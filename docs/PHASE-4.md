# PHASE 4 — WebSocket + node-pty + xterm (single terminal)

**Cel**: pojedyncza zakładka terminala w UI. WebSocket działa, PTY spawnuje się z `$SHELL`, xterm.js renderuje, flow control zapobiega OOM przy szybkim outpucie.

**Prerequisites**: fazy 0–3 (auth, JSONL, UI layout).

## Checklist

### PTY infrastructure

- [ ] `tests/unit/pty/manager.test.ts` — cap 16, 17ty rejected, rate limit 10/min, backpressure 1 MB
- [ ] `lib/pty/manager.ts` — singleton Map<id, {pty, cwd, shell, unacked, paused}>, metody `spawn`, `write`, `resize`, `kill`, `list`
- [ ] `lib/pty/spawn.ts` — resolve `$SHELL` (fallback `/bin/bash`), path-guard cwd, nvidia-pty wrapper
- [ ] `lib/pty/audit.ts` — append JSON line do `~/.claude/claude-ui/audit.log`: `{ts, event, id, pid, cwd, shell, cols, rows}` — **nie** env, **nie** treść
- [ ] Audit log file mode 0600, parent dir 0700

### WebSocket transport

- [ ] `lib/ws/server.ts` — `attachUpgradeRouter(http.Server, {next})` — routuje `/_next/webpack-hmr` do Next HMR, `/api/ws/pty` do `pty-channel`, `/api/ws/watch` do `watch-channel`
- [ ] Origin check na każdym upgrade: `req.headers.origin === 'http://127.0.0.1:PORT'`, inaczej `socket.destroy()`
- [ ] Auth: cookie odczytany z `req.headers.cookie` + safeCompare z serwerowym tokenem
- [ ] CSRF: pierwsza wiadomość klienta po otwarciu musi zawierać aktualny CSRF token, inaczej close 1008
- [ ] `lib/ws/pty-channel.ts` — protokół: `{type: "spawn" | "data" | "resize" | "kill" | "ack"}`
- [ ] Flow control: serwer wysyła chunk max 64 kB, liczy `unacked`, przy `unacked > 1 MB` → `pty.pause()`, gdy klient ACK → resume
- [ ] Klient ACK co 64 kB received

### server.ts integration

- [ ] `server.ts` dopięte: `attachUpgradeRouter(httpServer, {next})` po `app.prepare()`
- [ ] SIGTERM handler: `manager.killAll()` + `log.flush()` + `server.close()`

### UI: Terminal component

- [ ] `app/(ui)/terminal/Terminal.tsx` — xterm instance, addon-fit, addon-web-links, addon-canvas
- [ ] `hooks/use-pty.ts` — otwiera WS, wysyła `spawn`, subscribe data, send input
- [ ] Resize: ResizeObserver + debounce 100 ms → `fit()` → `{type:"resize", cols, rows}`
- [ ] Theme: dopasowany do shadcn (neutral base)
- [ ] Copy/paste: Ctrl+Shift+C/V (niekoliduje z claude CLI)
- [ ] Prompt: "new terminal" button → otwiera PTY z `$SHELL` w `$HOME`
- [ ] "Terminal zamknięty" placeholder gdy PTY exit

### Testy

- [ ] `tests/integration/pty-channel.test.ts` — ws client spawn + data + kill, bez zombie po kill
- [ ] `tests/integration/pty-backpressure.test.ts` — spawn `yes`, klient nie ACK, server pauzuje przy 1 MB, po ACK resume
- [ ] `tests/integration/pty-origin.test.ts` — WS z wrong Origin → 403 (socket destroyed)
- [ ] `tests/integration/pty-auth.test.ts` — bez cookie → close 4401
- [ ] `tests/e2e/phase-4-smoke.spec.ts`:
  - otwieram "new terminal"
  - widzę prompt `$ ` lub `bartek@host$`
  - wpisuję `echo hello` + Enter
  - widzę `hello` < 100 ms
  - resize okna → `cols` zaktualizowany (poprzez `stty size` check)

## Security gate

- [ ] WS upgrade bez Origin → 403 (curl test z `-H 'Origin: http://evil.com'`)
- [ ] WS upgrade bez auth cookie → close 4401
- [ ] WS spawn z `cwd` poza `$HOME` → rejected (path-guard)
- [ ] `audit.log` zawiera spawn entries **bez** treści env (grep na `HOME=`, `PATH=`, `TOKEN=` → zero)
- [ ] SIGTERM na serwerze → wszystkie PTY killed (`ps -ef | grep bash` przed/po — brak zombie)
- [ ] Flow control: `yes` w PTY nie rośnie pamięć serwera > 50 MB (monitoring)
- [ ] Rate limit: 11ty spawn w 1 min → rejected z 429

## Deliverables

- `git tag phase-4-done`
- Screencast terminala w PR
- Integration + e2e zielone
