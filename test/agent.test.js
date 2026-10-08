import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { runAgent, policy, landmarkShare, newState, mergePlaces } from '../lib/agent-loop.js';
import { pickConceptTags, tagCategory, shapeTags, shapeOverlap } from '../lib/agent.js';
import { server } from '../server.js';

const anchors = [
  { id: 'a1', name: 'Gepe', type: 'artist' },
  { id: 'a2', name: 'Roma', type: 'movie' },
  { id: 'a3', name: 'Aesop', type: 'brand' }
];

async function collect(opts) {
  const events = [];
  const state = await runAgent({ anchors, city: 'Berlin', lang: 'en', emit: (e) => events.push(e), ...opts });
  return { events, state };
}

test('policy planner completes every core lane and verifies itself', async () => {
  const { events } = await collect();
  const lanes = new Set(events.filter((e) => e.t === 'lane').map((e) => e.name));
  for (const l of ['dna', 'places', 'barrio', 'culture']) assert.ok(lanes.has(l), l);
  assert.equal(events[0].planner, 'policy');
  assert.equal(events.at(-1).t, 'done');
  assert.ok(events.some((e) => e.t === 'verify' && e.checks.places > 0));
  // every step has a reason and gets an observation
  const steps = events.filter((e) => e.t === 'step');
  assert.ok(steps.length >= 5 && steps.every((s) => s.why));
  for (const s of steps) assert.ok(events.some((e) => e.t === 'obs' && e.id === s.id), `obs for step ${s.id}`);
});

test('the agent runs a second pass from concepts and merges places', async () => {
  const { events, state } = await collect();
  assert.ok(events.some((e) => e.t === 'step' && e.tool === 'find_places' && e.args.mode === 'concepts'));
  assert.ok(state.places.some((p) => p.from === 'concepts' || p.from === 'both'));
  assert.ok(new Set(state.places.map((p) => p.id)).size === state.places.length, 'places deduplicated');
});

test('culture kinds follow what the person loves', async () => {
  const { state } = await collect();
  assert.ok(state.culture.artist && state.culture.screen && state.culture.brand);
  assert.ok(!state.culture.book);
});

test('an LLM planner chooses the tools; guardrails, validation and brief still apply', async (t) => {
  const seen = [];
  const fake = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    seen.push(body);
    const tool = (name, args) => ({ id: `c_${seen.length}_${name}`, type: 'function', function: { name, arguments: JSON.stringify(args) } });
    const turn = seen.filter((b) => b.tools).length;
    let message;
    if (!body.tools) message = { role: 'assistant', content: 'Welcome to Berlin. Start with the barrio and Gepe.' };
    else if (turn === 1) message = { role: 'assistant', content: '', tool_calls: [tool('read_taste', { reason: 'start' })] };
    else if (turn === 2) message = { role: 'assistant', content: '', tool_calls: [tool('find_places', { mode: 'anchors', reason: 'places' }), tool('delete_everything', { reason: 'x' }), tool('find_barrio', { reason: 'map' })] };
    else message = { role: 'assistant', content: 'done' }; // stops early: guardrails must fill culture
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message }] }));
  });
  fake.listen(0);
  await once(fake, 'listening');
  process.env.LLM_API_KEY = 'test-key';
  process.env.LLM_BASE_URL = `http://127.0.0.1:${fake.address().port}`;
  t.after(() => { delete process.env.LLM_API_KEY; delete process.env.LLM_BASE_URL; fake.close(); });

  const { events } = await collect();
  assert.equal(events[0].planner, 'llm');
  const tools = events.filter((e) => e.t === 'step').map((s) => s.tool);
  assert.ok(!tools.includes('delete_everything'), 'unknown tool rejected');
  assert.ok(tools.includes('read_taste') && tools.includes('find_barrio'));
  assert.ok(events.some((e) => e.t === 'note' && /Guardrail/.test(e.text)), 'guardrail completed skipped core');
  assert.ok(events.some((e) => e.t === 'lane' && e.name === 'culture'));
  const brief = events.find((e) => e.t === 'brief');
  assert.match(brief.text, /Welcome to Berlin/);
  // the key was sent as a bearer token only to the configured endpoint, never to the client
  assert.ok(!JSON.stringify(events).includes('test-key'));
});

