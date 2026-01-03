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

const requestTimestamps: number[] = [];
const MAX_REQUESTS_PER_SECOND = 8;
const RATE_LIMIT_WINDOW_MS = 1000;

async function checkRateLimit(): Promise<void> {
  const now = Date.now();

  while (
    requestTimestamps.length > 0 &&
    now - requestTimestamps[0] > RATE_LIMIT_WINDOW_MS
  ) {
    requestTimestamps.shift();
  }

  if (requestTimestamps.length >= MAX_REQUESTS_PER_SECOND) {
    const oldestRequest = requestTimestamps[0];
    const waitTime = RATE_LIMIT_WINDOW_MS - (now - oldestRequest);
    if (waitTime > 0) {
      baseLogger.info(`Rate limit reached, waiting ${waitTime}ms`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
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

function joinPathNoPrefix(path: string) {
  return new URL(path, clientConfig.endpoint).toString();
}

function joinPath(path: string) {
  return new URL(`shoginet/${path}`, clientConfig.endpoint).toString();
}

let lastLog: number;
export async function acquireWork(): Promise<Work | undefined> {
  try {
    await checkRateLimit();
    const url = joinPath('acquire');
    const response = await got.post(url, {
      timeout: { request: HTTP_TIMEOUT_IMPORTANT_SECONDS * 1000 },
      headers,
      retry: retry,
      json: makeJson({}),
    });
    const work = processResponse(response);
    return work;
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
    await checkRateLimit();
    const url = joinPath(`${work.work.type}/${work.work.id}`);
    const response = await got.post(url, {
      timeout: { request: HTTP_TIMEOUT_IMPORTANT_SECONDS * 1000 },
      headers,
      retry: retry,
      json: makeJson(res),
    });
    return processResponse(response);
  } catch (err: any) {
    baseLogger.error('Failed to submit work:', work, err?.response?.statusCode);
    return undefined;
  }
}

export async function abortWork(work: Work): Promise<void> {
  try {
    await checkRateLimit();
    await got.post(joinPath(`abort/${work.work.id}`), {
      timeout: { request: HTTP_TIMEOUT_UNIMPORTANT_SECONDS * 1000 },
      headers,
    });
  } catch (err: any) {
    baseLogger.error('Failed to abort work:', work, err?.response?.statusCode);
  }
}

export async function analysisProgressReport(
  work: Work,
  res: any,
): Promise<void> {
  try {
    await checkRateLimit();
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
