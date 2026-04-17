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

- [x] **Goal:** toggle button "Preview" in editor header that splits
      the view 50/50: left CodeMirror, right rendered markdown (same
      renderer as assistant messages — react-markdown + rehype-sanitize).
- **Touch:** `app/(ui)/editor/MarkdownEditor.tsx`, reuse
  `components/conversation/Markdown.tsx`.
- **DoD:** toggle persists in settings store (bonus: per file type).
  Works with Ctrl+S. Playwright: toggle preview, confirm rendered
  header element.

### T12 — Toast notifications (shadcn Sonner)

- [x] **Goal:** replace silent "Saved" badges / inline error bars with
      a single toast system. Triggers: CLAUDE.md saved / conflict, alias
      updated, WS reconnect, tab kill.
- **Touch:** `pnpm add sonner`, mount `<Toaster />` in `Providers`,
  new `lib/ui/toast.ts` thin wrapper. Replace existing ad-hoc banners
  with toast calls.
- **DoD:** toasts show and auto-dismiss in 3 s, stack properly, screen
  reader announces them (`role="status"`).

### T13 — Conversation graph (effectful)

- [x] **Goal:** new viewer mode "Graph". Visualize a session as a DAG:
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

- [x] **Goal:** per-session and per-project estimated cost rollup based
      on `usage.input_tokens` / `usage.output_tokens` found in assistant
      events. Settings panel for per-model rates.
- **Touch:** `lib/jsonl/usage.ts` (extract usage blocks), new column
  in session list ("$X.XX"), aggregate in sidebar tooltip, settings
  entry for rates table with sensible defaults (Opus 4 / Sonnet 4 /
  Haiku 4 pricing).
- **DoD:** costs visible on session tile. Unit tests cover extraction
  from several event shapes (string content vs array content).

### T15 — Replay mode (effectful)

