# TASKS — autonomous overnight queue

This file is the worklist for the nightly scheduler. The agent reads it
top-to-bottom, picks the first task with `[ ]`, implements it fully
(code + tests), marks it `[x]`, commits, and pushes. Next run picks the
next `[ ]`. Never reorder or delete tasks — only check them off.

**Ground rules for each run**

- Hard budget: 1 hour wall-clock per scheduler firing. If a task exceeds
  it, commit partial progress under a `wip/T##` branch and leave the
  checkbox unchecked with a note.
- All green: `pnpm typecheck && pnpm lint && pnpm test:unit` must pass
  before committing. E2E is nice-to-have, not blocking.
- Don't break phase-7-done invariants: no emoji in user-facing text,
  security controls stay, Polish UI strings preserved.
- Conventional commit message: `feat(area): T## title` or `fix(area): ...`.
- After commit: `git push origin main`.
- Mark the checkbox only after successful push.

---

## Queue

### T01 — Resolve-cwd fallback for legacy projects

- [x] **Goal:** projects without a sniffable `resolvedCwd` still let
  the user open `+ claude` / `+ shell`. Today 24/54 real projects
  return `no_resolved_cwd` → 409.
- **Touch:** `lib/jsonl/index.ts` (`listProjects`, new helper
  `inferCwdFromSlug`), `app/api/sessions/new/route.ts`.
- **Logic:** if sniff returns null, try `decodeSlugToDisplayPath(slug)`,
  `fs.realpath` it, check it's a dir **and** strictly under `$HOME`.
  Only then use as fallback cwd. Never traverse symlinks outside $HOME.
- **DoD:** new unit tests in `tests/unit/jsonl/index.test.ts` cover
  (a) sniff hit wins, (b) sniff miss + real dir fallback, (c) sniff
  miss + dir outside $HOME stays null. Manual check: `curl /api/projects`
  shows resolvedCwd for most previously-null projects.

### T02 — Resizable panel columns

- [x] **Goal:** drag borders between sidebar / sessions / viewer.
  Widths persist in `localStorage` under `claude-ui:layout`.
- **Touch:** `app/page.tsx`, new `components/layout/ResizableColumns.tsx`
  (pure CSS grid + pointer events, no new deps).
- **Logic:** two draggable splitters, min widths (sidebar 200, sessions
  240, viewer 400), double-click splitter resets to defaults.
- **DoD:** widths survive reload, drag works with mouse + keyboard
  (Arrow Left/Right when splitter focused). Phase-2 e2e still green.

### T03 — Favorites / pin projects

- [x] **Goal:** star projects, pinned ones render on top of the sidebar
  regardless of last-activity sort.
- **Touch:** extend `lib/aliases/io.ts` to a generic
  `lib/projects/meta.ts` storing `{ alias?: string, favorite?: boolean }`.
  New endpoint `/api/projects/meta` (GET, PATCH), replaces current
  `/api/projects/aliases` — keep the old route temporarily and proxy.
  Sidebar row: star icon on left, click toggles.
- **DoD:** star persists across restart, pinned sort works, existing
  aliases survive migration (write a one-shot loader that folds
  `aliases.json` into the new format on first read).

### T04 — Sort toggle in sidebar

- [x] **Goal:** dropdown in sidebar header: "Last activity" (default) /
  "Name" (alias or path) / "Session count".
- **Touch:** `app/(ui)/sidebar/ProjectList.tsx`, small `Select`
  component in `components/ui/select.tsx` (Radix-based if not present —
  otherwise native `<select>` styled).
- **Logic:** sort config in `stores/ui-slice.ts`, persisted via same
  localStorage key as layout.
- **DoD:** switching sort reorders list instantly, favorites still pin
  on top. Add unit test for the sort comparator (3 scenarios).

### T05 — Keyboard shortcuts overlay

- [x] **Goal:** press `?` anywhere → modal listing all shortcuts.
- **Touch:** new `components/HelpOverlay.tsx`, register in
  `components/providers.tsx`. Dialog via Radix (`@radix-ui/react-dialog`
  already installed).
