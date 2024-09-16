from shoginet import *


def test_intro():
    assert intro()


def test_parse_command_line():
    commands = collections.OrderedDict([
        ("run", cmd_run),
        ("configure", cmd_configure),
        ("systemd", cmd_systemd),
        ("cpuid", cmd_cpuid),
    ])
    assert parse_command_line(commands, ["-v"])
