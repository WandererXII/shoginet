import EventEmitter from 'node:events';
import type { ServerConfig } from './config/server.js';
import {
  TASK_ANALYSIS_TIMEOUT_SECONDS,
  TASK_MOVE_TIMEOUT_SECONDS,
  TASK_PUZZLE_TIMEOUT_SECONDS,
} from './consts.js';
import { Engine } from './engine.js';
import { abortWork } from './http.js';
import { baseLogger } from './logger.js';
import { StatsReporter } from './stats-reporter.js';
import type {
  AnalysisWork,
  EngineKind,
  MoveWork,
  PuzzleWork,
  Work,
} from './types.js';
import { analysis } from './work/analysis.js';
import { move } from './work/move.js';
import { puzzle } from './work/puzzle.js';

export interface WorkerEvents {
  initialized: () => void;
  available: () => void;
  result: (work: Work, result: any) => void;
  abort: (work: Work) => void;
}

export declare interface Worker {
  on<U extends keyof WorkerEvents>(event: U, listener: WorkerEvents[U]): this;
  emit<U extends keyof WorkerEvents>(
    event: U,
    ...args: Parameters<WorkerEvents[U]>
  ): boolean;
}

export class Worker extends EventEmitter {
  public engines: Record<EngineKind, Engine | undefined> = {
    yaneuraou: undefined,
    fairy: undefined,
  };
  public currentWork: Work | undefined = undefined;
  public logger: typeof baseLogger;

  private taskTimeout: NodeJS.Timeout | undefined;
  private statsReporter: StatsReporter;

  constructor(
    public readonly index: number,
    public readonly serverConfig: ServerConfig,
  ) {
    super();

    this.logger = baseLogger.getSubLogger({
      name: `worker-${this.index}`,
    });
    this.statsReporter = new StatsReporter(this);

    this.on('result', () => {
      clearTimeout(this.taskTimeout);
    });
  }

  initialize(): void {
    const enginesInitialized: Record<EngineKind, boolean> = {
      yaneuraou: !!this.engines.yaneuraou?.isActive,
      fairy: !!this.engines.fairy?.isActive,
    };

    if (enginesInitialized.fairy && enginesInitialized.yaneuraou) {
      this.emit('initialized');
      return;
    }

    const onReady = (kind: EngineKind) => {
      enginesInitialized[kind] = true;
      if (enginesInitialized.fairy && enginesInitialized.yaneuraou)
        this.emit('initialized');
    };

    const onFailure = () => {
      if (this.currentWork) {
        this.logger.error('Aborting work due to failue', this.currentWork);
        abortWork(this.currentWork);
      }
      this.initialize();
    };

    const engineKinds: EngineKind[] = ['yaneuraou', 'fairy'];
    engineKinds.forEach((kind) => {
      const curEngine = this.engines[kind];
      if (!curEngine?.isActive) {
        this.logger.info(`Initializing ${kind} engine`);

        curEngine?.destroy();

        const newEngine = new Engine(this, kind);
        newEngine.once('readyok', () => onReady(kind));
        newEngine.once('failure', onFailure);

        this.engines[kind] = newEngine;
      }
    });
  }

  stop(): void {
    this.logger.info('Stopping...');

    this.statsReporter.stop();
    this.removeAllListeners();
    this.engines.yaneuraou?.destroy();
    this.engines.fairy?.destroy();

    this.engines.yaneuraou = undefined;
    this.engines.fairy = undefined;
  }

  isAvailable(): boolean {
    return (
      !!this.engines.yaneuraou?.isActive &&
      !!this.engines.fairy?.isActive &&
      !this.currentWork
    );
  }

  task(work: Work): void {
    const workType = work.work.type;
    const engine = this.engines[work.work.flavor];

    if (!engine || !engine.isActive) {
      this.logger.error('Engine not found');
      this.initialize();
      return;
    }

    this.currentWork = work;

    const onTimeout = () => {
      // no need to abort - server gave up a long time ago
      engine.destroy();
      this.release();
    };

    if (workType === 'analysis') {
      this.taskTimeout = setTimeout(
        onTimeout,
        TASK_ANALYSIS_TIMEOUT_SECONDS * 1000,
      );
      analysis(this, engine, work as AnalysisWork);
    } else if (workType === 'move') {
      this.taskTimeout = setTimeout(
        onTimeout,
        TASK_MOVE_TIMEOUT_SECONDS * 1000,
      );
      move(this, engine, work as MoveWork);
    } else if (workType === 'puzzle') {
      this.taskTimeout = setTimeout(
        onTimeout,
        TASK_PUZZLE_TIMEOUT_SECONDS * 1000,
      );
      puzzle(this, engine, work as PuzzleWork);
    } else {
      this.release();
      this.logger.error(`Invalid work type: ${workType}`);
    }
  }

  release(): void {
    this.currentWork = undefined;
    this.emit('available');
  }
}
