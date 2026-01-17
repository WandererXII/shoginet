import got, { type Method, type Response } from 'got';
import { StatusCodes } from 'http-status-codes';
import pkg from '../package.json' with { type: 'json' };
import { clientConfig } from './config/client.js';
import {
  HTTP_TIMEOUT_IMPORTANT_SECONDS,
  HTTP_TIMEOUT_UNIMPORTANT_SECONDS,
  MAX_REQUESTS_PER_SECOND,
  TOO_MANY_REQUESTS_SLEEP_SECONDS,
} from './consts.js';
import { baseLogger } from './logger.js';
import type { Work } from './types.js';

const headers = {
  'shoginet-version': pkg.version,
  'shoginet-key': clientConfig.key,
};

const requestTimestamps: number[] = [];

async function checkRateLimit(opts: { urgent: boolean }): Promise<void> {
  const now = Date.now();

  while (requestTimestamps.length > 0 && now - requestTimestamps[0] > 1000) {
    requestTimestamps.shift();
  }

  if (requestTimestamps.length >= MAX_REQUESTS_PER_SECOND) {
    const oldestRequest = requestTimestamps[0];
    const waitTime = 1000 - (now - oldestRequest);
    if (waitTime > 0) {
      const actualWaitTime = Math.max(waitTime, opts.urgent ? 100 : 500);
      baseLogger.debug(`Rate limit reached, waiting ${actualWaitTime}ms`);
      await new Promise((resolve) => setTimeout(resolve, actualWaitTime));
    }
  }

  requestTimestamps.push(Date.now());
}

function makeJson(res: Record<string, any>) {
  return {
    ...res,
    shoginet: {
      version: pkg.version,
      apikey: clientConfig.key,
    },
  };
}

const retry = {
  limit: 3,
  methods: ['POST'] as Method[],
  statusCodes: [429],
};

async function processResponse(
  res: Response<string>,
): Promise<Work | undefined> {
  if (res.statusCode === StatusCodes.NO_CONTENT) return undefined;
  if (res.statusCode === StatusCodes.ACCEPTED)
    return JSON.parse(res.body) as Work;
  if (res.statusCode === StatusCodes.UNAUTHORIZED) {
    baseLogger.error(res.body);
    process.emit('SIGINT');
    return undefined;
  }
  if (res.statusCode === StatusCodes.TOO_MANY_REQUESTS) {
    baseLogger.warn(
      `Too many requests, sleeping for ${TOO_MANY_REQUESTS_SLEEP_SECONDS}s...`,
    );
    await new Promise((resolve) =>
      setTimeout(resolve, TOO_MANY_REQUESTS_SLEEP_SECONDS * 1000),
    );
    return undefined;
  }
  throw new Error(`Unexpected status: ${res.statusCode}`);
}

function joinPathNoPrefix(path: string) {
  return new URL(path, clientConfig.endpoint).toString();
}

function joinPath(path: string) {
  return new URL(`shoginet/${path}`, clientConfig.endpoint).toString();
}

let lastLog: number;
export async function acquireWork(): Promise<Work | undefined> {
  try {
    await checkRateLimit({ urgent: false });
    const url = joinPath('acquire');
    const response = await got.post(url, {
      timeout: { request: HTTP_TIMEOUT_IMPORTANT_SECONDS * 1000 },
      headers,
      throwHttpErrors: false,
      retry: retry,
      json: makeJson({}),
    });
    const newWork = await processResponse(response);
    return newWork;
  } catch (err) {
    if (!lastLog || Date.now() - lastLog > 60 * 1000 * 5) {
      baseLogger.error('Failed to acquire work.', err);
      lastLog = Date.now();
    }
    return undefined;
  }
}

export async function submitWork(
  work: Work,
  res: Record<string, any>,
): Promise<Work | undefined> {
  try {
    await checkRateLimit({ urgent: true });
    const url = joinPath(`${work.work.type}/${work.work.id}`);
    const response = await got.post(url, {
      timeout: { request: HTTP_TIMEOUT_IMPORTANT_SECONDS * 1000 },
      headers,
      retry: retry,
      throwHttpErrors: false,
      json: makeJson(res),
    });
    const newWork = await processResponse(response);
    return newWork;
  } catch (err: any) {
    baseLogger.error('Failed to submit work:', work, err);
    return undefined;
  }
}

export async function abortWork(work: Work): Promise<void> {
  try {
    await checkRateLimit({ urgent: false });
    await got.post(joinPath(`abort/${work.work.id}`), {
      timeout: { request: HTTP_TIMEOUT_UNIMPORTANT_SECONDS * 1000 },
      headers,
    });
  } catch (err: any) {
    baseLogger.error('Failed to abort work:', work, err);
  }
}

export async function analysisProgressReport(
  work: Work,
  res: any,
): Promise<void> {
  try {
    await checkRateLimit({ urgent: true });
    await got.post(joinPath(`${work.work.type}/${work.work.id}`), {
      timeout: { request: HTTP_TIMEOUT_UNIMPORTANT_SECONDS * 1000 },
      headers,
      json: makeJson({ ...res, partial: true }),
    });
  } catch (_) {
    baseLogger.warn(`Failed to submit analysis progress.`);
  }
}

export function getServerConfig(): Promise<any> {
  return got
    .get(joinPathNoPrefix('assets/shoginet/config.json'), {
      timeout: { request: HTTP_TIMEOUT_IMPORTANT_SECONDS * 1000 },
      headers,
    })
    .json();
}
