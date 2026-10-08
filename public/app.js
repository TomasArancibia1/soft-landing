import { buildPlan, toIcs } from './plan.js';

/* ---------------------------------------------------------------- i18n ---- */
const DICT = {
  en: {
    eyebrow: 'For anyone starting over in a new city',
    title: 'Move cities.<br><em>Keep your taste.</em>',
    lede: "Tell us what you love at home. An agent powered by Qloo's cultural graph translates it into the places, neighborhoods, sounds and people of your new city — so day one already feels like yours.",
    s1: 'Your taste passport', s1hint: 'Add 3–8 things you love: a band, a café, a film, a brand, a book…',
    t_all: 'Everything', t_artist: 'Music', t_place: 'Places', t_movie: 'Film', t_tv: 'Series', t_book: 'Books', t_podcast: 'Podcasts', t_brand: 'Brands',
    ph_search: 'Search anything you love…', example: 'No idea where to start? Try an example',
    s2: 'Where are you landing?', ph_city: 'e.g. Berlin, Lisbon, Mexico City…', go: 'Land softly',
    share: 'Copy link', restart: 'Start over',
    n_dna: 'Taste DNA', n_barrio: 'Your neighborhood', n_places: 'Places', n_culture: 'Local culture', n_meet: 'Meet someone', n_plan: '30-day plan', n_trace: 'How it works',
    h_dna: 'Your taste DNA', p_dna: 'The concepts Qloo finds running through everything you love.',
    h_barrio: 'Your neighborhood', h_places: 'Places that feel like you', p_places: 'Restaurants, bars and venues in your new city that match your taste.',
    h_culture: "Local culture you'll fall for", p_culture: 'What people in your new city who share your taste are into.',
    h_meet: 'Meet someone', p_meet: "A host, a new colleague, a date. Add their taste and find where you overlap — and a place you'd both enjoy.",
    ph_other: 'Something they love…', match: 'Find common ground',
    h_plan: 'Your first 30 days', p_plan: 'A gentle plan built only from Qloo results — each line shows why it was picked for you.',
    h_trace: 'How the agent used Qloo', p_trace: "The agent chooses each step from what Qloo returned. Every call below was made through Qloo's official harness; nothing on this page is invented.",
    foot: 'Built for the Qloo Agentic Hackathon. Open source (MIT).',
    k_artist: 'Sounds', k_screen: 'Film', k_series: 'Series', k_book: 'Books', k_podcast: 'Podcasts', k_brand: 'Brands',
    landingIn: 'Landing in', eyebrowOut: 'Your taste, translated',
    pBarrio: (names) => `Where in the city people who love ${names} concentrate. Brighter means stronger.`,
    needThree: 'Add at least 2 things you love and a city.', error: 'Something went wrong.', retry: 'Retry',
    empty: 'Qloo has no strong match here yet.', loading: 'Asking Qloo…',
    affinity: 'match', because: 'Because', yourTaste: 'your taste',
    barrioN: (n) => `Neighborhood ${n}`, unnamed: 'Taste hotspot', cells: 'hot cells',
    overlap: 'Where you overlap', apart: 'Where you differ', together: "A place you'd both enjoy",
    copied: 'Link copied', copyFail: 'Copy this link from the address bar',
    weeks: ['Orient yourself', 'Find your sound', 'Screen & pages', 'Meet people'],
    kinds: { barrio: 'Neighborhood', place: 'Place', artist: 'Listen', podcast: 'Listen', movie: 'Watch', tv_show: 'Watch', book: 'Read', meet: 'Meet', screen: 'Watch', entity: 'Explore' },
    youAndThem: 'You & them', theirTaste: 'Their taste', noOverlap: 'No clear overlap yet — add more of their favorites.',
    qloo: 'Qloo', cached: 'cached',
    personas: 'Or start from a persona', p1: 'Slow-morning indie', p2: 'Night owl & neon', p3: 'Foodie & festivals',
    warming: 'Waking the server up (free hosting) — the first visit can take up to a minute…',
    agent: 'The agent is working', a_dna: 'Reading your taste', a_places: 'Choosing places', a_barrio: 'Finding your neighborhood', a_culture: 'Listening to the city', a_plan: 'Writing your plan',
    calls: (n) => `${n} Qloo call${n === 1 ? '' : 's'}`, openMap: 'Open in maps', filterOn: (t) => `Filtering by “${t}”`, clear: 'Clear',
    ics: 'Add to calendar (.ics)', print: 'Print / save as PDF', tagHint: 'Tip: tap a concept to filter your places.',
    noMatches: 'No places carry that concept — clear the filter.',
    h_brief: 'Your landing brief', viaYou: 'Because you love', both: 'Matches your favorites and your concepts', spotTag: 'Everyday spot',
    agentLog: 'Agent decisions', plannerPolicy: 'Built-in planner', plannerLlm: (m) => `Language-model planner · ${m}`,
    stepsN: (n) => `${n} step${n === 1 ? '' : 's'}`, briefBy: (m) => `Written by ${m}, using only Qloo results`, briefAuto: 'Summary of the Qloo results below',
    tools: { read_taste: 'Read your taste', find_places: 'Find places', find_barrio: 'Map your neighborhood', name_barrios: 'Name the neighborhoods', listen_city: 'Listen to the city' },
    tpl: ({ city, tags, barrio, places, sound, show }) => [
      `In ${city}, your taste will feel at home: ${tags}.`,
      barrio && `Start around ${barrio} — it is where people who love what you love concentrate.`,
      places && `Good first stops: ${places}.`,
      sound && `For your ears: ${sound}${show ? `; on screen, ${show}` : ''}.`
    ].filter(Boolean).join(' '),
    runFailed: 'The agent could not finish this run.'
  },
  es: {
    eyebrow: 'Para quien empieza de nuevo en otra ciudad',
    title: 'Cambia de ciudad.<br><em>Conserva tu gusto.</em>',
    lede: 'Cuéntanos qué amas en tu ciudad. Un agente con el grafo cultural de Qloo lo traduce en lugares, barrios, música y personas de tu nueva ciudad — para que el primer día ya se sienta tuyo.',
    s1: 'Tu pasaporte de gustos', s1hint: 'Agrega de 3 a 8 cosas que amas: una banda, un café, una película, una marca, un libro…',
    t_all: 'Todo', t_artist: 'Música', t_place: 'Lugares', t_movie: 'Cine', t_tv: 'Series', t_book: 'Libros', t_podcast: 'Podcasts', t_brand: 'Marcas',
    ph_search: 'Busca algo que te guste…', example: '¿No sabes por dónde partir? Prueba un ejemplo',
    s2: '¿Dónde aterrizas?', ph_city: 'ej. Berlín, Lisboa, Ciudad de México…', go: 'Aterrizar suave',
    share: 'Copiar enlace', restart: 'Empezar de nuevo',
    n_dna: 'ADN de gustos', n_barrio: 'Tu barrio', n_places: 'Lugares', n_culture: 'Cultura local', n_meet: 'Conocer a alguien', n_plan: 'Plan de 30 días', n_trace: 'Cómo funciona',
    h_dna: 'Tu ADN de gustos', p_dna: 'Los conceptos que Qloo encuentra en todo lo que te gusta.',
    h_barrio: 'Tu barrio', h_places: 'Lugares que se sienten tuyos', p_places: 'Restaurantes, bares y locales de tu nueva ciudad que calzan con tu gusto.',
    h_culture: 'Cultura local que te va a encantar', p_culture: 'Lo que escucha y ve la gente de tu nueva ciudad que comparte tu gusto.',
    h_meet: 'Conocer a alguien', p_meet: 'Un anfitrión, un colega nuevo, una cita. Agrega sus gustos y descubre dónde coinciden — y un lugar que ambos disfrutarían.',
    ph_other: 'Algo que le guste…', match: 'Buscar puntos en común',
    h_plan: 'Tus primeros 30 días', p_plan: 'Un plan suave hecho solo con resultados de Qloo — cada línea dice por qué te la elegimos.',
    h_trace: 'Cómo usó Qloo el agente', p_trace: 'El agente elige cada paso según lo que Qloo devuelve. Cada llamada de abajo se hizo con el harness oficial de Qloo; nada en esta página está inventado.',
    foot: 'Hecho para el Qloo Agentic Hackathon. Código abierto (MIT).',
    k_artist: 'Música', k_screen: 'Cine', k_series: 'Series', k_book: 'Libros', k_podcast: 'Podcasts', k_brand: 'Marcas',
    landingIn: 'Aterrizando en', eyebrowOut: 'Tu gusto, traducido',
    pBarrio: (names) => `Dónde se concentra en la ciudad la gente que ama ${names}. Más brillante, más afinidad.`,
    needThree: 'Agrega al menos 2 cosas que amas y una ciudad.', error: 'Algo salió mal.', retry: 'Reintentar',
    empty: 'Qloo aún no tiene una coincidencia fuerte aquí.', loading: 'Consultando a Qloo…',
    affinity: 'afinidad', because: 'Porque', yourTaste: 'tu gusto',
    barrioN: (n) => `Barrio ${n}`, unnamed: 'Punto caliente', cells: 'celdas',
    overlap: 'Donde coinciden', apart: 'Donde difieren', together: 'Un lugar que ambos disfrutarían',
    copied: 'Enlace copiado', copyFail: 'Copia el enlace desde la barra de direcciones',
    weeks: ['Ubícate', 'Encuentra tu sonido', 'Pantalla y páginas', 'Conoce gente'],
    kinds: { barrio: 'Barrio', place: 'Lugar', artist: 'Escucha', podcast: 'Escucha', movie: 'Mira', tv_show: 'Mira', book: 'Lee', meet: 'Encuentro', screen: 'Mira', entity: 'Explora' },
    youAndThem: 'Tú y esa persona', theirTaste: 'Sus gustos', noOverlap: 'Aún no hay coincidencias claras — agrega más favoritos suyos.',
    qloo: 'Qloo', cached: 'en caché',
    personas: 'O parte desde un perfil', p1: 'Indie de mañanas lentas', p2: 'Noctámbulo y neón', p3: 'Foodie y festivales',
    warming: 'Despertando el servidor (hosting gratuito) — la primera visita puede tardar hasta un minuto…',
    agent: 'El agente está trabajando', a_dna: 'Leyendo tu gusto', a_places: 'Eligiendo lugares', a_barrio: 'Buscando tu barrio', a_culture: 'Escuchando la ciudad', a_plan: 'Escribiendo tu plan',
    calls: (n) => `${n} llamada${n === 1 ? '' : 's'} a Qloo`, openMap: 'Abrir en mapas', filterOn: (t) => `Filtrando por “${t}”`, clear: 'Quitar',
    ics: 'Agregar al calendario (.ics)', print: 'Imprimir / guardar PDF', tagHint: 'Tip: toca un concepto para filtrar tus lugares.',
    noMatches: 'Ningún lugar tiene ese concepto — quita el filtro.',
    h_brief: 'Tu resumen de aterrizaje', viaYou: 'Porque te gusta', both: 'Calza con tus favoritos y con tus conceptos', spotTag: 'Lugar de todos los días',
    agentLog: 'Decisiones del agente', plannerPolicy: 'Planificador integrado', plannerLlm: (m) => `Planificador con modelo de lenguaje · ${m}`,
    stepsN: (n) => `${n} paso${n === 1 ? '' : 's'}`, briefBy: (m) => `Escrito por ${m}, solo con resultados de Qloo`, briefAuto: 'Resumen de los resultados de Qloo de abajo',
    tools: { read_taste: 'Leer tu gusto', find_places: 'Buscar lugares', find_barrio: 'Mapear tu barrio', name_barrios: 'Nombrar los barrios', listen_city: 'Escuchar la ciudad' },
    tpl: ({ city, tags, barrio, places, sound, show }) => [
      `En ${city}, tu gusto se va a sentir en casa: ${tags}.`,
      barrio && `Parte por ${barrio}: ahí se concentra la gente que ama lo que tú amas.`,
      places && `Buenos primeros panoramas: ${places}.`,
      sound && `Para tus oídos: ${sound}${show ? `; en pantalla, ${show}` : ''}.`
    ].filter(Boolean).join(' '),
    runFailed: 'El agente no pudo terminar esta ejecución.'
  }
};

