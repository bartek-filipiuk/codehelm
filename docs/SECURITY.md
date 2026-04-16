# Security — `claude-ui`

## Kontekst i model zagrożeń

Aplikacja jest **lokalna** — binduje wyłącznie `127.0.0.1`, otwierana w Chromium jako `--app` window. Mimo to zakładamy realistyczne ataki lokalne:

- **Malicious strona w tle** w głównym browserze użytkownika próbuje dotrzeć do `http://127.0.0.1:PORT` przez fetch/XHR/WebSocket/SSRF.
- **DNS rebinding** — atakująca strona pod kontrolowaną domeną zmienia swoje A-record na `127.0.0.1` i próbuje wywołać nasze API z cookie innej origin.
- **Inny user na tej samej maszynie** (współdzielone serwery Linux, mało prawdopodobne u usera ale bronimy się bo darmowe) próbuje czytać profil chromium, socket, pliki stanowe.
- **XSS w renderowanej treści JSONL** — tool output z `<script>`, markdown w assistant msg.
- **Path traversal** przy walidacji slugów projektów i ścieżek sesji.
- **Supply chain** — malicious dep injected przez npm.

**Nie atakujemy**: scenariuszy gdy użytkownik jest już skompromitowany (keylogger, chrome user data hijacked) — to wykracza poza nasz scope. Zakładamy że user ma czysty system.

## Stack obronny (rdzeń)

| #   | Kontrola                                         | Implementacja                                                                                                   | Weryfikacja                                              |
| --- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 1   | Bind tylko 127.0.0.1                             | `server.listen({ host: '127.0.0.1', port })`                                                                    | `lsof -i :PORT` w CI                                     |
| 2   | Ephemeral port                                   | `lib/server/port.ts` — losowy 49152-65535, retry przy TOCTOU                                                    | unit: 1000 iteracji bez collision                        |
| 3   | Token rotation                                   | `crypto.randomBytes(32)`, nowy per-run, nie persist                                                             | integration: restart → stare cookie 401                  |
| 4   | Token transport                                  | `?k=TOKEN` tylko w **launcher URL**, pierwszy request → HttpOnly+SameSite=Strict cookie + 302 do `/` bez `?k`   | test: access log nie zawiera `?k=`                       |
| 5   | Timing-safe compare                              | `crypto.timingSafeEqual`                                                                                        | unit: różne długości → false bez rzutu                   |
| 6   | Host allowlist                                   | middleware: odrzuca wszystko poza `127.0.0.1:PORT` i `localhost:PORT` (redirect)                                | integration: `Host: evil.com` → 403                      |
| 7   | Origin check (WS)                                | `ws.on('upgrade', ...)` → sprawdź Origin header                                                                 | integration: wrong Origin → 403                          |
| 8   | CSP nonce                                        | `lib/security/csp.ts` → `script-src 'nonce-...' 'strict-dynamic'`                                               | devtools + CI grep: brak `unsafe-inline` w script-src    |
| 9   | CSRF double-submit                               | `lib/security/csrf.ts` — cookie `_csrf` + header `X-Csrf-Token`                                                 | integration: missing/tampered → 403                      |
| 10  | Referrer-Policy                                  | `no-referrer` globalnie (next.config.ts)                                                                        | curl check response header                               |
| 11  | Same-Origin headers                              | `COOP: same-origin`, `CORP: same-origin`, `X-Frame-Options: DENY`                                               | curl check                                               |
| 12  | Path guard                                       | `lib/security/path-guard.ts` — `fs.realpath` + prefix check                                                     | unit: fuzz 100 payloadów bez escape                      |
| 13  | Chromium profile                                 | `$XDG_RUNTIME_DIR/claude-ui/<uuid>` mode 0700                                                                   | test: `stat -c '%a'` == 700                              |
| 14  | Cleanup profile                                  | SIGTERM/SIGINT trap w `bin/claude-ui`                                                                           | test: start + kill + katalog usunięty                    |
| 15  | Rate limits                                      | token-bucket per session: PTY 10/min, REST 100/min, WS 500 msg/s                                                | integration: 11ty spawn → 429                            |
| 16  | Body limits                                      | PUT CLAUDE.md: 1 MB (413), rendered JSONL field: 10 MB truncate                                                 | integration: 2 MB body → 413                             |
| 17  | PTY cap                                          | 16 jednoczesnych, 17ty → rejected                                                                               | unit + integration                                       |
| 18  | PTY backpressure                                 | client ACK co 64 kB, server pause przy 1 MB unacked                                                             | integration: `yes` w PTY → brak OOM                      |
| 19  | Audit log whitelist                              | tylko `{ts, event, sessionId, pid, cwd, shell, cols, rows, path, bytes}` — **bez env, bez tokenów, bez treści** | grep w CI na `audit.log`                                 |
| 20  | Logger redact                                    | pino `redact: ['token', 'authorization', 'cookie', '*.env']`                                                    | unit: serialized log nie zawiera tokena                  |
| 21  | Graceful shutdown                                | SIGTERM → kill all PTY → flush log → exit                                                                       | test: `ps` post-shutdown, brak zombie                    |
| 22  | Schema validation                                | Zod na wszystkich request bodies                                                                                | unit: invalid body → 400                                 |
| 23  | Markdown sanitization                            | react-markdown + rehype-sanitize                                                                                | unit + playwright: `<script>` w assistant → escaped text |
| 24  | Brak `eval`/`Function`/`dangerouslySetInnerHTML` | ESLint `no-restricted-syntax` rule                                                                              | lint w CI                                                |
| 25  | `npm audit`                                      | `pnpm audit --prod --audit-level=high` w CI                                                                     | zielone w CI                                             |

