import type { DropMove } from 'shogiops/types';
import { makeUsi, parseUsi } from 'shogiops/util';
import { promote } from 'shogiops/variant/util';
import type { ScoreResult } from '../types.js';

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

export function fromFairyKyotoFormat(usi: string): string {
  if (usi[0] === '+') {
    const dropUnpromoted = parseUsi(usi.slice(1)) as DropMove;
    const promotedRole = promote('kyotoshogi')(dropUnpromoted.role)!;
    return makeUsi({ role: promotedRole, to: dropUnpromoted.to });
  } else if (usi.includes('-')) return `${usi.slice(0, -1)}+`;
  else return usi;
}
