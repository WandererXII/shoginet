import { makeSfen, parseSfen } from 'shogiops/sfen';
import type { Color } from 'shogiops/types';
import { isDrop, makeUsi, opposite, parseUsi } from 'shogiops/util';
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

interface UsiWithScore {
  usi: string;
  score: ScoreResult | undefined;
}

export function puzzle(worker: Worker, engine: Engine, work: PuzzleWork): void {
  worker.logger.debug('Starting puzzle analysis');

  const shogi = parseSfen('standard', work.position, false);
  const workUsis = work.moves.split(' ').filter((m) => m);
  const workMoves = workUsis.map((m) => parseUsi(m));
  if (shogi.isErr || workMoves.some((m) => m === undefined)) {
    worker.logger.error(
      'Could not parse position or moves',
      work.position,
      work.moves,
    );
    worker.emit('result', work, { result: false });
    return;
  }
  const workSfen = makeSfen(shogi.value);
  // we want to normalize all games to start from POV of the winner
  workMoves.forEach((m) => {
    shogi.value.play(m!);
  });

  const winnerColor = shogi.value.turn;
  const initialSfen = makeSfen(shogi.value);

  if (engine.kind === 'fairy') {
    engine.setVariant('standard');
    engine.setOption('Skill_Level', '20');
    engine.setOption('USI_AnalyseMode', 'true');
  }
  // we need 2, but let's play it safe
  engine.setMultiPv(3);
  engine.send('usinewgame');

  const serverConfig = worker.serverConfig.config.puzzle;
  const resultUsis: string[] = [];
  const bestScores: (ScoreResult | undefined)[] = [];

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
        resultUsis.push(makeUsi(parsed));
        bestScores.push(scores[0]);
        analysePly(depth + 1, opposite(color));
      } else {
        // we need to stop at our move
        const trimmedResultUsis =
          resultUsis.length % 2 ? resultUsis : resultUsis.slice(0, -1);
        const filteredResultUsis = clearFutileInterposition(trimmedResultUsis);
        const doWeHavePuzzle = !!filteredResultUsis;
        const result: any = { rejected: !doWeHavePuzzle };

        if (doWeHavePuzzle) {
          const puzzleResult = {
            sfen: workSfen,
            line: [...workUsis, ...filteredResultUsis].join(' '),
            themes: detectThemes(
              initialSfen,
              filteredResultUsis.map((u, i) => {
                return { usi: u, score: bestScores[i] };
              }),
            ),
          };
          result.puzzle = puzzleResult;
        }
        worker.logger.debug('Emitting move result:', result);
        worker.emit('result', work, result);
      }
    });

    engine.search(initialSfen, resultUsis, {
      movetime: serverConfig.movetime || DEFAULT_PUZZLE_MOVETIME_SECONDS * 1000,
      depth: serverConfig.depth,
      nodes: undefined,
      clock: undefined,
    });
  };

  analysePly(0, winnerColor);
}

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

export function detectThemes(
  sfen: string,
  scoredUsis: UsiWithScore[],
): string[] {
  const themes = new Set<string>();

  if (scoredUsis.length === 0) return [];

  const depth = scoredUsis.length;
  const initialScore = scoredUsis[0].score;

  if (depth === 1) themes.add('oneMove');
  else if (depth === 3) themes.add('short');
  else if (depth === 5) themes.add('long');
  else themes.add('veryLong');

  if (initialScore?.mate) {
    themes.add('mate');

    if (depth === 1) themes.add('mateIn1');
    else if (depth === 3) themes.add('mateIn3');
    else if (depth === 5) themes.add('mateIn5');
    else if (depth === 7) themes.add('mateIn7');
    else if (depth === 9) themes.add('mateIn9');
  } else if (initialScore?.cp !== undefined) {
    const cp = initialScore.cp;
    if (cp >= 2000) themes.add('crushing');
    else if (cp >= 700) themes.add('advantage');
    else if (Math.abs(cp) < 350) themes.add('equality');
  }

  if (initialScore?.mate) {
    const shogi = parseSfen('standard', sfen, false);

    if (shogi.isOk) {
      let isTsume = true;

      for (let i = 0; i < depth; i += 1) {
        const moveUsi = scoredUsis[i].usi;
        const move = parseUsi(moveUsi);

        if (!move) {
          isTsume = false;
          break;
        }

        shogi.value.play(move);

        if (i % 2 === 0) {
          if (!shogi.value.isCheck()) {
            isTsume = false;
            break;
          }
        }
      }

      if (isTsume) themes.add('tsume');
    }
  }

  return Array.from(themes).sort();
}

function clearFutileInterposition(usis: string[]): string[] {
  function isFutilePair(defenderUsi: string, attackerUsi: string): boolean {
    const defMove = parseUsi(defenderUsi);
    const atkMove = parseUsi(attackerUsi);

    if (!defMove || !atkMove) return false;
    console.log(isDrop(defMove), atkMove.to, defMove.to);

    return isDrop(defMove) && atkMove.to === defMove.to;
  }

  let cutoffIndex = usis.length;

  const startIndex = usis.length - 2;

  for (let i = startIndex; i >= 1; i -= 2) {
    const defenderUsi = usis[i];
    const attackerUsi = usis[i + 1];

    console.log('checking', defenderUsi, attackerUsi);

    if (isFutilePair(defenderUsi, attackerUsi)) {
      cutoffIndex = i;
    } else {
      break;
    }
  }

  return usis.slice(0, cutoffIndex);
}
