import got from 'got';
import semver from 'semver';
import pkg from '../package.json' with { type: 'json' };
import { MIN_FAIRY_VERSION, MIN_YANEURAOU_VERSION } from './consts.js';
import { baseLogger } from './logger.js';

export async function verifyVersion(): Promise<void> {
  const currentVersion = pkg.version;
  const repo = pkg.repository.url.split('/').slice(-2).join('/');

  const remotePkg = await got(
    `https://raw.githubusercontent.com/${repo}/main/package.json`,
  ).json<{ version: string }>();
  const remoteVersion = remotePkg.version;

  if (semver.gt(remoteVersion, currentVersion)) {
    const currentMajor = semver.major(currentVersion);
    const remoteMajor = semver.major(remoteVersion);

    if (remoteMajor > currentMajor) {
      throw `Major version update available: ${remoteVersion} (current: ${currentVersion}). Exiting.`;
    } else
      baseLogger.warn(
        `Newer version available: ${remoteVersion} (current: ${currentVersion}).`,
      );
  } else baseLogger.info(`Current version (${currentVersion}) is up-to-date.`);
}

export function verifyFairyVersion(versionStr: string): void {
  const match = versionStr.match(/Fairy-Stockfish (\d{6})/);
  if (!match) throw "Can't identify fairy version";

  const dateStr = match[1];
  const day = parseInt(dateStr.slice(0, 2), 10);
  const month = parseInt(dateStr.slice(2, 4), 10) - 1; // 0 based
  const year = 2000 + parseInt(dateStr.slice(4, 6), 10);

  const versionDate = new Date(year, month, day);
  if (versionDate < MIN_FAIRY_VERSION)
    throw `Fairy version is too old, please update the fairy engine (min: ${MIN_FAIRY_VERSION.toDateString()}, current: ${versionDate.toDateString()})`;
}

export function verifyYaneuraouVersion(versionStr: string): void {
  const match = versionStr.match(/YaneuraOu NNUE ([\d.]+)/);
  if (!match) throw "Can't identify YaneuraOu version";

  const version = parseFloat(match[1]);
  if (Number.isNaN(version)) throw 'Invalid YaneuraOu version format';

  if (version < MIN_YANEURAOU_VERSION)
    throw `YaneuraOu version is too old, please update the engine (min: ${MIN_YANEURAOU_VERSION}, current: ${match[1]})`;
}
