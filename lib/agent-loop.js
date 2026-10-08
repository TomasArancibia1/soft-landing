// The Soft Landing agent loop.
//
//   observe → decide → act (Qloo) → observe → ... → verify → brief
//
// Every action is a call to one of Qloo's canonical workflows through the
// official harness. What the agent does NEXT depends on what Qloo returned:
// it widens a thin result, runs a second pass from the person's concepts,
// pulls in more anchors when a heatmap is sparse, and chooses which parts of
// culture to explore from what the person actually loves.
//
// Two interchangeable planners decide the next step:
//   - an LLM (optional; any OpenAI-compatible endpoint via LLM_API_KEY), which
//     picks tools with function calling, and
//   - a built-in policy that needs no model, so the app works for free.
// Whatever the planner does, guardrails guarantee the core lanes complete and
// every tool call is validated against a whitelist and the person's own anchors.

import * as A from './agent.js';
import { reverseName } from './geo.js';
import { llmEnabled, llmLabel, chat } from './llm.js';
import { QlooError } from './qloo.js';

export const MAX_STEPS = 8;
const TYPE_TO_KIND = { artist: 'artist', movie: 'screen', tv_show: 'series', book: 'book', podcast: 'podcast', brand: 'brand' };
const FALLBACK_KINDS = ['artist', 'screen', 'series'];

// Landmarks and memorials make poor "first places" for someone who is settling in.
const LANDMARK = /\b(memorial|monument|museum|museo|gallery|archive|cathedral|church|castle|palace|gate|tower|statue|zoo|stadium|holocaust)\b/i;
export const landmarkShare = (items) => (items.length ? items.filter((i) => LANDMARK.test(`${i.name} ${i.description || ''}`)).length / items.length : 0);

let geoFailUntil = 0;
const names = (items, n = 3) => (items || []).slice(0, n).map((i) => i.name).filter(Boolean);
const list = (arr) => arr.join(', ');
const pick = (lang, en, es) => (lang === 'es' ? es : en);

export function newState(anchors, city) {
  return { anchors, city, tags: [], anchorPlaces: [], conceptPlaces: [], spotPlaces: [], concepts: [], places: [], maps: [], used: [], culture: {}, barrio: null, done: new Set(), errors: {}, calls: 0 };
}

// ---- merging --------------------------------------------------------------
export function mergePlaces(state) {
  const byId = new Map();
  const viaNames = state.anchors.slice(0, 2).map((a) => a.name);
  for (const it of state.anchorPlaces) byId.set(it.id, { ...it, why: [], via: viaNames, from: 'anchors' });
  for (const it of state.conceptPlaces) {
    const prev = byId.get(it.id);
    if (prev) byId.set(it.id, { ...prev, why: it.why, from: 'both', affinity: Math.max(prev.affinity ?? 0, it.affinity ?? 0) || prev.affinity });
    else byId.set(it.id, { ...it, via: [], from: 'concepts' });
  }
  for (const it of state.spotPlaces) {
    const prev = byId.get(it.id);
    byId.set(it.id, { ...(prev || it), why: prev?.why || [], via: prev?.via?.length ? prev.via : viaNames, from: 'spots', affinity: prev?.affinity ?? it.affinity });
  }
  const rank = { both: 0, spots: 1, anchors: 2, concepts: 3 };
  // Once everyday spots were found, landmarks and memorials move down the list.
  const demote = (it) => (state.spotPlaces.length && LANDMARK.test(`${it.name} ${it.description || ''}`) ? 10 : 0);
  state.places = [...byId.values()]
    .sort((a, b) => rank[a.from] + demote(a) - (rank[b.from] + demote(b)) || (b.affinity ?? 0) - (a.affinity ?? 0))
    .slice(0, 14);
}

function cultureKinds(state) {
  const kinds = ['artist'];
  for (const a of state.anchors) {
    const k = TYPE_TO_KIND[a.type];
    if (k && !kinds.includes(k)) kinds.push(k);
  }
  for (const k of FALLBACK_KINDS) if (kinds.length < 3 && !kinds.includes(k)) kinds.push(k);
  return kinds.slice(0, 3);
}

