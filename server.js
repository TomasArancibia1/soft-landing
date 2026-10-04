import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { qlooSearch, budgetStatus, isMock, QlooError } from './lib/qloo.js';
import * as agent from './lib/agent.js';
import * as N from './lib/normalize.js';

if (process.env.QLOO_MOCK === '1' && process.env.NODE_ENV === 'production') {
  console.error('Refusing to start: QLOO_MOCK=1 is not allowed in production.');
  process.exit(1);
}

const PORT = Number(process.env.PORT || 8787);
const PUBLIC_DIR = resolve(fileURLToPath(new URL('./public', import.meta.url)));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json'
};

const SEARCH_TYPES = new Set(['artist', 'movie', 'tv_show', 'book', 'podcast', 'brand', 'place', 'videogame', 'person']);

// ---- tiny per-IP rate limiter (protects the shared event quota) ----------------
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const windowMs = 60_000;
  const limit = Number(process.env.RATE_LIMIT_PER_MIN || 40);
  const list = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > limit;
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' https://cdnjs.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    "connect-src 'self'",
    "frame-ancestors 'none'"
  ].join('; ')
};

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    ...(isJson ? { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } : {}),
    ...headers
  });
  res.end(isJson ? JSON.stringify(body) : body);
}

async function readBody(req, limit = 32_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'Request too large');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---- validation -----------------------------------------------------------------
const cleanText = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '');

function parseAnchors(list, { min = 1, max = 8, field = 'anchors' } = {}) {
  if (!Array.isArray(list) || list.length < min || list.length > max) {
    throw new HttpError(400, `${field}: provide between ${min} and ${max} items`);
  }
  return list.map((a) => {
    const id = cleanText(a?.id, 80);
    const name = cleanText(a?.name, 120);
    if (!id || !name) throw new HttpError(400, `${field}: each item needs id and name`);
    return { id, name, type: cleanText(a?.type, 30) || undefined };
  });
}

function parseCity(value) {
  const city = cleanText(value, 80);
  if (city.length < 2) throw new HttpError(400, 'city is required');
  return city;
}

// ---- API ------------------------------------------------------------------------
async function handleApi(req, res, url) {
  const path = url.pathname;

  if (path === '/api/health') {
    return send(res, 200, { ok: true, mock: isMock, budget: budgetStatus() });
  }

  if (path === '/api/search' && req.method === 'GET') {
    const q = cleanText(url.searchParams.get('q'), 80);
    const type = cleanText(url.searchParams.get('type'), 20);
    if (q.length < 2) return send(res, 200, { items: [], trace: [] });
    if (type && !SEARCH_TYPES.has(type)) throw new HttpError(400, 'unknown type');
    const { result, trace } = await qlooSearch(q, type ? `urn:entity:${type}` : undefined, 7);
    return send(res, 200, { items: N.searchResults(result), trace: [trace] });
  }

  const lane = path.match(/^\/api\/lane\/([a-z]+)$/);
  if (lane && req.method === 'POST') {
    const body = await readBody(req);
    const anchors = parseAnchors(body.anchors);
    switch (lane[1]) {
      case 'dna':
        return send(res, 200, await agent.dna({ anchors }));
      case 'places':
        return send(res, 200, await agent.places({ anchors, city: parseCity(body.city) }));
      case 'barrio':
        return send(res, 200, await agent.barrio({ anchors, city: parseCity(body.city) }));
      case 'culture': {
        const kind = cleanText(body.kind, 12);
        if (!agent.CULTURE_KINDS.includes(kind)) throw new HttpError(400, 'unknown kind');
        return send(res, 200, await agent.culture({ anchors, city: parseCity(body.city), kind }));
      }
      case 'match': {
        const other = parseAnchors(body.other, { field: 'other' });
        return send(res, 200, await agent.match({ anchors, other, city: parseCity(body.city) }));
      }
      default:
        throw new HttpError(404, 'unknown lane');
    }
  }

  throw new HttpError(404, 'Not found');
}

// ---- static ---------------------------------------------------------------------
async function serveStatic(res, pathname) {
  let rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  if (!rel || rel.endsWith('/')) rel += 'index.html';
  const full = join(PUBLIC_DIR, rel);
  if (!full.startsWith(PUBLIC_DIR)) return send(res, 403, 'Forbidden');
  try {
    const data = await readFile(full);
    return send(res, 200, data, {
      'Content-Type': MIME[extname(full)] || 'application/octet-stream',
      'Cache-Control': ['.png', '.ico', '.svg'].includes(extname(full)) ? 'public, max-age=3600' : 'no-cache'
    });
  } catch {
    // SPA fallback
    try {
      const data = await readFile(join(PUBLIC_DIR, 'index.html'));
      return send(res, 200, data, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
    } catch {
      return send(res, 404, 'Not found');
    }
  }
}

export const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
      if (url.pathname !== '/api/health' && rateLimited(ip)) throw new HttpError(429, 'Slow down a little — too many requests.');
      return await handleApi(req, res, url);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed');
    return await serveStatic(res, url.pathname);
  } catch (error) {
    if (error instanceof HttpError) return send(res, error.status, { error: error.message });
    if (error instanceof QlooError) return send(res, error.status, { error: error.message, code: error.code });
    console.error('Unhandled error:', error?.message || error);
    return send(res, 500, { error: 'Something went wrong.' });
  }
});

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  server.listen(PORT, () => console.log(`Soft Landing listening on :${PORT}${isMock ? ' (MOCK data — development only)' : ''}`));
}
