import configparser
import argparse
import os
import multiprocessing
import sys
import typing
import re
import requests
import typing
from errors import ConfigError
from logger import CensorLogFilter
import consts
import util
import urllib.parse as urlparse
from engines import Engine
from logger import log


def load_conf(args: typing.Any) -> configparser.ConfigParser:
    conf = configparser.ConfigParser()
    conf.add_section("Shoginet")
    conf.add_section("Engines")

    if not args.no_conf:
        if not args.conf and not os.path.isfile(consts.DEFAULT_CONFIG):
            return configure(args)

        config_file = args.conf or consts.DEFAULT_CONFIG
        log.debug("Using config file: %s", config_file)

        if not conf.read(config_file):
            raise ConfigError("Could not read config file: %s" % config_file)

    if hasattr(args, "engine_dir") and args.engine_dir is not None:
        conf.set("Shoginet", "EngineDir", args.engine_dir)
    if hasattr(args, "yaneuraou_command") and args.yaneuraou_command is not None:
        conf.set("Shoginet", "YaneraOuCommand", args.yaneuraou_command)
    if hasattr(args, "fairy_command") and args.fairy_command is not None:
        conf.set("Shoginet", "FairyCommand", args.fairy_command)
    if hasattr(args, "key") and args.key is not None:
        conf.set("Shoginet", "Key", args.key)
    if hasattr(args, "cores") and args.cores is not None:
        conf.set("Shoginet", "Cores", args.cores)
    if hasattr(args, "memory") and args.memory is not None:
        conf.set("Shoginet", "Memory", args.memory)
    if hasattr(args, "threads") and args.threads is not None:
        conf.set("Shoginet", "Threads", str(args.threads))
    if hasattr(args, "endpoint") and args.endpoint is not None:
        conf.set("Shoginet", "Endpoint", args.endpoint)
    if hasattr(args, "fixed_backoff") and args.fixed_backoff is not None:
        conf.set("Shoginet", "FixedBackoff", str(args.fixed_backoff))
    for option_name, option_value in args.setoptionYaneuraou:
        conf.set("YaneuraOu", option_name.lower(), option_value)
    for option_name, option_value in args.setoptionFairy:
        conf.set("Fairy", option_name.lower(), option_value)

    log.addFilter(CensorLogFilter(conf_get(conf, "Key")))

    return conf


def config_input(prompt: str, validator: typing.Callable[[str], typing.Any], out: typing.TextIO) -> typing.Any:
    while True:
        if out == sys.stdout:
            inp = input(prompt)
        else:
            if prompt:
                out.write(prompt)
                out.flush()

            inp = input()

        try:
            return validator(inp)
        except ConfigError as error:
            print(error, file=out)


