# PHASE 0 — Setup + security primitives + CI

**Cel**: fundament do którego reszta faz będzie dopinana. Security primitives (token, csrf, host-check, path-guard, csp) są testowane **przed** czymkolwiek innym. Launcher (`bin/claude-ui`) umie zestawić proces + Chromium. CI blokuje merge bez zielonych testów.

**Out**: brak UI (placeholder), brak JSONL logic, brak PTY.

## Checklist

### Toolchain & config

- [x] `package.json` z `bin`, deps, scripts (dev/build/start/test/lint/audit)
- [x] `tsconfig.json` strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`
- [x] `.gitignore`, `.editorconfig`, `.prettierrc.json`, `.prettierignore`
- [x] `eslint.config.mjs` z `no-restricted-syntax` (eval/Function/dangerouslySetInnerHTML)
- [x] `next.config.ts` z `output: 'standalone'` + security headers
- [ ] `pnpm install` zielony, `pnpm-lock.yaml` committed
- [ ] husky pre-commit: lint-staged (prettier + eslint --fix)
- [ ] `.github/workflows/ci.yml` — lint + typecheck + unit + audit + playwright launcher smoke

### Security primitives (TDD — testy najpierw)

- [ ] `tests/unit/security/token.test.ts` — `generateToken` unikalność, `safeCompare` timing-safe + różne długości
- [ ] `lib/security/token.ts` — `generateToken(): string` (32 bajty hex), `safeCompare(a, b): boolean`
- [ ] `tests/unit/security/csrf.test.ts` — issue + verify, tampered cookie/header → false, replay OK dla tego samego tokena
- [ ] `lib/security/csrf.ts` — `issueCsrf(): {cookie, header}`, `verifyCsrf(cookieVal, headerVal): boolean`
- [ ] `tests/unit/security/host-check.test.ts` — allow `127.0.0.1:PORT`, allow `localhost:PORT`, deny `evil.com`, deny `127.0.0.1:other-port`
- [ ] `lib/security/host-check.ts` — `isHostAllowed(host, expectedHost): boolean`, `isOriginAllowed(origin, expectedOrigin): boolean`
- [ ] `tests/unit/security/path-guard.test.ts` — **fuzz 100 payloadów**: `../`, null bytes, UTF-8 tricks, symlinks, absolute paths, Windows-style separators, mixed case
- [ ] `lib/security/path-guard.ts` — `assertInside(root, candidate): Promise<string>` (throws jeśli escape)
- [ ] `tests/unit/security/csp.test.ts` — nonce jest 16+ bajtów, header format, script-src nie zawiera `unsafe-inline`
- [ ] `lib/security/csp.ts` — `makeCsp(nonce): string`

### Custom server + auth

- [ ] `lib/server/port.ts` — `findEphemeralPort(): Promise<number>` (retry na TOCTOU)
- [ ] `lib/server/config.ts` — `HOME`, `CLAUDE_DIR`, `AUDIT_PATH`, `PROFILE_DIR`
- [ ] `lib/server/logger.ts` — pino z `redact: ['token', 'authorization', 'cookie']`
- [ ] `server.ts` — custom http.Server, Next app, middleware stack (Host → auth → CSRF → Next handler)
- [ ] `app/api/auth/route.ts` — GET `?k=TOKEN` → timing-safe compare → ustaw cookie HttpOnly+SameSite=Strict + 302 do `/`
- [ ] `app/api/healthz/route.ts` — auth-exempt, zwraca `{ status: "ok" }`
- [ ] `app/layout.tsx` i `app/page.tsx` — minimalny placeholder ("claude-ui" + port)
- [ ] `app/globals.css` — Tailwind setup

### bin/claude-ui launcher

- [ ] `bin/claude-ui` (executable, shebang `#!/usr/bin/env node` albo tsx loader)
- [ ] Znajduje ephemeral port, generuje 32B token
- [ ] Spawn server z env: `PORT`, `TOKEN`, `AUDIT_PATH`
- [ ] Poll `http://127.0.0.1:PORT/healthz` max 10 s (interval 100 ms) aż 200
- [ ] Mkdir `$XDG_RUNTIME_DIR/claude-ui/<uuid>` z mode 0700, fallback `/tmp/claude-ui-<uid>-<uuid>` mode 0700
- [ ] Spawn `chromium --app=http://127.0.0.1:PORT/?k=TOKEN --user-data-dir=<profile>` (lub `google-chrome-stable`, fallback detection)
- [ ] Trap SIGTERM/SIGINT/SIGHUP: kill server child + rm -rf profile dir
- [ ] Exit gdy Chromium się zamknie (main loop awaits chrome process)

### CI

- [ ] `.github/workflows/ci.yml`:
  - job `lint`: `pnpm install --frozen-lockfile` + `pnpm lint` + `pnpm typecheck` + `pnpm format:check`
  - job `unit`: `pnpm test:unit` (Vitest)
  - job `integration`: `pnpm test:integration` (supertest)
  - job `audit`: `pnpm audit --prod --audit-level=high`
  - job `smoke`: `pnpm build` + `pnpm exec playwright test tests/e2e/phase-0-smoke.spec.ts`
- [ ] playwright smoke test: `claude-ui` startuje, `healthz` 200, port na 127.0.0.1 (nie 0.0.0.0)

## Security gate (wszystko MUSI być ✓ przed fazą 1)

- [ ] `pnpm audit --prod` → zero high/critical
- [ ] path-guard fuzz 100 payloadów → zero escape
- [ ] curl `Host: evil.com` → 403
- [ ] curl bez cookie + POST → 401
- [ ] Token **nie występuje** w `audit.log` ani pino output po redirecie (grep test)
- [ ] Chromium profile `stat -c '%a' $profile` → `700`
- [ ] SIGTERM → profil usunięty (integration test)
- [ ] `lsof -i :$PORT` pokazuje `127.0.0.1:*` (nie `0.0.0.0`)
- [ ] ESLint rule wyzwala się na `eval(` w kodzie testowym (pozytywna weryfikacja lintu)

## Deliverables

- `git tag phase-0-done`
- PR opisujący security primitives, z linkami do unit test coverage reportu
- Entry w `README.md`: tabela postępu `[x] Phase 0`
