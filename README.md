# Music of the Cosmos

An interactive sky map where every object plays its own music. Pick a planet, a pulsar, a
variable star or a black hole, pick a genre, and an endless track is generated in the
browser from the object's real scientific data. Spin sets the tempo, heat sets the timbre
and distance sets the echo.

- Real catalog data: SIMBAD, Gaia DR3, ATNF, AAVSO VSX, JPL Horizons, Wikidata
- Three genres: Ambient, Lo-fi and Ambient metal, all generated live with Tone.js
- A WebGL sky (three.js / react-three-fiber) with procedural close-ups of every object
- 10 languages, server-rendered object pages with full SEO metadata

## Quick start (development)

Requirements: Node.js 22+ and PostgreSQL 14+.

```bash
cp .env.example .env.local      # DATABASE_URL, NEXT_PUBLIC_SITE_URL, CATALOG_CONTACT
npm install
npm run db:migrate              # enables pg_trgm, creates the objects table
npm run db:seed                 # 40 seed objects through the same adapters the API uses
npm run dev
```

| Script | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js dev server / production build / production server |
| `npm test` | Vitest: catalog adapters, normalizer, music mapping, composer, DB-first service. Needs a `skysound_test` database (or `TEST_DATABASE_URL`) |
| `npm run test:e2e` | Playwright smoke tests. Runs `build && start` if no server is up. Uses the GPU (Metal) on macOS; software GL is very slow |
| `npm run lint` / `typecheck` | ESLint / TypeScript |
| `npm run db:seed` | Seed from the live catalogs. Flags: `--if-empty`, `--fallback-fixtures` (use saved responses when a catalog fails), `--fixtures` (offline) |
| `npm run db:rebuild` | Recompute `params` from the stored raw responses, without calling the catalogs |
| `npm run fixtures` | Re-capture `tests/fixtures/*.json` from the live catalogs |

## Deployment

### Docker Compose (app + Postgres)

```bash
cp .env.example .env            # set SITE_URL, POSTGRES_PASSWORD, CATALOG_CONTACT
docker compose up -d --build
docker compose logs -f app      # first start: migrate → seed → build (a couple of minutes)
```

The app listens on `APP_PORT` (default 3000). Put a reverse proxy with TLS in front of it
(Caddy, nginx, Traefik). `GET /api/health` reports the app and database status, and the
image's `HEALTHCHECK` uses it.

**Why the build runs on first start.** Pages are prerendered from the database (Next.js
Cache Components), so `next build` needs a live database, and it also inlines
`NEXT_PUBLIC_SITE_URL`. The image therefore holds the source and dependencies, and
`docker/entrypoint.sh` runs four steps:

1. Apply the migrations.
2. Seed, but only if the database is empty. It tries the live catalogs first and falls back
   to the saved responses for any object that fails.
3. Build once per container.
4. Start.

Restarts reuse the build. After changing `SITE_URL`, recreate the container with
`docker compose up -d --force-recreate app`.

### Any Node host

Any host with Node 22+ and Postgres works:

1. Set `DATABASE_URL`, `NEXT_PUBLIC_SITE_URL` and `CATALOG_CONTACT`.
2. Run `npm ci && npm run db:migrate && npm run db:seed -- --if-empty --fallback-fixtures`.
3. Run `npm run build && npm start`.

On serverless platforms, use a pooled connection string (Neon, Supabase). The client is
configured with `prepare: false` for that reason.

### Environment

| Variable | Used for |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `NEXT_PUBLIC_SITE_URL` (`SITE_URL` in compose) | Canonical URLs, `hreflang`, sitemap, robots, Open Graph |
| `CATALOG_CONTACT` | Contact sent in the User-Agent to SIMBAD/Wikidata (their usage policies ask for one) |

### SEO

- Server-rendered pages for every object in every language.
- `hreflang` alternates including `x-default`, and canonical URLs.
- `sitemap.xml` and `robots.txt` (`/api/` is disallowed).
- Per-page titles and descriptions.
- Open Graph and Twitter cards with a 1200×630 image.
- JSON-LD: `WebApplication` for the site and `Thing` for each object, with `sameAs` links to
  the catalog pages.
- A web app manifest and icons (SVG, ICO, Apple touch, maskable).

## How it works

```
app/[lang]/              pages: /, /object/[slug] (English unprefixed, other languages under /<lang>)
app/api, sitemap, robots API routes (objects, search, health) and site metadata
proxy.ts                 language routing
components/audio         AudioProvider: the engine lives outside React, so music survives navigation
components/scene         three.js sky: starfield, objects at RA/Dec, camera flights, close-ups
components/sky           SkyProvider: object list, selection = URL, prev/next, auto-switch
components/ui            panels: home, object card, player bar, settings, About sheet
lib/sources              catalog adapters + normalize.ts (Zod schema for SpaceObject)
lib/db, lib/objects      Drizzle schema and repository; the DB-first service; cached page queries
lib/audio                mapping (data → music), composer (pure, deterministic bars), genres, engine (Tone.js)
lib/i18n, lib/seed       UI dictionaries and description templates; curated seed objects and texts
scripts/                 seed, rebuild, capture-fixtures
docker/                  container entrypoint
```

