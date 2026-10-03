// Development-only stand-in for the Qloo harness so the UI and tests can run
// without a credential. Disabled whenever NODE_ENV=production.
// It never ships fake data to real users: server.js refuses to start in
// production with QLOO_MOCK=1.

const NAMES = {
  place: [
    'Café Neruda', 'La Peña del Sur', 'Mercado Central Bar', 'Rooftop 1881', 'El Vinilo',
    'Taller de Barrio', 'Casa Piedra', 'Fuente Alemana', 'Bar Nacional', 'Cine Arte Alameda',
    'Ramen Hikari', 'Tostaduría Sur', 'Galería Margen', 'Pasaje Jazz Club', 'Panadería Ñuñoa'
  ],
  artist: ['Nicola Cruz', 'Fito Páez', 'Natalia Lafourcade', 'Mon Laferte', 'Zoé', 'Café Tacvba', 'Gepe', 'Ana Tijoux'],
  movie: ['Roma', 'Una Mujer Fantástica', 'Cien años de perdón', 'Amores perros', 'Pan\'s Labyrinth', 'El Club'],
  tv_show: ['Narcos', 'La Casa de Papel', 'Merlí', 'Club de Cuervos', 'Los Archivos del Cardenal'],
  book: ['Los detectives salvajes', 'La casa de los espíritus', '2666', 'Rayuela', 'Pedro Páramo'],
  podcast: ['Radio Ambulante', 'Palabras más, palabras menos', 'Aire Libre', 'Intersecciones'],
  brand: ['Patagonia', 'Aesop', 'Havaianas', 'Nike', 'Muji'],
  videogame: ['Hades', 'Celeste', 'Disco Elysium'],
  person: ['Gael García Bernal', 'Pedro Pascal', 'Isabel Allende']
};

const TAGS = [
  'Indie folk', 'Live music', 'Third-wave coffee', 'Magical realism', 'Street food', 'Late-night',
  'Vinyl culture', 'Art house', 'Natural wine', 'Neighborhood bar', 'Cumbia electrónica', 'Mezcal'
];

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rng(seed) {
  let s = hash(seed) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return (s % 10000) / 10000;
  };
}
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const id = (name, type) => `mock-${type}-${slug(name)}`;

function entity(name, type, r, withAffinity = true) {
  return {
    entity_id: id(name, type),
    name,
    type: `urn:entity:${type}`,
    popularity: Number((r() * 0.4 + 0.5).toFixed(3)),
    ...(withAffinity ? { affinity: Number((r() * 0.35 + 0.6).toFixed(3)) } : {}),
    properties: {
      description: `${name} — a ${type.replace('_', ' ')} sample entry used only in development.`,
      ...(type === 'place' ? { address: 'Sample Street 123', geocode: { lat: -33.43 + r() * 0.06, lon: -70.65 + r() * 0.06 }, business_rating: Number((3.8 + r()).toFixed(1)) } : {})
    },
    explainability: [{ type: 'tag', name: TAGS[Math.floor(r() * TAGS.length)] }]
  };
}

const typeOf = (urnOrAlias) => String(urnOrAlias || 'place').replace('urn:entity:', '');

export async function mockSearch(query, type, take) {
  const r = rng(`s:${query}:${type}`);
  const types = type ? [typeOf(type)] : Object.keys(NAMES);
  const out = [];
  for (const t of types) {
    for (const n of NAMES[t] || []) {
      if (n.toLowerCase().includes(query.toLowerCase().slice(0, 3))) out.push(entity(n, t, r, false));
    }
  }
  if (out.length === 0) {
    for (const t of types.slice(0, 3)) out.push(entity(`${query} (${t})`, t, r, false));
  }
  return { success: true, results: out.slice(0, take) };
}

export async function mockExec(op, input) {
  const r = rng(`${op}:${JSON.stringify(input)}`);
  const limit = input.limit || 10;
  const pick = (type, n) => {
    const pool = [...(NAMES[type] || NAMES.place)];
    const out = [];
    while (out.length < Math.min(n, pool.length)) {
      out.push(entity(pool.splice(Math.floor(r() * pool.length), 1)[0], type, r));
    }
    return out.sort((a, b) => b.affinity - a.affinity);
  };
  await new Promise((res) => setTimeout(res, 120 + r() * 220));
  switch (op) {
    case 'recommend':
    case 'rank': {
      const t = typeOf(input.target_type || input.option_type);
      const results = pick(t, limit);
      return { status: 'ok', operation: op, interpretation: { target_type: `urn:entity:${t}` }, results, result_count: results.length };
    }
    case 'entity_tags':
      return {
        status: 'ok',
        results: TAGS.slice(0, limit).map((name, i) => ({ id: `urn:tag:mock:${slug(name)}`, name, type: 'urn:tag:genre', affinity: Number((0.95 - i * 0.05).toFixed(2)) })),
        result_count: Math.min(limit, TAGS.length)
      };
    case 'where_popular': {
      const base = { lat: -33.4372 + (hash(input.within || '') % 100) / 5000, lon: -70.6506 + (hash(input.entity || '') % 100) / 5000 };
      const points = Array.from({ length: limit }, (_, i) => ({
        location: { geohash: `mock${i}`, latitude: base.lat + (r() - 0.5) * 0.08, longitude: base.lon + (r() - 0.5) * 0.08 },
        query: { affinity: Number((0.98 - i * 0.07 + r() * 0.03).toFixed(3)) }
      }));
      return { status: 'ok', results: points, result_count: points.length };
    }
    case 'compare_audiences': {
      const results = pick('place', limit);
      return { status: 'ok', results: { entities: results, tags: TAGS.slice(0, 6).map((name) => ({ name, query: { affinity: Number(r().toFixed(2)) } })) } };
    }
    case 'audience_demographics':
      return { status: 'ok', results: [{ type: 'age', data: { '25-34': 0.46, '35-44': 0.28, '18-24': 0.16 } }, { type: 'gender', data: { female: 0.52, male: 0.48 } }] };
    case 'find_tags':
      return { status: 'ok', results: TAGS.slice(0, limit).map((name) => ({ id: `urn:tag:mock:${slug(name)}`, name })) };
    default:
      return { status: 'ok', results: [] };
  }
}
