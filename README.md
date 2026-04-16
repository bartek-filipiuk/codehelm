# claude-ui

Lokalny web UI do zarządzania sesjami Claude Code CLI. Zastępuje żonglowanie
wieloma oknami terminala — wszystkie projekty, historia konwersacji
i interaktywny shell w jednej zakładce Chromium.

Zero chmury. Zero dodatkowych kosztów API. Bindowanie tylko na
`127.0.0.1`, pełny stack obronny włącznie z CSP, CSRF double-submit,
path-guardem i audit logiem. Multi-tab terminal z `node-pty`, live updates
przez chokidar, edytor `CLAUDE.md` z CodeMirror 6, conflict detection
i atomic write.

Zbudowany z `Next.js 15` App Router, custom HTTP/WS serwera, `xterm.js`,
`react-virtuoso`, Zod, TanStack Query.

---

## Screenshots

**Sidebar + historia sesji z tool_use / tool_result inline**

![History view](screens/history.png)

**Multi-tab terminal z `claude --resume` i zwykłym shellem**

![Shell view](screens/shell.png)

**Rozbijanie bloków tool_use na expandowalne karty + syntax highlight**

![Tools view](screens/tools.png)

---

## Co to jest

Claude Code CLI zapisuje każdą sesję jako plik JSONL w
`~/.claude/projects/<slug>/<sessionId>.jsonl`. Im dłużej używasz CLI,
tym więcej tych sesji zbiera się w terminalu — ciężko wrócić do
poprzedniej, trudno znaleźć coś konkretnego, jeszcze trudniej uruchomić
kilka równolegle bez tmuxowej akrobatyki.

`claude-ui` daje jeden widok:

- **Lewa kolumna** — wszystkie projekty z `~/.claude/projects/` z licznikiem
  sesji, ostatnią aktywnością, search, ręcznie nadawane aliasy.
- **Środkowa kolumna** — lista sesji wybranego projektu (preview, rozmiar,
  liczba wiadomości, timestamp relatywny).
- **Prawa kolumna** — trzy tryby przełączane w locie:
  - *Historia* — progressive streaming JSONL, 8 typów eventów renderowanych
    osobno (user, assistant markdown, tool_use, tool_result, thinking,
    system, attachment, permission-mode). Virtualizacja `react-virtuoso`,
    Shiki dla code blocks, `react-markdown` + `rehype-sanitize` dla XSS-safe
    assistant content. Search z nawigacją, filtry po kategoriach
    (User / Assistant / Tools / System), tryb "tylko trafienia".
  - *Terminal* — wielokartkowy (max 16), każdy tab żyje w swoim PTY
    (`node-pty`), scrollback zachowany przy przełączaniu. "+ shell"
    odpala bash w cwd projektu, "▶ resume w terminalu" wpisuje za Ciebie
    `claude --resume <id>`.
  - *CLAUDE.md* — CodeMirror 6, podmiana globalny ↔ per-project, atomic
    write z rename, detekcja konfliktu przez `If-Unmodified-Since`.

Live updates: chokidar obserwuje `~/.claude/projects/` i pushuje przez
WebSocket zmiany — gdy CLI zapisze nowy event, lista sesji i viewer
odświeżają się natychmiast bez klikania.

---

## Security model (realny, nie marketing)

Aplikacja działa na `127.0.0.1` i obsługuje bash PTY z pełnymi uprawnieniami
Twojego konta. To jest zdalne wykonanie kodu dla każdego, kto przejmie
sesję. Stąd pełny wielowarstwowy defense-in-depth:

**Bind i dostęp**
- `server.listen({ host: '127.0.0.1' })` — nigdy `0.0.0.0`
- Losowy port ephemeral (49152–65535) generowany per-run
- 32-bajtowy token z `crypto.randomBytes`, nowy przy każdym starcie

**Token flow**
- `?k=TOKEN` tylko w URL launchera (zawsze `bin/claude-ui`, nigdy w
  historii przeglądarki — `/api/auth` zwraca HTML z JS redirect zamiast
  302, dzięki czemu cookie commituje się przed nawigacją do `/`)
- Weryfikacja przez `crypto.timingSafeEqual`
- Po sukcesie: `claude_ui_auth` cookie HttpOnly + SameSite=Lax (Lax a nie
  Strict bo Chromium w trybie `--app=` drops Strict na pierwszej
  nawigacji — CSRF kompensowany niżej)
- `Referrer-Policy: no-referrer` globalnie

**CSRF**
- Double-submit: drugie cookie `claude_ui_csrf` (NIE HttpOnly, JS je
  czyta i wstawia do `x-csrf-token` headera)
- Weryfikacja z `timingSafeEqual` na każdym `POST`/`PUT`/`PATCH`/`DELETE`
- Dla WebSocket: pierwsze wiadomość musi zawierać `csrf: <value>`,
  inaczej connection zamyka się z code 1008