// ---- tools ----------------------------------------------------------------
// Each tool returns { summary, lanes } — a short observation for the planner and
// the full lane payloads for the UI.
const TOOLS = {
  async read_taste(state) {
    const r = await A.dna({ anchors: state.anchors });
    state.tags = r.tags;
    state.calls += r.trace.length;
    state.done.add('taste');
    return {
      summary: r.tags.length ? `${r.tags.length} concepts; strongest: ${list(names(r.tags, 5))}` : 'no concepts returned',
      lanes: [{ name: 'dna', data: r }]
    };
  },

  async find_places(state, { mode = 'anchors' } = {}) {
    if (mode === 'spots') {
      const r = await A.placesSpots({ anchors: state.anchors, city: state.city });
      state.calls += r.trace.length;
      state.done.add('places:spots');
      state.spotPlaces = r.items;
      mergePlaces(state);
      const note = r.skipped ? ` (skipped: ${r.skipped})` : r.status && r.status !== 'ok' ? ` (qloo status: ${r.status})` : '';
      return {
        summary: `${r.items.length} everyday spots via Qloo tags [${list(r.spots || [])}]; ${state.places.length} unique places in total${note}`,
        lanes: [{ name: 'places', data: { items: state.places, trace: r.trace } }]
      };
    }
    if (mode === 'concepts') {
      const r = await A.placesByConcepts({ city: state.city, tags: state.tags });
      state.calls += r.trace.length;
      state.done.add('places:concepts');
      state.conceptPlaces = r.items;
      state.concepts = r.concepts;
      mergePlaces(state);
      const note = r.skipped ? ` (skipped: ${r.skipped})` : r.status && r.status !== 'ok' ? ` (qloo status: ${r.status})` : '';
      return {
        summary: `${r.items.length} places from concepts [${list(r.concepts)}]; ${state.places.length} unique places in total${note}`,
        lanes: [{ name: 'places', data: { items: state.places, trace: r.trace } }]
      };
    }
    const r = await A.places({ anchors: state.anchors, city: state.city });
    state.calls += r.trace.length;
    state.done.add('places:anchors');
    state.anchorPlaces = r.items;
    mergePlaces(state);
    return {
      summary: `${r.items.length} places for your favorites in ${state.city}; top: ${list(names(r.items))}`,
      lanes: [{ name: 'places', data: { items: state.places, trace: r.trace } }]
    };
  },

  async find_barrio(state, { widen = false } = {}) {
    const slice = widen ? state.anchors.slice(3, 6) : state.anchors.slice(0, 3);
    if (!slice.length) return { summary: 'no more anchors to widen with', lanes: [] };
    const r = await A.heat({ anchors: slice, city: state.city });
    state.calls += r.trace.length;
    state.maps.push(...r.maps);
    state.used.push(...slice.map((a) => a.name));
    state.done.add(widen ? 'barrio:widen' : 'barrio');
    const data = { ...A.barrioFrom(state.maps, state.used), trace: r.trace };
    state.barrio = data;
    return {
      summary: `${data.points.length} hot cells, ${data.barrios.length} barrio clusters from ${list(slice.map((a) => a.name))}`,
      lanes: [{ name: 'barrio', data }]
    };
  },

  async name_barrios(state) {
    if (!state.barrio) return { summary: 'no barrios to name', lanes: [] };
    const out = [];
    for (const b of state.barrio.barrios) {
      // If the geocoder is unreachable from the server, stop trying for a while:
      // the browser resolves the names instead and the lane never waits on it.
      let name = b.name;
      if (!name && Date.now() > geoFailUntil) {
        name = await reverseName(b.lat, b.lon);
        if (!name) geoFailUntil = Date.now() + 10 * 60_000;
      }
      out.push({ ...b, name });
    }
    state.barrio = { ...state.barrio, barrios: out };
    state.done.add('barrio:named');
    const got = out.filter((b) => b.name).length;
    return {
      summary: got ? `named ${got}/${out.length}: ${list(out.map((b) => b.name).filter(Boolean))}` : 'server could not resolve names; the browser will',
      lanes: [{ name: 'barrio', data: { ...state.barrio, trace: [] } }]
    };
  },

  async listen_city(state, { kind = 'artist' } = {}) {
    const r = await A.culture({ anchors: state.anchors, city: state.city, kind });
    state.calls += r.trace.length;
    state.culture[kind] = r.items;
    state.done.add(`culture:${kind}`);
    return {
      summary: `${r.items.length} ${kind} picks from people in ${state.city} who share your taste; top: ${list(names(r.items))}`,
      lanes: [{ name: 'culture', data: r }]
    };
  }
};

