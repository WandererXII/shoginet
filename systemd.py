import consts
from config import load_conf, validate_key, validate_engine_dir, validate_stockfish_command, validate_memory, validate_threads, validate_cores, validate_endpoint
import typing
import textwrap
from shlex import quote as shell_quote
import getpass
import os
import sys


def systemd(args: typing.Any) -> None:
    conf = load_conf(args)

    template = textwrap.dedent("""\
        [Unit]
        Description=Fishnet instance
        After=network-online.target
        Wants=network-online.target

        [Service]
        ExecStart={start}
        WorkingDirectory={cwd}
        ReadWriteDirectories={cwd}
        User={user}
        Group={group}
        Nice=5
        CapabilityBoundingSet=
        PrivateTmp=true
        PrivateDevices=true
        DevicePolicy=closed
        ProtectSystem={protect_system}
        NoNewPrivileges=true
        Restart=always

        [Install]
        WantedBy=multi-user.target""")

    # Prepare command line arguments
    builder = [shell_quote(sys.executable)]

    if __package__ is None:
        builder.append(shell_quote(os.path.abspath(sys.argv[0])))
    else:
        builder.append("-m")
        builder.append(shell_quote(
            os.path.splitext(os.path.basename(__file__))[0]))

    if args.no_conf:
        builder.append("--no-conf")
    else:
        config_file = os.path.abspath(args.conf or consts.DEFAULT_CONFIG)
        builder.append("--conf")
        builder.append(shell_quote(config_file))

    if args.key is not None:
        builder.append("--key")
        builder.append(shell_quote(validate_key(args.key, conf)))
    if args.engine_dir is not None:
        builder.append("--engine-dir")
        builder.append(shell_quote(validate_engine_dir(args.engine_dir)))
    engine_command = validate_stockfish_command(args.stockfish_command, conf)
    if args.stockfish_command is not None and engine_command is not None:
        builder.append("--stockfish-command")
        builder.append(shell_quote(
            engine_command))
    if args.cores is not None:
        builder.append("--cores")
        builder.append(shell_quote(str(validate_cores(args.cores))))
    if args.memory is not None:
        builder.append("--memory")
        builder.append(shell_quote(str(validate_memory(args.memory, conf))))
    if args.threads is not None:
        builder.append("--threads-per-process")
        builder.append(shell_quote(str(validate_threads(args.threads, conf))))
    if args.endpoint is not None:
        builder.append("--endpoint")
        builder.append(shell_quote(validate_endpoint(args.endpoint)))
    if args.fixed_backoff is not None:
        builder.append(
            "--fixed-backoff" if args.fixed_backoff else "--no-fixed-backoff")
    for option_name, option_value in args.setoption:
        builder.append("--setoption")
        builder.append(shell_quote(option_name))
        builder.append(shell_quote(option_value))
    if args.auto_update:
        builder.append("--auto-update")

    builder.append("run")

    start = " ".join(builder)

    protect_system = "full"
    if args.auto_update and os.path.realpath(os.path.abspath(__file__)).startswith("/usr/"):
        protect_system = "false"

    print(template.format(
        user=getpass.getuser(),
        group=getpass.getuser(),
        cwd=os.path.abspath("."),
        start=start,
        protect_system=protect_system
    ))

    try:
        if os.geteuid() == 0:
            print("\n# WARNING: Running as root is not recommended!", file=sys.stderr)
    except AttributeError:
        # No os.getuid() on Windows
        pass

    if sys.stdout.isatty():
        print("\n# Example usage:", file=sys.stderr)
        print("# python -m fishnet systemd | sudo tee /etc/systemd/system/shoginet.service", file=sys.stderr)
        print("# sudo systemctl enable shoginet.service", file=sys.stderr)
        print("# sudo systemctl start shoginet.service", file=sys.stderr)
        print("#", file=sys.stderr)
        print(
            "# Live view of the log: sudo journalctl --follow -u shoginet", file=sys.stderr)
