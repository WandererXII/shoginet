import typing
import argparse
import collections
import sys
import platform
import requests
import consts
from config import configure, load_conf, validate_command, conf_get, get_yaneuraou_command, get_fairy_command, get_engine_dir, get_key, validate_cores, validate_memory, validate_threads, get_endpoint
import util
import errors
from worker import Worker
from progressReporter import ProgressReporter
import signals
from logger import log
from systemd import systemd
from intro import intro
from cpuid import cpuid


def cmd_run(args: typing.Any) -> int:
    conf = load_conf(args)

    yane_command = validate_command(
        conf_get(conf, "YaneuraOuCommand"), conf)
    if not yane_command:
        yane_command = get_yaneuraou_command(conf)

    fairy_command = validate_command(
        conf_get(conf, "FairyCommand"), conf)
    if not fairy_command:
        fairy_command = get_fairy_command(conf)

    print()
    print("### Checking configuration ...")
    print()
    print("Python:           %s (with requests %s)" %
          (platform.python_version(), requests.__version__))
    print("EngineDir:        %s" % get_engine_dir(conf))
    print("YaneuraOuCommand: %s" % yane_command)
    print("FairyCommand:     %s" % fairy_command)
    print("Key:              %s" % (("*" * len(get_key(conf))) or "(none)"))

    cores = validate_cores(conf_get(conf, "Cores"))
    print("Cores:            %d" % cores)

    threads = validate_threads(conf_get(conf, "Threads"), conf)
    instances = max(1, cores // threads)
    print("Engine processes: %d (each ~%d threads)" % (instances, threads))
    memory = validate_memory(conf_get(conf, "Memory"), conf)
    print("Memory:           %d MB" % memory)
    endpoint = get_endpoint(conf)
    warning = "" if endpoint.startswith(
        "https://") else " (WARNING: not using https)"
    print("Endpoint:         %s%s" % (endpoint, warning))
    print("FixedBackoff:     %s" %
          util.parse_bool(conf_get(conf, "FixedBackoff")))
    print()

    if conf.has_section("Stockfish") and conf.items("Stockfish"):
        print("Using custom USI options is discouraged:")
        for name, value in conf.items("Stockfish"):
            if name.lower() == "hash":
                hint = " (use --memory instead)"
            elif name.lower() == "threads":
                hint = " (use --threads-per-process instead)"
            else:
                hint = ""
            print(" * %s = %s%s" % (name, value, hint))
        print()

    print("### Starting workers ...")
    print()

    buckets = [0] * instances
    for i in range(0, cores):
        buckets[i % instances] += 1

    progress_reporter = ProgressReporter(len(buckets) + 4, conf)
    progress_reporter.daemon = True
    progress_reporter.start()

    workers = [Worker(conf, bucket, memory // instances,
                      progress_reporter) for bucket in buckets]

    # Start all threads
    for i, worker in enumerate(workers):
        worker.set_name("><> %d" % (i + 1))
        worker.daemon = True
        worker.start()

    # Wait while the workers are running
    try:
        # Let SIGTERM and SIGINT gracefully terminate the program
        handler = signals.SignalHandler()

        try:
            while True:
                # Check worker status
                for _ in range(int(max(1, consts.STAT_INTERVAL / len(workers)))):
                    for worker in workers:
                        worker.finished.wait(1.0)
                        if worker.fatal_error:
                            raise worker.fatal_error

                # Log stats
                log.info("[shoginet v%s] Analyzed %d positions, crunched %d million nodes",
                         consts.SN_VERSION,
                         sum(worker.positions for worker in workers),
                         int(sum(worker.nodes for worker in workers) / 1000 / 1000))

        except errors.ShutdownSoon:
            handler = signals.SignalHandler()

            if any(worker.job for worker in workers):
                log.info(
                    "\n\n### Stopping soon. Press ^C again to abort pending jobs ...\n")

            for worker in workers:
                worker.stop_soon()

            for worker in workers:
                while not worker.finished.wait(0.5):
                    pass
    except (errors.Shutdown, errors.ShutdownSoon):
        if any(worker.job for worker in workers):
            log.info("\n\n### Good bye! Aborting pending jobs ...\n")
        else:
            log.info("\n\n### Good bye!")
    finally:
        handler.ignore = True

        # Stop workers
        for worker in workers:
            worker.stop()

        progress_reporter.stop()

        # Wait
        for worker in workers:
            worker.finished.wait()

    return 0


def cmd_configure(args: typing.Any) -> int:
    configure(args)
    return 0


def cmd_systemd(args: typing.Any) -> int:
    systemd(args)
    return 0


def cmd_cpuid(argv: typing.Any) -> int:
    cpuid()
    return 0


def parse_command_line(commands, argv):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verbose", "-v", default=0,
                        action="count", help="increase verbosity")
    parser.add_argument("--version", action="version",
                        version="shoginet v{0}".format(consts.SN_VERSION))

    g = parser.add_argument_group("configuration")
    g.add_argument("--auto-update", action="store_true",
                   help="automatically install available updates")
    g.add_argument("--conf", help="configuration file")
    g.add_argument("--no-conf", action="store_true",
                   help="do not use a configuration file")
    g.add_argument("--key", "--apikey", "-k", help="shoginet api key")

    g = parser.add_argument_group("resources")
    g.add_argument(
        "--cores", help="number of cores to use for engine processes (or auto for n - 1, or all for n)")
    g.add_argument(
        "--memory", help="total memory (MB) to use for engine hashtables")

    g = parser.add_argument_group("advanced")
    g.add_argument(
        "--endpoint", help="lishogi https endpoint (default: %s)" % consts.DEFAULT_ENDPOINT)
    g.add_argument("--engine-dir", help="engine working directory")
    g.add_argument("--yaneuraou-command",
                   help="YaneuraOu command (default: YaneuraOu-by-gcc)")
    g.add_argument("--fairy-command",
                   help="Fairy stockfish command (default: fairy-stockfish-largeboard_x86-64)")
    g.add_argument("--threads-per-process", "--threads", type=int, dest="threads",
                   help="hint for the number of threads to use per engine process (default: %d)" % consts.DEFAULT_THREADS)
    g.add_argument("--fixed-backoff", action="store_true", default=None,
                   help="fixed backoff (only recommended for move servers)")
    g.add_argument("--no-fixed-backoff", dest="fixed_backoff",
                   action="store_false", default=None)
    g.add_argument("--setoptionYaneuraou", nargs=2, action="append", default=[],
                   metavar=("NAME", "VALUE"), help="set a custom usi option for YaneuraOu")
    g.add_argument("--setoptionFairy", nargs=2, action="append", default=[],
                   metavar=("NAME", "VALUE"), help="set a custom usi option for Fairy Stockfish")

    parser.add_argument("command", default="run",
                        nargs="?", choices=commands.keys())

    return parser.parse_args(argv[1:])


def main(argv: typing.Any) -> int:
    # Parse command line arguments
    commands = collections.OrderedDict([
        ("run", cmd_run),
        ("configure", cmd_configure),
        ("systemd", cmd_systemd),
        ("cpuid", cmd_cpuid),
    ])
    args = parse_command_line(commands, argv)

    # Show intro
    if args.command not in ["systemd"]:
        print(intro())
        sys.stdout.flush()

    # Run
    try:
        sys.exit(commands[args.command](args))
    except errors.ConfigError:
        log.exception("Configuration error")
        return 78
    except (KeyboardInterrupt, errors.Shutdown, errors.ShutdownSoon):
        return 0


if __name__ == "__main__":
    main(sys.argv)
