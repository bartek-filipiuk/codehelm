# Architektura `claude-ui`

## Wysoki poziom

```
┌────────────────────────────────────────────────────────┐
│  bin/claude-ui  (launcher)                             │
│  1. find ephemeral port (49152-65535)                  │
│  2. gen 32B token (crypto.randomBytes)                 │
│  3. spawn `tsx server.ts` z PORT + TOKEN w env         │
│  4. poll /healthz (auth-exempt) aż ready               │
│  5. mkdir -m 0700 $XDG_RUNTIME_DIR/claude-ui/<uuid>    │
│  6. spawn chromium --app=http://127.0.0.1:PORT/?k=TOK  │
│       --user-data-dir=<profile>                        │
│  7. SIGTERM/SIGINT trap → kill children + rm profile   │
└───────────┬────────────────────────────────────────────┘
            │
            ▼
┌────────────────────────────────────────────────────────┐
│  server.ts  (Node HTTP + custom upgrade)               │
│                                                         │
│  HTTP path:                                             │
│    req → middleware (Host check, auth cookie, CSRF)     │
│        → app.getRequestHandler() (Next App Router)      │
│                                                         │
│  WS upgrade path:                                       │
│    req.url.startsWith('/_next/webpack-hmr')             │
│      → Next HMR ws.Server                               │
│    req.url === '/api/ws/pty'                            │
│      → lib/ws/pty-channel (Origin check, cookie auth)   │
│    req.url === '/api/ws/watch'                          │
│      → lib/ws/watch-channel                             │
└───────────┬────────────────────────────────────────────┘
            │
    ┌───────┴────────┬───────────────┬──────────────┐
    ▼                ▼               ▼              ▼
 REST API       WebSocket         fs watcher    PTY manager
 (App Router)   (ws lib)          (chokidar)    (node-pty)
    │                │               │              │
    └──── lib/ ──────┴───────────────┴──────────────┘
         (security, jsonl, pty, watcher, ws, server)
```

## Warstwy

### Frontend (Next.js 15 App Router + React 19)

- `app/layout.tsx` — CSP nonce (z headers()), Providers (TanStack Query + Zustand), globalne shadcn theme
- `app/page.tsx` — główny shell (sidebar + main, resizable panels)
- `app/(ui)/*` — komponenty UI per moduł
- Dane z REST przez TanStack Query, stan lokalny w Zustand slices
- Streaming JSONL: `fetch` z `ReadableStream` + progressive parse w hooku
- Virtualizacja: react-virtuoso dla listy wiadomości i dla długich list sesji

### Backend (custom server.ts + Next handler)

- Node 20 LTS, TypeScript strict, `tsx` w dev, standalone build w prod
- Jedna instancja `http.Server` obsługuje Next HTTP + WS upgrade
- Middleware stack (przed Next handlerem):
  1. Host allowlist (`127.0.0.1:PORT` lub `localhost:PORT` z redirectem)
  2. Auth cookie check (poza `/api/auth`, `/healthz`, `_next/*`)
  3. CSRF double-submit dla niebezpiecznych metod (POST/PUT/DELETE/PATCH)

### REST API (App Router Route Handlers)

- `/api/auth` — token → HttpOnly+SameSite=Strict cookie + redirect
- `/api/projects` — GET, discovery z `~/.claude/projects/`
- `/api/projects/[slug]/sessions` — GET, lista JSONL w projekcie
- `/api/sessions/[id]` — GET, streaming chunked
- `/api/sessions/[id]/export` — GET, Markdown download
- `/api/sessions/new` — POST, spawn `claude` w cwd projektu (walidacja cwd)
- `/api/claude-md` — GET/PUT globalny CLAUDE.md
- `/api/claude-md/[slug]` — GET/PUT per-project
- `/healthz` — GET, auth-exempt, dla launchera smoke testu

### WebSocket kanały

- `/api/ws/pty` — bidirectional protokół PTY (spawn, data, resize, kill, ack)
- `/api/ws/watch` — server push events z fs watchera (project-added, session-added, session-updated)

### Biblioteki wewnętrzne (`lib/`)

