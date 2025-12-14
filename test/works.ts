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

interface PuzzleValidationSpec {
  result: boolean;
  themes: string[];
  sfen: string;
  line: string[];
}

function validatePuzzle(
  response: PuzzleValidationSpec,
  expected: PuzzleValidationSpec,
): boolean {
  if (response.result !== expected.result) {
    console.error('Mismatch: result', {
      response: response.result,
      expected: expected.result,
    });
    return false;
  }

  if (!Array.isArray(response.themes)) {
    console.error('Invalid: themes is not an array', {
      response: response.themes,
    });
    return false;
  }

  if (response.themes.length !== expected.themes.length) {
    console.error('Mismatch: themes length', {
      response: response.themes.length,
      expected: expected.themes.length,
    });
    return false;
  }

  if (
    !(response.themes as string[]).every((t) => expected.themes.includes(t))
  ) {
    console.error('Mismatch: themes content', {
      response: response.themes,
      expected: expected.themes,
    });
    return false;
  }

  if (response.sfen !== expected.sfen) {
    console.error('Mismatch: sfen', {
      response: response.sfen,
      expected: expected.sfen,
    });
    return false;
  }

  if (JSON.stringify(response.line) !== JSON.stringify(expected.line)) {
    console.error('Mismatch: line', {
      response: response.line,
      expected: expected.line,
    });
    return false;
  }

  return true;
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
        engine: 'yaneuraou',
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
        engine: 'fairy',
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
        engine: 'yaneuraou',
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
    name: 'Puzzle - game (b)',
    path: '/shoginet/puzzle/1',
    work: {
      work: {
        type: 'puzzle',
        id: '1',
        engine: 'yaneuraou',
      },
      game_id: 'synthetic',
      position:
        'lnsgk4/1r3s3/1ppp3pp/p8/5+B3/2P1n4/PP3+bPPP/8R/L1SGKGS1L b GNL2Pn4p 27',
      variant: 'standard',
      moves: '3i3h',
    },
    validate: (response: any) => {
      const valid = validatePuzzle(response, {
        result: true,
        themes: ['mate', 'mateIn1', 'oneMove', 'tsume'],
        sfen: 'lnsgk4/1r3s3/1ppp3pp/p8/5+B3/2P1n4/PP3+bPPP/8R/L1SGKGS1L b GNL2Pn4p 27',
        line: ['3i3h', 'N*6g'],
      });
      if (!valid) console.error(response);
      return valid;
    },
  },
  {
    name: 'Puzzle - futile interposition (b)',
    path: '/shoginet/puzzle/2',
    work: {
      work: {
        type: 'puzzle',
        id: '2',
        engine: 'yaneuraou',
      },
      game_id: 'synthetic',
      position: '9/1kg6/1psg5/2ppp4/9/2P6/1P3+p+p+p+p/9/L6K1 b BSgsnlp 1',
      variant: 'standard',
      moves: '',
    },
    validate: (response: any) => {
      return validatePuzzle(response, {
        result: true,
        themes: ['mate', 'mateIn5', 'tsume', 'long'],
        sfen: '9/1kg6/1psg5/2ppp4/9/2P6/1P3+p+p+p+p/9/L6K1 b BSgsnlp 1',
        line: ['B*9c', '8b8a', 'S*9b', '8a9b', '9c7a+'],
      });
    },
  },
  {
    name: 'Puzzle - futile interposition (w)',
    path: '/shoginet/puzzle/3',
    work: {
      work: {
        type: 'puzzle',
        id: '3',
        engine: 'fairy',
      },
      game_id: 'synthetic',
      position: '9/9/9/9/pPP6/1K7/PS1s5/3+r5/1R2b4 w B2G2S2N2L4P 1',
      variant: 'standard',
      moves: '',
    },
    validate: (response: any) => {
      return validatePuzzle(response, {
        result: true,
        themes: ['mate', 'mateIn1', 'tsume', 'oneMove'],
        sfen: '9/9/9/9/pPP6/1K7/PS1s5/3+r5/1R2b4 w B2G2S2N2L4P 1',
        line: ['6h7i'],
      });
    },
  },
];