let lang = 'en';
try {
  const saved = localStorage.getItem('sl.lang');
  lang = saved === 'es' || saved === 'en' ? saved : (navigator.language || 'en').slice(0, 2) === 'es' ? 'es' : 'en';
} catch { lang = 'en'; }
const t = (key, ...args) => {
  const v = DICT[lang][key] ?? DICT.en[key] ?? key;
  return typeof v === 'function' ? v(...args) : v;
};

/* ------------------------------------------------------------- helpers ---- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
function h(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style') node.setAttribute('style', v);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
}
const safeImg = (u) => (typeof u === 'string' && /^https:\/\//i.test(u) ? u : null);
const initial = (s) => (s || '?').trim().charAt(0).toUpperCase();
const typeLabel = (type) => ({ artist: 'Music', movie: 'Film', tv_show: 'Series', book: 'Book', podcast: 'Podcast', brand: 'Brand', place: 'Place', videogame: 'Game', person: 'Person' }[type] || type || '');
const pct = (v) => (typeof v === 'number' ? Math.round(Math.max(0, Math.min(1, v)) * 100) : null);

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), 2400);
}

async function api(path, body) {
  const res = await fetch(path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) throw new Error(data?.error || t('error'));
  return data;
}

function applyLang() {
  document.documentElement.lang = lang;
  $$('[data-i18n]').forEach((n) => {
    const v = t(n.dataset.i18n);
    if (n.dataset.i18n === 'title') n.innerHTML = v; // static, trusted dictionary
    else n.textContent = v;
  });
  $$('[data-i18n-ph]').forEach((n) => n.setAttribute('placeholder', t(n.dataset.i18nPh)));
  $('#lang').textContent = lang === 'en' ? 'ES' : 'EN';
}

/* --------------------------------------------------------------- state ---- */
const state = { anchors: [], other: [], city: '', trace: [], data: {}, kind: 'artist', map: null, layer: null, steps: {}, tag: null, t0: 0, agent: null, brief: null };
const MAX_ANCHORS = 8;

