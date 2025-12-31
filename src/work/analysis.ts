import {
  ANALYSIS_PROGRESS_INTERVAL_SECONDS,
  DEFAULT_ANALYSIS_MOVETIME_SECONDS,
} from '../consts.js';
import type { Engine } from '../engine.js';
import { analysisProgressReport } from '../http.js';
import type { AnalysisWork } from '../types.js';
import type { Worker } from '../worker.js';
import { type ParsedInfo, parseInfo } from './util.js';

export function analysis(
  worker: Worker,
  engine: Engine,
  work: AnalysisWork,
): void {
  worker.logger.debug('Starting analysis');

  const variant = work.variant || 'standard';
  const moves: string[] = work.moves.split(' ');
  const skip = work.skipPositions ?? [];
  const serverConfig = worker.serverConfig.config.analysis;

  if (engine.kind === 'fairy') {
    engine.setVariant(variant);
    engine.setOption('USI_AnalyseMode', true);
    engine.setOption('Skill_Level', 20);
  }
  engine.setMultiPv(1);
  engine.send('usinewgame');

  const result: any = Array(moves.length + 1).fill(null);

  const start = Date.now();
  let lastProgress = start;

  const analysePly = (ply: number): void => {
    if (ply < 0) {
      worker.logger.debug('Emitting analysis result:', result);
      worker.emit('result', work, { analysis: result });
      return;
    }

    if (skip.includes(ply)) {
      worker.logger.debug(`Skipping analysis: ${ply} ply`);
      result[ply] = { skipped: true };
      analysePly(ply - 1);
      return;
    }
    worker.logger.debug(`Analysing: ${ply} ply`);

    const now = Date.now();
    if (now > lastProgress + ANALYSIS_PROGRESS_INTERVAL_SECONDS * 1000) {
      analysisProgressReport(work, { analysis: result });
      lastProgress = now;
    }

    let deepestInfo: ParsedInfo | undefined;
    const processInfo = (args: string) => {
      const parsed = parseInfo(args);
      if (
        !parsed.depth ||
        !deepestInfo?.depth ||
        parsed.depth >= deepestInfo.depth
      )
        deepestInfo = parsed;
    };

    engine.on('info', processInfo);

    engine.once('bestmove', () => {
      engine.off('info', processInfo);
      result[ply] = deepestInfo;
      analysePly(ply - 1);
    });

    engine.search(work.position, moves.slice(0, ply), {
      nodes: serverConfig.nodes,
      movetime:
        serverConfig.movetime || DEFAULT_ANALYSIS_MOVETIME_SECONDS * 1000,
      depth: serverConfig.depth,
      clock: undefined,
    });
  };

  analysePly(moves.length);
}
