import type { Color } from 'shogiops/types';
import { makeUsi, opposite, parseUsi } from 'shogiops/util';
import { DEFAULT_PUZZLE_MOVETIME_SECONDS } from '../consts.js';
import type { Engine } from '../engine.js';
import type { PuzzleWork, ScoreResult } from '../types.js';
import type { Worker } from '../worker.js';
import { parseInfo } from './util.js';

type MultiPvScores3 = [
  ScoreResult | undefined,
  ScoreResult | undefined,
  ScoreResult | undefined,
];

function winChances(score: ScoreResult): number {
  if (score.mate) return score.mate > 0 ? 1 : -1;
  else if (score.cp) return 2 / (1 + Math.exp(-0.0007 * score.cp)) - 1;
  else return 0;
}

function isAmbiguous(scores: MultiPvScores3): boolean {
  if (scores.filter((s) => !!s).length <= 1) return false;
  const bestScore = scores[0];
  const secondScore = scores[1];
  if (!bestScore || !secondScore) return false;
  else return winChances(bestScore) < winChances(secondScore) + 0.33;
}

export function puzzle(worker: Worker, engine: Engine, work: PuzzleWork): void {
  worker.logger.debug('Starting puzzle analysis');

  const moves: string[] = work.moves.split(' ');
  const initialMovesLength = moves.length;
  const position: string = work.position;

  const color: Color = position.split(' ')[1] !== 'w' ? 'sente' : 'gote';
  const winnerColor = initialMovesLength % 2 === 0 ? color : opposite(color);

  const serverConfig = worker.serverConfig.config.puzzle;

  if (engine.kind === 'fairy') {
    engine.setVariant('standard');
    engine.setOption('Skill_Level', '20');
    engine.setOption('USI_AnalyseMode', 'true');
  }
  // we need 2, but let's play it safe
  engine.setMultiPv(3);
  engine.send('usinewgame');

  const analysePly = (depth: number, color: Color) => {
    worker.logger.debug(`Analysing: ${depth} depth`);

    const scores: MultiPvScores3 = [undefined, undefined, undefined];

    const processScore = (args: string) => {
      const parsedInfo = parseInfo(args);
      const multipv = parsedInfo.multipv || 1;
      const score = parsedInfo.score;

      if (score !== undefined && scores.length >= multipv)
        scores[multipv - 1] = score;
    };

    engine.on('info', processScore);

    engine.once('bestmove', (usi) => {
      engine.off('info', processScore);

      const parsed = parseUsi(usi);
      if (
        parsed &&
        (!serverConfig.maxLength || depth < serverConfig.maxLength) &&
        (color !== winnerColor || !isAmbiguous(scores))
      ) {
        moves.push(makeUsi(parsed));
        analysePly(depth + 1, opposite(color));
      } else {
        const result = { result: moves.length > initialMovesLength };
        worker.logger.debug('Emitting move result:', result);
        worker.emit('result', work, result);
      }
    });

    engine.search(position, moves, {
      movetime: serverConfig.movetime || DEFAULT_PUZZLE_MOVETIME_SECONDS * 1000,
      depth: serverConfig.depth,
      nodes: undefined,
      clock: undefined,
    });
  };

  analysePly(0, color);
}
