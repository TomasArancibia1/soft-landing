# Soft Landing

**Move cities. Keep your taste.**

Soft Landing is an agent that translates what a person loves — a band, a café, a film, a brand, a book — into the barrio, places, culture and people of a city they have never lived in. It has no catalog of its own: every suggestion comes from [Qloo](https://qloo.com)'s Taste AI, and the page shows exactly which Qloo calls the agent made and why.

Live demo: **https://soft-landing-0fja.onrender.com** (free hosting — the first visit can take up to a minute to wake the server)

Built for the **Qloo Agentic Hackathon**. MIT licensed.

## Why this matters

About 304 million people live outside the country they were born in ([UN DESA, mid-2024](https://www.destatis.de/EN/Themes/Countries-Regions/International-Statistics/Data-Topic/Population-Labour-Social-Issues/DemographyMigration/Migrants.html)), and far more move between cities inside a country every year. The first weeks are the hardest: you know nothing about the new place, and generic "top 10 in Berlin" lists are written for nobody in particular. Qloo knows what *people like you* love in that city. Soft Landing turns that into a plan you can act on on day one.

## What it does

- **Taste DNA** — the concepts that tie your favorites together (Qloo `entity_tags`). Tags that describe who a person is (ethnicity, religion, nationality, gender, age...) are filtered out: Soft Landing translates what you like, it does not infer who you are.
- **Your barrio** — a heatmap of where in the city people who love your favorites concentrate, merged across your anchors and clustered into named neighborhoods (Qloo `where_popular`).
- **Places** — restaurants, bars and venues that match you, found in two passes: from your favorites *and* from your concepts, so you also see places your favorites don't point to directly (Qloo `recommend`).
- **Local culture** — what people in your new city who share your taste listen to, watch and read (Qloo `recommend` with `signal_location`).
- **Meet someone** — add a host's or a new friend's favorites to see where your tastes overlap and a place you would both enjoy (Qloo `compare_audiences` + `recommend`).
- **30-day plan** — four weeks of gentle suggestions built only from Qloo results, each line saying why it was picked. Export to your calendar (.ics) or print to PDF.
- **Landing brief** — a short note at the top summarizing the result.
- English and Spanish, light and dark mode, keyboard accessible, shareable link.

## How the agent works

The agent is a loop, not a fixed pipeline. At every step it looks at what Qloo returned and decides what to do next:

```
observe → decide → act (Qloo workflow) → observe → … → self-check → brief
```

1. **Read your taste** (`entity_tags`) — find the concepts behind your favorites.
2. **Find places** and **map your barrio** in parallel.
3. **Adapt.** If most places are landmarks or memorials, the agent runs an everyday-spots pass (cafés, bars, restaurants, bookstores). If few places matched your favorites, the agent widens the search with your concepts; if it found plenty, it runs the concept pass anyway to diversify. If the heatmap is sparse it pulls in more of your favorites.
4. **Choose what to explore** — it asks the city about the kinds of culture you actually love (music always; film, series, books, podcasts or brands depending on your favorites).
5. **Name the barrios**, **self-check** coverage, and write the brief.

The UI streams every decision, its reason and what came back (“Agent decisions”), and the “How it works” section lists every Qloo call with its inputs and timing.

Two interchangeable planners make the decisions:

- a **built-in policy** that needs no model, so the app is fully functional for free; and
- an **optional language-model planner** (any OpenAI-compatible endpoint, set with `LLM_API_KEY`) that chooses tools with function calling and also writes the landing brief — constrained to the names and concepts Qloo returned.

Either way, **guardrails** run on the server: tool names and arguments are validated against a whitelist and the person's own anchors, a failed step is never retried in a loop, the core lanes are completed if the planner skips them, and a model outage falls back to the policy mid-run.

## How Qloo is used

All data comes from Qloo's canonical workflows, executed through the official [`@qloo/qloo-harness`](https://www.npmjs.com/package/@qloo/qloo-harness) package in-process — the authorized surface for hackathon keys.

| Feature | Workflow |
| --- | --- |
| Autocomplete for favorites | harness `search` |
| Taste DNA | `entity_tags` |
| Barrio heatmap | `where_popular` (one per anchor, merged) |
| Places, pass 1 | `recommend` (target `place`, signals = your favorites, `filter_location` = city) |
| Places, pass 2 | `recommend` (signals = your top concept tags) |
| Places, everyday spots | `find_tags` (café, bar, restaurant, bookstore) + `recommend` with `include_tags`, run when most matches are landmarks |
| Local culture | `recommend` (target = artist / movie / tv_show / book / podcast / brand, `signal_location` = city) |
| Meet someone | `compare_audiences` + `recommend` |

The Qloo credential lives only in the server environment (`QLOO_API_KEY`); it is never sent to the browser, logged, or written to the repository. No Qloo data is stored in this repository; the server keeps a short-lived private cache and a daily call budget to respect the shared quota.

## Run it

Requires Node 22.19+.

```bash
npm install
QLOO_API_KEY=your-key npm start        # http://localhost:8787
npm run dev:mock                         # offline development data (never allowed in production)
npm test                                 # runs against the mock; no credential needed
```

Environment variables:

| Variable | Purpose | Default |
| --- | --- | --- |
| `QLOO_API_KEY` | Qloo credential (server only) | — |
| `QLOO_BASE_URL` | Qloo API host | `https://hackathon.api.qloo.com` |
| `LLM_API_KEY` | Optional model for the planner and brief | unset → built-in policy |
| `LLM_BASE_URL`, `LLM_MODEL` | OpenAI-compatible endpoint and model | Gemini endpoint, `gemini-2.5-flash` |
| `QLOO_DAILY_BUDGET` | Qloo calls per day | 1500 |
| `QLOO_CACHE_TTL_MS` | Private cache lifetime | 6 hours |
| `RATE_LIMIT_PER_MIN` | Requests per IP per minute | 40 |
| `WARM_PERSONAS` | Pre-compute the example personas after boot (`0` disables) | on |

The repo includes a `render.yaml` for a free Render web service. Zero runtime dependencies besides the Qloo harness: the server is a small Node `http` app and the front end is plain ES modules.

## Project layout

```
server.js            HTTP server, validation, NDJSON streaming endpoint (/api/agent), security headers
lib/agent-loop.js    the agent: tools, policy planner, LLM planner, guardrails, self-check
lib/agent.js         Qloo lanes (taste, places, heat, culture, match)
lib/qloo.js          access layer: harness in-process, cache, budget, retries, error classification
lib/normalize.js     defensive normalizers (entities, tags, heatmaps)
lib/llm.js           optional OpenAI-compatible client
lib/warm.js          pre-computes the example personas after boot
public/              front end (app.js, plan.js, styles.css, index.html)
test/                node:test suites (API, agent loop, fake LLM, plan, .ics)
```

## What was built during the submission period

Soft Landing started on 3 October 2026, after the hackathon opened, and everything in this repository was written during the submission period: the Qloo access layer and harness integration, the agent loop with its two planners and guardrails, the streaming UI, the barrio heatmap, the plan and calendar export, and the tests.

## License

[MIT](LICENSE)
