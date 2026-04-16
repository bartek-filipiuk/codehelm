# PHASE 5 — Multi-tab terminal + spawn-in-project

**Cel**: wiele zakładek terminala jednocześnie, przełączanie bez utraty stanu, "new session w projekcie" → spawn `claude --resume <id>` lub `claude` w cwd projektu.

**Prerequisites**: faza 4 (pojedynczy terminal działa).

## Checklist

### State: multi-tab

- [ ] `stores/terminal-slice.ts` — Zustand: `tabs: Tab[]` (max 16), `activeTabId`, actions: open, close, focus, updateTitle
- [ ] `Tab` typ: `{id, projectSlug?, sessionId?, cwd, shell, createdAt}`
- [ ] Persystencja (opcjonalna, low-pri): reconnect do aktywnych PTY po reload

### UI: TabBar + TabManager

- [ ] `app/(ui)/terminal/TabBar.tsx` — chip per tab, active highlighted, close button, "+ new"
- [ ] `app/(ui)/terminal/TabManager.tsx` — wszystkie xterm instances w DOM, aktywna `visibility:visible`, nieaktywne `visibility:hidden` + `position:absolute` (nie display:none — broken fit)
- [ ] Dispose xterm + addon-webgl/canvas przy close tab (no leak)
- [ ] Middle-click na tab → close
- [ ] Ctrl+Tab / Ctrl+Shift+Tab → next/prev tab
- [ ] Ctrl+T → new tab w aktualnym projekcie (lub `$HOME` jeśli brak)

### Spawn-in-project API

- [ ] `tests/integration/sessions-new.test.ts` — POST `/api/sessions/new` z valid slug → spawn metadata, malicious slug → 400
- [ ] `app/api/sessions/new/route.ts` — POST z body `{slug: string, resumeSessionId?: string}`:
  - path-guard: `assertInside(CLAUDE_PROJECTS_DIR, decodedProjectPath)` (istnieje? jest dir?)
  - CSRF required
  - rate-limit check
  - zwraca `{tabId}` — UI otwiera nowy terminal z tym `tabId` i wysyła `spawn` WS z cwd = decoded path, command = `claude` lub `claude --resume <id>`
- [ ] Path-guard rozróżnia: slug projektu to `~/.claude/projects/<slug>/`, cwd spawn to decoded real path (np. `~/main-projects/foo`) — **dwa różne path-guards**

### UX na session list

- [ ] Przycisk "Open in terminal" na każdej sesji → open tab z `claude --resume <sessionId>` w cwd projektu
- [ ] Przycisk "New session" na projekcie → open tab z `claude` w cwd projektu
- [ ] Visual indicator: jaka zakładka jest powiązana z jakim projektem (chip na tab)

### Testy

- [ ] `tests/unit/terminal-slice.test.ts` — open/close/focus, max 16, active po close
- [ ] `tests/integration/sessions-new.test.ts` — path traversal w slug → 400, nieistniejący dir → 404, rate limit 429
- [ ] `tests/e2e/phase-5-smoke.spec.ts`:
  - otwieram 3 zakładki w różnych projektach
  - przełączam → każda zachowuje stan (pre-existing output)
  - zamykam środkową → pozostają 2, PTY killed (API `/api/pty/list`)
  - klik "open in terminal" na sesji → nowa zakładka z `claude --resume` (weryfikacja przez stty i process tree)
  - próba otwarcia 17tej → komunikat "Limit reached"

## Security gate

- [ ] `cwd` dla spawn-in-project walidowany przez `assertInside($HOME, resolvedPath)` (nie tylko istniejący, ale pod $HOME)
- [ ] CSRF wymagany na POST `/api/sessions/new` (tampered → 403)
- [ ] Rate limit 10 spawnów/min aktywny (11ty → 429)
- [ ] Tab close wysyła SIGHUP, po 5 s SIGKILL (test z procesem ignorującym SIGHUP: `trap '' HUP; sleep 100` → killed po 5 s)
- [ ] Dispose addon-webgl/canvas przy close (manual memory snapshot: 10 open+close cycles, RSS delta < 50 MB)
- [ ] PTY list endpoint auth-gated (sanity check)

## Deliverables

- `git tag phase-5-done`
- Screencast 3 tabs przełączania w PR
- Integration + e2e zielone