## Threat → mitigation mapping

### DNS rebinding

- Host allowlist (kontrola #6) — tylko `127.0.0.1:PORT` i `localhost:PORT`.
- Nawet jeśli atakujący zrebinduje swoją domenę na `127.0.0.1`, Host header będzie jego domeną → 403.
- WS Origin check (kontrola #7) — dodatkowa warstwa dla upgrade requestów.

### CSRF z malicious strony

- `SameSite=Strict` cookie (kontrola #4) — cookie nie poleci z 3rd-party kontekstu.
- Double-submit token (kontrola #9) — nawet gdyby SameSite zawiódł.
- WS: CSRF w pierwszej wiadomości po handshake (bo WS upgrade nie wysyła custom headerów z browser JS).

### XSS w treści sesji

- react-markdown + rehype-sanitize dla assistant (kontrola #23).
- Wszystkie tool_result jako text w `<pre>` (brak HTML rendering).
- Truncate pól > 10 MB (kontrola #16) — DoS protection.
- CSP (kontrola #8) — nawet jeśli XSS przejdzie, `strict-dynamic` nie pozwoli odpalić inline script.

### Path traversal

- `path-guard.ts` z `fs.realpath` (kontrola #12) — rozwiązuje symlinki.
- Prefix check: `resolved === root || resolved.startsWith(root + path.sep)` (unik bugów typu `/home/bartek/.claudeEVIL/`).
- Każdy endpoint operujący na ścieżkach: **obowiązkowo** path-guard (lint hint można dodać w review).
- Fuzz 100 payloadów w testach (kontrola #12 weryfikacja).

### Token leakage

- `?k=TOKEN` w URL wycieka do access loga, Referer, historii przeglądarki, shared link.
- Mitigacja: redirect jest **pierwszą** rzeczą w `/api/auth` (kontrola #4).
- `Referrer-Policy: no-referrer` (kontrola #10) — nie wycieka przez linki wychodzące.
- Dedicated Chromium profile (kontrola #13) — nie kontaminuje głównej przeglądarki historią.
- Access log filtrowany na warstwie pino (kontrola #20).

### Malicious dep / supply chain

- `pnpm audit` w CI (kontrola #25) blokuje high/critical.
- `package.json` pin wersji (caret, nie wildcard) + `pnpm-lock.yaml` commited.
- Docelowo: lockfile-lint lub socket.dev alert.

### PTY abuse (własne konto, ale bug w UI)

- Rate limit 10 spawnów/min (kontrola #15) chroni przed buggy loopem UI.
- Cap 16 PTY (kontrola #17) chroni przed memory/fd exhaust.
- Backpressure (kontrola #18) chroni przed spamowaniem przez `yes`/`cat bigfile`.
- Audit log (kontrola #19) — w razie incydentu widać spawn history.
- Graceful shutdown (kontrola #21) — nie zostawia zombie po zamknięciu.

## Cross-cutting security gates (pre-release checklist)

- [ ] `pnpm audit --prod --audit-level=high` → zero
- [ ] `pnpm lint` zielony (eslint rules na eval/Function/dangerouslySetInnerHTML)
- [ ] `pnpm test:unit` zielony (100% path-guard fuzz, timing-safe, csrf)
- [ ] `pnpm test:integration` zielony (Host check, Origin check, auth, CSRF replay)
- [ ] `pnpm test:security` zielony (playwright security suite — patrz niżej)
- [ ] `audit.log` z testów: `grep -E '(token|cookie|Bearer|api_key)'` → zero trafień
- [ ] `lsof -i :$PORT` pokazuje tylko bind na `127.0.0.1`
- [ ] Chromium profile mode 0700 (`stat -c '%a'` == 700)
- [ ] SIGTERM → profile dir usunięty (integration test)
- [ ] Response headers na `/`:
  - CSP bez `unsafe-inline` w script-src
  - `Referrer-Policy: no-referrer`
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `COOP: same-origin`, `CORP: same-origin`
- [ ] Rate limits aktywne: manualny test `for i in {1..15}; do curl ... /api/sessions/new; done` → 10 OK + 5×429
- [ ] Body limit aktywny: `curl -X PUT ... -d @2mb.md` → 413
- [ ] Token rotation: restart `claude-ui`, stare cookie w Chromium → 401 + redirect na auth

## Playwright security suite (`tests/security/*.spec.ts`)

- `host-rebinding.spec.ts` — curl `Host: evil.com` → 403 na każdym endpoint
- `origin-ws.spec.ts` — WS upgrade z wrong Origin → 403
- `no-cookie.spec.ts` — automatyczny scan listy routes → każda wymaga cookie (except `/api/auth`, `/healthz`)
- `csrf-replay.spec.ts` — tampered CSRF header/cookie → 403
- `path-traversal.spec.ts` — 100 payloadów na każdym path-aware endpoint
- `xss-render.spec.ts` — fixture z `<script>`, `javascript:`, `onerror=` → renderowane jako text
- `rate-limit.spec.ts` — 11ty spawn → 429, 101st REST → 429
- `body-limit.spec.ts` — PUT 2 MB → 413
- `token-rotation.spec.ts` — kill server + restart → stare cookie 401

## Playbook incydentu

Jeśli użytkownik zauważy podejrzaną aktywność (np. niespodziewany PTY w audit.log):

1. `grep '<suspicious-pid>' ~/.claude/claude-ui/audit.log` — pełna historia eventów
2. `ps -ef | grep <pid>` — czy proces jeszcze żyje
3. `kill` serwer (SIGTERM) — wszystkie PTY umierają, profile cleanup
4. Review `audit.log` — szukaj `spawn` z nieoczekiwanym cwd lub shell
5. Regeneruj token (restart `claude-ui`) — stare cookie invalid

## Co nie jest w scope (design notes)

- **Multi-user auth** — pojedynczy lokalny user, brak session management.
- **HTTPS/TLS** — lokalny 127.0.0.1, cert dodałby komplikacji (self-signed warning, Secure cookie logika).
- **mTLS** — overkill dla lokalnego tool.
- **AppArmor/SELinux profile** — user-level tool, system-level hardening poza scope.
- **Sandboxing PTY (firejail/bwrap)** — zdecydowano: full shell (user's account już ma te uprawnienia).
