from util import *


def test_base_url():
    assert base_url("https://lishogi.org/fishnet/") == "https://lishogi.org/"


def test_fairy_filename():
    assert fairy_filename()