**DNS rebinding / Origin**
- Host header allowlist (tylko `127.0.0.1:PORT` i `localhost:PORT`)
- Origin check na każdym WS upgrade
- Rebind ataku nie łyka nawet jeśli cookie by wyciekło

**CSP**
- Per-request nonce w Next edge middleware (`middleware.ts`)
- `script-src 'nonce-<x>' 'strict-dynamic'` — bez `unsafe-inline`
- `'unsafe-eval'` aktywne **tylko w dev mode** (HMR Next.js) — prod strict
- `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`

**Path guard (krytyczne)**
- Każda ścieżka z user inputu idzie przez `lib/security/path-guard.ts`
- Rozwiązuje symlinki (`fs.realpath`) i weryfikuje prefix:
  `resolved === root || resolved.startsWith(root + path.sep)`
- Fuzz 100 payloadów w unit testach (URL-encoded, null bytes, UTF-8 tricks,
  symlink escape, prefix collision typu `/root/.claudeEVIL`)
- Dla CLAUDE.md dodatkowo: resolved path MUSI być literalnie
  `<dir>/CLAUDE.md` — blokuje zapis do `settings.json`, `CLAUDE.md.bak`,
  nested subdirs

**PTY**
- `node-pty` z cap 16 jednoczesnych PTY per instancja
- Rate limit 10 spawnów / minutę (token bucket)
- Backpressure: client ACKuje co 64 kB, serwer pauzuje PTY przy 1 MB
  unacked (zapobiega OOM przy `cat bigfile`)
- cwd walidowane przez path-guard — spawn poza `$HOME` odrzucany
- SIGHUP przy close, SIGKILL fallback po 5 s

**Audit log** (`~/.claude/claude-ui/audit.log`, mode 0600, parent 0700)
- Whitelist pól: `ts, event, sessionId, pid, cwd, shell, cols, rows,
  path, bytes, writeKind`
- **Nigdy** nie zapisuje: env vars, tokenów, cookie, treści wiadomości,
  stdout/stderr
- Logger pino z `redact: ['token', 'authorization', 'cookie', '*.env']`

**Resource limits**
- PUT CLAUDE.md: 1 MB (413 Payload Too Large)
- Rendered JSONL field w UI: 10 MB truncate z "show more"
- JSONL streaming przez `ReadableStream` — nigdy pełny plik do RAM

**Chromium profile**
- `$XDG_RUNTIME_DIR/claude-ui-<uid>-<uuid>/` z `mode 0700` (tmpfs, auto
  cleanup przy wylogowaniu)
- Fallback do `/tmp/claude-ui-<uid>-<uuid>/` mode 0700 gdy brak XDG
- Cleanup na SIGTERM/SIGINT/SIGHUP (trap w `bin/claude-ui`)

**Shutdown**
- SIGTERM killuje wszystkie PTY, zamyka watcher, flush log, exit ≤ 10 s

**Co NIE jest chronione**
- Scenariusze gdy Twoje konto jest już skompromitowane (keylogger,
  hijack chrome profile). To jest wyraźnie poza scope.
- Multi-user — to jest tool lokalny dla jednego usera.

Testy pokrywają każdą z tych warstw (unit + integration + playwright
security suite). `pnpm audit --prod --audit-level=high` zwraca zero.

---

## Quick start

```bash
# wymagania: Node 20.11+, pnpm 9+, Chromium albo Google Chrome
# Linux testowane na Ubuntu 22.04+; macOS/Windows poza scope v1

git clone https://github.com/bartek-filipiuk/claude-ui.git
cd claude-ui
pnpm install
./bin/claude-ui
```

Skrypt:
1. znajduje wolny port na `127.0.0.1`,
2. generuje 32-bajtowy token,
3. spawnuje Next.js serwer (`tsx server.ts`) w tle,
4. czeka aż `/api/healthz` zwróci 200,
5. tworzy dedykowany profil Chromium w `$XDG_RUNTIME_DIR`,
6. odpala `chromium --app=http://127.0.0.1:PORT/?k=TOKEN --user-data-dir=<profile>`.

Ctrl+C w terminalu lub zamknięcie okna Chromium → cleanup wszystkich PTY
+ profilu + exit.

### Zmienne środowiskowe

- `CLAUDE_UI_CHROMIUM=/path/to/chrome` — override auto-detect
- `LOG_LEVEL=debug` — szczegółowe logi pino (default `info`)

---

## Architektura