- [x] **Goal:** in Viewer, new button "Replay". Sessions plays back
      event-by-event with configurable speed (1x / 2x / 5x / "real-time
      between timestamps"). Useful for post-mortem review.
- **Touch:** `app/(ui)/conversation/Viewer.tsx` state machine, speed
  control, play/pause/scrub. Uses existing renderers — just animates
  revealing events in the Virtuoso list.
- **DoD:** starts from first event, pause works, scrubbing sets the
  revealed event count. Follow mode disabled while replay is active.

### T16 — Default event-category filters

- [x] **Goal:** persist which categories (user/assistant/tools/system)
      start hidden when a session is opened. Today user clicks chips every
      time; power users almost always want Tools off by default.
- **Touch:** extend `Settings` in `lib/settings/types.ts` with
  `hiddenCategories: EventCategory[]` (default `[]`), expose in
  `components/SettingsDialog.tsx` as a row of four toggles. Seed
  `hidden` in `Viewer.tsx` from settings on mount.
- **Logic:** settings is the canonical default; user can still toggle
  chips during the session without writing back (session-local override).
  Zod validates the array against the `EVENT_CATEGORIES` literal set.
- **DoD:** unit test for `applyDefaults` accepting + rejecting category
  names, SettingsDialog toggles write through, opening a new session
  respects the setting. No perf regression (initial state only).

### T17 — Timestamp display format

- [x] **Goal:** three formats for the small timestamp badge under each
      event: `relative` ("2 min temu"), `iso` ("2026-04-16T12:00:00Z"),
      `local` ("14:00:05", 24h). Chosen in Settings.
- **Touch:** new `lib/jsonl/format-timestamp.ts` with pure function
  `formatTimestamp(iso, mode, now)`. Extend `Settings` with
  `timestampFormat`. Use it in `components/conversation/messages.tsx`
  wherever a `<time>` is rendered.
- **Logic:** relative uses `Intl.RelativeTimeFormat('pl')`. ISO passes
  through. Local uses `toLocaleTimeString` with `hour12: false`.
  Invalid input returns empty string (no throw).
- **DoD:** unit tests cover all three modes + invalid input. Settings
  toggle visibly changes existing session without reload.

### T18 — Project grouping by path prefix

- [x] **Goal:** sidebar toggle "Flat / By folder". Grouped view collapses
      projects by first path segment under `$HOME` (e.g. `main-projects/`,
      `client-projects/`, `experiments/`). Pinned (favorite) projects stay
      at the very top as their own group.
- **Touch:** `app/(ui)/sidebar/ProjectList.tsx`, `stores/ui-slice.ts`
  (add `projectGrouping: 'flat' | 'prefix'`, persisted via
  `patchLayout`). New helper `lib/projects/group-by-prefix.ts`.
- **Logic:** group key derived from `resolvedCwd` relative to `$HOME`;
  null/absent cwd → "Inne". Group header shows count and collapses
  on click (localStorage per-group open state). Within a group the
  existing sort mode applies.
- **DoD:** unit test for the grouper (3 scenarios incl. no-cwd), toggle
  persists across restart, favorites pinning still works regardless
  of grouping mode.

### T19 — Terminal quick-actions row

- [x] **Goal:** narrow row above the active `<Terminal />` with buttons
      for predefined shell commands (global preset in Settings). Click
      types the command into the PTY and submits it.
- **Touch:** new `app/(ui)/terminal/QuickActions.tsx`, `Settings` gains
  `terminalQuickActions: { label: string, command: string }[]` with
  defaults (`git status`, `git log --oneline -10`, `pnpm test`,
  `pnpm dev`). Settings dialog row for editing the list (add / remove
  / reorder).
- **Logic:** action dispatch goes through the existing PTY write path
  of the active tab — buttons disabled when PTY status != `ready`.
  Command is plain text ending with `\r` so shell executes it.
- **DoD:** unit test for the reducer that edits the action list. E2E
  smoke (no new Playwright unless trivial): manual verification that
  clicking "git status" runs it. Buttons hidden when no tabs open.

### T20 — Parent tool_use popover

- [x] **Goal:** clicking anywhere inside a rendered `tool_result`
      opens a small popover showing the linked `tool_use` (tool name +
      args, pretty-printed JSON, wrapped). Closes on outside click / Esc.
- **Touch:** `components/conversation/messages.tsx` — wrap the existing
  ToolResult renderer in `@radix-ui/react-popover`. Use the already-built
  `buildToolUseRegistry`. Lazy-render popover content on open.
- **Logic:** if the registry has no parent (orphaned result), popover
  shows a disabled state "Brak powiązanego tool_use". Arg rendering
  truncates at 10 kB with "show more".
- **DoD:** popover opens on click, renders args, closes on Esc. Unit
  test for the registry lookup fallback. No perf hit during scroll
  (content only mounts on open).

### T21 — Diff-before-save in CLAUDE.md editor

- [x] **Goal:** in the editor header, a "Pokaż diff" button opens a
      modal showing the colored diff between current buffer and what's on
      disk. Save button inside the modal confirms the write.
- **Touch:** `app/(ui)/editor/MarkdownEditor.tsx`, reuse existing
  `components/conversation/DiffView.tsx` from T10. Fetch disk content
  through the already-returned `GET /api/claude-md` payload.
- **Logic:** diff computed only on button click (pure compute, cached
  until buffer changes). If no changes, modal shows "Brak zmian" and
  Save is disabled.
- **DoD:** modal renders hunks for a 100-line file, Ctrl+S still saves
  without opening modal, Save inside modal triggers the same PUT path.
  Unit test for "no changes" state.

### T22 — Recent CLAUDE.md files dropdown

- [x] **Goal:** dropdown in editor header listing last 10 opened
      CLAUDE.md paths (mixed global + per-project). Click opens that file
      in the editor.
- **Touch:** new `lib/ui/recent-files.ts` (localStorage-backed, key
  `claude-ui:recent-md`, capped at 10). Hook `use-recent-files.ts`.
  `MarkdownEditor.tsx` header gains a compact Select.
- **Logic:** open pushes to front, duplicates collapse, LRU trim. Paths
  stored as `{ kind: 'global' | 'project', slug?: string, label }`.
  Dropdown hidden if list is empty.
- **DoD:** opening 3 files populates list in LRU order, restart keeps
  them, click re-opens. Unit test for the LRU reducer (push + trim).

### T23 — Git branch badge in terminal header

- [x] **Goal:** show current branch + dirty flag next to the cwd in
      terminal header (e.g. `main●` for dirty, `main` for clean). Fetched
      once per tab open, refresh on manual click of the badge.
- **Touch:** new `/api/git/status` (query param `cwd`, path-guarded to
  `$HOME`, rate-limited 30/min), runs `git rev-parse --abbrev-ref HEAD`
  - `git status --porcelain -z --untracked-files=no` with a 2 s timeout.
    `Terminal.tsx` header fetches on mount. Not inside a repo → badge
    hidden.
- **Logic:** endpoint returns `{ branch: string | null, dirty: boolean }`.
  No polling. Errors swallowed to null → badge hidden. Command uses
  `child_process.execFile` (array args), never shell.
- **DoD:** badge shows in a repo tab, hidden outside a repo, click
  refreshes within 500 ms. Integration test for the endpoint (happy
  path + path outside $HOME → 403 + timeout → 504). No background work.

### T24 — Platform helpers + macOS shell/paths plumbing

- [x] **Goal:** centralize OS differences in a single module so launcher,
      PTY and installer never branch on `process.platform` inline. Ship
      macOS parity for shell default, runtime directory and Chromium path.
- **Touch:** new `lib/server/platform.ts`; `bin/claude-ui` (XDG/tmpdir
  - chromium lookup); `lib/pty/spawn.ts` (resolveShell). Don't touch
    `lib/server/audit.ts` (mode 0700 already portable across Unix).
- **Logic:** `defaultShell()` returns `$SHELL` if it exists and starts
  with `/`, else `/bin/zsh` on darwin or `/bin/bash` on linux — never
  invokes a sub-shell. `runtimeRootDir()` tries `$XDG_RUNTIME_DIR` →
  `$TMPDIR` → `os.tmpdir()` and passes the result through `fs.realpath`
  before returning. `chromiumCandidates()` returns ordered paths per
  `process.platform`; on darwin: `/Applications/Google Chrome.app/
Contents/MacOS/Google Chrome`, `/Applications/Chromium.app/...`,
  `/Applications/Arc.app/...`; on linux: `chromium`, `chromium-browser`,
  `google-chrome-stable`, `google-chrome`. Discovery must `fs.accessSync
(X_OK)` each candidate; no blind spawn.
- **DoD:** unit tests in `tests/unit/server/platform.test.ts` cover 6
  scenarios (shell fallback per OS, runtime dir with/without XDG/TMPDIR,
  chromium candidates per OS, accessSync filtering). No `shell: true`
  introduced anywhere. Path-guard fuzz (100 payloads) still green.
  Manual Linux smoke: unchanged startup. Document assumption: Windows
  is not a target — installer (T26) will hard-fail on win32.

### T25 — node-pty macOS prebuild path

- [ ] **Goal:** `pnpm install --frozen-lockfile` succeeds on Linux,
      macOS arm64 and macOS x86_64 without invoking node-gyp. Supply-chain
      safe: no new postinstall scripts, lockfile integrity preserved.
- **Touch:** `package.json`, `pnpm-lock.yaml`, optionally
  `lib/pty/spawn.ts` (imports) if API drift.
- **Logic:** Plan A — `pnpm update @homebridge/node-pty-prebuilt-
multiarch@latest`, verify `node_modules/@homebridge/.../prebuilds/`
  lists `darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64`. Plan
  B (preferred if A misses darwin): switch to `node-pty@1.0.0`
  (Microsoft upstream, prebuilt for all four). API is 95% compatible:
  `IPty.onData`, `onExit`, `resize`, `kill` unchanged; adjust imports
  only if TS types shift. `onlyBuiltDependencies` stays — no arbitrary
  postinstall escape hatch.
- **DoD:** `pnpm audit --production` zero high/critical. Existing
  `tests/integration/pty/*` pass unchanged. Lockfile committed with
  integrity hashes. New smoke test `tests/unit/pty/load.test.ts` that
  dynamic-imports the pty module inside try/catch — asserts the import
  resolves (doesn't invoke native load, so no platform dependency).
  Manual verification: fresh clone on Linux and macOS both reach ready
  PTY without compiling.

### T26 — `claude-ui install` Node-based installer

- [x] **Goal:** single-command setup for a fresh Linux or macOS system.
      `npx claude-ui-install` detects OS, verifies deps, builds, creates a
      symlink in `~/.local/bin/claude-ui` without ever running arbitrary
      shell strings or touching the user's shell rc.
- **Touch:** new `bin/install.ts` (ESM Node script, shebang `#!/usr/bin
/env node`); new `lib/install/checks.ts` (pure helpers: `detectOs`,
  `resolveHomeBinDir`, `needsPathUpdate`); add bin entry
  `"claude-ui-install": "bin/install.ts"` in `package.json`.
- **Logic (ordered, each step idempotent):**
  1. `process.platform` ∈ {linux, darwin}; else exit 1 with WSL note.
  2. Node version ≥ 20.11; else exit 1 suggesting `nvm install 20`.
  3. pnpm present? If not, `corepack enable` + `corepack prepare pnpm@9
--activate` via `spawnSync` with array args.
  4. `pnpm install --frozen-lockfile` (spawnSync, inherit stdio, 5 min
     timeout).
  5. Dry-load node-pty in try/catch; if fails, print repair hint and
     exit 1.
  6. `chromiumCandidates()` from T24 — info about first hit or a
     "install Chrome/Chromium before running" note. Do not hard-fail.
  7. `pnpm build` (next build + postbuild copies `server.ts` into
     standalone). Skippable with `--skip-build`.
  8. `mkdir -p ~/.local/bin` mode 0700. Create symlink
     `~/.local/bin/claude-ui` → repoRoot + `/bin/claude-ui` using
     `fs.symlinkSync`. Refuse if target exists and is not already a
     matching symlink (never clobber).
  9. PATH check: if `~/.local/bin` not in `$PATH`, print shell-specific
     instruction to add it — never edit shell rc.
- **Flags:** `--dry-run` (print plan, no writes), `--help`, `--skip-
build`, `--no-symlink`.
- **Security:** every `spawnSync` uses `{shell: false}` with array args,
  explicit timeouts; no `exec()`. Symlink target resolved via
  `fs.realpath` and verified to point inside the repo. No env
  variables or tokens are logged — only step markers and final summary.
- **DoD:** unit tests in `tests/unit/install/*` cover `detectOs`
  (linux/darwin/win32-throw), `resolveHomeBinDir`, `needsPathUpdate` (3
  scenarios), and symlink-guard (refuses regular file, accepts new or
  matching symlink). `rg -e 'shell:\s*true' bin/ lib/install/` = 0.
  `--dry-run` on Linux and macOS prints a plan and exits 0 without
  filesystem writes.

### T27 — Rip Polish UI strings → English

- [x] **Goal:** replace all ~140 Polish UI strings in JSX with English
      equivalents. No i18n library introduced. Regression-guard test
      prevents Polish diacritics from re-entering the codebase.
- **Touch (15 UI files):** `app/(ui)/sidebar/{ProjectList,Search}.tsx`;
  `app/(ui)/session-explorer/{SessionList,ProjectHeader}.tsx`;
  `app/(ui)/conversation/{Viewer,Outline,StatsBar,ReplayBar,MainPanel}
.tsx`; `app/(ui)/terminal/{TabBar,Terminal}.tsx`;
  `app/(ui)/editor/MarkdownEditor.tsx`;
  `components/{CommandPalette,HelpOverlay,SettingsDialog}.tsx`;
  `lib/jsonl/format-timestamp.ts` (switch `Intl.RelativeTimeFormat`
  locale to `'en'`); `app/layout.tsx` (`<html lang="en">`); every
  toast call-site (`lib/ui/toast.ts` consumers).
- **Logic:** direct translation keeping a tight, friendly register.
  "Wybierz sesję z listy." → "Pick a session to start."; "Szukaj w
  sesji…" → "Search in session…"; "Pauza"/"Odtwarzaj" → "Pause"/
  "Play"; "Prędkość odtwarzania" → "Playback speed"; "Brak wywołań
  narzędzi." → "No tool calls."; "Zamknij zakładkę" → "Close tab";
  "Nowa zakładka" → "New tab"; "Limit 16 zakładek" → "16-tab limit
  reached"; "Zapisano bufor terminala" → "Terminal buffer saved";
  "Skróty klawiaturowe" → "Keyboard shortcuts"; plural `{n} sesji` →
  `{n} sessions` (English allows simple -s; accept the corner case of
  "1 sessions" for now — fix with Intl.PluralRules later if needed).
- **Security:** no new string reaches `dangerouslySetInnerHTML`,
  `innerHTML`, or `document.write`. Toasts use `sonner` which
  text-escapes by default — still verify no HTML markup is passed.
- **DoD:** `rg -e '[ąćęłńóśźż]' app/ components/` returns 0 matches.
  All 408+ unit tests green (component tests asserting Polish labels
  get updated together). New `tests/unit/i18n/no-polish.test.ts`
  programmatically greps the codebase and fails on any match — acts
  as a CI guard-rail. Snapshots (if any) updated deliberately.

### T28 — Translate Polish code comments to English

- [ ] **Goal:** remove every Polish-language comment from the
      codebase so maintainers who don't read Polish can still reason
      about the code.
- **Touch:** every file surfaced by `rg -e '[ąćęłńóśźż]' lib/ tests/
hooks/ stores/ app/api` whose match falls inside a `//` or `/** */`
  comment. Starting set from audit: `lib/security/host-check.ts`,
  `tests/e2e/phase-2-smoke.spec.ts` (≈11 comments total).
- **Logic:** translations keep the _reason_ not a line-by-line gloss.
  When a comment merely restates the code, delete it. Do not touch
  code identifiers or logic.
- **Security:** `git diff` review before commit: confirm only comment
  lines changed. Any code change inside this task is a bug and must
  be pulled into a separate commit with its own tests.
- **DoD:** `rg -e '[ąćęłńóśźż]' lib/ tests/ hooks/ stores/ app/api`
  returns 0 matches. `pnpm typecheck && pnpm lint && pnpm test:unit`
  still green.

### T29 — Update README + docs + platform metadata

- [ ] **Goal:** public documentation in English, accurately reflects
      Linux + macOS support and the Node-based installer.
- **Touch:** `README.md` (notably line 174 "macOS out of scope");
  `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/PHASE-0.md` …
  `docs/PHASE-7.md` (translate any Polish fragments found);
  `CLAUDE.md` (repo-level — only the project instructions, not any
  user-specific language preferences).
- **Logic:** remove "macOS out of scope for v1"; add "Platform
  support: Linux + macOS. Windows: use WSL." Install section uses
  `npx claude-ui-install` with a manual-clone fallback (`git clone`
  - `node bin/install.ts`). Never suggest `curl ... | bash` from
    unofficial sources.
- **Security:** no live tokens, credentials, or internal URLs in
  examples. Install instructions must route through npm/pnpm or a
  reviewed script — no shell one-liners from untrusted hosts.
- **DoD:** `rg -e '[ąćęłńóśźż]' README.md docs/` returns 0 matches.
  Full README read-through is accurate: clone → install → run works
  on a fresh machine. No dangling Polish references in user-facing
  docs. Cross-cutting security gates from `PLATFORM_I18N_PLAN.md`
  (audit, CSP, Host/Origin, rate limits, profile mode 0700) all
  green before this task closes.

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
