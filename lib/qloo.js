// Qloo access layer.
//
// Every Qloo call in this app goes through the public `@qloo/qloo-harness`
// package (`qloo exec` / `qloo search`) — the authorized surface listed in the
// hackathon kit's API_ACCESS.md. The credential lives only in the server
// environment (QLOO_API_KEY); it is never sent to the browser, never logged,
// and never written to the repository.
//
// The layer adds: bounded concurrency, a short-lived cache (smallest request
// that answers the question, respect the quota), a daily call budget, bounded
// retries, and a trace of every call so the UI can show what the agent did.

import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mockExec, mockSearch } from './mock.js';

const MOCK = process.env.QLOO_MOCK === '1' && process.env.NODE_ENV !== 'production';
const CALL_TIMEOUT_MS = Number(process.env.QLOO_TIMEOUT_MS || 45_000);
const MAX_CONCURRENT = Number(process.env.QLOO_MAX_CONCURRENT || 3);
const CACHE_TTL_MS = Number(process.env.QLOO_CACHE_TTL_MS || 15 * 60_000);
const DAILY_BUDGET = Number(process.env.QLOO_DAILY_BUDGET || 1500);
const MAX_RETRIES = 1;

let harnessBin = null;
function resolveHarness() {
  if (harnessBin) return harnessBin;
  // The package restricts "exports", so locate it on disk instead of require.resolve.
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i += 1) {
    const pkgDir = join(dir, 'node_modules', '@qloo', 'qloo-harness');
    const pkgPath = join(pkgDir, 'package.json');
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      const rel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.qloo;
      harnessBin = join(pkgDir, rel || 'dist/bin.js');
      return harnessBin;
    }
    dir = dirname(dir);
  }
  throw new QlooError('QLOO_SETUP', 'The Qloo harness is not installed on the server.', 503);
}

const stateDir = MOCK ? null : mkdtempSync(join(tmpdir(), 'softlanding-qloo-'));

export class QlooError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// ---- budget -----------------------------------------------------------------
let budgetDay = new Date().toISOString().slice(0, 10);
let budgetUsed = 0;
function spendBudget() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== budgetDay) {
    budgetDay = today;
    budgetUsed = 0;
  }
  if (budgetUsed >= DAILY_BUDGET) {
    throw new QlooError('QLOO_BUDGET', 'Daily Qloo call budget for this demo is used up. Try again tomorrow.', 429);
  }
  budgetUsed += 1;
}
export function budgetStatus() {
  return { used: budgetUsed, limit: DAILY_BUDGET, day: budgetDay };
}

// ---- concurrency ------------------------------------------------------------
let running = 0;
const waiting = [];
function acquire() {
  if (running < MAX_CONCURRENT) {
    running += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiting.push(resolve));
}
function release() {
  const next = waiting.shift();
  if (next) next();
  else running -= 1;
}

// ---- cache ------------------------------------------------------------------
const cache = new Map();
const inflight = new Map();
function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
}
function cacheSet(key, value) {
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), value });
}

