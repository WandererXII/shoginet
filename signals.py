import signal
from typing import Optional
from types import FrameType
import errors


class SignalHandler(object):
    def __init__(self) -> None:
        self.ignore = False

        signal.signal(signal.SIGTERM, self.handle_term)
        signal.signal(signal.SIGINT, self.handle_int)

        try:
            signal.signal(signal.SIGUSR1, self.handle_usr1)
        except AttributeError:
            # No SIGUSR1 on Windows
            pass

    def handle_int(self, signum: int, frame: Optional[FrameType]) -> None:
        if not self.ignore:
            self.ignore = True
            raise errors.ShutdownSoon()

    def handle_term(self, signum: int, frame: Optional[FrameType]) -> None:
        if not self.ignore:
            self.ignore = True
            raise errors.Shutdown()

    def handle_usr1(self, signum: int, frame: Optional[FrameType]) -> None:
        if not self.ignore:
            self.ignore = True
            raise errors.UpdateRequired()