const CITIES = ['Barcelona', 'Berlin', 'Lisbon', 'Madrid', 'Mexico City', 'Buenos Aires', 'Santiago', 'Bogotá', 'Lima', 'São Paulo', 'New York', 'Los Angeles', 'Toronto', 'London', 'Amsterdam', 'Paris', 'Milan', 'Rome', 'Copenhagen', 'Stockholm', 'Vienna', 'Prague', 'Warsaw', 'Istanbul', 'Dubai', 'Singapore', 'Tokyo', 'Seoul', 'Sydney', 'Melbourne', 'Medellín', 'Montevideo', 'Panama City', 'Miami', 'Chicago', 'Austin', 'Vancouver', 'Dublin', 'Edinburgh', 'Cape Town'];
$('#cities').append(...CITIES.map((c) => h('option', { value: c })));

/* ---------------------------------------------------------- autocomplete -- */
function autocomplete({ input, list, typeSelect, onPick, taken }) {
  let items = [];
  let active = -1;
  let timer;
  let seq = 0;

  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; };
  const paint = () => {
    $$('li', list).forEach((li, i) => li.setAttribute('aria-selected', String(i === active)));
  };
  const render = () => {
    list.replaceChildren();
    if (!items.length) {
      list.append(h('li', { class: 'res-empty', role: 'option' }, t('empty')));
    }
    items.forEach((it, i) => {
      const img = safeImg(it.image);
      list.append(h('li', { role: 'option', 'aria-selected': 'false', onmousedown: (e) => { e.preventDefault(); pick(i); } },
        h('span', { class: 'thumb' }, img ? h('img', { src: img, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', style: 'width:100%;height:100%;object-fit:cover' }) : initial(it.name)),
        h('span', { class: 'res-meta' }, h('div', { class: 'res-name' }, it.name), h('div', { class: 'res-type' }, typeLabel(it.type)))));
    });
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };
  const pick = (i) => {
    const it = items[i];
    if (!it) return;
    if (taken().some((a) => a.id === it.id)) { toast('✓'); return; }
    onPick({ id: it.id, name: it.name, type: it.type, image: it.image });
    input.value = '';
    close();
  };
  const search = async () => {
    const q = input.value.trim();
    if (q.length < 2) return close();
    const my = ++seq;
    try {
      const type = typeSelect ? typeSelect.value : '';
      const data = await api(`/api/search?q=${encodeURIComponent(q)}${type ? `&type=${type}` : ''}`);
      if (my !== seq) return;
      items = data.items || [];
      active = items.length ? 0 : -1;
      render();
      paint();
      record(data.trace, 'search');
    } catch (e) {
      if (my !== seq) return;
      items = [];
      list.replaceChildren(h('li', { class: 'res-empty' }, e.message));
      list.hidden = false;
    }
  };
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 260); });
  input.addEventListener('keydown', (e) => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(items.length - 1, active + 1); paint(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); paint(); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(active); }
    else if (e.key === 'Escape') close();
  });
  input.addEventListener('blur', () => setTimeout(close, 120));
  typeSelect?.addEventListener('change', () => input.value && search());
}

