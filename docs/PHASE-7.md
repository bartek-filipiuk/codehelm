# PHASE 7 — CLAUDE.md editor

**Goal**: a CodeMirror 6 editor for the global `~/.claude/CLAUDE.md` and the per-project `<project-path>/CLAUDE.md`. Atomic write, conflict detection, body limit, CSRF, path-guard.

**Prerequisites**: every earlier phase.

## Checklist

### API: read + write

- [ ] `tests/integration/claude-md.test.ts` — GET/PUT global + per-project, body > 1 MB → 413, missing CSRF → 403, conflict → 412
- [ ] `app/api/claude-md/route.ts` — GET/PUT for `~/.claude/CLAUDE.md`
- [ ] `app/api/claude-md/[slug]/route.ts` — GET/PUT for `<decoded-project-path>/CLAUDE.md`:
  - path-guard: resolved path **literally** `<decoded-project-path>/CLAUDE.md` (nothing else — not `settings.json`, not `claude.md.bak`, nothing)
  - `assertInside($HOME, <decoded-project-path>)` before IO
- [ ] `lib/jsonl/write-guard.ts` — shared write-guard (fuzz 100 payloads)
- [ ] Body limit 1 MB (check `Content-Length` before parsing body) → 413
- [ ] Atomic write: `fs.writeFile(target + '.tmp', content, {mode: 0o644})` → `fs.rename(tmp, target)` (atomic on the same filesystem)
- [ ] `If-Unmodified-Since` header check: if the file mtime > header → 412 Precondition Failed
- [ ] Audit log: `{event:"claude-md-write", path, bytes, ts}` (no content)

### UI: editor

- [ ] `pnpm add @codemirror/lang-markdown @codemirror/theme-one-dark @codemirror/view @codemirror/state`
- [ ] `app/(ui)/editor/MarkdownEditor.tsx` — CodeMirror 6, dynamic import (chunk ~300 kB)
- [ ] Toolbar: target selector (global vs per-project), Save button, "Unsaved changes" indicator
- [ ] Keyboard: Ctrl+S → save
- [ ] Fetch is `If-Modified-Since`-aware: on GET remember `Last-Modified`, on PUT send as `If-Unmodified-Since`
- [ ] Conflict UI: dialog "File changed on disk — Your version / Disk version / Manual merge"

### UX

- [ ] Sidebar link "Edit CLAUDE.md" per project + global
- [ ] "Saved 2 min ago" status in the toolbar
- [ ] Autosave **not** implemented (too risky for conflicts), manual save only

### Tests

- [ ] `tests/unit/write-guard.test.ts` — 100 fuzz payloads: `../`, null bytes, symlinks, forbidden filenames
- [ ] `tests/integration/claude-md.test.ts`:
  - PUT < 1 MB OK
  - PUT > 1 MB → 413
  - PUT without CSRF → 403
  - PUT with tampered CSRF → 403
  - Conflict: two PUTs with the same `If-Unmodified-Since` → second returns 412
  - path traversal in slug → 400
  - attempt to write to `settings.json` via slug manipulation → 400
- [ ] `tests/e2e/phase-7-smoke.spec.ts`:
  - edit `~/.claude/CLAUDE.md`, save, refresh → changes visible
  - file on disk updated atomically (never an intermediate empty state — monitored via fs events)
  - edit + external change + Save → conflict dialog

## Security gate

- [ ] Write-guard fuzz 100 payloads → zero escapes
- [ ] Attempt to write `~/.claude/settings.json` (via slug manipulation or direct path) → 400/403
- [ ] PUT > 1 MB → 413 (no body-parse OOM)
- [ ] CSRF enforcement 100% (middleware enforces for PUT)
- [ ] Atomic write: `stat` on the file during PUT (intermediate) → either the old content or the new, never empty (race test)
- [ ] Audit log contains a write entry, **not** the file content
- [ ] File mode preserved (we don't flip 0644↔0600)

## Deliverables

- `git tag phase-7-done`
- Screencast of edit + save + conflict in the PR
- Cross-cutting security suite run and green (see `SECURITY.md`)
- v1.0.0 release ready
