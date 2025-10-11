import { LOGGER_REPORT_INTERVAL_SECONDS } from './consts.js';
import type { Work, WorkType } from './types.js';
import type { Worker } from './worker.js';

export class StatsReporter {
  private submittedWork: Record<WorkType, number> = {
    move: 0,
    analysis: 0,
    puzzle: 0,
  };

  private logger: Worker['logger'];
  private interval: NodeJS.Timeout | undefined;

  constructor(private worker: Worker) {
    this.logger = worker.logger.getSubLogger({
      name: 'reporter',
    });

    this.bindEvents();

    this.interval = setInterval(() => {
      this.logger.info(
        `Total: ${this.submittedWork.move} moves, ${this.submittedWork.analysis} analysis, ${this.submittedWork.puzzle} puzzles`,
      );
    }, LOGGER_REPORT_INTERVAL_SECONDS * 1000);
  }

  public stop(): void {
    clearInterval(this.interval);
  }

  private bindEvents(): void {
    this.worker.on('result', (work: Work) => {
      this.submittedWork[work.work.type]++;
    });
  }
}
