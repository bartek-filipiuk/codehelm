# PHASE 6 — File watcher + live updates

**Goal**: chokidar watches `~/.claude/projects/`, changes are pushed to clients over WebSocket, and the UI auto-refreshes the project/session list and the active session history.

**Prerequisites**: phases 0–5 (everything else in infra).

## Checklist

### Watcher

- [ ] `tests/unit/watcher.test.ts` — event handlers: new project, new session, session updated
- [ ] `lib/watcher/chokidar.ts`:
  - singleton `chokidar.watch(CLAUDE_PROJECTS_DIR, {ignored, depth: 2, followSymlinks: false, awaitWriteFinish: {stabilityThreshold: 200}})`
  - EventEmitter: `project-added`, `session-added`, `session-updated`
  - 200 ms debounce per file for `change` events (a JSONL append triggers multiple inotify events)
  - rate-limit: max 50 events/sec (batch)
- [ ] Restart the watcher on an inotify error (with a warn log)
- [ ] Graceful stop on SIGTERM

### WS watch channel

- [ ] `tests/integration/watch-channel.test.ts` — append to a JSONL, push arrives in < 500 ms
- [ ] `lib/ws/watch-channel.ts` — clients subscribe, server pushes `{type:"project-added", slug}`, `{type:"session-added", slug, sessionId}`, `{type:"session-updated", slug, sessionId}`
- [ ] Batch events in a 100 ms window (max 50 events/push) — burst protection
- [ ] Auth: subscribe blocked without a cookie (shared auth with `pty-channel`)

### Client hook

- [ ] `hooks/use-watch.ts` — opens the WS, subscribes to events, calls `queryClient.invalidateQueries`:
  - `project-added` → invalidate `['projects']`
  - `session-added` → invalidate `['sessions', slug]`
  - `session-updated` → if the session is open in the Viewer, attach the tail via a range streaming fetch (`Range: bytes=<old-size>-`), else full invalidate
- [ ] Auto-reconnect on close (exponential backoff, max 30 s)

### UI

- [ ] Live indicator in the sidebar: pulsing dot when the session is being updated
- [ ] Toast (shadcn) "New session in project X" on `session-added`
- [ ] Follow mode in the Viewer on by default for sessions being updated

### Tests

- [ ] `tests/integration/watch-channel.test.ts`:
  - append to a fixture JSONL → push < 500 ms
  - create a new project dir → push `project-added`
  - burst 1000 changes in 1 s → at most 10 push events (batch kicked in)
- [ ] `tests/e2e/phase-6-smoke.spec.ts`:
  - UI open, sidebar shows 3 sessions
  - background: create a new session (append to JSONL in the fixture)
  - UI shows 4 sessions in < 1 s without a manual refresh

## Security gate

- [ ] Watcher **does not** escape via symlink: `ln -s /etc ~/.claude/projects/evil` → no events generated from `/etc`
- [ ] WS watch subscribe without a cookie → close 4401
- [ ] A burst of 1000 changes/s does not flood WS (max 50/push × 10 push/s → 500/s max rate)
- [ ] No JSONL content leakage in WS pushes (metadata only: slug, sessionId — never the full event)

## Deliverables

- `git tag phase-6-done`
- Screencast of a live update after a background append
- Integration + e2e green
