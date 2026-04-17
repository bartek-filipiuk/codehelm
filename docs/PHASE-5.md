# PHASE 5 — Multi-tab terminal + spawn-in-project

**Goal**: multiple terminal tabs side by side, switching without losing state, and "new session in project" → spawn `claude --resume <id>` or `claude` in the project's cwd.

**Prerequisites**: phase 4 (single terminal working).

## Checklist

### State: multi-tab

- [ ] `stores/terminal-slice.ts` — Zustand: `tabs: Tab[]` (max 16), `activeTabId`, actions: open, close, focus, updateTitle
- [ ] `Tab` type: `{id, projectSlug?, sessionId?, cwd, shell, createdAt}`
- [ ] Persistence (optional, low-pri): reconnect to live PTYs after reload

### UI: TabBar + TabManager

- [ ] `app/(ui)/terminal/TabBar.tsx` — chip per tab, active highlighted, close button, "+ new"
- [ ] `app/(ui)/terminal/TabManager.tsx` — every xterm instance stays in the DOM; active `visibility:visible`, inactive `visibility:hidden` + `position:absolute` (not `display:none` — that breaks `fit()`)
- [ ] Dispose xterm + addon-webgl/canvas on tab close (no leak)
- [ ] Middle-click a tab → close
- [ ] Ctrl+Tab / Ctrl+Shift+Tab → next/prev tab
- [ ] Ctrl+T → new tab in the current project (or `$HOME` if none)

### Spawn-in-project API

- [ ] `tests/integration/sessions-new.test.ts` — POST `/api/sessions/new` with a valid slug → spawn metadata; malicious slug → 400
- [ ] `app/api/sessions/new/route.ts` — POST with body `{slug: string, resumeSessionId?: string}`:
  - path-guard: `assertInside(CLAUDE_PROJECTS_DIR, decodedProjectPath)` (exists? is a dir?)
  - CSRF required
  - rate-limit check
  - returns `{tabId}` — the UI opens a new terminal with that `tabId` and sends a `spawn` WS message with cwd = decoded path, command = `claude` or `claude --resume <id>`
- [ ] Path-guard distinguishes: the project slug maps to `~/.claude/projects/<slug>/`, but the spawn cwd is the decoded real path (e.g. `~/main-projects/foo`) — that's **two separate path-guards**

### UX on the session list

- [ ] "Open in terminal" button on each session → opens a tab running `claude --resume <sessionId>` in the project cwd
- [ ] "New session" button on a project → opens a tab running `claude` in the project cwd
- [ ] Visual indicator: which tab belongs to which project (chip on the tab)

### Tests

- [ ] `tests/unit/terminal-slice.test.ts` — open/close/focus, max 16, active reshuffles correctly after close
- [ ] `tests/integration/sessions-new.test.ts` — path traversal in slug → 400, non-existent dir → 404, rate limit 429
- [ ] `tests/e2e/phase-5-smoke.spec.ts`:
  - open 3 tabs across different projects
  - switch → each keeps its state (pre-existing output)
  - close the middle one → 2 remain, PTY killed (API `/api/pty/list`)
  - click "open in terminal" on a session → new tab running `claude --resume` (verified via `stty` and process tree)
  - try to open a 17th tab → "Limit reached" message

## Security gate

- [ ] `cwd` for spawn-in-project validated by `assertInside($HOME, resolvedPath)` (not just "exists" — must live under `$HOME`)
- [ ] CSRF required on POST `/api/sessions/new` (tampered → 403)
- [ ] Rate limit 10 spawns/min active (11th → 429)
- [ ] Tab close sends SIGHUP, then SIGKILL after 5 s (test with a process ignoring SIGHUP: `trap '' HUP; sleep 100` → killed after 5 s)
- [ ] Dispose addon-webgl/canvas on close (manual memory snapshot: 10 open+close cycles, RSS delta < 50 MB)
- [ ] PTY list endpoint auth-gated (sanity check)

## Deliverables

- `git tag phase-5-done`
- Screencast of 3 tabs switching in the PR
- Integration + e2e green