- **Content:** `?` help, `Ctrl+S` save CLAUDE.md, `Ctrl+K` command
  palette (coming in T06), `Ctrl+T` new shell tab, `/` focus sidebar
  search, `g g` top of viewer, `G` bottom, `Esc` close dialog.
- **DoD:** `?` toggles overlay globally except inside inputs. Unit test
  for the key handler (mocked addEventListener).

### T06 — Command palette (Ctrl+K)

- [x] **Goal:** power-user switcher. Cmd shows recent projects, all
  projects by alias, "New shell in current project", "Open CLAUDE.md
  (global)", "Open CLAUDE.md (current project)", "Close current tab".
- **Touch:** `components/ui/command.tsx` is already shadcn `cmdk` — wrap
  it in a dialog trigger. New `components/CommandPalette.tsx`.
- **Logic:** Ctrl+K / Cmd+K opens. Fuzzy filter built into cmdk.
  Actions dispatch to existing stores/hooks.
- **DoD:** Ctrl+K opens, typing filters, Enter runs action, Esc closes.
  At least 6 actions wired. Playwright smoke: open palette, type
  "new shell", Enter, new tab appears.

### T07 — Session outline / minimap

- [x] **Goal:** narrow column right of the viewer showing a marker per
  event (colored by category, height ≈ content length). Click jumps.
- **Touch:** new `app/(ui)/conversation/Outline.tsx`, mount in `Viewer`
  next to `Virtuoso`. Virtuoso's `scrollToIndex` already accessible.
- **Visuals:** max 40 px wide; each marker a `div` with `min-height: 2px`,
  computed from log-scale of content bytes; hover shows preview tooltip
  (first 60 chars).
- **DoD:** scrolling the viewer highlights corresponding marker; click
  on marker centers that event in view. Works with category filters.

### T08 — Settings modal (fonts + density + theme)

- [x] **Goal:** single Settings dialog (gear icon top-right of sidebar
  header), writes `~/.claude/claude-ui/settings.json` (mode 0600 via
  new `lib/settings/io.ts`, atomic write).
- **Options:**
  - Viewer font size (xs / sm / md / lg)
  - Terminal font size (12 / 13 / 14 / 16 px)
  - Viewer density (compact / comfortable / spacious)
  - Theme (Dark / Darker / Solarized dark)
- **Touch:** `lib/settings/io.ts`, `/api/settings` (GET/PATCH, CSRF),
  `hooks/use-settings.ts`, `components/SettingsDialog.tsx`, apply via
  CSS variables on `<html>`.
- **DoD:** change persists across restart. Integration test for GET/PATCH.
  Viewer and Terminal visibly respect the new font size.

### T09 — Session stats bar

- [x] **Goal:** above the viewer, an expandable row showing: duration
  (first → last event), total tokens (sum from assistant events if
  `usage` present), top 5 tools by call count.
- **Touch:** new `app/(ui)/conversation/StatsBar.tsx`, computed from
  the already-loaded `events` array. No API changes.
- **Visuals:** collapsed row ~24 px tall with "2h 14min · 180 events
  · Bash(42) Read(18) …"; click expands to full breakdown.
- **DoD:** stats update as streaming completes. Unit test for the
  aggregator function.

### T10 — Diff-friendly tool_result for Edit/Write

- [x] **Goal:** when `tool_use.name` is `Edit`, `Write`, or
  `NotebookEdit`, render the paired `tool_result` as a colored diff
  (old → new) instead of raw stdout.
- **Touch:** `components/conversation/messages.tsx` (pair tool_use to
  subsequent tool_result via `tool_use_id`), new
  `components/conversation/DiffView.tsx` — use `diff` npm package.
- **DoD:** Edit calls show red/green hunks. Falls back to raw output
  when diff can't be computed. Added to Playwright smoke: open session
  containing an Edit, check diff classes present.

