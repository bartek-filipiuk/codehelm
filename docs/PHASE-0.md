# PHASE 0 — Setup + security primitives + CI

**Goal**: lay the foundation the remaining phases plug into. Security primitives (token, csrf, host-check, path-guard, csp) are tested **before** anything else. The launcher (`bin/claude-ui`) can bring up a process + Chromium. CI blocks any merge without green tests.

**Out**: no UI (placeholder), no JSONL logic, no PTY.

## Checklist

### Toolchain & config

- [x] `package.json` with `bin`, deps, scripts (dev/build/start/test/lint/audit)
- [x] `tsconfig.json` strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`
- [x] `.gitignore`, `.editorconfig`, `.prettierrc.json`, `.prettierignore`
- [x] `eslint.config.mjs` with `no-restricted-syntax` (eval/Function/dangerouslySetInnerHTML)
- [x] `next.config.ts` with `output: 'standalone'` + security headers
- [ ] `pnpm install` green, `pnpm-lock.yaml` committed
- [ ] husky pre-commit: lint-staged (prettier + eslint --fix)
- [ ] `.github/workflows/ci.yml` — lint + typecheck + unit + audit + playwright launcher smoke

### Security primitives (TDD — tests first)

- [ ] `tests/unit/security/token.test.ts` — `generateToken` uniqueness, `safeCompare` timing-safe + mismatched lengths
- [ ] `lib/security/token.ts` — `generateToken(): string` (32 bytes hex), `safeCompare(a, b): boolean`
- [ ] `tests/unit/security/csrf.test.ts` — issue + verify, tampered cookie/header → false, replay OK for the same token
- [ ] `lib/security/csrf.ts` — `issueCsrf(): {cookie, header}`, `verifyCsrf(cookieVal, headerVal): boolean`
- [ ] `tests/unit/security/host-check.test.ts` — allow `127.0.0.1:PORT`, allow `localhost:PORT`, deny `evil.com`, deny `127.0.0.1:other-port`
- [ ] `lib/security/host-check.ts` — `isHostAllowed(host, expectedHost): boolean`, `isOriginAllowed(origin, expectedOrigin): boolean`
- [ ] `tests/unit/security/path-guard.test.ts` — **100-payload fuzz**: `../`, null bytes, UTF-8 tricks, symlinks, absolute paths, Windows-style separators, mixed case
- [ ] `lib/security/path-guard.ts` — `assertInside(root, candidate): Promise<string>` (throws on escape)
- [ ] `tests/unit/security/csp.test.ts` — nonce is 16+ bytes, header format, script-src must not contain `unsafe-inline`
- [ ] `lib/security/csp.ts` — `makeCsp(nonce): string`

### Custom server + auth

- [ ] `lib/server/port.ts` — `findEphemeralPort(): Promise<number>` (retry on TOCTOU)
- [ ] `lib/server/config.ts` — `HOME`, `CLAUDE_DIR`, `AUDIT_PATH`, `PROFILE_DIR`
- [ ] `lib/server/logger.ts` — pino with `redact: ['token', 'authorization', 'cookie']`
- [ ] `server.ts` — custom http.Server, Next app, middleware stack (Host → auth → CSRF → Next handler)
- [ ] `app/api/auth/route.ts` — GET `?k=TOKEN` → timing-safe compare → set HttpOnly+SameSite=Strict cookie + 302 to `/`
- [ ] `app/api/healthz/route.ts` — auth-exempt, returns `{ status: "ok" }`
- [ ] `app/layout.tsx` and `app/page.tsx` — minimal placeholder ("claude-ui" + port)
- [ ] `app/globals.css` — Tailwind setup

### bin/claude-ui launcher

- [ ] `bin/claude-ui` (executable, shebang `#!/usr/bin/env node` or tsx loader)
- [ ] Finds an ephemeral port, generates a 32-byte token
- [ ] Spawns the server with env: `PORT`, `TOKEN`, `AUDIT_PATH`
- [ ] Polls `http://127.0.0.1:PORT/healthz` for up to 10 s (100 ms interval) until 200
- [ ] `mkdir $XDG_RUNTIME_DIR/claude-ui/<uuid>` mode 0700, fallback `/tmp/claude-ui-<uid>-<uuid>` mode 0700
- [ ] Spawns `chromium --app=http://127.0.0.1:PORT/?k=TOKEN --user-data-dir=<profile>` (or `google-chrome-stable`, fallback detection)
- [ ] Traps SIGTERM/SIGINT/SIGHUP: kill server child + `rm -rf` profile dir
- [ ] Exits when Chromium closes (main loop awaits chrome process)

### CI

- [ ] `.github/workflows/ci.yml`:
  - job `lint`: `pnpm install --frozen-lockfile` + `pnpm lint` + `pnpm typecheck` + `pnpm format:check`
  - job `unit`: `pnpm test:unit` (Vitest)
  - job `integration`: `pnpm test:integration` (supertest)
  - job `audit`: `pnpm audit --prod --audit-level=high`
  - job `smoke`: `pnpm build` + `pnpm exec playwright test tests/e2e/phase-0-smoke.spec.ts`
- [ ] playwright smoke: `claude-ui` starts, `healthz` 200, port binds on 127.0.0.1 (not 0.0.0.0)

## Security gate (every box MUST be ✓ before Phase 1)

- [ ] `pnpm audit --prod` → zero high/critical
- [ ] path-guard fuzz 100 payloads → zero escapes
- [ ] curl `Host: evil.com` → 403
- [ ] curl without cookie + POST → 401
- [ ] Token **never** appears in `audit.log` or pino output after the redirect (grep test)
- [ ] Chromium profile `stat -c '%a' $profile` → `700`
- [ ] SIGTERM → profile removed (integration test)
- [ ] `lsof -i :$PORT` shows `127.0.0.1:*` (not `0.0.0.0`)
- [ ] ESLint rule triggers on `eval(` inside a test file (positive lint verification)

## Deliverables

- `git tag phase-0-done`
- PR describing the security primitives, with links to the unit test coverage report
- `README.md` progress entry: `[x] Phase 0`
