# PHASE 4 — WebSocket + node-pty + xterm (single terminal)

**Goal**: a single terminal tab in the UI. WebSocket works, a PTY spawns from `$SHELL`, xterm.js renders, flow control prevents OOM on fast output.

**Prerequisites**: phases 0–3 (auth, JSONL, UI layout).

## Checklist

### PTY infrastructure

- [ ] `tests/unit/pty/manager.test.ts` — cap 16, 17th rejected, rate limit 10/min, 1 MB backpressure
- [ ] `lib/pty/manager.ts` — singleton `Map<id, {pty, cwd, shell, unacked, paused}>`, methods `spawn`, `write`, `resize`, `kill`, `list`
- [ ] `lib/pty/spawn.ts` — resolve `$SHELL` (fallback `/bin/bash`), path-guard cwd, node-pty wrapper
- [ ] `lib/pty/audit.ts` — append a JSON line to `~/.claude/claude-ui/audit.log`: `{ts, event, id, pid, cwd, shell, cols, rows}` — **not** env, **not** content
- [ ] Audit log file mode 0600, parent dir 0700

### WebSocket transport

- [ ] `lib/ws/server.ts` — `attachUpgradeRouter(http.Server, {next})` — routes `/_next/webpack-hmr` to Next HMR, `/api/ws/pty` to `pty-channel`, `/api/ws/watch` to `watch-channel`
- [ ] Origin check on every upgrade: `req.headers.origin === 'http://127.0.0.1:PORT'`, otherwise `socket.destroy()`
- [ ] Auth: cookie read from `req.headers.cookie` + safeCompare against the server token
- [ ] CSRF: the first client message after open must carry the current CSRF token, otherwise close 1008
- [ ] `lib/ws/pty-channel.ts` — protocol: `{type: "spawn" | "data" | "resize" | "kill" | "ack"}`
- [ ] Flow control: server sends chunks of at most 64 kB, counts `unacked`; when `unacked > 1 MB` → `pty.pause()`, resume on client ACK
- [ ] Client ACKs every 64 kB received

### server.ts integration

- [ ] `server.ts` wires `attachUpgradeRouter(httpServer, {next})` after `app.prepare()`
- [ ] SIGTERM handler: `manager.killAll()` + `log.flush()` + `server.close()`

### UI: Terminal component

- [ ] `app/(ui)/terminal/Terminal.tsx` — xterm instance, addon-fit, addon-web-links, addon-canvas
- [ ] `hooks/use-pty.ts` — opens the WS, sends `spawn`, subscribes to data, sends input
- [ ] Resize: ResizeObserver + 100 ms debounce → `fit()` → `{type:"resize", cols, rows}`
- [ ] Theme tuned to shadcn (neutral base)
- [ ] Copy/paste: Ctrl+Shift+C / Ctrl+Shift+V (no collision with the claude CLI)
- [ ] Prompt: "new terminal" button → spawn a PTY with `$SHELL` in `$HOME`
- [ ] "Terminal closed" placeholder once the PTY exits

### Tests

- [ ] `tests/integration/pty-channel.test.ts` — ws client spawn + data + kill, no zombies after kill
- [ ] `tests/integration/pty-backpressure.test.ts` — spawn `yes`, client does not ACK, server pauses at 1 MB, resumes on ACK
- [ ] `tests/integration/pty-origin.test.ts` — WS with wrong Origin → 403 (socket destroyed)
- [ ] `tests/integration/pty-auth.test.ts` — no cookie → close 4401
- [ ] `tests/e2e/phase-4-smoke.spec.ts`:
  - open "new terminal"
  - see a prompt `$ ` or `bartek@host$`
  - type `echo hello` + Enter
  - see `hello` < 100 ms later
  - resize the window → `cols` updates (verified via `stty size`)

## Security gate

- [ ] WS upgrade without Origin → 403 (curl test with `-H 'Origin: http://evil.com'`)
- [ ] WS upgrade without auth cookie → close 4401
- [ ] WS spawn with `cwd` outside `$HOME` → rejected (path-guard)
- [ ] `audit.log` contains spawn entries **without** env content (grep for `HOME=`, `PATH=`, `TOKEN=` → zero)
- [ ] SIGTERM on the server → all PTYs killed (`ps -ef | grep bash` before/after — no zombies)
- [ ] Flow control: `yes` in a PTY does not push server memory above 50 MB (monitored)
- [ ] Rate limit: 11th spawn within 1 min → rejected with 429

## Deliverables

- `git tag phase-4-done`
- Screencast of the terminal in the PR
- Integration + e2e green
