import { clientConfig } from './config/client.js';
import type { ServerConfig } from './config/server.js';
import { MAX_BACKOFF_SECONDS, WORKER_INIT_TIMEOUT_SECONDS } from './consts.js';
import * as http from './http.js';
import { baseLogger } from './logger.js';
import { verifyFairyVersion, verifyYaneuraouVersion } from './version.js';
import { Worker } from './worker.js';

export class WorkerManager {
  private workers: Worker[] = [];
  private logger = baseLogger.getSubLogger({
    name: 'worker-manager',
  });

  private isRunning = false;
  private abort = new AbortController();
  private waitingResolver: ((w: Worker) => void) | undefined = undefined;

  constructor(private readonly serverConfig: ServerConfig) {}

  async initialize(): Promise<void> {
    this.logger.info(`Initializing ${clientConfig.workers} workers...`);

    for (let i = 0; i < clientConfig.workers; i++) {
      const w = new Worker(i, this.serverConfig);

      w.on('result', async (type, res) => {
        const work = await http.submitWork(type, res);
        if (work && this.isRunning) w.task(work);
        else setTimeout(w.release.bind(w), 1000); // to avoid asking for work immediately
      });

      w.on('abort', (work) => {
        http.abortWork(work);
        w.release();
      });

      w.on('available', () => {
        if (this.waitingResolver) {
          const resolve = this.waitingResolver;
          this.waitingResolver = undefined;
          resolve(w);
        }
      });

      this.workers.push(w);

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          throw `Worker #${i} initialization timed out`;
        }, WORKER_INIT_TIMEOUT_SECONDS * 1000);

        w.once('initialized', () => {
          clearTimeout(timeout);
          this.logger.info(`Worker #${i} initialized`);
          resolve();
        });

        w.initialize();
      });
    }

    this.logger.info('Verifying engine versions...');
    try {
      const worker = this.workers[0];
      verifyFairyVersion(worker.engines.fairy?.info.name || '');
      verifyYaneuraouVersion(worker.engines.yaneuraou?.info.name || '');
    } catch (err) {
      this.logger.error(`Invalid engine version: ${err}`);
      process.emit('SIGINT');
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    this.abort.abort();

    const busyWorkers = this.workers.filter((w) => !!w.currentWork);

    if (busyWorkers.length === 0) {
      this.forceStop();
      return;
    }

    this.logger.info(
      `Waiting for ${busyWorkers.length} workers to finish or 10m timeout...`,
    );

    const waitForWorkersToFinish = new Promise<void>((resolve) => {
      const finishedWorkerIds = new Set<number>();

      const checkDone = () => {
        if (finishedWorkerIds.size >= busyWorkers.length) {
          resolve();
        }
      };

      busyWorkers.forEach((w) => {
        const onWorkerFinished = () => {
          if (!finishedWorkerIds.has(w.index)) {
            finishedWorkerIds.add(w.index);

            w.off('result', onWorkerFinished);
            w.off('failure', onWorkerFinished);
            w.off('available', onWorkerFinished);

            checkDone();
          }
        };

        w.once('result', onWorkerFinished);
        w.once('failure', onWorkerFinished);
        w.once('available', onWorkerFinished);
      });
    });

    const maxWaitTime = new Promise<void>((resolve) => {
      setTimeout(
        () => {
          this.logger.warn('Force stop triggered due to 10 minute timeout.');
          resolve();
        },
        10 * 60 * 1000,
      );
    });

    await Promise.race([waitForWorkersToFinish, maxWaitTime]);

    this.workers.forEach((w) => {
      w.stop();
    });
  }

  async forceStop(): Promise<void> {
    this.isRunning = false;
    this.abort.abort();

    const busyWorkers = this.workers.filter((w) => !!w.currentWork);
    for (const w of busyWorkers) {
      if (w.currentWork) await http.abortWork(w.currentWork);
    }
    this.workers.forEach((w) => {
      w.stop();
    });
  }

  async start(): Promise<void> {
    this.isRunning = true;
    let noTask = 0;
    while (this.isRunning) {
      const availableWorker = await this.waitForWorker();
      const work = await http.acquireWork();

      if (work) {
        this.logger.debug('Received work:', work);
        noTask = 0;
        availableWorker.task(work);
      } else {
        noTask += 1;
        const backoff = Math.min(
          500 * noTask + 500 * noTask * Math.random(),
          MAX_BACKOFF_SECONDS * 1000,
        );
        await this.sleep(backoff);
      }
    }
  }

  private waitForWorker(): Promise<Worker> {
    const available = this.workers.find((w) => w.isAvailable());
    if (available) return Promise.resolve(available);

    return new Promise((resolve) => {
      this.waitingResolver = resolve;
    });
  }

  private sleep(backoff: number): Promise<void> {
    this.logger.debug(`Sleeping for: ${backoff}`);

    const abort = this.abort;
    return new Promise((resolve) => {
      function onAbort() {
        clearTimeout(id);
        abort.signal.removeEventListener('abort', onAbort);
        resolve();
      }

      const id = setTimeout(() => {
        abort.signal.removeEventListener('abort', onAbort);
        resolve();
      }, backoff);
      abort.signal.addEventListener('abort', onAbort);
    });
  }
}
