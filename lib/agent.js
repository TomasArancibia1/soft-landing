// The Soft Landing agent: turns a person's taste anchors + a destination city
// into a set of Qloo-grounded "lanes". Each lane is a small, explicit plan of
// Qloo calls (the trace is returned so the UI can show exactly what ran).

import { qlooExec } from './qloo.js';
import * as N from './normalize.js';
import { reverseName } from './geo.js';

const KINDS = {
  artist: 'artist',
  screen: 'movie',
  series: 'tv_show',
  book: 'book',
  podcast: 'podcast',
  brand: 'brand'
};
export const CULTURE_KINDS = Object.keys(KINDS);

const ids = (anchors) => anchors.map((a) => a.id);

/** Taste DNA: the concepts that jointly characterize the person's anchors. */
export async function dna({ anchors }) {
  const { result, trace } = await qlooExec('entity_tags', { entities: ids(anchors), limit: 14 });
  return { tags: N.tags(result), trace: [trace] };
}

/** Places in the destination that match the anchors (restaurants, bars, venues...). */
export async function places({ anchors, city }) {
  const { result, trace } = await qlooExec('recommend', {
    target_type: 'place',
    signals: ids(anchors),
    filter_location: city,
    limit: 12
  });
  return { items: N.entities(result), trace: [trace] };
}

/**
 * Barrio finder: where in the city do people who love these things concentrate?
 * One heatmap per anchor (max 3), merged — cells hit by several anchors rank higher.
 */
export async function barrio({ anchors, city }) {
  const chosen = anchors.slice(0, 3);
  const runs = await Promise.all(
    chosen.map((a) => qlooExec('where_popular', { entity: a.id, within: city, limit: 20 }))
  );
  const merged = N.mergeHeat(runs.map((r) => N.heatPoints(r.result)));
  const clusters = N.clusterBarrios(merged, 3);
  const named = [];
  for (const c of clusters) {
    named.push({ ...c, name: await reverseName(c.lat, c.lon) });
  }
  return {
    points: merged.slice(0, 40),
    barrios: named,
    anchorsUsed: chosen.map((a) => a.name),
    trace: runs.map((r) => r.trace)
  };
}

/** Local culture: what people in the destination who share your taste love (artists, screen, books...). */
export async function culture({ anchors, city, kind }) {
  const target = KINDS[kind] || 'artist';
  const { result, trace } = await qlooExec('recommend', {
    target_type: target,
    signals: ids(anchors),
    signal_location: city,
    limit: 8
  });
  return { kind, items: N.entities(result), trace: [trace] };
}

/**
 * Meet a local: compare your taste with someone else's (a host, a new friend, a
 * colleague) and find places you would both enjoy.
 */
export async function match({ anchors, other, city }) {
  const [cmp, together] = await Promise.all([
    qlooExec('compare_audiences', { group_a: ids(anchors), group_b: ids(other), target_type: 'place', limit: 10 }),
    qlooExec('recommend', {
      target_type: 'place',
      signals: [...ids(anchors), ...ids(other)].slice(0, 10),
      filter_location: city,
      limit: 8
    })
  ]);
  return {
    comparison: N.comparison(cmp.result),
    together: N.entities(together.result),
    trace: [cmp.trace, together.trace]
  };
}