```
bin/claude-ui (node launcher)
  find port, gen token, spawn server, spawn chromium --app
      |
      v
server.ts (custom http.Server)
  middleware:  Host allowlist -> auth cookie -> CSRF
  Next handler: app/api/*, app/page.tsx
  upgrade:     /_next/* -> Next HMR
               /api/ws/pty -> pty-channel
               /api/ws/watch -> watch-channel

middleware.ts (Next edge)
  per-request CSP nonce injected into request header (x-nonce)
  propagated to Next's inline scripts automatically

lib/
  security/    token, csrf, host-check, path-guard (realpath), csp, nonce
  server/      config, port finder, logger (pino redact), audit, middleware
  jsonl/       Zod schemas for 9 event types, readline parser, listProjects,
               slug encode/decode, Markdown export, in-session search
  pty/         cap+rate-limit+backpressure manager, spawn wrapper, audit
  watcher/     chokidar singleton, metadata-only events, depth/symlink guard
  ws/          upgrade router, pty-channel (Zod protocol + flow control),
               watch-channel (batched push)
  claude-md/   write-guard (byte-exact CLAUDE.md invariant), atomic io
  aliases/     JSON map (slug -> alias), atomic write

app/
  layout.tsx, page.tsx
  (ui)/sidebar/         Search, ProjectList
  (ui)/session-explorer/ SessionList, ProjectHeader (rename inline)
  (ui)/conversation/    Viewer (virtuoso), MainPanel (mode switcher)
  (ui)/terminal/        Terminal (xterm), TabBar, TabManager
  (ui)/editor/          MarkdownEditor (CodeMirror 6)
  api/
    auth, healthz
    projects, projects/[slug]/sessions, projects/aliases (GET/PATCH)
    sessions/[id], sessions/[id]/export, sessions/new
    claude-md, claude-md/[slug]

hooks/
  use-projects, use-sessions, use-session-stream, use-pty, use-watch,
  use-open-session, use-claude-md, use-aliases

stores/  (zustand)
  ui-slice          selected project/session, search, mode flags
  terminal-slice    tabs (max 16), active, open/close/setActive
```

---

## Tests

```bash
pnpm test          # vitest unit + integration (220+ tests)
pnpm test:e2e      # playwright (18+ specs across phases 0..7)
pnpm audit         # pnpm audit --prod --audit-level=high (zero)
pnpm lint          # eslint strict, no eval/Function/dangerouslySetInnerHTML
pnpm typecheck     # tsc --noEmit
pnpm build         # Next standalone + custom server
```

Coverage obejmuje:
- fuzz 100 path-traversal payloadów
- CSRF replay / tampered tokens
- Host rebinding (`Host: evil.com` -> 403)
- WS Origin reject, cookie reject
- PTY cap, rate limit, backpressure, audit log content check
- JSONL parser dla 9 typów eventów + malformed line skip
- atomic CLAUDE.md write, If-Unmodified-Since conflict
- chokidar symlink guard, batched push throttle
- XSS w assistant markdown (rehype-sanitize), tool_result stdout
- e2e: spawn terminala + echo, resume claude, live updates w sesji

---

## Phases (historia rozwoju)

| Tag             | Zakres                                          |
| --------------- | ----------------------------------------------- |
| phase-0-done    | Fundament: security primitives + launcher + CI  |
| phase-1-done    | Backend: JSONL parser + 4 REST endpointy        |
| phase-2-done    | Sidebar + Session Explorer                      |
| phase-3-done    | Conversation Viewer + Shiki + sanitize          |
| phase-4-done    | WebSocket + node-pty + pojedynczy terminal      |
| phase-5-done    | Multi-tab + `claude --resume` spawn             |
| phase-6-done    | File watcher + live updates                     |
| phase-7-done    | CodeMirror 6 + atomic write                     |

---

## Roadmap

Backlog usprawnień w [IMPROVEMENTPLAN.md](IMPROVEMENTPLAN.md).
Aktywna kolejka w [TASKS.md](TASKS.md) — pobierana przez automatyczny
scheduler, każdy job implementuje pierwszy nieoznaczony task i odhacza
checkbox.

---

## Development

```bash
pnpm dev                    # HMR dev server
pnpm exec playwright install chromium
pnpm test:watch             # vitest interactive
```

Repozytorium ma strict TypeScript, strict ESLint (`eval`, `Function`,
`dangerouslySetInnerHTML` z literal string — wszystkie zabronione
z project-wide lint rule), prettier z Polish localization w niektórych
user-facing stringach i husky pre-commit.

Custom server.ts siedzi obok Next-a, nie zastępuje go — Next obsługuje
App Router i HMR, my przejmujemy tylko HTTP upgrade dla WS i middleware
stack przed `app.getRequestHandler()`.

---

## License

MIT (TBD — dodaj LICENSE.md jeśli potrzebne).

---

Built for local-only use. Nie wystawiaj na publiczny adres bez drugiej
warstwy uwierzytelniania (np. reverse proxy z mTLS, Tailscale z ACL).
Default security model zakłada że `127.0.0.1` jest zaufanym boundary.
