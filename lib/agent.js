// The Soft Landing agent: turns a person's taste anchors + a destination city
// into a set of Qloo-grounded "lanes". Each lane is a small, explicit plan of
// Qloo calls (the trace is returned so the UI can show exactly what ran).

import { qlooExec } from './qloo.js';
import * as N from './normalize.js';

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

// Tags that describe who a person *is* (ethnicity, religion...) are never shown or used:
// Soft Landing translates what you like, it does not infer who you are.
const SENSITIVE = new Set(['ethnicity', 'nationality', 'religion', 'sexuality', 'gender', 'age', 'race', 'political', 'politics', 'disability', 'health', 'language', 'occupation', 'inclusivity']);
// Categories that say the most about taste come first (they also drive the concept pass and the brief).
const PRIORITY = ['emotional_tone', 'cultural_relevance', 'hobby', 'aesthetic_property', 'influencer_appeal', 'customer_identity', 'amenity'];
const prio = (t) => { const i = PRIORITY.indexOf(tagCategory(t.id)); return i < 0 ? 99 : i; };
export const shapeTags = (tags) => tags.filter((t) => !SENSITIVE.has(tagCategory(t.id))).sort((a, b) => prio(a) - prio(b)).slice(0, 14);
export const tagCategory = (id) => String(id || '').split(':')[2] || '';
// Concept categories that make sense as signals for places (vs. media-specific ones like subgenre).
const PLACE_FRIENDLY = new Set(['amenity', 'hobby', 'customer_identity', 'influencer_appeal', 'cultural_relevance', 'emotional_tone', 'cuisine', 'vibe', 'lifestyle', 'interest', 'audience', 'style', 'atmosphere', 'occasion', 'social_scene']);

/** Taste DNA: the concepts that jointly characterize the person's anchors. */
export async function dna({ anchors }) {
  const { result, trace } = await qlooExec('entity_tags', { entities: ids(anchors), limit: 20 });
  const tags = shapeTags(N.tags(result));
  return { tags, trace: [trace] };
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

/** The concepts most useful for finding places: place-friendly categories first, then the rest. */
export function pickConceptTags(tags, n = 3) {
  const usable = tags.filter((t) => typeof t.id === 'string' && t.id.startsWith('urn:tag:'));
  const friendly = usable.filter((t) => PLACE_FRIENDLY.has(tagCategory(t.id)));
  return [...friendly, ...usable.filter((t) => !friendly.includes(t))].slice(0, n);
}

/** Second pass: places that carry the person's top Qloo concepts, whoever the anchors were. */
export async function placesByConcepts({ city, tags }) {
  const sig = pickConceptTags(tags);
  if (!sig.length) return { items: [], concepts: [], trace: [], skipped: 'no tag ids' };
  const { result, trace } = await qlooExec('recommend', {
    target_type: 'place',
    signal_tags: sig.map((t) => t.id),
    signal_tags_operator: 'union',
    filter_location: city,
    limit: 12
  });
  const concepts = sig.map((t) => t.name);
  const items = N.entities(result).map((it) => ({ ...it, why: concepts.slice(0, 3) }));
  return { items, concepts, trace: [trace], status: result?.status };
}

const SPOT_QUERIES = ['cafe', 'bar', 'restaurant', 'bookstore'];

/** Everyday spots: ask Qloo (find_tags) which place tags mean cafés, bars, restaurants..., then filter by them. */
export async function placesSpots({ anchors, city }) {
  const runs = await Promise.all(SPOT_QUERIES.map((q) => qlooExec('find_tags', { query: q, limit: 5 })));
  const tags = [];
  runs.forEach((r, i) => {
    const found = N.tags(r.result);
    const best = found.find((t) => /:place:|^place$/.test(`${t.id || ''}:${t.type || ''}`)) || found[0];
    if (best?.id && String(best.id).startsWith('urn:tag:')) tags.push({ ...best, query: SPOT_QUERIES[i] });
  });
  const trace = runs.map((r) => r.trace);
  if (!tags.length) return { items: [], spots: [], trace, skipped: 'no place tags found' };
  const { result, trace: t2 } = await qlooExec('recommend', {
    target_type: 'place',
    signals: ids(anchors),
    include_tags: tags.map((t) => t.id),
    include_tags_operator: 'union',
    filter_location: city,
    limit: 12
  });
  const items = N.entities(result);
  return { items, spots: tags.map((t) => t.name), trace: [...trace, t2], status: result?.status };
}

/** One heatmap per anchor: where in the city do people who love this concentrate? */
export async function heat({ anchors, city }) {
  const runs = await Promise.all(
    anchors.map((a) => qlooExec('where_popular', { entity: a.id, within: city, limit: 20 }))
  );
  return { maps: runs.map((r) => N.heatPoints(r.result)), trace: runs.map((r) => r.trace) };
}

/** Merge heatmaps into ranked cells and barrio clusters (names are resolved in the browser). */
export function barrioFrom(maps, anchorNames) {
  const merged = N.mergeHeat(maps);
  const barrios = N.clusterBarrios(merged, 3).map((c) => ({ ...c, name: null }));
  return { points: merged.slice(0, 40), barrios, anchorsUsed: anchorNames };
}

/**
 * Barrio finder (single-shot lane): one heatmap per anchor (max 3), merged — cells hit
 * by several anchors rank higher.
 */
export async function barrio({ anchors, city }) {
  const chosen = anchors.slice(0, 3);
  const { maps, trace } = await heat({ anchors: chosen, city });
  return { ...barrioFrom(maps, chosen.map((a) => a.name)), trace };
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
