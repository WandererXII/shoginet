import type { Rules } from 'shogiops/types';

export type EngineKind = 'yaneuraou' | 'fairy';

export interface EngineInfo {
  name?: string;
  options?: string[];
  [key: string]: any;
}

export interface ScoreResult {
  mate?: number;
  cp?: number;
}

export type WorkType = 'move' | 'analysis' | 'puzzle';

interface BaseWork {
  work: {
    type: WorkType;
    id: string;
    engine: EngineKind;
  };
  game_id: string;
  position: string;
  variant?: Rules;
  moves: string;
}

export type Level = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export interface MoveWork extends BaseWork {
  work: {
    type: 'move';
    id: string;
    engine: EngineKind;
    level: Level;
    clock?: {
      wtime: number;
      btime: number;
      byo: number;
      inc: number;
    };
  };
}

export interface AnalysisWork extends BaseWork {
  work: {
    type: 'analysis';
    id: string;
    engine: EngineKind;
  };
  nodes: number;
  skipPositions: number[];
}

export interface PuzzleWork extends BaseWork {
  work: {
    type: 'puzzle';
    id: string;
    engine: EngineKind;
  };
}

export type Work = AnalysisWork | MoveWork | PuzzleWork;
