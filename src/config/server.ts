import { SERVER_CONFIG_REFETCH_SECONDS } from '../consts.js';
import { getServerConfig } from '../http.js';
import { baseLogger } from '../logger.js';
import type { Level } from '../types.js';

type LevelSettings = {
  [level in `${Level}`]: {
    skill?: number;
    movetime?: number;
    depth?: number;
    nodes?: number;
  };
};

interface Config {
  analysis: {
    movetime?: number;
    nodes?: number;
    depth?: number;
  };
  puzzle: {
    movetime?: number;
    depth?: number;
    maxLength?: number;
  };
  move: {
    fairy: LevelSettings;
    yaneuraou: LevelSettings;
  };
}

export class ServerConfig {
  public config!: Config;
  private logger = baseLogger.getSubLogger({
    name: 'server-config',
  });

  async initialize(): Promise<void> {
    await this.load();
    this.startPeriodicRefresh();
  }

  private startPeriodicRefresh(): void {
    setInterval(() => {
      try {
        this.load();
      } catch {
        this.logger.error('Failed to load config from server');
      }
    }, SERVER_CONFIG_REFETCH_SECONDS * 1000);
  }

  async load(): Promise<void> {
    const newConfig = await getServerConfig();
    this.logger.debug('New config loaded:', newConfig);
    if (!newConfig || typeof newConfig !== 'object')
      throw new Error('Received invalid config from server');

    this.config = newConfig;
  }
}
