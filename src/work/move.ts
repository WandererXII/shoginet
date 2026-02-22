import type { MoveOrDrop } from 'shogiops/types';
import { defined, makeUsi, opposite, parseUsi } from 'shogiops/util';
import { DEFAULT_MOVE_MOVETIME_SECONDS } from '../consts.js';
import type { Engine } from '../engine.js';
import type { MoveWork } from '../types.js';
import type { Worker } from '../worker.js';
import { fixFairyUsi, positionFromWork } from './util.js';

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
    const parsed = parseUsi(fixedUsi);
    if (parsed) {
      const result = { move: { bestmove: makeUsi(parsed) } };
      worker.logger.debug('Emitting move result:', result);

      // verify legality - sanity check
      const pos = positionFromWork(work);
      if (!pos || !pos.isLegal(parsed))
        worker.logger.warn(
          `Coudln't verify legality of usi we are about to submit (${makeUsi(parsed)}):`,
          work,
        );

      worker.emit('result', work, result);
    } else {
      worker.logger.warn(`Aborting work:`, work);
      worker.emit('abort', work);
    }
  });

  engine.search(work.position, work.moves.split(' '), {
    movetime: serverConfig.movetime || DEFAULT_MOVE_MOVETIME_SECONDS * 1000,
    depth: serverConfig.depth,
    nodes: serverConfig.nodes,
    clock: work.work.clock,
  });
}

function engineBypass(work: MoveWork): MoveOrDrop | undefined {
  // Fairy plays only to checkmate and can't handle opposite check
  if (work.variant === 'dobutsu') {
    const pos = positionFromWork(work);
    if (!pos) return;

    const playerKing = pos.kingsOf(opposite(pos.turn)).singleSquare();
    if (!defined(playerKing)) return;

    const allMoves = pos.allMoveDests();

    // Fairy doesn't capture opponent's lion, so we do it ourselves
    // Doing this for all levels should be fine
    for (const [orig, dests] of allMoves.entries()) {
      if (dests.has(playerKing)) return { from: orig, to: playerKing };
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
    // at this point we know all moves put/keep us in check and no drops exist
    // so we return a random move
    const moves = allMoves.entries().find(([_, ds]) => ds.nonEmpty());
    if (moves) return { from: moves[0], to: moves[1].first()! };
  } else return;
}
