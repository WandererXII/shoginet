import { makeSfen, parseSfen } from 'shogiops/sfen';
import type { MoveOrDrop } from 'shogiops/types';
import {
  defined,
  makeUsi,
  opposite,
  parsePieceName,
  parseUsi,
} from 'shogiops/util';
import { DEFAULT_MOVE_MOVETIME_SECONDS } from '../consts.js';
import type { Engine } from '../engine.js';
import type { MoveWork } from '../types.js';
import type { Worker } from '../worker.js';
import { fixFairyUsi, positionFromWork, transformSfen } from './util.js';

export function move(worker: Worker, engine: Engine, work: MoveWork): void {
  worker.logger.debug('Starting move generation');

  const variant = work.variant || 'standard';
  const serverConfig =
    worker.serverConfig.config.move[engine.kind][work.work.level];

  const eb = engineBypass(work);
  if (eb) {
    const result = { move: { bestmove: makeUsi(eb) } };
    worker.logger.debug(`Bypassing engine and emitting move result:`, result);
    worker.emit('result', work, result);
    return;
  }

  if (engine.kind === 'fairy') {
    engine.setVariant(variant);
    if (serverConfig.skill) engine.setOption('Skill_Level', serverConfig.skill);
  }

  engine.setMultiPv(1);
  engine.send('usinewgame');

  engine.once('bestmove', (usi) => {
    const fixedUsi = engine.kind === 'fairy' ? fixFairyUsi(variant, usi) : usi;
    let parsed = parseUsi(fixedUsi);

    if (!parsed) {
      worker.logger.warn(`Received '${fixedUsi}' for:`, work);
      parsed = generateRandomMove(work);
    }

    if (parsed) {
      const result = { move: { bestmove: makeUsi(parsed) } };
      worker.logger.debug('Emitting move result:', result);

      // verify legality - sanity check
      const pos = positionFromWork(work);
      if (!pos || !pos.isLegal(parsed))
        worker.logger.warn(
          `Couldn't verify legality of usi we are about to submit (${makeUsi(parsed)}):`,
          work,
        );

      worker.emit('result', work, result);
    } else {
      worker.logger.warn(`Aborting work:`, work);
      worker.emit('abort', work);
    }
  });

  const sanitized = sanitizeForEngine(work);

  engine.search(
    sanitized.position,
    sanitized.moves.split(' ').filter((m) => !!m),
    {
      movetime: serverConfig.movetime || DEFAULT_MOVE_MOVETIME_SECONDS * 1000,
      depth: serverConfig.depth,
      nodes: serverConfig.nodes,
      clock: work.work.clock,
    },
  );
}

function engineBypass(work: MoveWork): MoveOrDrop | undefined {
  if (work.variant === 'dobutsu') {
    const pos = positionFromWork(work);
    if (!pos) return;
    const playerKing = pos.kingsOf(opposite(pos.turn)).singleSquare();

    const allMoves = pos.allMoveDests();

    // Fairy doesn't capture opponent's lion, so we do it ourselves
    // Doing this for all levels should be fine
    if (defined(playerKing)) {
      for (const [orig, dests] of allMoves.entries()) {
        if (dests.has(playerKing)) return { from: orig, to: playerKing };
      }
    }

    if (
      !pos.isCheck() &&
      pos
        .allDropDests()
        .values()
        .some((sqs) => sqs.nonEmpty())
    )
      return;

    // Fairy refuses to move into check, so if no other move is possible, we do it
    for (const [orig, dests] of allMoves.entries()) {
      for (const dest of dests) {
        const clone = pos.clone();
        clone.play({ from: orig, to: dest });
        clone.turn = opposite(clone.turn);
        if (!clone.isCheck()) return;
      }
    }

    // at this point we know all moves put/keep us in check
    // so we return a random move
    return generateRandomMove(work);
  } else return;
}

function generateRandomMove(work: MoveWork): MoveOrDrop | undefined {
  const pos = positionFromWork(work);
  if (!pos) return undefined;

  const movesAndDrops: MoveOrDrop[] = [];

  for (const [from, dests] of pos.allMoveDests().entries()) {
    for (const to of dests) movesAndDrops.push({ from, to });
  }
  for (const [pieceName, dests] of pos.allDropDests().entries()) {
    for (const to of dests)
      movesAndDrops.push({ role: parsePieceName(pieceName).role, to });
  }

  if (!movesAndDrops.length) return;

  return movesAndDrops[Math.floor(Math.random() * movesAndDrops.length)];
}

function sanitizeForEngine(work: MoveWork): {
  position: string;
  moves: string;
} {
  if (work.variant === 'dobutsu') {
    const variant = work.variant;
    const pos = parseSfen(variant, work.position, false);
    if (!pos.isOk) return { position: work.position, moves: work.moves };

    const wMoves = work.moves.split(' ').filter((wm) => !!wm);
    let oppositeCheckOccurred = false;

    for (const wMove of wMoves) {
      const parsedWMove = parseUsi(fixFairyUsi(variant, wMove));
      if (!parsedWMove) return { position: work.position, moves: work.moves };

      pos.value.play(parsedWMove);
      if (pos.value.isCheck(opposite(pos.value.turn)))
        oppositeCheckOccurred = true;
    }

    if (oppositeCheckOccurred)
      return {
        position: transformSfen(makeSfen(pos.value), {
          r: 'g',
          R: 'G',
          k: 'l',
          K: 'L',
          b: 'e',
          B: 'E',
          p: 'c',
          P: 'C',
        }),
        moves: '',
      };

    return { position: work.position, moves: work.moves };
  } else return { position: work.position, moves: work.moves };
}
