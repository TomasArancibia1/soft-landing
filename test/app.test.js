import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { server } from '../server.js';
import * as N from '../lib/normalize.js';
import { buildPlan } from '../public/plan.js';

let base;
test.before(async () => {
  server.listen(0);
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const anchors = [{ id: 'a1', name: 'A' }, { id: 'a2', name: 'B' }];

test('health reports mock mode and budget', async () => {
  const j = await (await fetch(`${base}/api/health`)).json();
  assert.equal(j.ok, true);
  assert.equal(typeof j.budget.limit, 'number');
});

test('search returns normalized items', async () => {
  const j = await (await fetch(`${base}/api/search?q=Gepe&type=artist`)).json();
  assert.ok(Array.isArray(j.items));
  assert.ok(j.items.every((i) => i.id && i.name));
});

test('lane validation rejects bad input', async () => {
  assert.equal((await post('/api/lane/places', { anchors: [], city: 'X' })).status, 400);
  assert.equal((await post('/api/lane/places', { anchors, city: '' })).status, 400);
  assert.equal((await post('/api/lane/culture', { anchors, city: 'Berlin', kind: 'nope' })).status, 400);
  assert.equal((await post('/api/lane/unknown', { anchors, city: 'Berlin' })).status, 404);
});

test('every lane answers with a trace', async () => {
  for (const [lane, extra] of [['dna', {}], ['places', {}], ['barrio', {}], ['culture', { kind: 'artist' }], ['match', { other: [{ id: 'o1', name: 'O' }] }]]) {
    const res = await post(`/api/lane/${lane}`, { anchors, city: 'Berlin', ...extra });
    assert.equal(res.status, 200, lane);
    const j = await res.json();
    assert.ok(Array.isArray(j.trace) && j.trace.length > 0, `${lane} trace`);
  }
});

test('static files carry security headers and block path traversal', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.ok(res.headers.get('content-security-policy'));
  const text = await (await fetch(`${base}/..%2fserver.js`)).text();
  assert.ok(!text.includes('createServer'));
});

test('geohash decoding and heat merging', () => {
  const d = N.decodeGeohash('u33dc');
  assert.ok(Math.abs(d.lat - 52.5) < 1 && Math.abs(d.lon - 13.4) < 1);
  const merged = N.mergeHeat([[{ key: 'x', lat: 1, lon: 1, affinity: 0.5 }], [{ key: 'x', lat: 1, lon: 1, affinity: 0.7 }, { key: 'y', lat: 2, lon: 2, affinity: 0.9 }]]);
  assert.equal(merged[0].key, 'x');
});

test('entity normalizer tolerates missing fields', () => {
  assert.equal(N.entity({ name: 'no id' }), undefined);
  const e = N.entity({ entity_id: '1', name: 'X', properties: { image: { url: 'https://i/x.png' } }, query: { affinity: 0.9, explainability: [{ name: 'Indie' }] } });
  assert.equal(e.image, 'https://i/x.png');
  assert.deepEqual(e.why, ['Indie']);
});

test('plan is built only from provided results', () => {
  const plan = buildPlan({ anchors, city: 'Berlin', places: [{ name: 'P1', why: ['Jazz'] }, { name: 'P2' }, { name: 'P3' }], culture: { artist: [{ name: 'Art' }] }, barrios: [{ name: 'Kreuzberg' }] });
  const titles = plan.weeks.flatMap((w) => w.items.map((i) => i.title));
  assert.deepEqual([...titles].sort(), ['Art', 'Kreuzberg', 'P1', 'P2', 'P3']);
});

test('ics export is valid and folds long lines', async () => {
  const { toIcs, buildPlan } = await import('../public/plan.js');
  const plan = buildPlan({ anchors: [{ name: 'A' }], city: 'Berlin', tags: [{ name: 'Indie' }], places: [{ name: 'Café, "Uno"; Dos', address: 'x'.repeat(200) }, { name: 'B' }, { name: 'C' }], barrios: [{ name: 'Kreuzberg' }], culture: {} });
  const ics = toIcs(plan, { start: new Date('2026-10-05T10:00:00Z'), now: new Date('2026-10-04T00:00:00Z'), cityLabel: 'Berlin' });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261005/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261026/);
  assert.match(ics, /Caf[^\r\n]*Uno/);
  for (const l of ics.split('\r\n')) assert.ok(l.length <= 75, `line too long: ${l.length}`);
  assert.match(ics, /END:VCALENDAR\r\n$/);
});
