# Security — `claude-ui`

## Context and threat model

The app is **local** — it binds to `127.0.0.1` only and opens inside a Chromium `--app` window. Even so we assume realistic local attacks:

- **Malicious page in the user's main browser** trying to reach `http://127.0.0.1:PORT` via fetch / XHR / WebSocket / SSRF.
- **DNS rebinding** — an attacker page under a controlled domain flips its A record to `127.0.0.1` and tries to call our API with a cookie from another origin.
- **Another user on the same machine** (shared Linux servers, unlikely for our target user but cheap to defend against) trying to read the chromium profile, sockets, or state files.
- **XSS in rendered JSONL content** — tool output containing `<script>`, markdown inside assistant messages.
- **Path traversal** in project slugs and session paths.
- **Supply chain** — a malicious dep injected via npm.

**Not in scope**: scenarios where the user is already compromised (keylogger, hijacked Chrome profile) — that's outside what a local tool can fix. We assume a clean host.

## Defensive stack (core)

| #   | Control                                            | Implementation                                                                                                       | Verification                                          |
| --- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 1   | Bind to 127.0.0.1 only                             | `server.listen({ host: '127.0.0.1', port })`                                                                         | `lsof -i :PORT` in CI                                 |
| 2   | Ephemeral port                                     | `lib/server/port.ts` — random 49152-65535, retry on TOCTOU                                                           | unit: 1000 iterations without collision               |
| 3   | Token rotation                                     | `crypto.randomBytes(32)`, fresh per-run, not persisted                                                               | integration: restart → old cookie 401                 |
| 4   | Token transport                                    | `?k=TOKEN` only in the **launcher URL**; first request → HttpOnly + SameSite=Strict cookie + 302 to `/` without `?k` | test: access log does not contain `?k=`               |
| 5   | Timing-safe compare                                | `crypto.timingSafeEqual`                                                                                             | unit: mismatched lengths → false without throwing     |
| 6   | Host allowlist                                     | middleware rejects anything other than `127.0.0.1:PORT` and `localhost:PORT` (redirect)                              | integration: `Host: evil.com` → 403                   |
| 7   | WS Origin check                                    | `ws.on('upgrade', ...)` validates the Origin header                                                                  | integration: wrong Origin → 403                       |
| 8   | CSP nonce                                          | `lib/security/csp.ts` → `script-src 'nonce-...' 'strict-dynamic'`                                                    | devtools + CI grep: no `unsafe-inline` in script-src  |
| 9   | CSRF double-submit                                 | `lib/security/csrf.ts` — cookie `_csrf` + header `X-Csrf-Token`                                                      | integration: missing/tampered → 403                   |
| 10  | Referrer-Policy                                    | `no-referrer` globally (next.config.ts)                                                                              | curl check on response header                         |
| 11  | Same-origin headers                                | `COOP: same-origin`, `CORP: same-origin`, `X-Frame-Options: DENY`                                                    | curl check                                            |
| 12  | Path guard                                         | `lib/security/path-guard.ts` — `fs.realpath` + prefix check                                                          | unit: 100-payload fuzz without escape                 |
| 13  | Chromium profile                                   | `$XDG_RUNTIME_DIR/claude-ui/<uuid>` mode 0700                                                                        | test: `stat -c '%a'` == 700                           |
| 14  | Profile cleanup                                    | SIGTERM / SIGINT trap in `bin/claude-ui`                                                                             | test: start + kill + dir removed                      |
| 15  | Rate limits                                        | per-session token-bucket: PTY 10/min, REST 100/min, WS 500 msg/s                                                     | integration: 11th spawn → 429                         |
| 16  | Body limits                                        | PUT CLAUDE.md: 1 MB (413), rendered JSONL field: 10 MB truncate                                                      | integration: 2 MB body → 413                          |
| 17  | PTY cap                                            | 16 concurrent tabs, 17th → rejected                                                                                  | unit + integration                                    |
| 18  | PTY backpressure                                   | client ACK every 64 kB, server pauses at 1 MB unacked                                                                | integration: `yes` in a PTY → no OOM                  |
| 19  | Audit log whitelist                                | only `{ts, event, sessionId, pid, cwd, shell, cols, rows, path, bytes}` — **no env, no tokens, no content**          | grep on `audit.log` in CI                             |
| 20  | Logger redact                                      | pino `redact: ['token', 'authorization', 'cookie', '*.env']`                                                         | unit: serialized log never contains the token         |
| 21  | Graceful shutdown                                  | SIGTERM → kill all PTYs → flush log → exit                                                                           | test: `ps` post-shutdown, no zombies                  |
| 22  | Schema validation                                  | Zod on every request body                                                                                            | unit: invalid body → 400                              |
| 23  | Markdown sanitisation                              | react-markdown + rehype-sanitize                                                                                     | unit + playwright: `<script>` inside assistant → text |
| 24  | No `eval` / `Function` / `dangerouslySetInnerHTML` | ESLint `no-restricted-syntax` rule                                                                                   | lint in CI                                            |
| 25  | `npm audit`                                        | `pnpm audit --prod --audit-level=high` in CI                                                                         | green in CI                                           |

## Threat → mitigation mapping

### DNS rebinding

