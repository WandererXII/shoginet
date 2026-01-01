import { makeUsi, parseUsi } from 'shogiops/util';
import { DEFAULT_MOVE_MOVETIME_SECONDS } from '../consts.js';
import type { Engine } from '../engine.js';
import type { MoveWork } from '../types.js';
import type { Worker } from '../worker.js';
import { fromFairyKyotoFormat } from './util.js';

export function move(worker: Worker, engine: Engine, work: MoveWork): void {
  worker.logger.debug('Starting move generation');

  const variant = work.variant || 'standard';
  const serverConfig =
    worker.serverConfig.config.move[engine.kind][work.work.level];

  if (engine.kind === 'fairy') {
    engine.setVariant(variant);
    if (serverConfig.skill) engine.setOption('Skill_Level', serverConfig.skill);
  }

  engine.setMultiPv(1);
  engine.send('usinewgame');

  engine.once('bestmove', (usi) => {
    const fixedUsi = variant === 'kyotoshogi' ? fromFairyKyotoFormat(usi) : usi;
    const parsed = parseUsi(fixedUsi);
    if (parsed) {
      const result = { move: { bestmove: makeUsi(parsed) } };
      worker.logger.debug('Emitting move result:', result);
      worker.emit('result', work, result);
    } else {
      worker.logger.warn(`Received '${fixedUsi}' for:`, work);
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
