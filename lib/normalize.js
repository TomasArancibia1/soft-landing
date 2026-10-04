// Defensive normalizers: turn Qloo workflow envelopes into small, stable shapes
// the UI renders. Unknown/missing fields degrade gracefully instead of throwing.

const asRecord = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : undefined);
const asArray = (v) => (Array.isArray(v) ? v : []);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

export const shortType = (t) => String(t || '').replace(/^urn:(entity|tag):/, '').replace(/^.*:/, '') || undefined;

/** Gather human-readable names from an arbitrary explainability payload. */
export function collectNames(value, depth = 0, out = new Set()) {
  if (depth > 4 || value == null) return [...out];
  if (typeof value === 'string') return [...out];
  if (Array.isArray(value)) {
    for (const item of value) collectNames(item, depth + 1, out);
    return [...out];
  }
  const rec = asRecord(value);
  if (rec) {
    if (typeof rec.name === 'string' && rec.name.length < 60) out.add(rec.name);
    for (const v of Object.values(rec)) if (typeof v === 'object') collectNames(v, depth + 1, out);
  }
  return [...out];
}

function imageUrl(image) {
  if (!image) return undefined;
  if (typeof image === 'string') return image;
  return asRecord(image)?.url;
}

export function entity(raw) {
  const e = asRecord(raw);
  if (!e) return undefined;
  const props = asRecord(e.properties) || {};
  const geo = asRecord(props.geocode) || asRecord(e.location) || {};
  const q = asRecord(e.query);
  const name = e.name;
  const id = e.entity_id ?? e.id;
  if (!name || !id) return undefined;
  const explain = e.explainability ?? q?.explainability;
  const typeRaw = e.type ?? asArray(e.types)[0] ?? e.subtype;
  return {
    id: String(id),
    name: String(name),
    type: shortType(typeRaw),
    image: imageUrl(props.image) ?? imageUrl(e.image),
    description: props.short_description ?? props.description,
    address: typeof props.address === 'string' ? props.address : undefined,
    year: props.release_year,
    rating: num(props.business_rating),
    price: num(props.price_level),
    lat: num(geo.lat) ?? num(geo.latitude),
    lon: num(geo.lon) ?? num(geo.lng) ?? num(geo.longitude),
    affinity: num(e.affinity) ?? num(q?.affinity),
    popularity: num(e.popularity),
    why: collectNames(explain).slice(0, 4)
  };
}

export function entities(envelope) {
  const results = envelope?.results;
  const list = Array.isArray(results) ? results : asArray(asRecord(results)?.entities);
  return list.map(entity).filter(Boolean);
}

/** Search endpoint: results may be an array or { results: [...] } depending on version. */
export function searchResults(payload) {
  const list = Array.isArray(payload) ? payload : asArray(payload?.results ?? payload?.entities);
  return list.map(entity).filter(Boolean);
}

export function tags(envelope) {
  const results = envelope?.results;
  const list = Array.isArray(results) ? results : asArray(asRecord(results)?.tags);
  return list
    .map((t) => {
      const r = asRecord(t);
      if (!r?.name) return undefined;
      return {
        id: r.id ?? r.tag_id,
        name: String(r.name),
        type: shortType(r.type ?? r.subtype),
        affinity: num(r.affinity) ?? num(asRecord(r.query)?.affinity)
      };
    })
    .filter(Boolean);
}

// ---- heatmap ---------------------------------------------------------------
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
export function decodeGeohash(hash) {
  let even = true;
  const lat = [-90, 90];
  const lon = [-180, 180];
  for (const ch of String(hash).toLowerCase()) {
    const idx = BASE32.indexOf(ch);
    if (idx < 0) return undefined;
    for (let bit = 4; bit >= 0; bit -= 1) {
      const range = even ? lon : lat;
      const mid = (range[0] + range[1]) / 2;
      if ((idx >> bit) & 1) range[0] = mid;
      else range[1] = mid;
      even = !even;
    }
  }
  return { lat: (lat[0] + lat[1]) / 2, lon: (lon[0] + lon[1]) / 2 };
}

