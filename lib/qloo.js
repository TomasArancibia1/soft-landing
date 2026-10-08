// Qloo access layer.
//
// Every Qloo call in this app goes through the public `@qloo/qloo-harness`
// package — the authorized surface listed in the hackathon kit's
// API_ACCESS.md. The harness is loaded once, in-process, through its public
// exports (`runQlooExec`, `runQloo`): no process is spawned per call, which
// matters on a small free instance. The credential lives only in the server
// environment (QLOO_API_KEY); it is never sent to the browser, never logged,
// and never written to the repository.
//
// The layer adds: bounded concurrency, a short-lived cache (smallest request
// that answers the question, respect the quota), a daily call budget, bounded
// retries, and a trace of every call so the UI can show what the agent did.

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mockExec, mockSearch } from './mock.js';

const MOCK = process.env.QLOO_MOCK === '1' && process.env.NODE_ENV !== 'production';
const CALL_TIMEOUT_MS = Number(process.env.QLOO_TIMEOUT_MS || 45_000);
const MAX_CONCURRENT = Number(process.env.QLOO_MAX_CONCURRENT || 3);
const CACHE_TTL_MS = Number(process.env.QLOO_CACHE_TTL_MS || 15 * 60_000);
const DAILY_BUDGET = Number(process.env.QLOO_DAILY_BUDGET || 1500);
const MAX_RETRIES = 1;

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

// ---- in-process harness -----------------------------------------------------
function harnessEnv() {
  return {
    PATH: process.env.PATH,
    HOME: stateDir,
    // Must differ from HOME: the harness rejects QLOO_HOME equal to the home dir.
    QLOO_HOME: join(stateDir, 'qloo'),
    NO_COLOR: '1',
    QLOO_API_KEY: process.env.QLOO_API_KEY || '',
    // Event keys only work against the hackathon API; override with QLOO_BASE_URL.
    QLOO_BASE_URL: process.env.QLOO_BASE_URL || 'https://hackathon.api.qloo.com',
    QLOO_TRUSTED_BASE_URL: process.env.QLOO_BASE_URL || 'https://hackathon.api.qloo.com'
  };
}

let harness = null;
export function loadHarness() {
  if (!harness) {
    harness = (async () => {
      const env = harnessEnv();
      // The legacy `search` command reads process.env, so mirror the state paths there.
      Object.assign(process.env, { HOME: env.HOME, QLOO_HOME: env.QLOO_HOME, NO_COLOR: '1', QLOO_BASE_URL: env.QLOO_BASE_URL, QLOO_TRUSTED_BASE_URL: env.QLOO_TRUSTED_BASE_URL });
      const mod = await import('@qloo/qloo-harness');
      const executor = mod.createDirectQlooWorkflowExecutorFromEnvironment({ env });
      return { mod, env, executor };
    })();
    harness.catch(() => { harness = null; });
  }
  return harness;
}

// The legacy `search` command writes to process.stdout; capture it one call at a time.
let stdoutLock = Promise.resolve();
function withCapturedStdout(fn, timeoutMs) {
  const run = stdoutLock.then(async () => {
    const original = process.stdout.write;
    let buffer = '';
    process.stdout.write = (chunk, encoding, callback) => {
      buffer += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
      const done = typeof encoding === 'function' ? encoding : callback;
      if (typeof done === 'function') done();
      return true;
    };
    let timer;
    try {
      const code = await Promise.race([
        fn(),
        new Promise((resolve) => { timer = setTimeout(() => resolve(130), timeoutMs); })
      ]);
      return { code, stdout: buffer, stderr: '' };
    } finally {
      clearTimeout(timer);
      process.stdout.write = original;
    }
  });
  stdoutLock = run.catch(() => {});
  return run;
}

async function runHarness(args) {
  if (!process.env.QLOO_API_KEY) {
    throw new QlooError('QLOO_AUTH', 'The Qloo credential is not configured on the server yet.', 503);
  }
  let outcome;
  try {
    const h = await loadHarness();
    if (args[0] === 'exec') {
      let stdout = '';
      let stderr = '';
      const code = await h.mod.runQlooExec(args.slice(1), {
        env: h.env,
        createExecutor: () => h.executor,
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
        writeOut: (text) => { stdout += text; },
        writeError: (text) => { stderr += text; }
      });
      outcome = { code, stdout, stderr };
    } else {
      outcome = await withCapturedStdout(() => h.mod.runQloo(args), CALL_TIMEOUT_MS);
    }
  } catch (error) {
    console.error('[qloo] harness error ' + (error?.code || error?.name || 'unknown')); // never log messages or payloads
    throw new QlooError('QLOO_FAILED', 'Qloo could not complete that request.', 502);
  }
  const { code, stdout, stderr } = outcome;
  if (code === 0) return stdout;

  let errorCode = '';
  try {
    errorCode = JSON.parse(stdout.slice(stdout.indexOf('{')))?.error?.code || '';
  } catch { /* not JSON */ }
  const blob = `${errorCode} ${stdout} ${stderr}`;
  if (code === 4 || /QLOO_AUTH|AUTH_FAILED|api key|unauthor|forbidden|401|403/i.test(blob)) {
    throw new QlooError('QLOO_AUTH', 'The Qloo credential was rejected or is missing on the server.', 503);
  }
  if (/QLOO_RATE|429|rate.?limit/i.test(blob)) throw new QlooError('QLOO_RATE', 'Qloo rate limit reached. Please retry in a moment.', 429);
  if (code === 130) throw new QlooError('QLOO_TIMEOUT', 'Qloo took too long to answer.', 504);
  const safe = /^[A-Z_]{1,40}$/.test(String(errorCode)) ? errorCode : '-';
  console.error(`[qloo] failed exit=${code} code=${safe}`); // identifiers only: never log stdout/stderr
  throw new QlooError('QLOO_FAILED', 'Qloo could not complete that request.', 502);
}

function parseJson(text) {
  const a = text.indexOf('{'); const b = text.indexOf('['); const start = a === -1 ? b : b === -1 ? a : Math.min(a, b);
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

// Warm the harness shortly after boot so the first visitor does not pay the load cost.
if (!MOCK && process.env.QLOO_API_KEY) {
  setTimeout(() => loadHarness().catch(() => {}), 3000).unref();
}
