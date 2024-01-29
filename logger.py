import logging
import sys
import collections
import typing
from consts import PROGRESS, ENGINE, LOGGING_VERBOSITY


logging.addLevelName(PROGRESS, "PROGRESS")
logging.addLevelName(ENGINE, "ENGINE")


class LogFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        # Format message
        msg = super(LogFormatter, self).format(record)

        # Add level name
        if record.levelno in [logging.INFO, PROGRESS]:
            with_level = msg
        else:
            with_level = "%s: %s" % (record.levelname, msg)

        # Add thread name
        if record.threadName == "MainThread":
            return with_level
        else:
            return "%s: %s" % (record.threadName, with_level)


class CollapsingLogHandler(logging.StreamHandler):
    def __init__(self, stream: typing.TextIO = sys.stdout) -> None:
        super(CollapsingLogHandler, self).__init__(stream)
        self.last_level = logging.INFO
        self.last_len = 0

    def emit(self, record: logging.LogRecord) -> None:
        try:
            if self.last_level == PROGRESS:
                if record.levelno == PROGRESS:
                    self.stream.write("\r")
                else:
                    self.stream.write("\n")

            msg = self.format(record)
            if record.levelno == PROGRESS:
                self.stream.write(msg.ljust(self.last_len))
                self.last_len = max(len(msg), self.last_len)
            else:
                self.last_len = 0
                self.stream.write(msg)
                self.stream.write("\n")

            self.last_level = record.levelno
            self.flush()
        except Exception:
            self.handleError(record)


class TailLogHandler(logging.Handler):
    def __init__(self, capacity: int, max_level: int, flush_level: int, target_handler: logging.StreamHandler) -> None:
        super(TailLogHandler, self).__init__()
        self.buffer: collections.deque = collections.deque(maxlen=capacity)
        self.max_level = max_level
        self.flush_level = flush_level
        self.target_handler = target_handler

    def emit(self, record: logging.LogRecord) -> None:
        if record.levelno < self.max_level:
            self.buffer.append(record)

        if record.levelno >= self.flush_level:
            while self.buffer:
                record = self.buffer.popleft()
                self.target_handler.handle(record)


class CensorLogFilter(logging.Filter):
    def __init__(self, keyword: typing.Optional[str]) -> None:
        self.keyword = keyword

    def censor(self, msg: typing.Any) -> str:
        if self.keyword and type(msg) is str:
            return msg.replace(self.keyword, "*" * len(self.keyword))
        else:
            return msg

    def filter(self, record: logging.LogRecord) -> bool:
        record.msg = self.censor(record.msg)
        if (record.args):
            record.args = tuple(self.censor(arg) if isinstance(
                arg, str) else arg for arg in record.args)
        return True


def setup_logging(verbosity: int) -> logging.Logger:
    logger = logging.getLogger()
    logger.setLevel(ENGINE)
    stream = sys.stdout
    handler = logging.StreamHandler(stream)

    if verbosity >= 3:
        handler.setLevel(ENGINE)
    elif verbosity >= 2:
        handler.setLevel(logging.DEBUG)
    elif verbosity >= 1:
        handler.setLevel(PROGRESS)
    else:
        if stream.isatty():
            handler = CollapsingLogHandler(stream)
            handler.setLevel(PROGRESS)
        else:
            handler.setLevel(logging.INFO)

    if verbosity < 2:
        logging.getLogger("urllib3").setLevel(logging.WARNING)
        logging.getLogger("requests.packages.urllib3").setLevel(
            logging.WARNING)

    tail_target = logging.StreamHandler(stream)
    tail_target.setFormatter(LogFormatter())
    logger.addHandler(TailLogHandler(
        35, handler.level, logging.ERROR, tail_target))

    handler.setFormatter(LogFormatter())
    logger.addHandler(handler)

    return logger


log = setup_logging(LOGGING_VERBOSITY)
