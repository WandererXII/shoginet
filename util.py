import typing
import os
import sys
import platform
import urllib.parse as urlparse
from errors import ConfigError


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

    if os.name == "nt":
        return "YaneuraOu-%s%s.exe" % machine
    elif os.name == "os2" or sys.platform == "darwin":
        return "YaneuraOu-by-gcc"
    else:
        return "YaneuraOu-by-gcc"
