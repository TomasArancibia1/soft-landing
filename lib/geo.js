// Reverse geocoding for neighborhood names (OpenStreetMap Nominatim).
// Usage policy: <= 1 request/second, identifying User-Agent, cache results.

const cache = new Map();
let chain = Promise.resolve();
let lastAt = 0;

const UA = process.env.GEO_USER_AGENT || 'SoftLanding-hackathon-demo/1.0 (https://github.com/)';

export function reverseName(lat, lon) {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  if (cache.has(key)) return Promise.resolve(cache.get(key));
  const job = chain.then(async () => {
    if (cache.has(key)) return cache.get(key);
    const wait = Math.max(0, 1100 - (Date.now() - lastAt));
    if (wait) await new Promise((r) => setTimeout(r, wait));
    lastAt = Date.now();
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&accept-language=en&lat=${lat}&lon=${lon}`;
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000) });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      const a = data.address || {};
      const name = a.neighbourhood || a.suburb || a.quarter || a.city_district || a.village || a.town || a.city || data.name || null;
      cache.set(key, name);
      return name;
    } catch {
      cache.set(key, null);
      return null;
    }
  });
  chain = job.catch(() => {});
  return job;
}
