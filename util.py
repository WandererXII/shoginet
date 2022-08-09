import typing
import os
import sys
import platform
import urllib.parse as urlparse
from errors import ConfigError
from cpuid import detect_cpu_capabilities


def parse_bool(inp: typing.Any, default: bool = False) -> bool:
    if not inp or isinstance(inp, str):
        return default

    inp = inp.strip().lower()
    if not inp:
        return default

    if inp in ["y", "j", "yes", "yep", "true", "t", "1", "ok"]:
        return True
    elif inp in ["n", "no", "nop", "nope", "f", "false", "0"]:
        return False
    else:
        raise ConfigError("Not a boolean value: %s", inp)


def base_url(url: str) -> str:
    url_info = urlparse.urlparse(url)
    return "%s://%s/" % (url_info.scheme, url_info.hostname)


def yaneuraou_filename() -> str:
    machine = platform.machine().lower()

    vendor, modern, bmi2, sse42, avx2 = detect_cpu_capabilities()
    if sse42 and "Intel" in vendor and avx2:
        suffix = "-AVX2"
    elif sse42 and "Intel" in vendor:
        suffix = "-SSE42"
    else:
        suffix = ""

    if os.name == "nt":
        return "YaneuraOu-%s%s.exe" % (machine, suffix)
    elif os.name == "os2" or sys.platform == "darwin":
        return "YaneuraOu-by-gcc"
    else:
        return "YaneuraOu-by-gcc%s" % suffix


def fairy_filename() -> str:
    machine = platform.machine().lower()

    vendor, modern, bmi2, sse42, avx2 = detect_cpu_capabilities()
    if modern and "Intel" in vendor and bmi2:
        suffix = "-bmi2"
    elif modern:
        suffix = "-modern"
    else:
        suffix = ""

    if os.name == "nt":
        return "fairy-stockfish-largeboard_x86-64%s%s.exe" % (machine, suffix)
    elif os.name == "os2" or sys.platform == "darwin":
        return "fairy-stockfish-largeboard_x86-64"
    else:
        return "fairy-stockfish-largeboard_x86-64%s" % suffix
