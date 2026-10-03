// Builds the 4-week "settling-in" plan from lane results. Pure and deterministic:
// every suggestion is a Qloo result, and every line says which of the person's
// tastes (or Qloo tags) it comes from.

const first = (arr, n = 1) => (Array.isArray(arr) ? arr.slice(0, n) : []);
const because = (item, anchors, tags) => {
  const via = item.why && item.why.length ? item.why[0] : tags && tags.length ? tags[0].name : null;
  if (via) return { kind: 'tag', value: via };
  const a = anchors && anchors[0];
  return a ? { kind: 'anchor', value: a.name } : null;
};

export function buildPlan({ anchors = [], city = '', tags = [], places = [], barrios = [], culture = {}, match = null }) {
  const weeks = [];

  // Week 1 — orient: the barrio and two anchor places
  const w1 = [];
  const barrio = barrios[0];
  if (barrio) {
    w1.push({ type: 'barrio', title: barrio.name || 'Your strongest taste cluster', note: 'Where people who love what you love concentrate.', ref: barrio });
  }
  for (const p of first(places, 2)) w1.push({ type: 'place', title: p.name, note: p.address || p.description, why: because(p, anchors, tags), ref: p });
  if (w1.length) weeks.push({ week: 1, key: 'w1', items: w1 });

  // Week 2 — sound
  const w2 = [];
  for (const a of first(culture.artist, 2)) w2.push({ type: 'artist', title: a.name, note: a.description, why: because(a, anchors, tags), ref: a });
  for (const p of first(culture.podcast, 1)) w2.push({ type: 'podcast', title: p.name, note: p.description, why: because(p, anchors, tags), ref: p });
  if (w2.length) weeks.push({ week: 2, key: 'w2', items: w2 });

  // Week 3 — screen & pages
  const w3 = [];
  for (const s of [...first(culture.screen, 1), ...first(culture.series, 1), ...first(culture.book, 1)]) {
    w3.push({ type: s.type || 'screen', title: s.name, note: s.description, why: because(s, anchors, tags), ref: s });
  }
  if (w3.length) weeks.push({ week: 3, key: 'w3', items: w3 });

  // Week 4 — people
  const w4 = [];
  if (match && match.together && match.together.length) {
    for (const p of first(match.together, 2)) w4.push({ type: 'meet', title: p.name, note: p.address || p.description, why: because(p, anchors, tags), ref: p });
  } else if (places.length > 2) {
    for (const p of first(places.slice(2), 2)) w4.push({ type: 'place', title: p.name, note: p.address || p.description, why: because(p, anchors, tags), ref: p });
  }
  if (w4.length) weeks.push({ week: 4, key: 'w4', items: w4 });

  return { city, weeks };
}