test('an LLM outage falls back to the built-in policy', async (t) => {
  const dead = http.createServer((req, res) => { res.writeHead(500); res.end('nope'); });
  dead.listen(0);
  await once(dead, 'listening');
  process.env.LLM_API_KEY = 'k';
  process.env.LLM_BASE_URL = `http://127.0.0.1:${dead.address().port}`;
  t.after(() => { delete process.env.LLM_API_KEY; delete process.env.LLM_BASE_URL; dead.close(); });
  const { events } = await collect();
  assert.ok(events.some((e) => e.t === 'note'));
  assert.equal(events.at(-1).planner, 'policy');
  assert.ok(events.some((e) => e.t === 'lane' && e.name === 'places'));
});

test('/api/agent streams newline-delimited JSON events', async (t) => {
  server.listen(0);
  await once(server, 'listening');
  t.after(() => server.close());
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/agent`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ anchors, city: 'Berlin', lang: 'en' })
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /ndjson/);
  const lines = (await res.text()).trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(lines[0].t, 'start');
  assert.equal(lines.at(-1).t, 'done');
  const bad = await fetch(`http://127.0.0.1:${server.address().port}/api/agent`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ anchors: [], city: 'X' }) });
  assert.equal(bad.status, 400);
});

test('landmarkShare and the policy trigger an everyday-spots pass when results are mostly landmarks', () => {
  const st = newState(anchors, 'Berlin');
  st.done = new Set(['taste', 'places:anchors', 'places:concepts', 'barrio']);
  st.tags = [{ id: 'urn:tag:hobby:qloo:dancing', name: 'Dancing' }];
  st.places = [{ name: 'Memorial to the Murdered Jews' }, { name: 'Brandenburg Gate' }, { name: 'Neues Museum' }, { name: 'Cafe Anna' }];
  assert.ok(landmarkShare(st.places) >= 0.4);
  const steps = policy(st, 'en');
  assert.equal(steps[0].tool, 'find_places');
  assert.equal(steps[0].args.mode, 'spots');
  assert.ok(steps[0].why.length > 20);
  st.places = [{ name: 'Cafe Anna' }, { name: 'Bar Luna' }];
  assert.equal(landmarkShare(st.places), 0);
  assert.notEqual(policy(st, 'en')[0].args?.mode, 'spots');
});

test('concept picking prefers place-friendly tags and ignores tags without ids', () => {
  const tags = [
    { id: 'urn:tag:genre:qloo:cartoon', name: 'Cartoon' },
    { name: 'No id' },
    { id: 'urn:tag:hobby:qloo:dancing', name: 'Dancing' },
    { id: 'urn:tag:amenity:qloo:wifi', name: 'Wifi' }
  ];
  const picked = pickConceptTags(tags, 2).map((t) => t.name);
  assert.deepEqual(picked, ['Dancing', 'Wifi']);
  assert.equal(tagCategory('urn:tag:ethnicity:qloo:x'), 'ethnicity');
});

test('taste DNA drops identity-like and off-topic tags and puts taste-defining concepts first', () => {
  const tags = [
    { id: 'urn:tag:language:qloo:spanish', name: 'Spanish' },
    { id: 'urn:tag:occupation:qloo:magician', name: 'Magician' },
    { id: 'urn:tag:ethnicity:qloo:x', name: 'X' },
    { id: 'urn:tag:inclusivity:place:identifies_as_women_owned', name: 'Women-owned' },
    { id: 'urn:tag:subgenre:qloo:heartwarming', name: 'Heartwarming' },
    { id: 'urn:tag:hobby:qloo:dancing', name: 'Dancing' },
    { id: 'urn:tag:emotional_tone:qloo:self_expression', name: 'Self-expression' }
  ];
  assert.deepEqual(shapeTags(tags).map((t) => t.name), ['Self-expression', 'Dancing', 'Heartwarming']);
});

