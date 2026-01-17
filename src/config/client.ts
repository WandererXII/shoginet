import os from 'node:os';
import config from 'config';
import { HASH_MIN, MAX_WORKERS } from '../consts.js';

interface Config {
  workers: number;
  engines: {
    yaneuraou: {
      path: string;
      threads: number;
      memory: number;
    };
    fairy: {
      path: string;
      threads: number;
      memory: number;
    };
  };
  logger: 'error' | 'warn' | 'info' | 'debug' | 'silly';
  key: string;
  endpoint: string;
}

export const clientConfig = config as unknown as Config;

export function verifyConfig(): void {
  const sc = clientConfig;
  const maxThreads = os.cpus().length;

  if (!sc.endpoint) throw 'No endpoint set';
  if (sc.workers <= 0 || sc.workers > MAX_WORKERS)
    throw `0 < workers <= ${MAX_WORKERS}`;
  if (sc.engines.fairy.threads < 1 || sc.engines.yaneuraou.threads < 1)
    throw 'Minimum 1 thread for every engine';
  if (
    sc.engines.fairy.threads > maxThreads ||
    sc.engines.yaneuraou.threads > maxThreads
  )
    throw `You can set up to ${maxThreads} with your CPU`;
  if (
    sc.engines.fairy.memory < HASH_MIN ||
    sc.engines.yaneuraou.memory < HASH_MIN
  )
    throw `Minimum ${HASH_MIN}MB memory per engine`;
  if (!['error', 'warn', 'info', 'debug', 'silly'].includes(sc.logger))
    throw 'Invalid logger level value';
}
