# Design brief — codehelm

**Audience:** this file is written for [Claude Design](https://claude.com/plugins/design) (Opus 4.7). During onboarding Claude Design will read this repo and build a design system automatically; this brief tells it what to focus on, what to leave alone, and where every styled surface lives so the first pass is grounded in reality instead of wall-of-text discovery.

**One-line identity:** codehelm is a **local-only web UI for browsing and resuming Claude Code CLI sessions**, with an embedded multi-tab terminal and a `CLAUDE.md` editor. Everything runs on `127.0.0.1`, inside a dedicated Chromium `--app=` window, behind an ephemeral-token + HttpOnly cookie. Opens as a single SPA-style page — no routing, three mutually exclusive panels in the main area.

---

## 1. Design goals for this pass

What we want the redesign to achieve, in order:

1. **A cohesive visual identity** beyond "shadcn dark neutrals". Codehelm is a dev-tool brand: monospace-forward, amber-gold accent (from the new banner), terminal-native. Treat the amber as the single accent colour; pull it through states, focus rings, selected tabs, and the replay-mode affordance.
2. **Higher information density without noise** in the conversation viewer. The viewer is the central screen — a long virtualised list of heterogeneous events (9 types). Today every event uses its own card with a border. We want a calmer hierarchy that still lets search hits, tool results, diffs, and assistant markdown stand apart at a glance.
3. **A stronger sidebar**. Projects list can reach 50+ entries with grouping by folder and favorites pinned. Sort dropdown, grouping toggle, and per-project favorites + aliases all collide in the header today.
4. **Consistent modals and popovers**. Settings, Command Palette, Help Overlay, Diff-before-save, Parent-tool-use popover, Recent-files dropdown — they're functionally similar but visually drift.
5. **Terminal chrome that matches the rest of the app**. xterm output itself is off-limits, but the TabBar, QuickActions row, cwd/git-branch header, and Clear/Save/Restart buttons should read as part of the same system.
6. **Keep it fast**. Zero new webfonts downloaded at runtime (CSP-strict, no CDN). No animations that run on scroll. Virtualisation must still work.

Non-goals: we are not restructuring the app, not adding new features, not changing the three-mode switcher semantics, not redoing the CLI itself.

---

## 2. Constraints that cannot move

Security and platform constraints that shape the design space:

- **CSP is strict-dynamic + nonce**. No `unsafe-inline`, no CDN-hosted fonts, no remote images. Fonts must be bundled locally (today: system stack + `@xterm/xterm/css/xterm.css`).
- **Dark-only.** `<html lang="en" className="dark">` is hardcoded. Light theme is out of scope this pass.
- **Desktop-first.** Runs in a Chromium `--app=` window, so min-width is roughly 1200 px. Mobile breakpoints exist (Outline hides on `sm`) but are not a priority.
- **xterm output is unstyleable by us**. We control the surrounding chrome, not the terminal buffer.
- **CodeMirror theme is `@codemirror/theme-one-dark`** in MarkdownEditor. We can replace or re-theme it, but editor chrome (line numbers, gutter) comes from the theme package — coordinate any swap.
- **No emoji in user-facing strings** (existing convention — conventional commits, audit logs, aria labels).
- **English-only UI** — an i18n guard test fails CI if Polish diacritics land in `app/ components/ lib/ hooks/ stores/ tests/ docs/`.

---

## 3. Design system — current snapshot

### 3.1 Token layer

| Layer       | Where                                        | What it does                                                                                                                                      |
| ----------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tailwind v4 | `postcss.config.mjs` + `app/globals.css`     | Uses the v4 `@theme` directive inside `globals.css`; no separate `tailwind.config.js`                                                             |
| CSS vars    | `app/globals.css`                            | `--color-background: #0a0a0a`, `--color-foreground: #fafafa`, plus vars populated at runtime by SettingsApplier                                    |
| Settings    | `lib/settings/types.ts`                      | Enumerations for `viewerFontSize`, `terminalFontSize`, `viewerDensity`, `theme`, `timestampFormat`, `hiddenCategories`, `terminalQuickActions`    |
| Applier     | `components/SettingsApplier.tsx`             | Writes `--ui-viewer-font-size`, `--ui-terminal-font-size`, `--ui-viewer-pad`, `--ui-viewer-line-height`, and `data-theme` on `<html>`              |
| Providers   | `components/providers.tsx`                   | Wraps QueryClientProvider, TooltipProvider (delay 200 ms), SettingsApplier, WatcherSubscriber, HelpOverlay, CommandPalette, Toaster (sonner)     |
| Brand asset | `screens/banner.webp`                        | Amber gold `#d4a72c` on pure black `#080808`, monospace ANSI Shadow wordmark — this is the source of truth for the accent colour                 |

### 3.2 Color palette in use (today)

Pulled from Tailwind class usage across the component tree:

- **Surfaces:** `neutral-950` (page), `neutral-900` (cards, inputs), `neutral-800` (borders, hover chips, active tab), `neutral-700` (splitters), `neutral-600` (active tab border)
- **Text:** `neutral-100` (primary), `neutral-300` (secondary), `neutral-400` (tertiary / hover), `neutral-500` (captions), `neutral-600` (disabled)
- **Accents used ad-hoc today:**
  - `emerald-400/500` — diff added, "ready" status
  - `red-300/400/900` — errors, dirty badge
  - `purple-700/900/950` — replay mode chrome (override this for codehelm gold if Claude Design prefers a single accent)
  - `amber-300/400` — tool_use header, dirty indicator, some CTAs
  - `sky-300/900/950` — tool_result header
  - `blue-500` — splitter focus ring

Recommendation for the redesign: collapse `purple` (replay) and `amber` (tool_use) into a unified codehelm gold. Keep `emerald`/`red` for diff/error because they're semantic.

### 3.3 Font stacks

- **Prose (messages, UI labels):** `ui-sans-serif, system-ui, -apple-system, sans-serif`
- **Monospace (code blocks, terminal header, `<pre>`):** Tailwind `font-mono` default
- **Terminal buffer:** xterm.js internal, not our CSS
- **Syntax highlighting:** Shiki with `github-dark-default` theme — bundled, lazy-loaded per language
- **Markdown editor:** CodeMirror 6 with `@codemirror/theme-one-dark`

### 3.4 Sizes / radii

No formal scale today — it's ad-hoc Tailwind. Rough breakdown:

- Text: `text-[10px]` (badges), `text-[11px]` (captions), `text-xs` (sidebar), `text-sm` (messages), `text-md` (headings)
- Radii: `rounded-md` on most cards, `rounded-full` on chips, `rounded` (default) on small chrome
- Spacing: `px-3 py-2` cards, `px-4 py-3` headers, `gap-2`/`gap-3` most layouts
- Density multiplier: `--ui-viewer-pad` switches 0.25rem / 0.5rem / 0.875rem

### 3.5 Shape of user-visible chrome we control

Five modal primitives — they should share one visual system post-redesign:

1. **Dialog** (`components/ui/dialog.tsx`) — black overlay `bg-black/70`, centred panel, `border-neutral-800 bg-neutral-950 rounded-lg p-6`, fade-in-0 zoom-in-95
2. **Popover** (`components/ui/popover.tsx`) — `w-80 rounded-md border border-neutral-800 bg-neutral-950 p-3 text-xs`
3. **Tooltip** (`components/ui/tooltip.tsx`) — `border-neutral-800 bg-neutral-900 text-xs zoom-in-95`
4. **Command palette body** — uses cmdk inside a Dialog
5. **Sonner toasts** (`lib/ui/toast.ts`) — bottom-right, dark theme, 3000 ms, custom className

---

## 4. Component inventory (design-relevant files only)

File paths are relative to repo root. Line refs on the important ones.

### 4.1 Design-system primitives — `components/ui/`

| File                | Exposes                                                                          |
| ------------------- | -------------------------------------------------------------------------------- |
| `button.tsx`        | `Button` with CVA variants: `default / ghost / outline / secondary`, sizes `default / sm / icon` |
| `input.tsx`         | `Input` — single variant, `h-9 border-neutral-800 bg-neutral-900`                |
| `dialog.tsx`        | `Dialog*` Radix wrappers including `DialogContent` `hideClose` prop              |
| `command.tsx`       | `Command*` cmdk wrappers — palette primitives                                    |
| `select.tsx`        | Styled native `<select>`, `h-7 text-xs`                                          |
| `popover.tsx`       | `Popover*` Radix wrappers                                                        |
| `tooltip.tsx`       | `TooltipProvider` + `Tooltip*` wrappers                                          |
| `scroll-area.tsx`   | Radix ScrollArea — thumb `bg-neutral-700`                                        |
| `skeleton.tsx`      | Single shimmer, `bg-neutral-800 animate-pulse`                                   |

### 4.2 Global shell — `app/` and `components/`

| File                                 | Role                                                                                           |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `app/layout.tsx`                     | Root HTML (`lang="en" className="dark"`), body classes, provider mount, nonce reader           |
| `app/page.tsx`                       | Mounts `<ResizableColumns sidebar={…} sessions={…} viewer={<MainPanel />}>` — **THE** main page |
| `components/providers.tsx`           | All-in providers wrapper                                                                       |
| `components/SettingsApplier.tsx`     | Applies settings to CSS vars + `data-theme`                                                    |
| `components/SettingsDialog.tsx`      | Settings modal — rows for every setting (fonts, density, theme, timestamp, hidden categories, model pricing, terminal quick actions) |
| `components/CommandPalette.tsx`      | Cmd+K palette — recent + all projects, "new shell", "open CLAUDE.md", "close tab"              |
| `components/HelpOverlay.tsx`         | `?` overlay listing keyboard shortcuts                                                         |
| `components/layout/ResizableColumns.tsx` | Three-pane resize layout with keyboard-accessible splitters                                |

### 4.3 Sidebar (left pane) — `app/(ui)/sidebar/`

| File                                 | Role                                                                                           |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `app/(ui)/sidebar/Search.tsx`        | Debounced (150 ms) project-filter input                                                        |
| `app/(ui)/sidebar/ProjectList.tsx`   | Projects list with sort dropdown (activity/name/sessions), grouping toggle (flat/prefix), favorites pin, alias editing inline |

### 4.4 Session explorer (middle pane) — `app/(ui)/session-explorer/`

| File                                      | Role                                                                 |
| ----------------------------------------- | -------------------------------------------------------------------- |
| `app/(ui)/session-explorer/ProjectHeader.tsx` | Shows selected project + alias edit-in-place                     |
| `app/(ui)/session-explorer/SessionList.tsx`   | List of sessions with preview, size, msg count, mtime, per-session cost |

### 4.5 Conversation viewer (right pane) — `app/(ui)/conversation/`

| File                                 | Role                                                                                           |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `app/(ui)/conversation/MainPanel.tsx`| Mode switcher — viewer / terminal / editor. Owns the header with mode buttons                  |
| `app/(ui)/conversation/Viewer.tsx`   | Virtualised event list (react-virtuoso). Hosts search, filters, replay, jump-to-event input    |
| `app/(ui)/conversation/StatsBar.tsx` | Collapsible stats row above viewer: duration, token totals, top tool counts                    |
| `app/(ui)/conversation/Outline.tsx`  | Right-side minimap of events, marker height = log(bytes), color per category                   |
| `app/(ui)/conversation/ReplayBar.tsx`| Purple-themed replay controls (play/pause, speed 1x/2x/5x/timestamps, scrubber, Exit)          |

### 4.6 Per-event renderers — `components/conversation/`

Single file, per-type components rendered by `renderEvent`:

- `components/conversation/messages.tsx` — UserMsg, AssistantMsg, ToolUseBlock, ToolResultBlock (+ ParentToolUseTrigger popover), ToolUseMsg, ToolResultMsg, SystemMsg, AttachmentMsg, PermissionMsg, QueueMsg, FileHistoryMsg, TruncatedHint, TimestampBadge, Wrapper
- `components/conversation/Markdown.tsx` — react-markdown + rehype-sanitize for assistant prose
- `components/conversation/CodeBlock.tsx` — lazy Shiki highlighter, `github-dark-default` theme
- `components/conversation/DiffView.tsx` — diff-js, added/removed line colors, header with +X −Y counts

### 4.7 Terminal — `app/(ui)/terminal/`

| File                                 | Role                                                                                           |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `app/(ui)/terminal/TabBar.tsx`       | Tab strip, middle-click to close, "+ new" button                                               |
| `app/(ui)/terminal/TabManager.tsx`   | Renders every terminal (inactive ones offscreen so xterm state survives)                       |
| `app/(ui)/terminal/Terminal.tsx`     | xterm wrapper — header shows cwd + git branch badge + status badge + Clear/Save/Restart buttons |
| `app/(ui)/terminal/QuickActions.tsx` | Row of predefined shell commands above the active tab (from settings)                          |

### 4.8 Markdown editor — `app/(ui)/editor/`

| File                                        | Role                                                                                    |
| ------------------------------------------- | --------------------------------------------------------------------------------------- |
| `app/(ui)/editor/MarkdownEditor.tsx`        | CodeMirror 6 editor for `CLAUDE.md` — Global/Project toggle, Recent dropdown, Preview split, Diff button → Dialog, Save (Ctrl+S) |

### 4.9 State modules that drive UI variation

| File                         | Role                                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------------------- |
| `stores/ui-slice.ts`         | Zustand — `selectedProjectSlug`, `selectedSessionId`, `search`, `terminalOpen`, `editorOpen`, `pendingEventIndex`, `sortMode`, `projectGrouping` |
| `stores/terminal-slice.ts`   | Terminal tabs, `activeTabId`, writer registry used by QuickActions                            |
| `lib/ui/layout-storage.ts`   | localStorage key `codehelm:layout` — sidebar/sessions widths, sortMode, editorPreview, projectGrouping |
| `lib/ui/recent-files.ts`     | localStorage key `codehelm:recent-md` — LRU of 10 recent CLAUDE.md targets                    |
| `hooks/use-settings.ts`      | TanStack Query hook over `/api/settings`                                                      |
| `lib/ui/toast.ts`            | `toastSuccess/Error/Info/Warning` wrappers over sonner                                        |

---

## 5. Screens to redesign (the map)

The app is a single page. Everything below happens inside the `ResizableColumns` three-pane layout.

### 5.1 Main page composition — `app/page.tsx`

```
┌────────────────────┬────────────────────┬─────────────────────────────┐
│ SIDEBAR            │ SESSION EXPLORER   │ MAINPANEL                   │
│                    │                    │                             │
│ - codehelm header  │ - ProjectHeader    │ Viewer | Terminal | Editor  │
│ - Search           │ - SessionList      │  (mutually exclusive)       │
│ - ProjectList      │                    │                             │
│   - Sort dropdown  │                    │   Viewer  = history + replay│
│   - Group toggle   │                    │   Terminal = TabBar + xterm │
│   - Favorites pin  │                    │   Editor  = CodeMirror      │
│   - Alias inline   │                    │                             │
└────────────────────┴────────────────────┴─────────────────────────────┘
```

### 5.2 Viewer mode (default, ~70% of time spent here)

Layout: `<StatsBar>` on top, toolbar (search + category chips + Follow + Replay + Jump-to-event), virtualised list, `<Outline>` minimap on right.

Key states to design for:
- Empty (no session selected)
- Loading (skeletons)
- Long session (2000+ events) — virtualisation renders a sliding window
- Replay mode active — `ReplayBar` appears below the toolbar, entire viewer is in a "playback" visual mode
- Search with hits — match highlighting, `N of M` counter, prev/next buttons, "only hits" chip
- Category filter chips — can turn user/assistant/tools/system on/off live

Each event in the list can be one of 9 types (see 4.6). The most visually distinct ones:
- **User** — blue role label + `<pre>` text
- **Assistant** — emerald role label + rendered Markdown + optional code blocks (Shiki highlighted)
- **Tool use** — amber collapsed card `name: {truncated input}`, expands to JSON
- **Tool result** — sky/red card with optional inline diff (for Edit/Write/NotebookEdit pairs)

### 5.3 Terminal mode

Layout when `tabs.length > 0`: `<TabBar>` + `<QuickActions>` + `<TabManager>`. No Outline.

Chrome to design:
- Tab chip (active = `border-neutral-600 bg-neutral-800`, inactive = `border-neutral-800 bg-neutral-950`)
- Quick-actions row — between 0 and 12 chips with command labels
- Terminal header (inside each Terminal instance) — cwd path, git branch badge (`main●` dirty or `main` clean), status chip (connecting/ready/closed/error), Clear / Save / Restart buttons

### 5.4 Editor mode

Layout: header toolbar + CodeMirror (optional split with Markdown preview on right).

Chrome to design:
- Target switcher (Per-project | Global)
- Recent files dropdown (Popover, max 10)
- Preview / Diff / Save buttons
- Diff-before-save Dialog (uses `DiffView`)

### 5.5 Global overlays

- **Settings dialog** — ~6 settings rows, needs visual hierarchy (groups: appearance, viewer, terminal, pricing)
- **Command palette** — search + grouped commands + project list
- **Help overlay** — list of keyboard shortcuts
- **Toasts** — bottom-right stack

---

## 6. Interaction patterns already implemented

Preserve these and make sure the redesign leaves room for their chrome:

| Trigger       | Action                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------ |
| `?`           | Toggle HelpOverlay (except inside text inputs)                                                   |
| `Ctrl/⌘ + K`  | Toggle CommandPalette                                                                            |
| `Ctrl/⌘ + S`  | Save CLAUDE.md                                                                                   |
| `Ctrl/⌘ + T`  | New shell tab                                                                                    |
| `/`           | Focus sidebar search                                                                             |
| `g g`         | Scroll viewer to top                                                                             |
| `G`           | Scroll viewer to bottom                                                                          |
| `Space`       | Play/pause replay (when replay mode active and focus not in an input)                            |
| Arrow keys    | Resize a splitter when focused (16 px steps)                                                     |
| Middle-click  | Close a terminal tab                                                                             |
| Outside click + `Esc` | Close any Radix modal                                                                   |

---

## 7. Out of scope for this redesign

Do not touch:

- xterm terminal buffer visual output (PTY bytes; colours come from the shell)
- CodeMirror gutters, line numbers, selection colours (managed by `@codemirror/theme-one-dark`)
- Server HTML (`app/api/auth/route.ts` renders a bare `<title>codehelm</title>` page only used during the one-shot auth redirect — not a real surface)
- Banner image (`screens/banner.webp`) — this is the brand anchor for the accent colour; fresh banner already shipped
- Tests, Zod schemas, security primitives, path-guard, CSRF flow
- `REBRANDING_PLAN.md`, `PLATFORM_I18N_PLAN.md`, `IMPROVEMENTPLAN.md`, `TASKS.md` (historical docs)

Screenshots in `screens/history.png`, `screens/shell.png`, `screens/tools.png` show the **pre-rebrand** UI (`claude-ui`) and will need recapture once the new design is shipped.

---

## 8. Desired deliverables from Claude Design

Priority order:

1. **A small set of design tokens** (colours, typography scale, spacing scale, radii) codified so we can drop them straight into `app/globals.css` as CSS variables. The accent should trace back to the banner gold `#d4a72c`.
2. **Viewer redesign** — one calm hierarchy for all 9 event types. Preserve timestamps, role labels, collapsible tool_use/tool_result. Propose how search highlights interact with the event border and how the Outline minimap pairs with the visible window.
3. **Sidebar redesign** — accommodates sort + grouping + favorites without looking like a toolbar cluster. 50+ projects scrollable with clear hover/selected/favorite states.
4. **Terminal chrome** — TabBar, QuickActions row, Terminal header (cwd + git badge + status + actions) as a unified strip.
5. **Modal pattern** — one visual template shared across Settings, Command Palette, Help Overlay, Diff-before-save, Parent-tool-use popover. Focus ring colour = accent.
6. **Replay mode visual** — today it's purple-accented chrome; rework so it uses the codehelm gold as a muted "currently playing back" state that doesn't look like an error.
7. **Empty states** — "pick a session", "no events match filters", "no projects yet", "no open terminal tabs".

Optional: a mid-fidelity HTML export we can diff against the current pages, or a token JSON Claude Code can translate into Tailwind v4 `@theme` declarations.

---

## 9. References

Files you may want to open first (ranked by density of visual decisions):

1. `app/(ui)/conversation/Viewer.tsx` — the screen users spend 70% of their time on
2. `components/conversation/messages.tsx` — per-event renderers, all 9 types
3. `app/(ui)/sidebar/ProjectList.tsx` — sort + grouping + favorites UX density
4. `components/SettingsDialog.tsx` — the biggest modal, reveals how our "form rows" read today
5. `components/CommandPalette.tsx` + `components/HelpOverlay.tsx` — modal patterns
6. `app/(ui)/terminal/Terminal.tsx` + `TabBar.tsx` + `QuickActions.tsx` — terminal chrome trio
7. `app/(ui)/editor/MarkdownEditor.tsx` — editor chrome + Diff dialog inline

External inspiration is welcome, but the final system should still feel like a devtool that runs in a `--app=` Chromium window — not a SaaS dashboard.

---

## 10. Hand-back

Once the design is approved, the hand-off to Claude Code is:

- Token JSON or CSS variables → drop into `app/globals.css` (`@theme` block)
- Component specs → apply to files in section 4; component file paths are stable
- Any new primitives → add under `components/ui/` following the Radix wrapper convention (see `components/ui/popover.tsx` for a minimal template)
- No inline styles; everything stays Tailwind + CSS vars

Keep the PR split per area (sidebar / viewer / terminal / editor / modals) so we can ship incrementally behind a feature flag if needed.