- `lib/security/*` — pure functions, zero IO, trywialnie testowalne
  - `token.ts` — `generateToken()`, `safeCompare(a, b)`
  - `csrf.ts` — `issueCsrf()`, `verifyCsrf(cookie, header)`
  - `host-check.ts` — `isHostAllowed(req)`, `isOriginAllowed(req)`
  - `path-guard.ts` — `assertInside(root, candidate)` → realpath + prefix check
  - `csp.ts` — `makeCsp(nonce)` → header value
- `lib/jsonl/*`
  - `types.ts` — Zod schemas dla 8 event types
  - `parser.ts` — `parseJsonlStream(readable) → AsyncIterable<Event>`
  - `index.ts` — `listProjects()`, `listSessions(slug)`, `decodeSlug(slug)`
  - `export-md.ts` — `sessionToMarkdown(events) → string`
  - `search.ts` — `searchInSession(events, query)`
- `lib/pty/*`
  - `manager.ts` — singleton, Map<id, PtyHandle>, cap 16, rate limit 10/min
  - `spawn.ts` — wrapper node-pty, resolve `$SHELL` z fallbackami
  - `audit.ts` — append `~/.claude/claude-ui/audit.log`
- `lib/watcher/chokidar.ts` — singleton watcher + EventEmitter
- `lib/ws/*`
  - `server.ts` — upgrade router, handshake auth
  - `pty-channel.ts` — protokół PTY, flow control (client ACK)
  - `watch-channel.ts` — push events
- `lib/server/*`
  - `port.ts` — `findEphemeralPort()` z retry na TOCTOU
  - `config.ts` — stałe: `HOME`, `CLAUDE_DIR`, `AUDIT_PATH`, `PROFILE_DIR`
  - `logger.ts` — pino instance, redact `token`, `authorization`, `cookie`

## Przepływy danych

### Otwarcie sesji w trybie read-only

1. User klika projekt w sidebarze → `GET /api/projects/[slug]/sessions`
2. Klik sesji → `GET /api/sessions/[id]` (streaming JSONL)
3. Hook `use-session-stream` iteruje po chunks → feed do react-virtuoso
4. Shiki lazy-loaded per język bloku kodu

### Otwarcie terminala w projekcie

1. User klika "terminal" na projekcie → client otwiera WS `/api/ws/pty`
2. Handshake: cookie auth + Origin check + CSRF w pierwszej wiadomości
3. Client wysyła `{type:"spawn", shell:"/bin/bash", cwd:"/home/bartek/project", cols:80, rows:24}`
4. Server: path-guard cwd, rate limit check, `pty.spawn(...)`, audit append
5. Bidirectional data stream z flow control (client ACK co 64 kB, server pause przy 1 MB unacked)

### Live update gdy Claude CLI pisze do JSONL

1. chokidar wykrywa `change` na `~/.claude/projects/<slug>/<sessionId>.jsonl`
2. Debounce 200 ms per plik → emit event
3. `watch-channel` pushuje `{type:"session-updated", slug, sessionId}` do klientów z aktywnym WS
4. Klient → `queryClient.invalidateQueries(['session', sessionId])` → reload
5. Jeśli sesja jest aktualnie otwarta: hook dopina nowy ogon streaming bez full reload

## Standalone build

- `next build` z `output: 'standalone'` → `.next/standalone/` zawiera minimalny runtime
- Postbuild: `cp server.ts .next/standalone/` + `cp -r bin .next/standalone/`
- Uruchomienie prod: `node .next/standalone/server.js` (nie, używamy tsx + server.ts w dev; prod ma server.js zbudowany przez tsx build)

## Performance targety

- Pierwszy byte streamu sesji: < 50 ms (lokalnie)
- Scroll 2000 wiadomości: FPS > 30
- PTY echo RTT: < 20 ms
- Memory: < 300 MB przy 5 aktywnych zakładkach terminala + 2 otwartych sesjach JSONL

## Observability

- Logger: pino z redact listą (token, authorization, cookie, env.\*)
- Audit log: tylko fakty strukturalne, bez treści (patrz SECURITY.md)
- Health: `/healthz` → `{status:"ok", uptime, pty_count, memory_mb}` (auth-exempt dla launcher + systemd probe)