/* -------------------------------------------------------------- passport -- */
function renderPassport(listEl, arr, onRemove) {
  listEl.replaceChildren(...arr.map((a, i) => {
    const img = safeImg(a.image);
    return h('li', { class: 'pill' },
      h('span', { class: 'thumb' }, img ? h('img', { src: img, alt: '', referrerpolicy: 'no-referrer', style: 'width:100%;height:100%;object-fit:cover' }) : initial(a.name)),
      a.name,
      h('button', { type: 'button', 'aria-label': `Remove ${a.name}`, onclick: () => onRemove(i) }, '×'));
  }));
}
function refreshIntake() {
  renderPassport($('#passport'), state.anchors, (i) => { state.anchors.splice(i, 1); refreshIntake(); });
  $('#go').disabled = !(state.anchors.length >= 2 && $('#city').value.trim().length >= 2);
  try { localStorage.setItem('sl.draft', JSON.stringify({ a: state.anchors, c: $('#city').value })); } catch { /* ignore */ }
}
function refreshOther() {
  renderPassport($('#passport2'), state.other, (i) => { state.other.splice(i, 1); refreshOther(); });
  $('#match').disabled = state.other.length < 1;
}

autocomplete({
  input: $('#q'), list: $('#results'), typeSelect: $('#stype'), taken: () => state.anchors,
  onPick: (a) => { if (state.anchors.length < MAX_ANCHORS) { state.anchors.push(a); refreshIntake(); } else toast(`Max ${MAX_ANCHORS}`); }
});
autocomplete({
  input: $('#q2'), list: $('#results2'), taken: () => state.other,
  onPick: (a) => { if (state.other.length < 6) { state.other.push(a); refreshOther(); } }
});
$('#city').addEventListener('input', refreshIntake);

/* ------------------------------------------------------------- personas --- */
const PERSONAS = [
  { key: 'p1', city: 'Berlin', items: [['Bon Iver', 'artist'], ['Aesop', 'brand'], ['Amélie', 'movie'], ['Fleabag', 'tv_show'], ['Radio Ambulante', 'podcast'], ['Blue Bottle Coffee', 'brand']] },
  { key: 'p2', city: 'Tokyo', items: [['Tame Impala', 'artist'], ['Daft Punk', 'artist'], ['Blade Runner 2049', 'movie'], ['Stranger Things', 'tv_show'], ['Norwegian Wood', 'book'], ['Nike', 'brand']] },
  { key: 'p3', city: 'Lisbon', items: [['Bad Bunny', 'artist'], ["Chef's Table", 'tv_show'], ['Parts Unknown', 'tv_show'], ['Noma', 'place'], ['Coachella', 'brand']] }
];
function renderPersonas() {
  const box = $('#personas');
  box.replaceChildren(...PERSONAS.map((p) => h('button', { type: 'button', class: 'chip-btn persona', onclick: (ev) => usePersona(p, ev.currentTarget) }, t(p.key), h('span', { class: 'to' }, ` → ${p.city}`))));
}
async function usePersona(p, btn) {
  $$('.persona').forEach((b) => (b.disabled = true));
  btn.classList.add('busy');
  try {
    const found = await Promise.all(p.items.map(async ([q, type]) => {
      try { const d = await api(`/api/search?q=${encodeURIComponent(q)}&type=${type}`); return d.items?.[0]; } catch { return null; }
    }));
    state.anchors = [];
    for (const it of found.filter(Boolean)) {
      if (!state.anchors.some((a) => a.id === it.id) && state.anchors.length < MAX_ANCHORS) state.anchors.push({ id: it.id, name: it.name, type: it.type, image: it.image });
    }
    $('#city').value = p.city;
    refreshIntake();
    if (state.anchors.length < 2) { const e = $('#intake-error'); e.textContent = t('error'); e.hidden = false; }
  } finally { $$('.persona').forEach((b) => (b.disabled = false)); btn.classList.remove('busy'); }
}

/* ------------------------------------------------------------- tracing ---- */
function record(traces, lane) {
  for (const tr of traces || []) state.trace.push({ ...tr, lane });
  renderTrace();
}
function renderTrace() {
  const box = $('#trace');
  if (!box) return;
  box.replaceChildren(...state.trace.map((c) => h('div', { class: 'call' },
    h('span', { class: 'op' }, `${c.lane} · ${c.op}`),
    h('code', { title: JSON.stringify(c.input) }, summarize(c.input)),
    h('span', { class: 'ms' }, c.cached ? t('cached') : `${c.ms} ms`))));
}
function summarize(input) {
  if (!input) return '';
  const parts = [];
  for (const [k, v] of Object.entries(input)) {
    if (v == null) continue;
    const val = Array.isArray(v) ? `${v.length} ids` : String(v);
    parts.push(`${k}=${val.length > 28 ? `${val.slice(0, 28)}…` : val}`);
  }
  return parts.join('  ');
}