def configure(args: typing.Any) -> configparser.ConfigParser:
    if sys.stdout.isatty():
        out = sys.stdout
        try:
            # Unix: Importing for its side effect
            import readline  # noqa: F401
        except ImportError:
            # Windows
            pass
    else:
        out = sys.stderr

    print(file=out)
    print("### Configuration", file=out)
    print(file=out)

    conf = configparser.ConfigParser()
    conf.add_section("Shoginet")
    conf.add_section("YaneuraOu")
    conf.add_section("Fairy")

    # Ensure the config file is going to be writable
    config_file = os.path.abspath(args.conf or consts.DEFAULT_CONFIG)
    if os.path.isfile(config_file):
        conf.read(config_file)
        with open(config_file, "r+"):
            pass
    else:
        with open(config_file, "w"):
            pass
        os.remove(config_file)

    # Engines working directory
    engine_dir = config_input("Engine working directory (default: %s): " % os.path.abspath("."),
                              validate_engine_dir, out)
    conf.set("Shoginet", "EngineDir", engine_dir)

    # Engines command
    print(file=out)
    print("YaneuraOu is licensed under the GNU General Public License v3.", file=out)
    print("You can find the source at: https://github.com/yaneuraou/YaneuraOu", file=out)
    print(file=out)
    print("You can build custom YaneuraOu yourself and provide", file=out)
    print("the path or automatically download a precompiled binary.", file=out)
    print(file=out)
    yaneuraou_command = config_input("Path or command for yaneuraOu (default works on linux): ",
                                     lambda v: validate_command(
                                         v, conf),
                                     out)
    if not yaneuraou_command:
        conf.remove_option("Shoginet", "YaneuraOuCommand")
    else:
        conf.set("Shoginet", "YaneuraOuCommand", yaneuraou_command)

    print(file=out)
    print("Fairy-Stockfish is licensed under the GNU General Public License v3.", file=out)
    print("You can find the source at: https://github.com/ianfab/Fairy-Stockfish", file=out)
    print(file=out)
    print("You can build custom Fairy-Stockfish yourself and provide", file=out)
    print("the path or automatically download a precompiled binary.", file=out)
    print(file=out)
    fairy_command = config_input("Path or command for fairy stockfish (default works on linux): ",
                                 lambda v: validate_command(
                                     v, conf),
                                 out)
    if not fairy_command:
        conf.remove_option("Shoginet", "FairyCommand")
    else:
        conf.set("Shoginet", "FairyCommand", fairy_command)
    print(file=out)

    # Cores
    max_cores = multiprocessing.cpu_count()
    default_cores = max(1, max_cores - 1)
    cores = config_input("Number of cores to use for engine threads (default %d, max %d): " % (default_cores, max_cores),
                         validate_cores, out)
    conf.set("Shoginet", "Cores", str(cores))

    # Advanced options
    endpoint = args.endpoint or consts.DEFAULT_ENDPOINT
    if config_input("Configure advanced options? (default: no) ", lambda o: str(util.parse_bool(o)), out):
        endpoint = config_input("Shoginet API endpoint (default: %s): " % (
            endpoint, ), lambda inp: validate_endpoint(inp, endpoint), out)

    conf.set("Shoginet", "Endpoint", endpoint)

    # Change key?
    key = None
    if conf.has_option("Shoginet", "Key"):
        if not config_input("Change Shoginet key? (default: no) ", lambda k: str(util.parse_bool(k)), out):
            key = conf.get("Shoginet", "Key")

    # Key
    if key is None:
        key = config_input("Personal Shoginet key (append ! to force): ",
                           lambda v: validate_key(v, conf, network=True), out)
    conf.set("Shoginet", "Key", key)
    log.addFilter(CensorLogFilter(key))

    # Confirm
    print(file=out)
    while not config_input("Done. Write configuration to %s now? (default: yes) " % (config_file, ),
                           lambda v: str(util.parse_bool(v, True)), out):
        pass

    # Write configuration
    with open(config_file, "w") as f:
        conf.write(f)

    print("Configuration saved.", file=out)
    return conf


def validate_engine_dir(engine_dir: typing.Optional[str]) -> str:
    if not engine_dir or not engine_dir.strip():
        return os.path.abspath(".")

    engine_dir = os.path.abspath(os.path.expanduser(engine_dir.strip()))

    if not os.path.isdir(engine_dir):
        raise ConfigError("EngineDir not found: %s" % engine_dir)

    return engine_dir


def validate_command(command: typing.Optional[str], conf: configparser.ConfigParser) -> typing.Optional[str]:
    if not command or not command.strip():
        return None

    command = command.strip()
    engine_dir = get_engine_dir(conf)

    # Ensure the required options are supported
    engine = Engine(False, command, engine_dir)
    engine.usi()

    del engine

    return command


def validate_cores(cores: typing.Optional[str]) -> int:
    if not cores or cores.strip().lower() == "auto":
        return max(1, multiprocessing.cpu_count() - 1)

    if cores.strip().lower() == "all":
        return multiprocessing.cpu_count()

    try:
        coresNum = int(cores.strip())
    except ValueError:
        raise ConfigError("Number of cores must be an integer")

    if coresNum < 1:
        raise ConfigError("Need at least one core")

    if coresNum > multiprocessing.cpu_count():
        raise ConfigError(
            "At most %d cores available on your machine " % multiprocessing.cpu_count())

    return coresNum


