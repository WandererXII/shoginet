import threading
import subprocess
import typing
import os
import sys
import signal
from consts import ENGINE
from logger import log


class Engine:

    def __init__(self, variants: bool, command: str, cwd: typing.Optional[str] = None, shell: bool = True, _popen_lock: threading.Lock = threading.Lock()) -> None:
        kwargs: dict[str, typing.Any] = {
            "shell": shell,
            "stdout": subprocess.PIPE,
            "stderr": subprocess.STDOUT,
            "stdin": subprocess.PIPE,
            "bufsize": 1,  # Line buffered
            "universal_newlines": True,
        }

        if cwd is not None:
            kwargs["cwd"] = cwd

        # Prevent signal propagation from parent process
        if sys.platform == "win32":
            kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
        else:
            kwargs["preexec_fn"] = os.setpgrp

        self.variants = variants
        self.name = "fairy" if variants else "yaneuraou"
        with _popen_lock:
            self.engine_proccess = subprocess.Popen(command, **kwargs)

    def __del__(self) -> None:
        if sys.platform == "win32":
            self.engine_proccess.send_signal(signal.CTRL_BREAK_EVENT)
        else:
            os.killpg(self.engine_proccess.pid, signal.SIGKILL)

        # Try to avoid zombie by cleaning up any leftover stdout
        try:
            self.engine_proccess.communicate()
        except IOError:
            # Can happen from duplicate communication to engine_proccess
            pass

    def send(self, line: str) -> None:
        log.log(ENGINE, "%s(%s) << %s",
                self.engine_proccess.pid, self.name, line)
        assert self.engine_proccess.stdin is not None
        self.engine_proccess.stdin.write(line + "\n")
        self.engine_proccess.stdin.flush()

    def recv(self) -> str:
        while True:
            assert self.engine_proccess.stdout is not None
            line = self.engine_proccess.stdout.readline()
            if line == "":
                raise EOFError()

            line = line.rstrip()

            log.log(ENGINE, "%s(%s) >> %s",
                    self.engine_proccess.pid, self.name, line)

            if line:
                return line

    def recv_usi(self) -> typing.List[str]:
        command_and_args = self.recv().split(None, 1)
        if len(command_and_args) == 1:
            return [command_and_args[0], ""]
        else:
            return command_and_args

    def usi(self) -> dict[str, str]:
        self.send("usi")

        engine_info: dict[str, str] = {}

        while True:
            command, arg = self.recv_usi()

            if command == "usiok":
                return engine_info
            elif command == "id":
                name_and_value = arg.split(None, 1)
                if len(name_and_value) == 2:
                    engine_info[name_and_value[0]] = name_and_value[1]
            elif command == "option" or command == "Fairy-Stockfish":
                pass
            else:
                log.warning(
                    "Unexpected engine response to usi: %s %s", command, arg)

    def isready(self) -> None:
        self.send("isready")
        while True:
            command, arg = self.recv_usi()
            if command == "readyok":
                break
            elif command == "info" and arg.startswith("string "):
                pass
            else:
                log.warning(
                    "Unexpected engine response to isready: %s %s", command, arg)

    def setoption(self, name: str, value: str) -> None:
        if value is True:
            value = "true"
        elif value is False:
            value = "false"
        elif value is None:
            value = "none"

        self.send("setoption name %s value %s" % (name, value))

    def set_variant_options(self, variant: str) -> None:
        if not self.variants:
            return
        variant = variant.lower()
        if variant == "standard":
            self.setoption("USI_Variant", "shogi")
        else:
            self.setoption("USI_Variant", variant)

    def recv_bestmove(self) -> typing.Optional[str]:
        while True:
            command, arg = self.recv_usi()
            if command == "bestmove":
                bestmove = arg.split()[0]
                if bestmove and bestmove != "(none)" and bestmove != "resign":
                    return bestmove
                else:
                    return None
            elif command == "info":
                continue
            else:
                log.warning(
                    "Unexpected engine response to go: %s %s", command, arg)

    def encode_score(self, kind: str, value: int) -> int:
        if kind == "mate":
            if value > 0:
                return 102_000 - value
            else:
                return -102_000 - value
        else:
            return min(max(value, -100_000), 100_000)

    def decode_score(self, score: int) -> typing.Any:
        if score > 100_000:
            return {"mate": 102_000 - score}
        elif score < -100_000:
            return {"mate": -102_000 - score}
        else:
            return {"cp": score}

    def recv_analysis(self) -> typing.Any:
        scores: typing.List[str] = []
        nodes: typing.List[str] = []
        times: typing.List[str] = []
        pvs: typing.List[str] = []

        bound: typing.List[str] = []

        while True:
            command, arg = self.recv_usi()

            if command == "bestmove":
                return scores, nodes, times, pvs
            elif command == "info":
                depth: typing.Optional[int] = None
                multipv = 1

                def set_table(arr: typing.List[typing.Any], value: typing.Any) -> None:
                    while len(arr) < multipv:
                        arr.append([])
                    while len(arr[multipv - 1]) <= (depth or 0):
                        arr[multipv - 1].append(None)
                    arr[multipv - 1][depth] = value

                tokens = (arg or "").split(" ")
                while tokens:
                    parameter = tokens.pop(0)

                    if parameter == "multipv":
                        multipv = int(tokens.pop(0))
                    elif parameter == "depth":
                        depth = int(tokens.pop(0))
                    elif parameter == "nodes":
                        set_table(nodes, int(tokens.pop(0)))
                    elif parameter == "time":
                        set_table(times, int(tokens.pop(0)))
                    elif parameter == "score":
                        kind = tokens.pop(0)
                        value = self.encode_score(kind, int(tokens.pop(0)))
                        is_bound = False
                        if tokens and tokens[0] in ["lowerbound", "upperbound"]:
                            is_bound = True
                            tokens.pop(0)

                        was_bound = depth is None or len(bound) < multipv or len(
                            bound[multipv - 1]) <= depth or bound[multipv - 1][depth]
                        set_table(bound, is_bound)

                        if was_bound or not is_bound:
                            set_table(scores, value)
                    elif parameter == "pv":
                        set_table(pvs, " ".join(tokens))
                        break
            else:
                log.warning(
                    "Unexpected engine response to go: %s %s", command, arg)

    def go(self, position: str, moves: list[str], movetime: int = None, clock: typing.Optional[dict[str, int]] = None, depth: int = None, nodes: int = None) -> None:
        self.send("position sfen %s moves %s" % (position, " ".join(moves)))

        builder = []
        builder.append("go")
        if movetime is not None:
            builder.append("movetime")
            builder.append(str(movetime))
        if nodes is not None:
            builder.append("nodes")
            builder.append(str(nodes))
        if depth is not None:
            builder.append("depth")
            builder.append(str(depth))
        if clock is not None:
            builder.append("btime")
            builder.append(str(clock["btime"] * 10))
            builder.append("wtime")
            builder.append(str(clock["wtime"] * 10))
            builder.append("byoyomi")
            builder.append(str(clock["byo"] * 1000))
            if(clock["inc"] > 0):
                builder.append("binc")
                builder.append(str(clock["inc"] * 1000))
                builder.append("winc")
                builder.append(str(clock["inc"] * 1000))

        self.send(" ".join(builder))
