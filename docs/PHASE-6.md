# PHASE 6 — File watcher + live updates

**Cel**: chokidar obserwuje `~/.claude/projects/`, zmiany pushowane przez WebSocket do klientów, UI auto-refresh listy projektów/sesji i historii aktywnej sesji.

**Prerequisites**: fazy 0–5 (cała reszta infra).

## Checklist

### Watcher

- [ ] `tests/unit/watcher.test.ts` — event handlers: new project, new session, session updated
- [ ] `lib/watcher/chokidar.ts`:
  - singleton `chokidar.watch(CLAUDE_PROJECTS_DIR, {ignored, depth: 2, followSymlinks: false, awaitWriteFinish: {stabilityThreshold: 200}})`
  - EventEmitter: `project-added`, `session-added`, `session-updated`
  - debounce 200 ms per plik dla `change` (bo append JSONL triggeruje wiele eventów)
  - rate-limit: max 50 events/sec (batch)
- [ ] Restart watchera na błąd inotify (z logiem warn)
- [ ] Graceful stop na SIGTERM

### WS watch channel

- [ ] `tests/integration/watch-channel.test.ts` — append do JSONL, push otrzymany < 500 ms
- [ ] `lib/ws/watch-channel.ts` — klienci subskrybują, server pushuje `{type:"project-added", slug}`, `{type:"session-added", slug, sessionId}`, `{type:"session-updated", slug, sessionId}`
- [ ] Batch events w oknie 100 ms (max 50 events/push) — ochrona przed burst
- [ ] Auth: subscribe blocked bez cookie (shared auth z pty-channel)

### Client hook

- [ ] `hooks/use-watch.ts` — otwiera WS, subscribe na eventy, wywołuje `queryClient.invalidateQueries`:
  - `project-added` → invalidate `['projects']`
  - `session-added` → invalidate `['sessions', slug]`
  - `session-updated` → jeśli otwarta w Viewerze, doklej ogon przez streaming fetch na `Range: bytes=<old-size>-` (albo full invalidate jeśli stream zamknięty)
- [ ] Auto-reconnect na close (exponential backoff, max 30 s)

### UI

- [ ] Live indicator w sidebarze: kropka pulsująca jeśli sesja się aktualizuje
- [ ] Toast (shadcn) "New session in project X" przy `session-added`
- [ ] Follow mode w Viewerze domyślnie ON dla aktualizowanych sesji

### Testy

- [ ] `tests/integration/watch-channel.test.ts`:
  - append do fixture JSONL → push < 500 ms
  - utworzenie nowego katalogu projektu → push `project-added`
  - burst 1000 changes w 1 s → maksymalnie 10 push events (batch zadziałał)
- [ ] `tests/e2e/phase-6-smoke.spec.ts`:
  - otwarte UI, sidebar pokazuje 3 sesje
  - background: tworzę nową sesję (append JSONL w fixture)
  - UI pokazuje 4 sesje < 1 s, bez manual refresh

## Security gate

- [ ] Watcher **nie** eskaluje przez symlink: `ln -s /etc ~/.claude/projects/evil` → nie generuje events z `/etc`
- [ ] WS watch subscribe bez cookie → close 4401
- [ ] Burst 1000 changes/s nie zapycha WS (max 50/push, 10 push/s → 500/s max rate)
- [ ] Brak leakage treści JSONL w WS push (tylko metadane: slug, sessionId, nie full event)

## Deliverables

- `git tag phase-6-done`
- Screencast live update z background append
- Integration + e2e zielone