/* ------------------------------------------------------- lane plumbing ---- */
function skeleton(container, n = 6) {
  container.replaceChildren(...Array.from({ length: n }, () => h('div', { class: 'skel' })));
}
function setStep() { /* the agent panel is driven by the event stream */ }
const toolLabel = (tool, args) => `${t('tools')[tool] || tool}${args?.kind ? ` · ${t(`k_${args.kind}`)}` : ''}${args?.mode === 'concepts' ? ' · ' + (lang === 'es' ? 'conceptos' : 'concepts') : ''}`;
function renderAgent() {
  const box = $('#agent');
  if (!box) return;
  const a = state.agent;
  if (!a) return box.replaceChildren();
  const secs = ((a.ms ?? (state.t0 ? performance.now() - state.t0 : 0)) / 1000).toFixed(1);
  box.classList.toggle('finished', !!a.done);
  const planner = a.planner === 'llm' ? t('plannerLlm', a.model || 'LLM') : t('plannerPolicy');
  const running = a.steps.filter((s) => s.status === 'run').at(-1) || a.steps.at(-1);
  box.replaceChildren(...[
    h('div', { class: 'agent-top' },
      h('div', { class: 'agent-title' }, a.done ? `✓ ${t('calls', a.calls ?? state.trace.length)} · ${t('stepsN', a.steps.length)} · ${secs}s` : t('agent')),
      h('span', { class: 'agent-planner' }, planner)),
    h('ol', {}, a.steps.map((s) => h('li', { class: s.status === 'run' ? 'run' : s.ok === false ? 'err' : 'done' }, h('i', { 'aria-hidden': 'true' }), toolLabel(s.tool, s.args)))),
    !a.done && running?.why ? h('p', { class: 'agent-why' }, running.why) : null,
    a.verify ? h('p', { class: 'agent-why' }, a.verify) : null,
    a.steps.length ? h('details', { class: 'agent-log' },
      h('summary', {}, t('agentLog')),
      ...a.steps.map((s) => h('div', { class: 'log-row' },
        h('b', {}, `${s.id}. ${toolLabel(s.tool, s.args)}`),
        s.why && h('div', { class: 'log-why' }, s.why),
        s.summary && h('div', { class: `log-obs${s.ok === false ? ' bad' : ''}` }, `→ ${s.summary}${s.ms ? ` (${s.ms} ms)` : ''}`))),
      ...a.notes.map((n) => h('div', { class: 'log-row' }, h('div', { class: 'log-why' }, n)))) : null
  ].filter(Boolean));
}

async function lane(name, body, container, render, { cols } = {}) {
  if (cols !== false) skeleton(container, cols || 4);
  setStep(name, 'run');
  try {
    const data = await api(`/api/lane/${name}`, { anchors: state.anchors.map(({ id, name: n, type }) => ({ id, name: n, type })), city: state.city, ...body });
    record(data.trace, name);
    state.data[name + (body?.kind ? `:${body.kind}` : '')] = data;
    render(data);
    setStep(name, 'done');
    schedulePlan();
    return data;
  } catch (e) {
    setStep(name, 'err');
    container.replaceChildren(h('div', { class: 'lane-error' }, h('span', {}, e.message), h('button', { class: 'chip-btn', type: 'button', onclick: () => lane(name, body, container, render, { cols }) }, t('retry'))));
    return null;
  }
}

