// Pre-computes the three example personas shortly after boot so the first
// visitor (or a judge) gets an instant answer. Results land in the private,
// server-side cache only; nothing is written to disk or to the repository.

import { qlooSearch } from './qloo.js';
import { runAgent } from './agent-loop.js';

export const PERSONAS = [
  { city: 'Berlin', items: [['Bon Iver', 'artist'], ['Aesop', 'brand'], ['Amélie', 'movie'], ['Fleabag', 'tv_show'], ['Radio Ambulante', 'podcast'], ['Blue Bottle Coffee', 'brand']] },
  { city: 'Tokyo', items: [['Tame Impala', 'artist'], ['Daft Punk', 'artist'], ['Blade Runner 2049', 'movie'], ['Stranger Things', 'tv_show'], ['Norwegian Wood', 'book'], ['Nike', 'brand']] },
  { city: 'Lisbon', items: [['Bad Bunny', 'artist'], ["Chef's Table", 'tv_show'], ['Parts Unknown', 'tv_show'], ['Noma', 'place'], ['Coachella', 'brand']] }
];

export async function warmPersonas({ personas = PERSONAS } = {}) {
  for (const p of personas) {
    try {
      const found = await Promise.all(p.items.map(async ([q, type]) => {
        try {
          const { result } = await qlooSearch(q, `urn:entity:${type}`, 7);
          const list = Array.isArray(result) ? result : result?.results || result?.entities || [];
          const e = list[0];
          return e ? { id: String(e.entity_id ?? e.id), name: String(e.name), type } : null;
        } catch { return null; }
      }));
      const anchors = [];
      for (const a of found.filter(Boolean)) if (!anchors.some((x) => x.id === a.id)) anchors.push(a);
      if (anchors.length >= 2) await runAgent({ anchors, city: p.city, lang: 'en', emit: () => {} });
    } catch { /* warming is best-effort */ }
  }
}