// ---- process runner ---------------------------------------------------------
function runHarness(args) {
  return new Promise((resolve, reject) => {
    if (!process.env.QLOO_API_KEY) {
      return reject(new QlooError('QLOO_AUTH', 'The Qloo credential is not configured on the server yet.', 503));
    }
    const env = {
      PATH: process.env.PATH,
      HOME: stateDir,
      QLOO_HOME: stateDir,
      NO_COLOR: '1',
      QLOO_API_KEY: process.env.QLOO_API_KEY || '',
      // Event keys only work against the hackathon API; override with QLOO_BASE_URL.
      QLOO_BASE_URL: process.env.QLOO_BASE_URL || 'https://hackathon.api.qloo.com',
      QLOO_TRUSTED_BASE_URL: process.env.QLOO_BASE_URL || 'https://hackathon.api.qloo.com'
    };
    execFile(
      process.execPath,
      [resolveHarness(), ...args],
      { env, timeout: CALL_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          let code = '';
          try {
            code = JSON.parse(stdout.slice(stdout.indexOf('{')))?.error?.code || '';
          } catch { /* not JSON */ }
          const blob = `${code} ${stdout} ${stderr}`;
          if (error.code === 4 || /QLOO_AUTH|api key|unauthor|forbidden|401|403/i.test(blob)) {
            return reject(new QlooError('QLOO_AUTH', 'The Qloo credential was rejected or is missing on the server.', 503));
          }
          if (/QLOO_RATE|429|rate.?limit/i.test(blob)) {
            return reject(new QlooError('QLOO_RATE', 'Qloo rate limit reached. Please retry in a moment.', 429));
          }
          if (error.killed) return reject(new QlooError('QLOO_TIMEOUT', 'Qloo took too long to answer.', 504));
          console.error('[qloo] diag exit=' + error.code + ' sig=' + (error.signal || '-') + ' out=' + String(stdout || '').length + ' err=' + String(stderr || '').length + ' node=' + process.version + ' tags=' + [...new Set((String(stderr || '') + ' ' + String(stdout || '')).match(/ERR_[A-Z_]+|\w+Error|commander\.\w+|unexpected failure|Cannot find package|requires|interactive|TTY|engine|unknown|missing|required|option|argument|too many|unsupported|ENOTFOUND|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|certificate|fetch failed|timeout|rate|forbidden|unauthorized|not found|permission|usage|schema|parse|API_ERROR|GENERAL_ERROR|CONFIG_ERROR|QLOO_[A-Z]+/gi) || [])].map((s) => s.toLowerCase()).join(',')); // TEMP-DIAG-SAFE
          return reject(new QlooError('QLOO_FAILED', 'Qloo could not complete that request.', 502));
        }
        resolve(stdout);
      }
    );
  });
}

function parseJson(text) {
  const start = text.indexOf('{') === -1 ? text.indexOf('[') : text.indexOf('{');
  try {
    return JSON.parse(text.slice(start));
  } catch {
    throw new QlooError('QLOO_PARSE', 'Unexpected response from Qloo.');
  }
}

async function cached(key, producer) {
  const hit = cacheGet(key);
  if (hit) return { value: hit, cached: true };
  if (inflight.has(key)) return { value: await inflight.get(key), cached: true };
  const promise = (async () => {
    spendBudget();
    await acquire();
    try {
      let lastError;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
        try {
          return await producer();
        } catch (error) {
          lastError = error;
          if (!(error instanceof QlooError) || !['QLOO_TIMEOUT', 'QLOO_FAILED'].includes(error.code)) break;
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        }
      }
      throw lastError;
    } finally {
      release();
    }
  })();
  inflight.set(key, promise);
  try {
    const value = await promise;
    cacheSet(key, value);
    return { value, cached: false };
  } finally {
    inflight.delete(key);
  }
}

/**
 * Run one canonical Qloo workflow (recommend, rank, describe, where_popular,
 * compare_audiences, entity_tags, audience_demographics, trends, find_tags).
 * Returns { result, trace } where trace describes the call for the UI.
 */
export async function qlooExec(operation, input) {
  const started = Date.now();
  const key = `exec:${operation}:${JSON.stringify(input)}`;
  const { value, cached: fromCache } = await cached(key, async () => {
    if (MOCK) return mockExec(operation, input);
    const out = await runHarness(['exec', operation, '--input', JSON.stringify(input)]);
    const parsed = parseJson(out);
    if (parsed?.error) {
      const code = String(parsed.error.code || '');
      if (/AUTH/i.test(code)) throw new QlooError('QLOO_AUTH', 'The Qloo credential was rejected or is missing on the server.', 503);
      if (/RATE/i.test(code)) throw new QlooError('QLOO_RATE', 'Qloo rate limit reached. Please retry in a moment.', 429);
      throw new QlooError('QLOO_FAILED', 'Qloo could not complete that request.', 502);
    }
    return parsed;
  });
  return {
    result: value,
    trace: { op: operation, input, ms: Date.now() - started, cached: fromCache }
  };
}

/** Name search used by the taste-passport autocomplete. */
export async function qlooSearch(query, type, take = 6) {
  const started = Date.now();
  const key = `search:${type || '*'}:${query.toLowerCase()}:${take}`;
  const { value, cached: fromCache } = await cached(key, async () => {
    if (MOCK) return mockSearch(query, type, take);
    const args = ['search', '--query', query, '--take', String(take), '--json'];
    if (type) args.push('--type', type);
    const out = await runHarness(args);
    return parseJson(out);
  });
  return {
    result: value,
    trace: { op: 'search', input: { query, type }, ms: Date.now() - started, cached: fromCache }
  };
}

export const isMock = MOCK;
