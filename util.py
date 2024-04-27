import typing
import os
import sys
import platform
import urllib.parse as urlparse
import math
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


def encode_score(kind: str, value: int) -> int:
    if kind == "mate":
        if value > 0:
            return 102_000 - value
        else:
            return -102_000 - value
    else:
        return min(max(value, -100_000), 100_000)

def decode_score(score: int) -> typing.Any:
    if score > 100_000:
        return {"mate": 102_000 - score}
    elif score < -100_000:
        return {"mate": -102_000 - score}
    else:
        return {"cp": score}

def win_chances(score: int) -> float:
    """
    winning chances from -1 to 1 https://graphsketch.com/?eqn1_color=1&eqn1_eqn=100+*+%282+%2F+%281+%2B+exp%28-0.0007+*+x%29%29+-+1%29&eqn2_color=2&eqn2_eqn=&eqn3_color=3&eqn3_eqn=&eqn4_color=4&eqn4_eqn=&eqn5_color=5&eqn5_eqn=&eqn6_color=6&eqn6_eqn=&x_min=-7000&x_max=7000&y_min=-100&y_max=100&x_tick=100&y_tick=10&x_label_freq=2&y_label_freq=2&do_grid=0&do_grid=1&bold_labeled_lines=0&bold_labeled_lines=1&line_width=4&image_w=850&image_h=525
    """
    if abs(score) > 100_000:
        return 1 if score > 0 else -1

    return 2 / (1 + math.exp(-0.0007 * score)) - 1