/* ------------------------------------------------------------ renderers --- */
const mapsUrl = (item) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([item.name, item.address, state.city].filter(Boolean).join(' '))}`;
function card(item, { showWhy = true, maps = false } = {}) {
  const img = safeImg(item.image);
  const m = pct(item.affinity);
  return h('article', { class: 'item' },
    h('div', { class: 'cover' }, img ? h('img', { src: img, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', onerror: (e) => e.target.replaceWith(initial(item.name)) }) : initial(item.name)),
    h('div', { class: 'item-body' },
      h('div', { class: 'item-name' }, item.name),
      (item.address || item.description) && h('div', { class: 'item-sub' }, item.address || item.description),
      m != null && h('div', { class: 'meter-row' }, h('div', { class: 'meter', style: `--m:${m / 100}` }, h('i')), `${m}% ${t('affinity')}`),
      showWhy && item.why?.length ? h('div', { class: 'because' }, `${t('because')} `, h('b', {}, item.why.slice(0, 2).join(' · '))) : null,
      showWhy && !item.why?.length && item.via?.length ? h('div', { class: 'because' }, `${t('viaYou')} `, h('b', {}, item.via.slice(0, 2).join(' · '))) : null,
      item.from === 'both' ? h('div', { class: 'pill-both' }, `✦ ${t('both')}`) : null,
      item.from === 'spots' ? h('div', { class: 'pill-both' }, `☕ ${t('spotTag')}`) : null,
      maps ? h('a', { class: 'maplink', href: mapsUrl(item), target: '_blank', rel: 'noopener noreferrer' }, `${t('openMap')} ↗`) : null));
}
function grid(container, items, opts) {
  if (!items?.length) return container.replaceChildren(h('div', { class: 'empty' }, t('empty')));
  container.replaceChildren(...items.map((it, i) => { const c = card(it, opts); c.style.animationDelay = `${i * 40}ms`; return c; }));
}

function renderPlaces() {
  if (state.data.dna?.tags) renderDna(state.data.dna);
  const items = state.data.places?.items || [];
  const box = $('#places');
  const bar = $('#places-filter');
  if (!state.tag) { bar.hidden = true; return grid(box, items, { maps: true }); }
  const tag = state.tag.toLowerCase();
  const kept = items.filter((it) => (it.why || []).some((w) => String(w).toLowerCase() === tag));
  bar.hidden = false;
  bar.replaceChildren(h('span', {}, t('filterOn', state.tag)), h('button', { type: 'button', class: 'chip-btn', onclick: () => { state.tag = null; renderPlaces(); } }, t('clear')));
  if (!kept.length) return box.replaceChildren(h('div', { class: 'empty' }, t('noMatches')));
  grid(box, kept, { maps: true });
}

const placeTagSet = () => new Set((state.data.places?.items || []).flatMap((it) => (it.why || []).map((w) => String(w).toLowerCase())));
function renderDna({ tags }) {
  const box = $('#dna');
  if (!tags?.length) return box.replaceChildren(h('div', { class: 'empty' }, t('empty')));
  const max = Math.max(...tags.map((x) => x.affinity ?? 0), 0.0001);
  const linked = placeTagSet();
  const anyLinked = tags.some((tg) => linked.has(String(tg.name).toLowerCase()));
  const tip = $('.tip'); if (tip) tip.hidden = !anyLinked;
  box.replaceChildren(...tags.map((tg, i) => {
    const s = tg.affinity != null ? Math.max(0.15, Math.min(1, tg.affinity / max)) : Math.max(0.2, 1 - i * 0.07);
    const style = `--s:${s.toFixed(2)};animation-delay:${i * 35}ms`;
    if (!linked.has(String(tg.name).toLowerCase())) return h('span', { class: 'tag', style }, tg.name);
    return h('button', { type: 'button', class: `tag linked${state.tag === tg.name ? ' on' : ''}`, 'aria-pressed': String(state.tag === tg.name), style, title: t('tagHint'), onclick: () => { state.tag = state.tag === tg.name ? null : tg.name; renderDna({ tags }); renderPlaces(); if (state.tag) $('#sec-places').scrollIntoView({ behavior: 'smooth' }); } }, tg.name);
  }));
}

function ensureMap() {
  if (state.map || !window.L) return state.map;
  state.map = window.L.map('map', { scrollWheelZoom: false }).setView([20, 0], 2);
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(state.map);
  state.layer = window.L.layerGroup().addTo(state.map);
  return state.map;
}
const clamp01 = (n) => Math.min(1, Math.max(0, Number(n) || 0));
// If the map library or its tiles can't load, still show where the heat is.
function drawFallbackMap(points) {
  const el = $('#map');
  const NS = 'http://www.w3.org/2000/svg';
  const lats = points.map((p) => p.lat), lons = points.map((p) => p.lon);
  const [minLat, maxLat, minLon, maxLon] = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)];
  const sx = (lon) => 30 + ((lon - minLon) / (maxLon - minLon || 1)) * 540;
  const sy = (lat) => 270 - ((lat - minLat) / (maxLat - minLat || 1)) * 240;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 600 300'); svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%'); svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  for (const p of points) {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', sx(p.lon)); c.setAttribute('cy', sy(p.lat)); c.setAttribute('r', 8 + clamp01(p.strength) * 26);
    c.setAttribute('fill', '#6c4cf5'); c.setAttribute('fill-opacity', 0.15 + clamp01(p.strength) * 0.45);
    svg.append(c);
  }
  el.replaceChildren(svg);
}
function renderBarrio(data) {
  $('#p-barrio').textContent = t('pBarrio', data.anchorsUsed.join(', '));
  const map = ensureMap();
  const box = $('#barrios');
  if (!data.points?.length) { box.replaceChildren(h('div', { class: 'empty' }, t('empty'))); return; }
  if (!map) drawFallbackMap(data.points);
  if (map) {
    state.layer.clearLayers();
    const bounds = [];
    for (const p of data.points) {
      window.L.circleMarker([p.lat, p.lon], { radius: 6 + clamp01(p.strength) * 20, color: '#6c4cf5', weight: 0, fillColor: '#6c4cf5', fillOpacity: 0.12 + clamp01(p.strength) * 0.4 }).addTo(state.layer);
      bounds.push([p.lat, p.lon]);
    }
    setTimeout(() => { map.invalidateSize(); map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 }); }, 60);
  }
  box.replaceChildren(...data.barrios.map((b, i) => h('div', { class: 'barrio', tabindex: '0', onclick: () => state.map?.flyTo([b.lat, b.lon], 14) },
    h('div', { class: 'rank' }, t('barrioN', i + 1)),
    h('h4', { class: 'bname' }, b.name || t('unnamed')),
    h('div', { class: 'meter-row' }, h('div', { class: 'meter', style: `--m:${clamp01(b.strength)}` }, h('i')), `${b.cells} ${t('cells')}`))));
}

// Neighborhood names: the server tries first; any it could not resolve are looked up
// here (OpenStreetMap Nominatim, 1 request/second, only barrio coordinates are sent).
let namingJob = 0;
// Two clusters can sit in the same named district: tell them apart by where they are inside it.
function disambiguateBarrios(data) {
  const dirs = lang === 'es' ? { n: 'norte', s: 'sur', e: 'este', w: 'oeste' } : { n: 'north', s: 'south', e: 'east', w: 'west' };
  const groups = new Map();
  data.barrios.forEach((b, i) => { if (b.name) groups.set(b.name, [...(groups.get(b.name) || []), i]); });
  for (const [name, idx] of groups) {
    if (idx.length < 2) continue;
    const lat = idx.reduce((s, i) => s + data.barrios[i].lat, 0) / idx.length;
    const lon = idx.reduce((s, i) => s + data.barrios[i].lon, 0) / idx.length;
    idx.forEach((i) => {
      const b = data.barrios[i];
      const dLat = b.lat - lat;
      const dLon = (b.lon - lon) * Math.cos((lat * Math.PI) / 180);
      const dir = Math.abs(dLat) >= Math.abs(dLon) ? (dLat >= 0 ? dirs.n : dirs.s) : (dLon >= 0 ? dirs.e : dirs.w);
      b.name = `${name} · ${dir}`;
      const el = $$('#barrios .bname')[i];
      if (el) el.textContent = b.name;
    });
  }
}
async function nameBarrios(data) {
  const job = ++namingJob;
  for (let i = 0; i < data.barrios.length; i += 1) {
    const b = data.barrios[i];
    if (b.name || job !== namingJob) continue;
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&accept-language=${lang}&lat=${b.lat.toFixed(5)}&lon=${b.lon.toFixed(5)}`;
      const res = await fetch(url, { referrerPolicy: 'strict-origin-when-cross-origin' });
      if (res.ok) {
        const a = (await res.json()).address || {};
        b.name = a.neighbourhood || a.suburb || a.quarter || a.city_district || a.village || a.town || a.city || null;
        const el = $$('#barrios .bname')[i];
        if (b.name && el) el.textContent = b.name;
      }
    } catch { /* leave the generic label */ }
    await new Promise((r) => setTimeout(r, 1100));
  }
  disambiguateBarrios(data);
  schedulePlan();
  renderBrief();
}

function renderKinds() {
  const kinds = ['artist', 'screen', 'series', 'book', 'podcast', 'brand'];
  $('#kinds').replaceChildren(...kinds.map((k) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(state.kind === k), onclick: () => { state.kind = k; renderKinds(); loadCulture(k); } }, t(`k_${k}`))));
}
async function loadCulture(kind) {
  const key = `culture:${kind}`;
  const box = $('#culture');
  if (state.data[key]) return grid(box, state.data[key].items);
  await lane('culture', { kind }, box, (d) => { if (state.kind === kind) grid(box, d.items); });
}

