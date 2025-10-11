import { parseUsi } from 'shogiops/util';
import type { Work } from '../src/types.js';

export interface WorkDefinition {
  name: string;
  path: string;
  work: Work;
  validate: (response: any) => boolean | undefined;
}

function validateBestmove(response: any): boolean {
  const bm = response.move?.bestmove;
  const parsed = parseUsi(bm);
  return !!parsed;
}

export const works: WorkDefinition[] = [
  {
    name: 'Move (yaneuraou)',
    path: '/shoginet/move/A',
    work: {
      work: {
        type: 'move',
        id: 'A',
        level: 5,
        clock: { btime: 120000, wtime: 120000, inc: 0, byo: 0 },
        flavor: 'yaneuraou',
      },
      game_id: 'xxxxxxxx',
      position:
        'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1',
      variant: 'standard',
      moves: '4g4f',
    },
    validate: validateBestmove,
  },
  {
    name: 'Move (fairy)',
    path: '/shoginet/move/B',
    work: {
      work: {
        type: 'move',
        id: 'B',
        level: 1,
        clock: { btime: 120000, wtime: 120000, inc: 0, byo: 0 },
        flavor: 'fairy',
      },
      game_id: 'xxxxxxxx',
      position:
        'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1',
      variant: 'standard',
      moves: '4g4f',
    },
    validate: validateBestmove,
  },
  {
    name: 'Analysis',
    path: '/shoginet/analysis/C',
    work: {
      work: {
        type: 'analysis',
        id: 'C',
        flavor: 'yaneuraou',
      },
      nodes: 1250000,
      skipPositions: [0, 1, 2],
      game_id: 'xxxxxxxx',
      position:
        'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1',
      variant: 'standard',
      moves: '7g7f 3c3d 6i7h 2b8h+ 7i8h 5c5d 2g2f 8b5b 2f2e 5d5e 5i6h',
    },
    validate: (response: any) => {
      if (response.partial) return;
      const skipped = [0, 1, 2].every(
        (s) => response.analysis[s].skipped === true,
      );
      return skipped && response.analysis.length === 12;
    },
  },
  {
    name: 'Puzzle',
    path: '/shoginet/puzzle/D',
    work: {
      work: {
        type: 'puzzle',
        id: 'D',
        flavor: 'yaneuraou',
      },
      game_id: 'synthetic',
      position:
        'lnsgk4/1r3s3/1ppp3pp/p8/5+B3/2P1n4/PP3+bPPP/8R/L1SGKGS1L b GNL2Pn4p 27',
      variant: 'standard',
      moves: '3i3h',
    },
    validate: (response: any) => {
      return response.result === true;
    },
  },
];
