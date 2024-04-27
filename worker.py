import threading
import configparser
import progressReporter
import platform
import typing
import util
import random
import consts
import json
import requests
from errors import UpdateRequired
from config import get_endpoint, get_engine_dir, conf_get, get_yaneuraou_command, get_fairy_command, get_key
from logger import log
import time
from engines import Engine


class Worker(threading.Thread):
    def __init__(self, conf: configparser.ConfigParser, threads: int, memory: int, progress_reporter: progressReporter.ProgressReporter) -> None:
        super(Worker, self).__init__()
        self.conf = conf
        self.threads = threads
        self.memory = memory // 2  # split between fairy and yane

        self.progress_reporter = progress_reporter

        self.alive = True
        self.fatal_error: typing.Optional[Exception] = None
        self.finished = threading.Event()
        self.sleep = threading.Event()
        self.status_lock = threading.RLock()

        self.nodes = 0
        self.positions = 0

        self.engines_lock = threading.RLock()
        self.yaneuraou: typing.Optional[Engine] = None
        self.fairy: typing.Optional[Engine] = None
        self.yaneuraou_info: typing.Any = None
        self.fairy_info: typing.Any = None

        self.job = None
        self.backoff = start_backoff(self.conf)

        self.http = requests.Session()
        self.http.mount(
            "http://", requests.adapters.HTTPAdapter(max_retries=1))
        self.http.mount(
            "https://", requests.adapters.HTTPAdapter(max_retries=1))

    def set_name(self, name: str) -> None:
        self.name = name
        if self.progress_reporter:
            self.progress_reporter.name = "%s (P)" % (name, )

    def stop(self) -> None:
        with self.status_lock:
            self.alive = False
            self.kill_engine()
            self.sleep.set()

    def stop_soon(self) -> None:
        with self.status_lock:
            self.alive = False
            self.sleep.set()

    def is_alive(self) -> bool:
        with self.status_lock:
            return self.alive

    def report_and_fetch(self, path: str, result: typing.Any, params: typing.Any) -> typing.Any:
        return self.http.post(get_endpoint(self.conf, path),
                              params=params,
                              json=result,
                              timeout=consts.HTTP_TIMEOUT)

    def run(self) -> None:
        try:
            while self.is_alive():
                self.run_inner()
        except UpdateRequired as error:
            self.fatal_error = error
        except Exception as error:
            self.fatal_error = error
            log.exception("Fatal error in worker")
        finally:
            self.finished.set()

    def run_inner(self) -> None:
        try:
            # Check if the engine is still alive and start, if necessary
            self.start_engines()

            # Do the next work unit
            path, request = self.work()
        except consts.DEAD_ENGINE_ERRORS:
            alive = self.is_alive()
            if alive:
                t = next(self.backoff)
                log.exception(
                    "Engine process has died. Backing off %0.1fs", t)

            # Abort current job
            self.abort_job()

            if alive:
                self.sleep.wait(t)
                self.kill_engine()

            return

        try:
            # Report result and fetch next job unless stopping and no results to report
            params = {}
            if not self.is_alive():
                params["stop"] = "true"
            if "stop" in params and path == "acquire":
                response = None
            else:
                response = self.report_and_fetch(path, request, params)

        except requests.RequestException as err:
            self.job = None
            t = next(self.backoff)
            log.error(
                "Backing off %0.1fs after failed request (%s)", t, err)
            self.sleep.wait(t)
        else:
            # Handle response.
            if response is None or response.status_code == 204:
                self.job = None
                t = next(self.backoff)
                log.debug("No job received. Backing off %0.1fs", t)
                self.sleep.wait(t)
            elif response.status_code == 202:
                log.debug("Got job: %s", response.text)
                self.job = response.json()
                self.backoff = start_backoff(self.conf)
            elif 500 <= response.status_code <= 599:
                self.job = None
                t = next(self.backoff)
                log.error("Server error: HTTP %d %s. Backing off %0.1fs",
                          response.status_code, response.reason, t)
                self.sleep.wait(t)
            elif 400 <= response.status_code <= 499:
                self.job = None
                t = next(self.backoff) + \
                    (60 if response.status_code == 429 else 0)
                try:
                    log.debug("Client error: HTTP %d %s: %s",
                              response.status_code, response.reason, response.text)
                    error = response.json()["error"]
                    log.error(error)

                    if "Please restart shoginet to upgrade." in error:
                        log.error("Stopping worker for update.")
                        raise UpdateRequired()
                except (KeyError, ValueError):
                    log.error("Client error: HTTP %d %s. Backing off %0.1fs. Request was: %s",
                              response.status_code, response.reason, t, json.dumps(request))
                self.sleep.wait(t)
            else:
                self.job = None
                t = next(self.backoff)
                log.error(
                    "Unexpected HTTP status for acquire: %d", response.status_code)
                self.sleep.wait(t)

    def abort_job(self) -> None:
        if self.job is None:
            return

        log.debug("Aborting job %s", self.job["work"]["id"])

        try:
            response = requests.post(get_endpoint(self.conf, "abort/%s" % self.job["work"]["id"]),
                                     data=json.dumps(self.make_request()),
                                     timeout=consts.HTTP_TIMEOUT)
            if response.status_code == 204:
                log.info("Aborted job %s", self.job["work"]["id"])
            else:
                log.error(
                    "Unexpected HTTP status for abort: %d", response.status_code)
        except requests.RequestException:
            log.exception("Could not abort job. Continuing.")

        self.job = None

    def kill_engine(self) -> None:
        with self.engines_lock:
            if self.yaneuraou:
                try:
                    del self.yaneuraou
                except OSError:
                    log.exception("Failed to kill engine process.")
                self.yaneuraou = None

    def start_engines(self) -> None:
        def start_fairy() -> None:
            if not self.fairy or self.fairy.engine_proccess.poll() is not None:
                self.fairy = Engine(True, get_fairy_command(self.conf, False),
                                    get_engine_dir(self.conf))
                self.fairy_info = typing.cast(typing.Any, self.fairy.usi())
                self.fairy_info.pop("author", None)
                log.info("Started %s, threads: %s (%d), pid: %d",
                         self.fairy_info.get("name", "Fairy stockfish <?>"),
                         "+" * self.threads, self.threads, self.fairy.engine_proccess.pid)
                self.fairy_info["options"] = {}
                self.fairy_info["options"]["Threads"] = str(self.threads)
                self.fairy_info["options"]["USI_Hash"] = str(self.memory)
                # Custom options
                if self.conf.has_section("Fairy"):
                    for name, value in self.conf.items("Fairy"):
                        self.fairy_info["options"][name] = value
                for name, value in self.fairy_info["options"].items():
                    self.fairy.setoption(name, value)
                self.fairy.isready()

        def start_yane() -> None:
            if not self.yaneuraou or self.yaneuraou.engine_proccess.poll() is not None:
                self.yaneuraou = Engine(False, get_yaneuraou_command(self.conf, False),
                                        get_engine_dir(self.conf))
                self.yaneuraou_info = typing.cast(
                    typing.Any, self.yaneuraou.usi())
                self.yaneuraou_info.pop("author", None)
                log.info("Started %s, threads: %s (%d), pid: %d",
                         self.yaneuraou_info.get("name", "YaneuraOu <?>"),
                         "+" * self.threads, self.threads, self.yaneuraou.engine_proccess.pid)
                self.yaneuraou_info["options"] = {}
                self.yaneuraou_info["options"]["Threads"] = str(self.threads)
                self.yaneuraou_info["options"]["USI_Hash"] = str(self.memory)
                self.yaneuraou_info["options"]["EnteringKingRule"] = "CSARule27H"
                self.yaneuraou_info["options"]["BookFile"] = "no_book"
                self.yaneuraou_info["options"]["ConsiderationMode"] = "true"
                self.yaneuraou_info["options"]["OutputFailLHPV"] = "true"
                # Custom options
                if self.conf.has_section("YaneuraOu"):
                    for name, value in self.conf.items("YaneuraOu"):
                        self.yaneuraou_info["options"][name] = value
                for name, value in self.yaneuraou_info["options"].items():
                    self.yaneuraou.setoption(name, value)
                self.yaneuraou.isready()

        with self.engines_lock:
            # Checks if already running.
            start_fairy()
            start_yane()

    def make_request(self) -> typing.Any:
        return {
            "shoginet": {
                "version": consts.SN_VERSION,
                "python": platform.python_version(),
                "apikey": get_key(self.conf),
            },
            "yaneuraou": self.yaneuraou_info,
            "fairy": self.fairy_info,
        }

    def work(self) -> typing.Tuple[str, typing.Any]:
        result = self.make_request()

        if self.job and self.job["work"]["type"] == "analysis":
            result = self.analysis(self.job)
            return "analysis" + "/" + self.job["work"]["id"], result
        elif self.job and self.job["work"]["type"] == "move":
            result = self.bestmove(self.job)
            return "move" + "/" + self.job["work"]["id"], result
        elif self.job and self.job["work"]["type"] == "puzzle":
            result = self.puzzle(self.job)
            return "puzzle" + "/" + self.job["work"]["id"], result
        else:
            if self.job:
                log.error("Invalid job type: %s", self.job["work"]["type"])

            return "acquire", result

    def job_name(self, job: typing.Any, ply: typing.Optional[int] = None) -> str:
        builder = []
        if job["work"]["type"] == "puzzle":
            builder.append("Puzzle - ")
            builder.append(job["work"]["id"])
        elif job.get("game_id"):
            builder.append(util.base_url(get_endpoint(self.conf)))
            builder.append(job["game_id"])
        else:
            builder.append(job["work"]["id"])
        if ply is not None:
            builder.append("#")
            builder.append(str(ply))
        return "".join(builder)

    def bestmove(self, job: typing.Any) -> str:
        lvl = job["work"]["level"]
        lvlIndex = lvl - 1
        variant = job.get("variant", "standard")
        useFairy = job["work"].get("flavor", "yaneuraou") == "fairy"
        moves = job["moves"].split()

        log.debug("Playing %s with lvl %d",
                  self.job_name(job), lvl)

        if useFairy:
            engine = self.fairy
        else:
            engine = self.yaneuraou

        assert engine is not None
        engine.set_variant_options(variant)
        if useFairy:
            engine.setoption("Skill_Level", consts.LVL_SKILL[lvlIndex])
        else:
            engine.setoption("SkillLevel", max(consts.LVL_SKILL[lvlIndex], 0))
        engine.setoption("MultiPV", "1")
        engine.send("usinewgame")
        engine.isready()

        movetime = int(
            round(consts.LVL_MOVETIMES[lvlIndex] / (self.threads * 0.9 ** (self.threads - 1))))
        start = time.time()
        engine.go(job["position"], moves,
                  movetime=movetime, clock=job["work"].get(
            "clock"),
            depth=consts.LVL_DEPTHS[lvlIndex], nodes=(None if useFairy else consts.LVL_NODES[lvlIndex]))
        bestmove = engine.recv_bestmove()
        end = time.time()

        log.log(consts.PROGRESS, "Engine(%s) played move(%s) in %s (%s) with lvl %d: %0.3fs elapsed",
                engine.name, bestmove, self.job_name(job), variant,
                lvl, end - start)

        self.positions += 1

        result = self.make_request()
        result["move"] = {
            "bestmove": bestmove,
        }
        return result

    def analysis(self, job: typing.Any) -> typing.Any:
        variant = job.get("variant", "standard")
        useFairy = job["work"].get("flavor", "yaneuraou") == "fairy"
        moves = job["moves"].split()

        result = self.make_request()
        start = last_progress_report = time.time()

        multipv = job.get("multipv")
        nodes = job.get("nodes") or 3500000
        skip = job.get("skipPositions", [])

        if useFairy:
            engine = self.fairy
        else:
            engine = self.yaneuraou

        assert engine is not None
        engine.set_variant_options(variant)
        if useFairy:
            engine.setoption("Skill_Level", '20')
        else:
            engine.setoption("SkillLevel", '20')
        engine.setoption("MultiPV", multipv or '1')
        if (useFairy):
            engine.setoption("USI_AnalyseMode", 'true')
        engine.send("usinewgame")
        engine.isready()

        if multipv is None:
            result["analysis"] = [None for _ in range(len(moves) + 1)]
        else:
            result["analysis"] = {
                "time": [[] for _ in range(len(moves) + 1)],
                "nodes": [[] for _ in range(len(moves) + 1)],
                "score": [[] for _ in range(len(moves) + 1)],
                "pv": [[] for _ in range(len(moves) + 1)],
            }

        num_positions = 0

        for ply in range(len(moves), -1, -1):
            if ply in skip:
                result["analysis"][ply] = {"skipped": True}
                continue

            if last_progress_report + consts.PROGRESS_REPORT_INTERVAL < time.time():
                if self.progress_reporter:
                    self.progress_reporter.send(job, result)
                last_progress_report = time.time()

            log.log(consts.PROGRESS, "Analysing: %s",
                    self.job_name(job, ply))

            engine.go(job["position"], moves[0:ply],
                      nodes=nodes, movetime=7000)
            scores, nodes, times, pvs = engine.recv_analysis()
            if multipv is None:
                depth = len(scores[0]) - 1
                result["analysis"][ply] = {
                    "depth": depth,
                    "score": util.decode_score(scores[0][depth]),
                }
                try:
                    result["analysis"][ply]["nodes"] = n = nodes[0][depth]
                    result["analysis"][ply]["time"] = t = times[0][depth]
                    if t > 200:
                        result["analysis"][ply]["nps"] = n * 1000 // t
                except IndexError:
                    pass
                try:
                    result["analysis"][ply]["pv"] = pvs[0][depth]
                except IndexError:
                    pass
            else:
                result["analysis"]["time"][ply] = times
                result["analysis"]["nodes"][ply] = nodes
                result["analysis"]["score"][ply] = scores
                result["analysis"]["pv"][ply] = pvs

            try:
                self.nodes += nodes[0][-1]
            except IndexError:
                pass
            self.positions += 1
            num_positions += 1

        end = time.time()

        if num_positions:
            log.info("%s took %0.1fs (%0.2fs per position - %s)",
                     self.job_name(job),
                     end - start, (end - start) / num_positions, engine.name)
        else:
            log.info("%s done (nothing to do)", self.job_name(job))

        return result

    def puzzle(self, job: typing.Any) -> typing.Any:
        useFairy = job["work"].get("flavor", "yaneuraou") == "fairy"
        moves = job["moves"].split()
        movesLen = len(moves)
        position = job["position"]
        turn = position.split(" ")[1] != "w" # True for sente
        winnerTurn = turn if movesLen % 2 == 0 else not turn

        result = self.make_request()
        start = last_progress_report = time.time()

        if useFairy:
            engine = self.fairy
        else:
            engine = self.yaneuraou

        assert engine is not None
        engine.set_variant_options("standard")
        if useFairy:
            engine.setoption("Skill_Level", '20')
        else:
            engine.setoption("SkillLevel", '20')
        engine.setoption("MultiPV", '3')
        if (useFairy):
            engine.setoption("USI_AnalyseMode", 'true')
        engine.send("usinewgame")
        engine.isready()

        num_positions = 0

        turn = winnerTurn

        start = time.time()
        while True:
            num_positions += 1
            engine.go(position, moves, depth=18, movetime='3000')
            bestmove, scores = engine.recv_puzzle_analysis()
            if bestmove is None or bestmove == "win" or (turn == winnerTurn and is_ambiguous(scores)):
                break
            else:
                moves.append(bestmove)
            turn = not turn

        end = time.time()

        found = len(moves) > movesLen

        if found:
            log.info("%s found after %0.1fs (%0.2fs per position - %s)",
                    self.job_name(job),
                    end - start, (end - start) / num_positions, engine.name)
        else:
            log.log(consts.PROGRESS, "Engine(%s) is looking for new puzzles (%s) - %0.1fs",
                engine.name, self.job_name(job), end - start)

        result["result"] = found
        return result

def is_ambiguous(scores: typing.List[int]) -> bool:
    if len(scores) <= 1:
        return False
    best_score = scores[0]
    second_score = scores[1]
    if util.win_chances(best_score) < util.win_chances(second_score) + 0.33:
        return True
    return False

def start_backoff(conf: configparser.ConfigParser) -> typing.Generator[float, None, None]:
    if util.parse_bool(conf_get(conf, "FixedBackoff")):
        while True:
            yield random.random() * consts.MAX_FIXED_BACKOFF
    else:
        backoff = 1.0
        while True:
            yield 0.5 * backoff + 0.5 * backoff * random.random()
            backoff = min(backoff + 1, consts.MAX_BACKOFF)
