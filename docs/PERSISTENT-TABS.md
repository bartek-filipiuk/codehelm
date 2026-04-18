# Persistent terminal tabs

Every terminal tab opened in the UI (sidebar project → open terminal, resume
session, QuickActions, etc.) is promoted to a persistent PTY on mount:

- `Terminal.tsx` POSTs `/api/persistent-tabs` the first time it sees a pane
  with no `persistentId`, writes the returned id back into the pane (via
  `setPanePersistentId`), then attaches via WebSocket.
- Closing the tab (`X` button) fires a fire-and-forget DELETE against
  `/api/persistent-tabs/:id`; the server kills the PTY and drops the entry.
- Reload / project switch / Chromium close does **not** kill the PTY. On
  reopen, `TabManager` hydrates from `GET /api/persistent-tabs` and the same
  tabs come back.
- `codehelm` restart → `restoreAllAtStartup()` respawns every persistent tab
  from `~/.codehelm/persistent-tabs.json` before the UI connects.
- If registration fails (cap, network), `Terminal` falls back to classic
  ephemeral spawn and client-side `initCommand`.

Related files: `app/(ui)/terminal/Terminal.tsx`, `app/(ui)/terminal/TabManager.tsx`,
`lib/ui/persistent-tab-sync.ts`, `lib/pty/persistent-tabs-{store,registry,service}.ts`,
`stores/terminal-slice.ts`.

## Known limitations & follow-ups

### 1. `MAX_PTY` cap applies per pane

`LIMITS.MAX_PTY = 16` in `lib/server/config.ts`. Every project tab and every
split pane counts. 5 projects × 3-way split = 15 PTYs, so the 17th pane
silently falls back to ephemeral spawn. Raise the cap or introduce a
per-project eviction policy if this becomes common.

### 2. `audit.log` grows with every tab open

Each persistent tab creation writes a `pty.spawn` entry; server restart with
auto-respawn re-emits them. There is no rotation yet — if the file matters for
incident review, add a rolling policy (size-based or daily).

### 3. Split layout does not survive reload

**This is the biggest rough edge.** Every pane registers as its own persistent
tab server-side. Zustand does not persist `tab.layout` or the mapping
`tab → panes[]`. After reload, each former pane reappears as a separate
top-level tab — split geometry is lost.

Paths out (in order of cost):

- **UI-only workaround:** persist `tab.layout` + `panes[].persistentId`
  ordering to `localStorage` keyed by project slug; on hydration, re-stitch
  panes under the original parent tab.
- **Server-side grouping:** add `group_id` (UUID) to persistent-tabs schema.
  All panes belonging to the same UI tab share a `group_id`. Hydration groups
  server tabs by `group_id`, creates one Zustand tab per group, places panes
  in creation order.
- **Full layout persistence:** store the whole `TerminalTab` (layout, pane
  sizes from `lib/ui/pane-sizes`, active pane) in a `~/.codehelm/ui-state.json`
  file written by a new API endpoint. Most invasive, most correct.

Recommended: server-side grouping (option 2) — small schema change, clean
hydration, no new storage, survives reload on any machine/browser that loads
the same `~/.codehelm` directory.

### 4. No per-tab rename persistence server-side

Tab titles edited via `renameTab` are saved to localStorage (`tab-aliases.json`)
as today. Reload from a different browser loses the rename. The `aliasKey` is
already stored server-side in the persistent-tab record, so mirroring titles
there is a small follow-up.

### 5. Ephemeral fallback on registration failure is silent

`registerPersistentTab` returns `null` on non-2xx; the tab still opens but
loses reload-survivability. Worth adding a toast: "tab is not persistent" with
a hint about the 16-PTY cap.