### T11 — Markdown preview in CLAUDE.md editor

- [ ] **Goal:** toggle button "Preview" in editor header that splits
  the view 50/50: left CodeMirror, right rendered markdown (same
  renderer as assistant messages — react-markdown + rehype-sanitize).
- **Touch:** `app/(ui)/editor/MarkdownEditor.tsx`, reuse
  `components/conversation/Markdown.tsx`.
- **DoD:** toggle persists in settings store (bonus: per file type).
  Works with Ctrl+S. Playwright: toggle preview, confirm rendered
  header element.

### T12 — Toast notifications (shadcn Sonner)

- [ ] **Goal:** replace silent "Saved" badges / inline error bars with
  a single toast system. Triggers: CLAUDE.md saved / conflict, alias
  updated, WS reconnect, tab kill.
- **Touch:** `pnpm add sonner`, mount `<Toaster />` in `Providers`,
  new `lib/ui/toast.ts` thin wrapper. Replace existing ad-hoc banners
  with toast calls.
- **DoD:** toasts show and auto-dismiss in 3 s, stack properly, screen
  reader announces them (`role="status"`).

### T13 — Conversation graph (effectful)

- [ ] **Goal:** new viewer mode "Graph". Visualize a session as a DAG:
  user messages are nodes on the main axis, assistant messages branch
  off, tool_use calls hang as leaves under their assistant node.
- **Touch:** new `app/(ui)/conversation/Graph.tsx` using `reactflow`
  (`pnpm add reactflow`) — pure client, lazy import. Extend MainPanel
  mode switcher to include "Graph". No backend changes.
- **Layout:** auto-layout via `elkjs` or `dagre` (pick smaller). Node
  styles mimic message wrappers (same color scheme). Click a node
  jumps viewer mode back to it.
- **DoD:** graph renders for a 200-event session in <1 s, pan/zoom
  works, node click switches to Viewer mode and scrolls there. Bundle
  impact noted in PR.

### T14 — Cost estimator (effectful)

- [ ] **Goal:** per-session and per-project estimated cost rollup based
  on `usage.input_tokens` / `usage.output_tokens` found in assistant
  events. Settings panel for per-model rates.
- **Touch:** `lib/jsonl/usage.ts` (extract usage blocks), new column
  in session list ("$X.XX"), aggregate in sidebar tooltip, settings
  entry for rates table with sensible defaults (Opus 4 / Sonnet 4 /
  Haiku 4 pricing).
- **DoD:** costs visible on session tile. Unit tests cover extraction
  from several event shapes (string content vs array content).

### T15 — Replay mode (effectful)

- [ ] **Goal:** in Viewer, new button "Replay". Sessions plays back
  event-by-event with configurable speed (1x / 2x / 5x / "real-time
  between timestamps"). Useful for post-mortem review.
- **Touch:** `app/(ui)/conversation/Viewer.tsx` state machine, speed
  control, play/pause/scrub. Uses existing renderers — just animates
  revealing events in the Virtuoso list.
- **DoD:** starts from first event, pause works, scrubbing sets the
  revealed event count. Follow mode disabled while replay is active.

---

## How the scheduler consumes this file

1. `cd /home/bartek/main-projects/claude-ui`
2. `git pull --rebase origin main`
3. Open this file, find first line matching `^- \[ \] \*\*T\d\d —`.
4. Read the task block through the next `### T` heading or EOF.
5. Implement code + tests to satisfy the DoD.
6. Run `pnpm typecheck && pnpm lint && pnpm test:unit`. If any fails,
   fix before proceeding.
7. `git add -A && git commit -m "<conventional message>" && git push`.
8. In this file, change the task line from `- [ ]` to `- [x]` and push
   a follow-up commit `chore: mark T## done`.
9. Exit.

If nothing unchecked remains: exit with a celebratory no-op commit
(optional) and leave a comment `All queued tasks complete — add more to
TASKS.md` in the scheduler run summary.