**Catalogs.**
- SIMBAD (Sesame + TAP) gives coordinates, Teff, parallax and cross-identifiers.
- With those identifiers the app queries Gaia DR3 (Teff, luminosity), ATNF (pulsar period,
  distance) and VSX (variability type and period).
- Solar System bodies come from JPL Horizons.
- Every request has a timeout, retries with backoff, and a per-catalog rate limit.

**Search in any language.** The catalogs only understand Latin designations, so other scripts
go through Wikidata. For example, «Бетельгейзе» → Q12124 → SIMBAD `* alf Ori`. Planets and
moons are matched to Horizons by their English name, and comets by SPK-ID. Results are cached
for 10 minutes, and `Retry-After` is respected.

**DB-first.** `GET /api/objects/[slug]` returns a ready row at once. Otherwise:
- A `fetching` row is inserted. The unique slug acts as a lock, so exactly one request queries
  the catalogs; others await its promise (same process) or poll the status (other instances).
- An error marks the row `failed`, with a retry cooldown; "not found" is cached longer.
- A stuck `fetching` row is reclaimed after 90 s.
- If an object already exists under another slug (same `canonical_key`), the new slug becomes
  an alias.

**Languages.**
- en, zh, hi, es, fr, ar, bn, pt, ru, ur. Arabic and Urdu are right-to-left, and the layout
  uses logical start/end properties.
- English is unprefixed; `/en/…` redirects to the canonical URL.
- UI strings live in `lib/i18n/dict/<lang>.ts`. Curated names and descriptions live in
  `lib/seed/texts/<lang>.ts`, and a test checks they are complete for every language.
- Other objects get descriptions generated from their parameters.

**Mapping.**
- A period (pulsar spin, stellar pulsation, planetary orbit) is folded by powers of two into
  the genre's tempo range.
- Period ratios choose the tonic interval and the chord progression.
- Temperature sets the scale, filter brightness and timbre.
- The light curve drives volume, cutoff and reverb beat by beat.
- Distance sets reverb length and amount, and the delay.
- Every note is diatonic (tested), and the master bus has a compressor and a −1.5 dBFS limiter.

**Genres.**
- **Ambient**: drones, glassy lead, shimmer.
- **Lo-fi**: keys, swung boom-bap, vinyl crackle.
- **Ambient metal**: a dark choir, a tolling bell and cold wind. Each 8-bar phrase the guitar
  changes character:
  - clean chorused arpeggios;
  - a high shimmer;
  - an open crunchy chord;
  - a swelled high-gain wall;
  - silence.

  Gain, attack and reverb change with it. Drums appear only under the heavier phrases.

**Player and settings.**
- Previous/next: previous goes back through the history; next follows the auto-switch order.
- Space plays and pauses.
- **View settings:**
  - zoom into the selected object (off by default: the camera only turns to it);
  - show the playing object's card on the home page (on by default).
- **Sound settings:** crossfade length; auto-switch every N minutes, in random order, list
  order or same-type order.
- **Mix (per genre):** tempo (±25%), notes (×0.25 sparse … ×2.5 busy), register (low ↔ high
  notes), reverb, guitar gain (Ambient metal), and a level and mute for each layer. Changes
  apply live, from the next bar. The neutral mix reproduces the preset exactly; the composer
  reads the mix (`lib/audio/mix.ts`) as a pure input, so it is unit-tested like the rest.
- All settings are kept in localStorage.

**Close-ups.**
- The selected object is always rendered at its true angular size. In the wide view it is a
  few pixels, and with zoom on the camera eases into a 10× telescope view.
- HDR rendering with bloom and ACES tone mapping. Everything is procedural, with no images.
- **Stars:** granulation, spots, chromosphere, prominences and corona.
- **Planets:** banded atmospheres with zonal winds, cratered relief, ring shadows.
- **Black holes:** a Schwarzschild ray tracer, with lensing, Doppler beaming and gravitational
  redshift.
- **Smoothness:** all shaders are precompiled at idle, and the render resolution is fixed.

## Deviations from the original spec

- **The AAVSO API is behind a Cloudflare challenge**, so VSX is read from its VizieR mirror
  (`B/vsx/vsx`). Observed light curves are not connected; the curve is modelled from the
  variability type and the VSX period, and marked `kind: "model"`.
- The default crossfade is 3 s (the spec said 4–8 s), as requested; it can be set from 0.5 to 10 s.
- ISR is implemented with Cache Components: `'use cache'` + `cacheTag` for DB queries and
  `generateStaticParams` for the seed pages. Fetching a new object invalidates the tags.
- Stage 2 (accounts, export, cron) is not built.