// ---- built-in policy (no model needed) ---------------------------------------
export function policy(state, lang) {
  const d = state.done;
  if (!d.has('taste')) {
    return [{ tool: 'read_taste', args: {}, why: pick(lang, 'Start with what ties your favorites together, so every next step is guided by concepts and not only names.', 'Parto por lo que une tus favoritos, para que cada paso siguiente se guíe por conceptos y no solo por nombres.') }];
  }
  const first = [];
  if (!d.has('places:anchors')) first.push({ tool: 'find_places', args: { mode: 'anchors' }, why: pick(lang, `Find places in ${state.city} that people like you love.`, `Busco lugares en ${state.city} que ama gente como tú.`) });
  if (!d.has('barrio')) first.push({ tool: 'find_barrio', args: {}, why: pick(lang, 'Map where in the city people who love your favorites concentrate.', 'Mapeo dónde se concentra en la ciudad la gente que ama tus favoritos.') });
  if (first.length) return first;

  if (!d.has('places:concepts') && state.tags.some((t) => String(t.id || '').startsWith('urn:tag:'))) {
    const top = list(names(state.tags, 3));
    const thin = state.anchorPlaces.length < 6;
    return [{
      tool: 'find_places', args: { mode: 'concepts' },
      why: thin
        ? pick(lang, `Only ${state.anchorPlaces.length} places matched your favorites, so I widen the search using your concepts (${top}).`, `Solo ${state.anchorPlaces.length} lugares calzaron con tus favoritos, así que amplío con tus conceptos (${top}).`)
        : pick(lang, `Second pass from your concepts (${top}) to surface places your favorites don't point to directly.`, `Segunda pasada desde tus conceptos (${top}) para encontrar lugares que tus favoritos no señalan directamente.`)
    }];
  }
  if (!d.has('places:spots') && landmarkShare(state.places) >= 0.4) {
    const pct = Math.round(landmarkShare(state.places) * 100);
    return [{ tool: 'find_places', args: { mode: 'spots' }, why: pick(lang, `${pct}% of what matched are landmarks and memorials, but you are settling in, so I also look for everyday spots: cafés, bars, restaurants, bookstores.`, `${pct}% de lo que calzó son monumentos y memoriales, pero estás instalándote, así que también busco lugares del día a día: cafés, bares, restaurantes, librerías.`) }];
  }
  if (!d.has('barrio:widen') && state.barrio && state.barrio.points.length < 8 && state.anchors.length > 3) {
    return [{ tool: 'find_barrio', args: { widen: true }, why: pick(lang, `The heatmap is sparse (${state.barrio.points.length} cells), so I add more of your favorites.`, `El mapa de calor es escaso (${state.barrio.points.length} celdas), así que sumo más de tus favoritos.`) }];
  }
  const batch = [];
  if (state.barrio && !d.has('barrio:named')) batch.push({ tool: 'name_barrios', args: {}, why: pick(lang, 'Give the strongest clusters real neighborhood names.', 'Les pongo nombre real de barrio a los clusters más fuertes.') });
  for (const kind of cultureKinds(state)) {
    if (!d.has(`culture:${kind}`)) batch.push({ tool: 'listen_city', args: { kind }, why: pick(lang, `Ask what people in ${state.city} with your taste are into (${kind}).`, `Pregunto qué consume la gente de ${state.city} con tu gusto (${kind}).`) });
  }
  return batch.length ? batch : null;
}

// ---- LLM planner ------------------------------------------------------------
const reasonProp = { type: 'string', description: 'One short sentence: why you are taking this step, based on what you have seen so far.' };
const LLM_TOOLS = [
  { type: 'function', function: { name: 'read_taste', description: "Qloo entity_tags: the concepts that tie the person's favorites together. Call first.", parameters: { type: 'object', properties: { reason: reasonProp }, required: ['reason'] } } },
  { type: 'function', function: { name: 'find_places', description: "Places in the destination city. mode 'anchors' uses the person's favorites as signals; mode 'concepts' uses the concepts from read_taste (a second pass that widens and diversifies); mode 'spots' looks for everyday cafés, bars, restaurants and bookstores (use it when results are mostly landmarks).", parameters: { type: 'object', properties: { mode: { type: 'string', enum: ['anchors', 'concepts', 'spots'] }, reason: reasonProp }, required: ['mode', 'reason'] } } },
  { type: 'function', function: { name: 'find_barrio', description: "Qloo where_popular heatmaps: where in the city people who love the favorites concentrate. widen=true adds more of the person's favorites when the map is sparse.", parameters: { type: 'object', properties: { widen: { type: 'boolean' }, reason: reasonProp }, required: ['reason'] } } },
  { type: 'function', function: { name: 'listen_city', description: 'What people in the destination who share the persons taste love, for one culture kind.', parameters: { type: 'object', properties: { kind: { type: 'string', enum: A.CULTURE_KINDS }, reason: reasonProp }, required: ['kind', 'reason'] } } }
];