def validate_threads(threads: typing.Optional[str], conf: configparser.ConfigParser) -> int:
    cores = validate_cores(conf_get(conf, "Cores"))

    if not threads or str(threads).strip().lower() == "auto":
        return min(consts.DEFAULT_THREADS, cores)

    try:
        threadsNum = int(str(threads).strip())
    except ValueError:
        raise ConfigError("Number of threads must be an integer")

    if threadsNum < 1:
        raise ConfigError("Need at least one thread per engine process")

    if threadsNum > cores:
        raise ConfigError(
            "%d cores is not enough to run %d threads" % (cores, threadsNum))

    return threadsNum


def validate_memory(memory: typing.Optional[str], conf: configparser.ConfigParser) -> int:
    cores = validate_cores(conf_get(conf, "Cores"))
    threads = validate_threads(conf_get(conf, "Threads"), conf)
    processes = cores // threads

    if not memory or not memory.strip() or memory.strip().lower() == "auto":
        return processes * consts.HASH_DEFAULT

    try:
        memoryNum = int(memory.strip())
    except ValueError:
        raise ConfigError("Memory must be an integer")

    if memoryNum < processes * consts.HASH_MIN:
        raise ConfigError("Not enough memory for a minimum of %d x %d MB in hash tables" % (
            processes, consts.HASH_MIN))

    if memoryNum > processes * consts.HASH_MAX:
        raise ConfigError("Cannot reasonably use more than %d x %d MB = %d MB for hash tables" % (
            processes, consts.HASH_MAX, processes * consts.HASH_MAX))

    return memoryNum


def validate_endpoint(endpoint: typing.Optional[str], default: str = consts.DEFAULT_ENDPOINT) -> str:
    if not endpoint or not endpoint.strip():
        return default

    if not endpoint.endswith("/"):
        endpoint += "/"

    url_info = urlparse.urlparse(endpoint)
    if url_info.scheme not in ["http", "https"]:
        raise ConfigError(
            "Endpoint does not have http:// or https:// URL scheme")

    return endpoint


def validate_key(key: typing.Optional[str], conf: configparser.ConfigParser, network: bool = False) -> str:
    if not key or not key.strip():
        return ""

    key = key.strip()

    network = network and not key.endswith("!")
    key = key.rstrip("!").strip()

    if not re.match(r"^[a-zA-Z0-9]+$", key):
        raise ConfigError("Shoginet key is expected to be alphanumeric")

    if network:
        response = requests.get(get_endpoint(
            conf, "key/%s" % key), timeout=consts.HTTP_TIMEOUT)
        if response.status_code == 404:
            raise ConfigError("Invalid or inactive Shoginet key")
        else:
            response.raise_for_status()

    return key


def get_engine_dir(conf: configparser.ConfigParser) -> str:
    return validate_engine_dir(conf_get(conf, "EngineDir"))


def get_endpoint(conf: configparser.ConfigParser, sub: str = "") -> str:
    return urlparse.urljoin(validate_endpoint(conf_get(conf, "Endpoint")), sub)


def get_yaneuraou_command(conf: configparser.ConfigParser, update: bool = True) -> str:
    yane_command = validate_command(
        conf_get(conf, "YaneuraOuCommand"), conf)
    if not yane_command:
        filename = util.yaneuraou_filename()
        return typing.cast(str, validate_command(os.path.join(".", filename), conf))
    else:
        return yane_command


def get_fairy_command(conf: configparser.ConfigParser, update: bool = True) -> str:
    fairy_command = validate_command(
        conf_get(conf, "FairyCommand"), conf)
    if not fairy_command:
        filename = util.fairy_filename()
        return typing.cast(str, validate_command(os.path.join(".", filename), conf))
    else:
        return fairy_command


def get_key(conf: configparser.ConfigParser) -> str:
    return validate_key(conf_get(conf, "Key"), conf, network=False)


def conf_get(conf: configparser.ConfigParser, key: str, default: typing.Optional[str] = None, section: str = "Shoginet") -> typing.Optional[str]:
    if not conf.has_section(section):
        return default
    elif not conf.has_option(section, key):
        return default
    else:
        return conf.get(section, key)