- Host allowlist (control #6) — only `127.0.0.1:PORT` and `localhost:PORT`.
- Even if the attacker rebinds their domain to `127.0.0.1`, the Host header is still their domain → 403.
- WS Origin check (control #7) — additional layer for upgrade requests.

### CSRF from a malicious page

- `SameSite=Strict` cookie (control #4) — cookie does not ride along in third-party contexts.
- Double-submit token (control #9) — fallback even if SameSite ever fails.
- WS: CSRF travels in the first message after handshake (WS upgrades cannot carry custom headers from browser JS).

### XSS inside session content

- react-markdown + rehype-sanitize for assistant output (control #23).
- All `tool_result` payloads render as text inside `<pre>` (no HTML).
- Truncate fields > 10 MB (control #16) — DoS protection.
- CSP (control #8) — even if XSS gets in, `strict-dynamic` blocks inline script execution.

### Path traversal

- `path-guard.ts` with `fs.realpath` (control #12) — resolves symlinks.
- Prefix check: `resolved === root || resolved.startsWith(root + path.sep)` (avoids the `/home/bartek/.claudeEVIL/` class of bugs).
- Every endpoint that touches paths: **mandatory** path-guard (lint hint considered for review).
- 100-payload fuzz in tests (control #12 verification).

### Token leakage

- `?k=TOKEN` in the URL would leak to the access log, Referer, browser history, and shared links.
- Mitigation: the redirect is the **first** thing `/api/auth` does (control #4).
- `Referrer-Policy: no-referrer` (control #10) — no leakage via outbound links.
- Dedicated Chromium profile (control #13) — the main browser's history stays clean.
- Access log filtered at the pino layer (control #20).

### Malicious dep / supply chain

- `pnpm audit` in CI (control #25) blocks high/critical vulnerabilities.
- `package.json` pins versions (caret, not wildcard) and `pnpm-lock.yaml` is committed.
- Future: lockfile-lint or socket.dev alerts.

### PTY abuse (own account, triggered by a UI bug)

- Rate limit 10 spawns/min (control #15) contains a buggy UI loop.
- 16-PTY cap (control #17) protects against memory / fd exhaustion.
- Backpressure (control #18) stops spam from `yes` / `cat bigfile`.
- Audit log (control #19) preserves spawn history for incident review.
- Graceful shutdown (control #21) leaves no zombies behind.

## Cross-cutting security gates (pre-release checklist)

- [ ] `pnpm audit --prod --audit-level=high` → zero
- [ ] `pnpm lint` green (eslint rules against eval / Function / dangerouslySetInnerHTML)
- [ ] `pnpm test:unit` green (100% path-guard fuzz, timing-safe, csrf)
- [ ] `pnpm test:integration` green (Host check, Origin check, auth, CSRF replay)
- [ ] `pnpm test:security` green (playwright security suite — see below)
- [ ] `audit.log` from tests: `grep -E '(token|cookie|Bearer|api_key)'` → zero hits
- [ ] `lsof -i :$PORT` shows only the `127.0.0.1` bind
- [ ] Chromium profile mode 0700 (`stat -c '%a'` == 700)
- [ ] SIGTERM → profile dir removed (integration test)
- [ ] Response headers on `/`:
  - CSP without `unsafe-inline` in script-src
  - `Referrer-Policy: no-referrer`
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `COOP: same-origin`, `CORP: same-origin`
- [ ] Rate limits live: manual `for i in {1..15}; do curl ... /api/sessions/new; done` → 10 OK + 5×429
- [ ] Body limit live: `curl -X PUT ... -d @2mb.md` → 413
- [ ] Token rotation: restart `claude-ui`, old cookie in Chromium → 401 + redirect to auth

## Playwright security suite (`tests/security/*.spec.ts`)

- `host-rebinding.spec.ts` — `Host: evil.com` → 403 on every endpoint.
- `origin-ws.spec.ts` — WS upgrade with wrong Origin → 403.
- `no-cookie.spec.ts` — automated route scan → every route requires a cookie (except `/api/auth`, `/healthz`).
- `csrf-replay.spec.ts` — tampered CSRF header / cookie → 403.
- `path-traversal.spec.ts` — 100 payloads on every path-aware endpoint.
- `xss-render.spec.ts` — fixtures with `<script>`, `javascript:`, `onerror=` → rendered as text.
- `rate-limit.spec.ts` — 11th spawn → 429, 101st REST → 429.
- `body-limit.spec.ts` — PUT 2 MB → 413.
- `token-rotation.spec.ts` — kill server + restart → old cookie 401.

## Incident playbook

If a user spots suspicious activity (e.g. an unexpected PTY in `audit.log`):

1. `grep '<suspicious-pid>' ~/.claude/claude-ui/audit.log` — full event history for that PID.
2. `ps -ef | grep <pid>` — check whether the process is still alive.
3. `kill` the server (SIGTERM) — every PTY dies, profile gets cleaned up.
4. Review `audit.log` — look for `spawn` events with an unexpected cwd or shell.
5. Regenerate the token (restart `claude-ui`) — old cookies become invalid.

## Out of scope (design notes)

- **Multi-user auth** — single local user, no session management.
- **HTTPS / TLS** — local `127.0.0.1`; a cert would add complexity (self-signed warning, Secure-cookie logic) without a real threat model win.
- **mTLS** — overkill for a local tool.
- **AppArmor / SELinux profile** — user-level tool, system-level hardening is out of scope.
- **PTY sandboxing (firejail / bwrap)** — decided against: the shell already runs with the user's own privileges; sandboxing would break shell ergonomics without blocking any real attacker who already owns the account.