function renderMeet(data) {
  const out = $('#meet');
  const { comparison, together } = data;
  const nodes = [];
  if (comparison.tags?.length) {
    nodes.push(h('div', {}, h('div', { class: 'sub-title' }, t('overlap')), h('div', { class: 'cloud' }, comparison.tags.slice(0, 10).map((tg, i) => h('span', { class: 'tag', style: `--s:${Math.max(0.2, 1 - i * 0.08)}` }, tg.name)))));
  }
  if (comparison.entities?.length) {
    const box = h('div', { class: 'grid' });
    grid(box, comparison.entities.slice(0, 6), { showWhy: false });
    nodes.push(h('div', {}, h('div', { class: 'sub-title' }, t('youAndThem')), box));
  }
  const box2 = h('div', { class: 'grid' });
  grid(box2, together, { maps: true });
  nodes.push(h('div', {}, h('div', { class: 'sub-title' }, t('together')), box2));
  out.replaceChildren(...nodes);
}

function renderBrief() {
  const box = $('#brief');
  if (!box) return;
  const d = state.data;
  const tags = (d.dna?.tags || []).slice(0, 3).map((x) => x.name);
  if (!tags.length) { box.hidden = true; return; }
  const ai = state.brief && state.brief.lang === lang ? state.brief : null;
  const text = ai ? ai.text : t('tpl', {
    city: state.city,
    tags: tags.join(', '),
    barrio: d.barrio?.barrios?.find((b) => b.name)?.name,
    places: (d.places?.items || []).slice(0, 3).map((x) => x.name).join(', '),
    sound: (d['culture:artist']?.items || []).slice(0, 2).map((x) => x.name).join(', '),
    show: (d['culture:screen']?.items || d['culture:series']?.items || []).slice(0, 1).map((x) => x.name).join(', ')
  });
  box.hidden = false;
  box.replaceChildren(h('h3', {}, t('h_brief')), h('p', { class: 'brief-text' }, text), h('p', { class: 'brief-by' }, ai ? t('briefBy', ai.model || 'LLM') : t('briefAuto')));
}

const clipText = (s, n) => { s = String(s); if (s.length <= n) return s; const cut = s.slice(0, n); return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), n - 20))}…`; };
let planTimer;
function schedulePlan() { clearTimeout(planTimer); planTimer = setTimeout(() => { renderPlan(); renderBrief(); }, 150); }
function renderPlan() {
  const d = state.data;
  const culture = {};
  for (const k of ['artist', 'screen', 'series', 'book', 'podcast', 'brand']) culture[k] = d[`culture:${k}`]?.items;
  const plan = buildPlan({ anchors: state.anchors, city: state.city, tags: d.dna?.tags, places: d.places?.items, barrios: d.barrio?.barrios, culture, match: d.match });
  const box = $('#plan');
  if (!plan.weeks.length) return box.replaceChildren(h('div', { class: 'skel' }));
  state.plan = plan;
  setStep('plan', 'done');
  box.replaceChildren(...plan.weeks.map((w) => h('div', { class: 'week' },
    h('h4', {}, `Week ${w.week}`),
    h('div', { class: 'wt' }, DICT[lang].weeks[w.week - 1]),
    ...w.items.map((it) => h('div', { class: 'step-item' },
      h('div', { class: 'k' }, t('kinds')[it.type] || it.type),
      h('div', { class: 't' }, it.title),
      it.note && h('div', { class: 'n' }, clipText(it.note, 110)),
      it.why && h('div', { class: 'because' }, `${t('because')} `, h('b', {}, it.why.value)))))));
}

/* ------------------------------------------------------------- run ------- */
function applyLane(name, data) {
  record(data.trace, name);
  if (name === 'culture') {
    state.data[`culture:${data.kind}`] = data;
    if (state.kind === data.kind) grid($('#culture'), data.items);
  } else {
    state.data[name] = data;
    if (name === 'dna') renderDna(data);
    else if (name === 'places') renderPlaces();
    else if (name === 'barrio') { renderBarrio(data); nameBarrios(data); }
  }
  schedulePlan();
}

function onAgentEvent(ev) {
  const a = state.agent;
  if (ev.t === 'start') { state.agent = { planner: ev.planner, model: ev.model, steps: [], notes: [], done: false }; }
  else if (ev.t === 'step') a.steps.push({ id: ev.id, tool: ev.tool, args: ev.args, why: ev.why, status: 'run' });
  else if (ev.t === 'obs') { const s = a.steps.find((x) => x.id === ev.id); if (s) Object.assign(s, { status: 'done', ok: ev.ok, summary: ev.summary, ms: ev.ms }); }
  else if (ev.t === 'lane') applyLane(ev.name, ev.data);
  else if (ev.t === 'lane_error') {
    const container = { dna: $('#dna'), places: $('#places'), barrio: $('#barrios'), culture: $('#culture') }[ev.name];
    if (container && !(ev.name === 'culture' && ev.kind && ev.kind !== state.kind)) {
      container.replaceChildren(h('div', { class: 'lane-error' }, h('span', {}, ev.message), h('button', { class: 'chip-btn', type: 'button', onclick: () => retryLane(ev) }, t('retry'))));
    }
  }
  else if (ev.t === 'note') a.notes.push(ev.text);
  else if (ev.t === 'verify') a.verify = ev.text;
  else if (ev.t === 'brief') { state.brief = { text: ev.text, lang: ev.lang, model: ev.model }; renderBrief(); }
  else if (ev.t === 'done') Object.assign(a, { done: true, calls: ev.calls, ms: performance.now() - state.t0, planner: ev.planner });
  else if (ev.t === 'error') { a.done = true; a.verify = ev.message || t('runFailed'); }
  renderAgent();
}

function retryLane(ev) {
  const map = { dna: ['dna', $('#dna'), renderDna, 1], places: ['places', $('#places'), renderPlaces, 6], barrio: ['barrio', $('#barrios'), (d) => { renderBarrio(d); nameBarrios(d); }, 3], culture: ['culture', $('#culture'), (d) => grid($('#culture'), d.items), 4] };
  const [name, box, render, cols] = map[ev.name];
  return lane(name, ev.kind ? { kind: ev.kind } : {}, box, render, { cols });
}

async function streamAgent() {
  const res = await fetch('/api/agent', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ anchors: state.anchors.map(({ id, name, type }) => ({ id, name, type })), city: state.city, lang })
  });
  if (!res.ok || !res.body) {
    let msg = t('error');
    try { msg = (await res.json()).error || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) { try { onAgentEvent(JSON.parse(line)); } catch { /* skip a malformed line */ } }
    }
  }
}

async function land() {
  state.city = $('#city').value.trim();
  state.trace = [];
  state.data = {};
  state.kind = 'artist';
  state.steps = {};
  state.tag = null;
  state.agent = null;
  state.brief = null;
  state.t0 = performance.now();
  renderAgent();
  $('#intake').hidden = true;
  $('#out').hidden = false;
  $('#brief').hidden = true;
  window.scrollTo({ top: 0 });
  $('#out-eyebrow').textContent = t('eyebrowOut');
  $('#out-title').textContent = `${t('landingIn')} ${state.city}`;
  history.replaceState(null, '', `#${encodeState()}`);
  renderKinds();
  skeleton($('#dna'), 1);
  skeleton($('#places'), 6);
  skeleton($('#barrios'), 3);
  skeleton($('#culture'), 4);
  $('#plan').replaceChildren(h('div', { class: 'skel' }));
  $('#meet').replaceChildren();
  try {
    await streamAgent();
  } catch (e) {
    state.agent = state.agent || { planner: 'policy', steps: [], notes: [] };
    Object.assign(state.agent, { done: true, verify: e.message || t('runFailed') });
    renderAgent();
    for (const id of ['#dna', '#places', '#barrios', '#culture']) {
      if ($(id).querySelector('.skel')) $(id).replaceChildren(h('div', { class: 'lane-error' }, h('span', {}, e.message || t('error')), h('button', { class: 'chip-btn', type: 'button', onclick: land }, t('retry'))));
    }
  }
}