function systemPrompt(state, lang) {
  return [
    'You are the planning core of Soft Landing, an agent that helps a person who is moving to a new city by translating their taste with Qloo Taste AI.',
    'You decide which Qloo tools to call and in what order, one step at a time, based on what the previous results showed.',
    'Always start with read_taste. Use find_places in anchors and concepts modes (add spots when results are mostly landmarks), find_barrio, and listen_city for 2 or 3 kinds that match what the person actually loves (always include artist).',
    'Call independent tools together in one turn. Adapt: if a result is thin, widen it; do not repeat a call that already ran.',
    'When you have enough, reply with a short plain sentence and no tool call.',
    `Write every "reason" in ${lang === 'es' ? 'Spanish' : 'English'}. Never invent results; you only see tool outputs.`
  ].join('\n');
}

async function llmPlan(messages, signal) {
  const msg = await chat({ messages, tools: LLM_TOOLS, signal, maxTokens: 400 });
  messages.push({ role: 'assistant', content: msg.content || '', ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls } : {}) });
  const calls = (msg.tool_calls || []).slice(0, 4);
  return calls.map((c) => {
    let args = {};
    try { args = JSON.parse(c.function?.arguments || '{}'); } catch { /* ignore */ }
    return { id: c.id, tool: c.function?.name, args, why: typeof args.reason === 'string' ? args.reason.slice(0, 220) : '' };
  });
}

function validate(action, state) {
  if (!Object.hasOwn(TOOLS, action.tool) || action.tool === 'name_barrios') return 'unknown tool';
  const a = action.args || {};
  if (action.tool === 'find_places' && !['anchors', 'concepts', 'spots'].includes(a.mode)) action.args = { mode: 'anchors' };
  if (action.tool === 'listen_city' && !A.CULTURE_KINDS.includes(a.kind)) return 'unknown kind';
  if (action.tool === 'find_places' && action.args.mode === 'concepts' && !state.tags.length) return 'needs read_taste first';
  const key = action.tool === 'find_places' ? `places:${action.args.mode}` : action.tool === 'listen_city' ? `culture:${a.kind}` : action.tool === 'find_barrio' ? (a.widen ? 'barrio:widen' : 'barrio') : 'taste';
  if (state.done.has(key)) return 'already done';
  return null;
}

// ---- runner -----------------------------------------------------------------
const friendly = (e) => (e instanceof QlooError ? e.message : 'That step failed.');

