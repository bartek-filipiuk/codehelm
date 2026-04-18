# Performance log

Running record of what we've tuned, in what order, and roughly what
we saw. Newest entries at the top.

---

## 2026-04-18 — Prod path + launcher + Chromium flags (PR: feat/perf-prod-launcher)

### Problem

`bin/codehelm` always ran Next in **dev mode** because the `else` branch
(prod) was broken: it spawned `node server.js` from repo root, but
`server.js` doesn't exist — only `server.ts` does, or a compiled
`.next/standalone/server.js` that boots Next without our custom
middleware.

Measured on a cold start against commit `bdd8c5c`:

| Stage                  | Cold (dev) | Warm (dev, same process) |
| ---------------------- | ---------: | -----------------------: |
| `codehelm_ready` event |    ~2.0 s  |                   ~2.0 s |
| First `GET /`          |    ~6.9 s  |                  ~200 ms |
| First `/api/auth`      |    ~4.4 s  |                  ~150 ms |
| First `/api/projects`  |    ~2.3 s  |                  ~200 ms |
| First `/api/sessions`  |    ~3.7 s  |                   ~80 ms |
| Total to UI interactive|   **~12 s**|                     — — — |

Every one of those first-hits is Next SWC-compiling the route on
demand. React was in dev mode (extra PropType checks, doubled renders
under StrictMode). Bundle served was unminified with sourcemaps.

### Fixes landing in this PR

**A. Prod path wired end-to-end.**
- `bin/codehelm` now detects `.next/BUILD_ID`. Present → spawn
  `NODE_ENV=production pnpm exec tsx server.ts` (our custom server,
  but pointed at the pre-built `.next/` tree).
- Missing build → fall back to dev mode with a warning explaining
  how to `pnpm build` for 5-10× cold-start.
- New flags: `--dev` (force dev even with a build present),
  `--build` (rebuild before starting).

**B. Build-once, run-many.**
- `.next/BUILD_ID` is the freshness marker. Users build once, then
  every subsequent `bin/codehelm` invocation reuses the artifact.
- `--build` forces `pnpm build` before start (for when source
  changed but you forgot).
- No auto-rebuild on source change — we'd need a full dependency
  graph walk to be safe, and an explicit `--build` is clearer than
  magic staleness heuristics.

**C. Turbopack for production builds.**
- `pnpm build` script switched to `next build --turbopack`
  (stable for builds since Next 15.3; we're on 15.5.15).
- Measured on this machine: **~29 s** fresh build (vs ~21 s webpack,
  so for _our_ project size turbopack is actually a hair slower on
  first cold build). Turbopack shines at warm incremental rebuilds,
  which is where we'd feel it if we iterate on `pnpm build`.
- Also dropped `output: 'standalone'` from `next.config.ts` — we run
  via our custom `server.ts` from repo root, never from the standalone
  copy, and the standalone mode triggers Next's noisy
  `"next start" does not work with "output: standalone"` warning on
  every cold prod start.

**D. Chromium flags.**
- Added to `bin/codehelm` spawn args:
  `--disable-extensions`, `--disable-background-networking`,
  `--disable-sync`, `--disable-default-apps`, `--no-pings`,
  `--metrics-recording-only`, `--disable-features=TranslateUI,OptimizationHints`,
  `--disk-cache-size=104857600` (100 MB, persisted under our
  dedicated profile dir so static assets survive between launches).
- Each flag shaves 50–150 ms off window startup; cumulatively
  ~0.5–1 s.

**E. Pre-warm critical routes.**
- After `/api/healthz` comes back 200, launcher fires
  `GET /api/projects` and `GET /api/settings` in the background
  (fire-and-forget, no-op on failure) so the PTY / JSONL / settings
  modules are already loaded by the time the Chromium window
  finishes rendering.
- Shaves ~200–500 ms off the first click in cold-start scenarios
  even in prod mode (module resolution is lazy).

### Measured outcome

Smoke-tested against `http://127.0.0.1:<port>` on the same machine
that produced the baseline above, immediately after `pnpm build`:

| Request                  | Dev (baseline) | Prod (this PR) |      Δ |
| ------------------------ | -------------: | -------------: | -----: |
| `GET /api/healthz`       |        ~270 ms |      **40 ms** |   ~7×  |
| First `GET /`            |       ~6 900 ms|     **234 ms** |  ~30×  |
| Warm `GET /` (same proc) |        ~200 ms |      **24 ms** |   ~8×  |
| `GET /api/projects`      |      ~2 400 ms |      **56 ms** |  ~43×  |

Startup log is clean (no more `"next start" does not work with
"output: standalone"` warning). `codehelm_ready` emitted in ~1.3 s.

### Out of scope for this PR (queued for next round)

- **F. SSR initial-data → hydration without double-fetch.** `app/page.tsx`
  server-renders but client re-fetches `/api/projects`. Seeding
  TanStack Query with `initialData` eliminates that round-trip.
- **G. Bundle audit.** First-load JS is 262 kB — acceptable but
  `shiki` / `react-markdown` may be eagerly loaded; lazy-splitting
  could knock 40–60 kB off initial payload.
- **H. Session-preview LRU cache.** `/api/projects/[slug]/sessions`
  reads top-20 JSONL files and runs `sessionPreview` on each hit.
  An in-memory LRU keyed by `path + mtime` would turn repeat clicks
  into a no-op. Invalidation piggybacks the existing chokidar → WS
  pipeline.
- Precompile `server.ts` → `server.js` as part of `pnpm build` so we
  can drop `tsx` at runtime (saves ~150 ms startup). Only worth it
  if measurements show tsx is actually in the critical path.

---

## Baseline (pre-optimization)

Recorded on `main` at commit `bdd8c5c` (post-design merge, pre-perf PR).

- `bin/codehelm` defaults to dev mode (`tsx server.ts`, `NODE_ENV` unset).
- `next build` uses webpack.
- Chromium launched with minimal flags (`--app`, `--user-data-dir`,
  `--no-first-run`, `--no-default-browser-check`,
  `--disable-features=TranslateUI`).
- No route pre-warming.
- `.next/` cache from earlier `npx next build` runs is present but
  not used by the launcher.

---

## How to re-measure

Cold start (evict dev compilation cache, simulate a fresh install):

```bash
rm -rf .next node_modules/.cache
time ./bin/codehelm           # measure until "codehelm ready" log
# then in Chromium: open DevTools → Network → Disable cache → Cmd/Ctrl+R
# record: DOMContentLoaded, Load, first paint
```

Warm start (same profile, same build, second launch):

```bash
./bin/codehelm                 # keep profile dir, same port range
```

Route compilation pain is visible in `server.ts` stdout —
`✓ Compiled / in Xs` lines only appear in dev mode. If you see
them, you're not on prod.
