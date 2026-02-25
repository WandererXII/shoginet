import { parseSfen } from 'shogiops/sfen';
import type { DropMove, Rules } from 'shogiops/types';
import { makeUsi, parseUsi } from 'shogiops/util';
import type { Position } from 'shogiops/variant/position';
import { promote } from 'shogiops/variant/util';
import type { BaseWork, ScoreResult } from '../types.js';

export type ParsedInfo = {
  depth?: number;
  seldepth?: number;
  score?: ScoreResult;
  multipv?: number;
  nodes?: number;
  nps?: number;
  time?: number;
  pv?: string; // space separated
};

export function parseInfo(line: string): ParsedInfo {
  const tokens = line.trim().split(/\s+/);
  const out: ParsedInfo = {};

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    switch (t) {
      case 'depth':
        out.depth = Number(tokens[++i]);
        break;
      case 'seldepth':
        out.seldepth = Number(tokens[++i]);
        break;
      case 'score': {
        const scoreType = tokens[++i]; // "cp" or "mate"
        const val = Number(tokens[++i]);
        out.score = {};
        if (scoreType === 'cp') out.score.cp = val;
        else if (scoreType === 'mate') out.score.mate = val;
        break;
      }
      case 'multipv':
        out.multipv = Number(tokens[++i]);
        break;
      case 'nodes':
        out.nodes = Number(tokens[++i]);
        break;
      case 'nps':
        out.nps = Number(tokens[++i]);
        break;
      case 'time':
        out.time = Number(tokens[++i]);
        break;
      case 'pv':
        out.pv = tokens.slice(i + 1).join(' ');
        i = tokens.length;
        break;
    }
  }

  return out;
}

export function positionFromWork(work: BaseWork): Position | undefined {
  const variant = work.variant || 'standard';
  const pos = parseSfen(variant, work.position, false);
  if (pos.isOk) {
    const wMoves = work.moves.split(' ').filter((wm) => !!wm);
    for (const wMove of wMoves) {
      const parsedWMove = parseUsi(fixFairyUsi(variant, wMove));
      if (parsedWMove) pos.value.play(parsedWMove);
      else return;
    }

    return pos.value;
  }
}

export function fixFairyUsi(variant: Rules, usi: string): string {
  if (variant === 'kyotoshogi') return fromFairyKyotoFormat(usi);
  else if (variant === 'dobutsu') return fromFairyDobutsuFormat(usi);
  else return usi;
}

function fromFairyKyotoFormat(usi: string): string {
  if (usi[0] === '+') {
    const dropUnpromoted = parseUsi(usi.slice(1)) as DropMove;
    const promotedRole = promote('kyotoshogi')(dropUnpromoted.role)!;
    return makeUsi({ role: promotedRole, to: dropUnpromoted.to });
  } else if (usi.includes('-')) return `${usi.slice(0, -1)}+`;
  else return usi;
}

function fromFairyDobutsuFormat(usi: string): string {
  const reverse: Record<string, string> = {
    g: 'r',
    G: 'R',
    l: 'k',
    L: 'K',
    e: 'b',
    E: 'B',
    c: 'p',
    C: 'P',
  };

  // drops - C*2b -> P*2b
  if (usi[1] === '*') {
    const role = usi[0];
    return (reverse[role] || role) + usi.slice(1);
  }

  return usi;
}

export function transformSfen(sfen: string, mapping: Record<string, string>) {
  return sfen
    .split('')
    .map((c) => mapping[c] || c)
    .join('');
}