function encodeState() {
  const payload = { a: state.anchors.map((a) => ({ i: a.id, n: a.name, t: a.type })), c: state.city };
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decodeState(hash) {
  try {
    const b64 = hash.replace(/-/g, '+').replace(/_/g, '/');
    const p = JSON.parse(decodeURIComponent(escape(atob(b64))));
    if (!Array.isArray(p.a) || !p.c) return null;
    return { anchors: p.a.slice(0, MAX_ANCHORS).map((x) => ({ id: String(x.i), name: String(x.n), type: x.t })), city: String(p.c) };
  } catch { return null; }
}

$('#go').addEventListener('click', () => {
  if (state.anchors.length < 2 || $('#city').value.trim().length < 2) { const e = $('#intake-error'); e.textContent = t('needThree'); e.hidden = false; return; }
  land();
});
$('#restart').addEventListener('click', () => { history.replaceState(null, '', location.pathname); $('#out').hidden = true; $('#intake').hidden = false; window.scrollTo({ top: 0 }); });
$('#share').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(location.href); toast(t('copied')); } catch { toast(t('copyFail')); }
});
$('#match').addEventListener('click', async (ev) => {
  ev.target.disabled = true;
  const box = $('#meet');
  skeleton(box, 3);
  await lane('match', { other: state.other.map(({ id, name, type }) => ({ id, name, type })) }, box, renderMeet, { cols: false });
  ev.target.disabled = false;
});
$('#ics').addEventListener('click', () => {
  if (!state.plan?.weeks?.length) return;
  const blob = new Blob([toIcs(state.plan, { cityLabel: state.city, weekNames: DICT[lang].weeks })], { type: 'text/calendar;charset=utf-8' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `soft-landing-${state.city.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.ics` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});
$('#print').addEventListener('click', () => window.print());
$('#lang').addEventListener('click', () => {
  lang = lang === 'en' ? 'es' : 'en';
  try { localStorage.setItem('sl.lang', lang); } catch { /* ignore */ }
  applyLang();
  renderPersonas();
  renderAgent();
  renderBrief();
  if (!$('#out').hidden) { $('#out-eyebrow').textContent = t('eyebrowOut'); $('#out-title').textContent = `${t('landingIn')} ${state.city}`; renderKinds(); renderPlan(); }
});

// section highlight in the sticky nav
const links = $$('.tabs a');
const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${e.target.id}`));
}, { rootMargin: '-30% 0px -60% 0px' });
$$('#out .block').forEach((s) => io.observe(s));

/* ------------------------------------------------------------- boot ------ */
applyLang();
renderPersonas();
// Free hosting sleeps when idle: wake it up on arrival and say so if it takes a while.
(() => {
  const banner = $('#warm');
  const timer = setTimeout(() => { banner.textContent = t('warming'); banner.hidden = false; }, 2500);
  fetch('/api/health').catch(() => {}).finally(() => { clearTimeout(timer); banner.hidden = true; });
})();
const shared = location.hash.length > 1 ? decodeState(location.hash.slice(1)) : null;
if (shared) {
  state.anchors = shared.anchors;
  $('#city').value = shared.city;
  refreshIntake();
  land();
} else {
  try {
    const draft = JSON.parse(localStorage.getItem('sl.draft') || 'null');
    if (draft?.a?.length) { state.anchors = draft.a; $('#city').value = draft.c || ''; }
  } catch { /* ignore */ }
  refreshIntake();
}
refreshOther();
