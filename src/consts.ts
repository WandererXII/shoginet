export const ANALYSIS_PROGRESS_INTERVAL_SECONDS = 7;
export const HTTP_TIMEOUT_IMPORTANT_SECONDS = 15;
export const HTTP_TIMEOUT_UNIMPORTANT_SECONDS = 10;
export const LOGGER_REPORT_INTERVAL_SECONDS: number = 30 * 60;
export const SERVER_CONFIG_REFETCH_SECONDS: number = 8 * 60 * 60;
export const MAX_BACKOFF_SECONDS = 35.0;
export const MAX_WORKERS = 3; // for now more than enough
export const DEFAULT_ANALYSIS_MOVETIME_SECONDS = 3;
export const DEFAULT_MOVE_MOVETIME_SECONDS = 0.5;
export const DEFAULT_PUZZLE_MOVETIME_SECONDS = 3;
export const WORKER_INIT_TIMEOUT_SECONDS = 30;
export const TASK_ANALYSIS_TIMEOUT_SECONDS: number = 10 * 60;
export const TASK_MOVE_TIMEOUT_SECONDS = 20;
export const TASK_PUZZLE_TIMEOUT_SECONDS: number = 4 * 60;

// engine
export const MIN_FAIRY_VERSION: Date = new Date(2025, 10 - 1, 6);
export const MIN_YANEURAOU_VERSION = 9;
export const HASH_MIN = 64;
