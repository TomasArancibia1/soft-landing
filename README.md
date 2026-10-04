# Soft Landing

**Move cities. Keep your taste.**

Soft Landing is an agent that translates what a person loves at home into a new city. Give it a handful of favorites — a band, a café, a film, a brand, a book — and a destination, and it uses [Qloo](https://qloo.com)'s cultural-intelligence graph to return:

- **Taste DNA** — the concepts that run through everything you love.
- **Your barrio** — a map of where, in the new city, people who love what you love concentrate (taste heatmaps, merged across your favorites).
- **Places that feel like you** — restaurants, bars and venues, each with the reason it was picked.
- **Local culture** — artists, film, series, books, podcasts and brands people in that city with your taste are into.
- **Meet someone** — add a host's, colleague's or date's favorites; the agent compares both tastes and finds a place you'd both enjoy.
- **A 30-day plan** — four gentle weeks built *only* from Qloo results, every line showing why it was chosen.
- **A visible trace** — every Qloo call the agent made, so nothing on the page is invented.

And the details that make it usable:

- Persona starters, so anyone can try it in one click.
- A live "agent at work" strip that shows each step finishing, with the total number of Qloo calls and time.
- Tap a taste concept to filter the places Qloo explained with it; every place opens in maps.
- Export the 30-day plan to your calendar (`.ics`) or print it as a PDF.
- English / Spanish, dark mode, keyboard and screen-reader friendly, reduced-motion aware, works on phones.
- If the map library can't load, the barrio view falls back to an inline plot instead of going blank.
- A wake-up notice for the first visit on free hosting, plus a `keepalive` GitHub Action that keeps the demo warm.

Why it matters: more than 280 million people live outside their country of birth, and every year millions more change cities for study or work. The first weeks are lonely largely because the things that made a place feel like home — a particular kind of café, a scene, a neighborhood — are invisible in a new city. Taste is the shortest path to belonging, and Qloo is the only graph that can translate it across places and categories.

## How Qloo powers it

Qloo is the differentiator — the app has no catalog of its own. Everything comes from these Qloo workflows:

| Feature | Qloo workflow |
| --- | --- |
| Taste-passport autocomplete | entity search |
| Taste DNA | `entity_tags` (taste-analysis `urn:tag`) |
| Places | `recommend` — place entities, signals = your favorites, `filter.location` = destination, explainability on |
| Your barrio | `where_popular` (`urn:heatmap`) per favorite, merged and clustered locally |
| Local culture | `recommend` — artist / film / series / book / podcast / brand with `signal.location` = destination |
| Meet someone | `compare_audiences` (`/v2/analysis/compare`) + `recommend` with both tastes as signals |

All calls go through the public [`@qloo/qloo-harness`](https://www.npmjs.com/package/@qloo/qloo-harness) package (`qloo exec` and `qloo search`) — the authorized surface from the hackathon kit. The server adds a short cache, bounded concurrency and retries, a daily call budget and per-IP rate limiting so the shared quota is respected.

## Architecture

```
browser (static UI, no secrets)
   │  JSON
   ▼
server.js  ── validation, rate limit, security headers
   │
lib/agent.js   lanes: dna · places · barrio · culture · match
   │
lib/qloo.js    cache · budget · concurrency · retries · trace
   │  child process, credential only in server env
   ▼
@qloo/qloo-harness  →  Qloo API
```

The Qloo credential lives only in the server environment (`QLOO_API_KEY`). It is never sent to the browser, never logged and never committed. Zero runtime dependencies besides the harness (plain Node `http`).

## Run it

Requires Node 22.19+ and an event-issued Qloo credential.

```sh
npm install
export QLOO_API_KEY=...        # event-issued key; never commit it
npm start                      # http://localhost:8787
```

Development without a credential uses clearly labeled sample data and is disabled in production:

```sh
npm run dev:mock
npm test
```

### Deploy (Render)

`render.yaml` is included. Create a Web Service from the repository, set `QLOO_API_KEY` as a secret environment variable, and deploy. Event keys work only against the hackathon API, which is the default (`QLOO_BASE_URL=https://hackathon.api.qloo.com`). Optional variables: `QLOO_DAILY_BUDGET` (default 1500 calls/day), `RATE_LIMIT_PER_MIN` (default 40 per IP), `QLOO_MAX_CONCURRENT` (default 3).

## Responsible use

- The credential is individual and event-issued; this project does not share it or ship it in the repository.
- Cached results are kept in memory for 15 minutes; nothing is stored about users.
- The app makes the smallest request that answers each question and does not bulk-scrape Qloo.
- Neighborhood names come from OpenStreetMap Nominatim, cached and rate-limited per its usage policy.

## License

MIT — see [LICENSE](LICENSE).