export function heatPoint(raw) {
  const p = asRecord(raw);
  if (!p) return undefined;
  const loc = asRecord(p.location) || p;
  let lat = num(loc.latitude) ?? num(loc.lat);
  let lon = num(loc.longitude) ?? num(loc.lng) ?? num(loc.lon);
  const geohash = loc.geohash ?? p.geohash;
  if ((lat === undefined || lon === undefined) && typeof geohash === 'string') {
    const d = decodeGeohash(geohash);
    if (d) ({ lat, lon } = d);
  }
  if (lat === undefined || lon === undefined) return undefined;
  const q = asRecord(p.query);
  return { lat, lon, affinity: num(q?.affinity) ?? num(p.affinity) ?? 0, key: String(geohash ?? `${lat.toFixed(3)},${lon.toFixed(3)}`) };
}

export function heatPoints(envelope) {
  const results = envelope?.results;
  const list = Array.isArray(results) ? results : asArray(asRecord(results)?.heatmap);
  return list.map(heatPoint).filter(Boolean);
}

/** Strength in 0.05..1 even if a source reports zero or negative affinities. */
function scaleStrength(items, field) {
  const vals = items.map((i) => i[field]);
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  return items.map((i) => ({
    ...i,
    strength: max <= min ? 1 : 0.05 + 0.95 * ((i[field] - min) / (max - min))
  }));
}

/** Merge several heatmaps (one per anchor): affinity is averaged per cell, cells hit by more anchors rank higher. */
export function mergeHeat(maps) {
  const cells = new Map();
  maps.forEach((points, i) => {
    for (const p of points) {
      const cell = cells.get(p.key) ?? { ...p, sum: 0, hits: 0, anchors: new Set() };
      cell.sum += p.affinity;
      cell.hits += 1;
      cell.anchors.add(i);
      cells.set(p.key, cell);
    }
  });
  const merged = [...cells.values()].map((c) => ({
    lat: c.lat,
    lon: c.lon,
    key: c.key,
    hits: c.hits,
    affinity: c.sum / c.hits,
    score: (c.sum / maps.length) * (1 + 0.5 * (c.hits - 1))
  }));
  merged.sort((a, b) => b.score - a.score);
  return scaleStrength(merged, 'score');
}

/** Greedy grid clustering of the strongest cells into "barrio" candidates. */
export function clusterBarrios(points, count = 3, cellDeg = 0.012) {
  const buckets = new Map();
  for (const p of points) {
    const k = `${Math.round(p.lat / cellDeg)}:${Math.round(p.lon / cellDeg)}`;
    const b = buckets.get(k) ?? { lat: 0, lon: 0, weight: 0, n: 0, hits: 0 };
    b.lat += p.lat * p.score;
    b.lon += p.lon * p.score;
    b.weight += p.score;
    b.n += 1;
    b.hits = Math.max(b.hits, p.hits);
    buckets.set(k, b);
  }
  const clusters = [...buckets.values()].map((b) => ({ lat: b.lat / b.weight, lon: b.lon / b.weight, weight: b.weight, cells: b.n, overlap: b.hits }));
  clusters.sort((a, b) => b.weight - a.weight);
  return scaleStrength(clusters.slice(0, count), 'weight');
}

/** compare_audiences: best-effort split into entities and tags. */
export function comparison(envelope) {
  const results = envelope?.results;
  const rec = asRecord(results);
  return {
    entities: Array.isArray(results) ? results.map(entity).filter(Boolean) : asArray(rec?.entities).map(entity).filter(Boolean),
    tags: asArray(rec?.tags).map((t) => ({ name: t?.name, affinity: num(t?.query?.affinity) ?? num(t?.affinity) })).filter((t) => t.name)
  };
}
