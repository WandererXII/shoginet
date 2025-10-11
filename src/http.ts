import got, { type Response } from 'got';
import { StatusCodes } from 'http-status-codes';
import pkg from '../package.json' with { type: 'json' };
import { clientConfig } from './config/client.js';
import {
  HTTP_TIMEOUT_IMPORTANT_SECONDS,
  HTTP_TIMEOUT_UNIMPORTANT_SECONDS,
} from './consts.js';
import { baseLogger } from './logger.js';
import type { Work } from './types.js';

const headers = {
  'shoginet-version': pkg.version,
  'shoginet-key': clientConfig.key,
};

function og(res: Record<string, any>) {
  return {
    ...res,
    shoginet: {
      version: pkg.version,
      python: 'NO',
      apikey: clientConfig.key,
    },
    yaneuraou: { name: 'Y', options: {} },
    fairy: { name: 'F', options: {} },
  };
}

function processResponse(res: Response<string>): Work | undefined {
  if (res.statusCode === StatusCodes.NO_CONTENT) return undefined;
  if (res.statusCode === StatusCodes.ACCEPTED)
    return JSON.parse(res.body) as Work;
  if (res.statusCode === StatusCodes.UNAUTHORIZED) {
    baseLogger.error(res.body);
    process.exit(1);
  }
  throw new Error(`Unexpected status ${res.statusCode}: ${res}`);
}

function joinPath(path: string) {
  return new URL(`shoginet/${path}`, clientConfig.endpoint).toString();
}

export async function acquireWork(): Promise<Work | undefined> {
  try {
    const url = joinPath('acquire');
    const response = await got.post(url, {
      timeout: { request: HTTP_TIMEOUT_IMPORTANT_SECONDS * 1000 },
      headers,
      throwHttpErrors: false,
      json: og({}),
    });
    const work = processResponse(response);
    return work;
  } catch (err) {
    baseLogger.error('Failed to acquire work:', err);
    return undefined;
  }
}

export async function submitWork(
  work: Work,
  res: Record<string, any>,
): Promise<Work | undefined> {
  try {
    const url = joinPath(`${work.work.type}/${work.work.id}`);
    const response = await got.post(url, {
      timeout: { request: HTTP_TIMEOUT_IMPORTANT_SECONDS * 1000 },
      headers,
      json: og(res),
    });
    return processResponse(response);
  } catch (err) {
    baseLogger.error('Failed to submit work:', err);
    return undefined;
  }
}

export async function abortWork(work: Work): Promise<void> {
  try {
    await got.post(joinPath(`abort/${work.work.id}`), {
      timeout: { request: HTTP_TIMEOUT_UNIMPORTANT_SECONDS * 1000 },
      headers,
    });
  } catch (err) {
    baseLogger.error(`Failed to abort work: ${err}`);
  }
}

export async function analysisProgressReport(
  work: Work,
  res: any,
): Promise<void> {
  try {
    await got.post(joinPath(`${work.work.type}/${work.work.id}`), {
      timeout: { request: HTTP_TIMEOUT_UNIMPORTANT_SECONDS * 1000 },
      headers,
      json: og({ ...res, partial: true }),
    });
  } catch (err) {
    baseLogger.warn(`Failed to submit analysis progress: ${err}`);
  }
}

export function getServerConfig(): Promise<any> {
  return got
    .get(joinPath('config'), {
      timeout: { request: HTTP_TIMEOUT_IMPORTANT_SECONDS * 1000 },
      headers,
    })
    .json();
}