test('landmarks move below everyday spots once the spots pass has run', () => {
  const st = newState(anchors, 'Berlin');
  st.anchorPlaces = [{ id: 'm1', name: 'Memorial to Someone', affinity: 0.9 }, { id: 'a2', name: 'Bar Luna', affinity: 0.5 }];
  st.spotPlaces = [{ id: 's1', name: 'Cafe Anna', affinity: 0.2 }];
  mergePlaces(st);
  const names = st.places.map((p) => p.name);
  assert.ok(names.indexOf('Memorial to Someone') > names.indexOf('Cafe Anna'));
  assert.ok(names.indexOf('Memorial to Someone') > names.indexOf('Bar Luna'));
});

test('taste DNA removes near-duplicate concepts and varies categories at the top', () => {
  const tags = [
    { id: 'urn:tag:emotional_tone:qloo:women_empowerment', name: 'Women Empowerment' },
    { id: 'urn:tag:emotional_tone:qloo:empowerment', name: 'Empowerment' },
    { id: 'urn:tag:emotional_tone:qloo:motivation', name: 'Motivation' },
    { id: 'urn:tag:hobby:qloo:dancing', name: 'Dancing' },
    { id: 'urn:tag:amenity:qloo:spa', name: 'SPA' }
  ];
  assert.deepEqual(shapeTags(tags).map((t) => t.name), ['Women Empowerment', 'Dancing', 'SPA', 'Motivation']);
});

test('overlap concepts drop repeats and place-only tags', () => {
  const tags = [
    { name: 'United States', type: 'country' },
    { name: 'Funk' }, { name: 'funk' },
    { id: 'urn:tag:location:qloo:new_york', name: 'New York City' },
    { id: 'urn:tag:genre:qloo:disco', name: 'Disco' }
  ];
  assert.deepEqual(shapeOverlap(tags).map((t) => t.name), ['Funk', 'Disco']);
});

test('everydayFirst pushes landmarks behind everyday places', async () => {
  const { everydayFirst } = await import('../lib/agent.js');
  const out = everydayFirst([{ name: 'Memorial to X' }, { name: 'Cafe A' }, { name: 'Bar B' }]);
  assert.deepEqual(out.map((i) => i.name), ['Cafe A', 'Bar B', 'Memorial to X']);
});

test('everydayFirst drops landmarks when there are enough everyday places', async () => {
  const { everydayFirst } = await import('../lib/agent.js');
  const out = everydayFirst([{ name: 'Memorial to X' }, { name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }]);
  assert.deepEqual(out.map((i) => i.name), ['A', 'B', 'C', 'D']);
});

test('weak tag categories and padded names never reach the DNA', () => {
  const tags = [
    { id: 'urn:tag:art_style:qloo:cartoon', name: 'Cartoon' },
    { id: 'urn:tag:keyword:qloo:personal_conflict', name: 'Personal Conflict' },
    { id: 'urn:tag:setting:qloo:roadside', name: ' roadside' },
    { id: 'urn:tag:hobby:qloo:dancing', name: ' Dancing' }
  ];
  assert.deepEqual(shapeTags(tags).map((t) => t.name), ['Dancing']);
});

test('global chains rank below independent places', () => {
  const st = newState(anchors, 'Tokyo');
  st.spotPlaces = [{ id: 's1', name: 'Cafe Anna', affinity: 0.1 }];
  st.anchorPlaces = [{ id: 'c1', name: 'Hard Rock Cafe Tokyo', affinity: 0.99 }, { id: 'c2', name: 'Bar Luna', affinity: 0.5 }];
  mergePlaces(st);
  const names = st.places.map((p) => p.name);
  assert.ok(names.indexOf('Hard Rock Cafe Tokyo') > names.indexOf('Bar Luna'));
});