export async function runAgent({ anchors, city, lang = 'en', signal, emit }) {
  const started = Date.now();
  const state = newState(anchors, city);
  const useLlm = llmEnabled();
  let llmOk = useLlm;
  let n = 0;
  const messages = useLlm
    ? [{ role: 'system', content: systemPrompt(state, lang) }, { role: 'user', content: JSON.stringify({ city, favorites: anchors.map((a) => ({ name: a.name, type: a.type || 'unknown' })) }) }]
    : null;

  emit({ t: 'start', planner: useLlm ? 'llm' : 'policy', model: llmLabel(), city, maxSteps: MAX_STEPS });

  const runOne = async (action) => {
    const id = ++n;
    emit({ t: 'step', id, tool: action.tool, args: action.args, why: action.why });
    const t0 = Date.now();
    try {
      const out = await TOOLS[action.tool](state, action.args);
      for (const lane of out.lanes) emit({ t: 'lane', name: lane.name, data: lane.data });
      emit({ t: 'obs', id, ok: true, ms: Date.now() - t0, summary: out.summary });
      return { action, summary: out.summary };
    } catch (e) {
      if (e instanceof QlooError && e.code === 'QLOO_AUTH') throw e;
      const key = action.tool === 'find_places' ? `places:${action.args?.mode || 'anchors'}` : action.tool === 'listen_city' ? `culture:${action.args?.kind}` : action.tool === 'read_taste' ? 'taste' : action.tool === 'find_barrio' ? (action.args?.widen ? 'barrio:widen' : 'barrio') : action.tool;
      state.done.add(key); // never retry a failed step in a loop
      state.errors[key] = friendly(e);
      const lane = { read_taste: 'dna', find_places: 'places', find_barrio: 'barrio', listen_city: 'culture' }[action.tool];
      if (lane) emit({ t: 'lane_error', name: lane, kind: action.args?.kind, message: friendly(e) });
      emit({ t: 'obs', id, ok: false, ms: Date.now() - t0, summary: friendly(e) });
      return { action, summary: `error: ${friendly(e)}` };
    }
  };

  const runBatch = async (actions) => Promise.all(actions.map(runOne));

  while (n < MAX_STEPS && !signal?.aborted) {
    let actions;
    if (llmOk) {
      try {
        actions = await llmPlan(messages, signal);
      } catch {
        llmOk = false;
        emit({ t: 'note', text: pick(lang, 'The language model did not answer; the built-in policy takes over.', 'El modelo de lenguaje no respondió; sigue la política integrada.') });
        actions = policy(state, lang);
      }
      if (llmOk) {
        const lastAssistant = messages[messages.length - 1];
        if (!actions.length) break;
        const accepted = [];
        const toolMsgs = [];
        for (const act of actions) {
          const why = validate(act, state);
          if (why) { toolMsgs.push({ role: 'tool', tool_call_id: act.id, content: `rejected: ${why}` }); continue; }
          accepted.push(act);
        }
        const results = await runBatch(accepted);
        for (const r of results) toolMsgs.push({ role: 'tool', tool_call_id: r.action.id, content: r.summary });
        messages.push(...toolMsgs);
        if (!accepted.length && lastAssistant) break;
        continue;
      }
    } else {
      actions = policy(state, lang);
    }
    if (!actions || !actions.length) break;
    await runBatch(actions);
  }

  // Guardrails: whatever the planner chose, the core of the landing must exist.
  const core = [];
  if (!state.done.has('taste')) core.push({ tool: 'read_taste', args: {} });
  if (!state.done.has('places:anchors')) core.push({ tool: 'find_places', args: { mode: 'anchors' } });
  if (!state.done.has('barrio')) core.push({ tool: 'find_barrio', args: {} });
  if (!state.done.has('culture:artist')) core.push({ tool: 'listen_city', args: { kind: 'artist' } });
  if (core.length && !signal?.aborted) {
    emit({ t: 'note', text: pick(lang, 'Guardrail: completing the core steps the plan skipped.', 'Guardarraíl: completo los pasos centrales que el plan omitió.') });
    await runBatch(core.map((c) => ({ ...c, why: pick(lang, 'Core step required for a complete landing.', 'Paso central necesario para un aterrizaje completo.') })));
  }
  if (state.barrio && !state.done.has('barrio:named') && !signal?.aborted) {
    await runBatch([{ tool: 'name_barrios', args: {}, why: pick(lang, 'Give the strongest clusters real neighborhood names.', 'Les pongo nombre real de barrio a los clusters más fuertes.') }]);
  }

  // Verify: a short self-check the person can read.
  const cultureKinds = Object.keys(state.culture).filter((k) => state.culture[k]?.length);
  const checks = {
    places: state.places.length,
    concepts: state.tags.length,
    barrios: state.barrio?.barrios?.length || 0,
    culture: cultureKinds.length
  };
  emit({
    t: 'verify',
    checks,
    text: pick(lang,
      `Self-check: ${checks.places} places, ${checks.barrios} barrios, ${checks.concepts} concepts, ${checks.culture} culture lanes.`,
      `Autorevisión: ${checks.places} lugares, ${checks.barrios} barrios, ${checks.concepts} conceptos, ${checks.culture} líneas de cultura.`)
  });

  // Brief: a short grounded note. Only with a model; otherwise the UI writes a template.
  if (llmOk && !signal?.aborted) {
    try {
      const msg = await chat({
        signal,
        maxTokens: 450,
        temperature: 0.5,
        messages: [
          { role: 'system', content: `You write a warm, concrete 3-4 sentence landing note for someone moving to ${city}, in ${lang === 'es' ? 'Spanish' : 'English'}. Use ONLY the names and concepts in the JSON data; do not invent places, facts or numbers. No lists, no headings, no emojis.` },
          { role: 'user', content: JSON.stringify({ city, favorites: anchors.map((a) => a.name), concepts: names(state.tags, 6), places: names(state.places, 4), neighborhoods: (state.barrio?.barrios || []).map((b) => b.name).filter(Boolean), sounds: names(state.culture.artist, 3), screen: names(state.culture.screen || state.culture.series, 2) }) }
        ]
      });
      const text = String(msg.content || '').trim().slice(0, 900);
      if (text) emit({ t: 'brief', text, lang, model: llmLabel() });
    } catch {
      emit({ t: 'note', text: pick(lang, 'No model note this time; the page writes its own summary.', 'Sin nota del modelo esta vez; la página escribe su propio resumen.') });
    }
  }

  emit({ t: 'done', calls: state.calls, ms: Date.now() - started, steps: n, planner: useLlm && llmOk ? 'llm' : 'policy' });
  return state;
}
