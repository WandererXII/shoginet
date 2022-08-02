import threading
import configparser
import requests
import queue
import json
import consts
import time
import typing
from config import get_endpoint
from logger import log


class ProgressReporter(threading.Thread):
    def __init__(self, queue_size: int, conf: configparser.ConfigParser) -> None:
        super(ProgressReporter, self).__init__()
        self.http = requests.Session()
        self.conf = conf

        self.queue: queue.Queue = queue.Queue(maxsize=queue_size)
        self._poison_pill = object()

    def send(self, job: typing.Any, result: typing.Any) -> None:
        path = "analysis/%s" % job["work"]["id"]
        data = json.dumps(result).encode("utf-8")
        try:
            self.queue.put_nowait((path, data))
        except queue.Full:
            log.debug(
                "Could not keep up with progress reports. Dropping one.")

    def stop(self) -> None:
        while not self.queue.empty():
            self.queue.get_nowait()
        self.queue.put(self._poison_pill)

    def run(self) -> None:
        while True:
            item = self.queue.get()
            if item == self._poison_pill:
                return

            path, data = item

            try:
                response = self.http.post(get_endpoint(self.conf, path),
                                          data=data,
                                          timeout=consts.HTTP_TIMEOUT)
                if response.status_code == 429:
                    log.error(
                        "Too many requests. Suspending progress reports for 60s ...")
                    time.sleep(60.0)
                elif response.status_code != 204:
                    log.error(
                        "Expected status 204 for progress report, got %d", response.status_code)
            except requests.RequestException as err:
                log.warning(
                    "Could not send progress report (%s). Continuing.", err)
