import { verifyConfig } from './config/client.js';
import { ServerConfig } from './config/server.js';
import { baseLogger } from './logger.js';
import { verifyVersion } from './version.js';
import { WorkerManager } from './worker-manager.js';

async function main(): Promise<void> {
  baseLogger.info('Starting shoginet...');

  baseLogger.info('Verifying config file...');
  try {
    verifyConfig();
  } catch (err) {
    baseLogger.error(`Invalid config file: ${err}`);
    process.exit(1);
  }

  const serverConfig = new ServerConfig();
  baseLogger.info('Fetching server config...');
  try {
    await serverConfig.initialize();
  } catch (err) {
    baseLogger.error(`Failed to fetch server config file: ${err}`);
    process.exit(1);
  }

  baseLogger.info('Verifying shoginet version...');
  try {
    await verifyVersion();
  } catch (err) {
    baseLogger.error(`Invalid version: ${err}`);
    // process.exit(1);
  }

  const workerManager = new WorkerManager(serverConfig);
  baseLogger.info('Initializing worker manager...');
  try {
    await workerManager.initialize();
  } catch (err) {
    baseLogger.error(`Couldn't initialize workers: ${err}`);
    process.exit(1);
  }

  let nextForceShutdown = false;
  const shutdown = async () => {
    if (!nextForceShutdown) {
      baseLogger.info('Shutting down...');
      nextForceShutdown = true;
      await workerManager.stop();
      baseLogger.info('Workers stopped');
    } else {
      baseLogger.info('Forcing shutdown...');
      await workerManager.forceStop();
      baseLogger.info('Workers stopped by force');
    }

    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  baseLogger.info('Shoginet is running...');
  await workerManager.start();
}

await main();
