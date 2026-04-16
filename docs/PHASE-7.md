# PHASE 7 — CLAUDE.md editor

**Cel**: edytor CodeMirror 6 dla globalnego `~/.claude/CLAUDE.md` i per-project `<project-path>/CLAUDE.md`. Atomic write, conflict detection, body limit, CSRF, path-guard.

**Prerequisites**: wszystkie wcześniejsze fazy.

## Checklist

### API: read + write

- [ ] `tests/integration/claude-md.test.ts` — GET/PUT global + per-project, body > 1 MB → 413, CSRF missing → 403, conflict 412
- [ ] `app/api/claude-md/route.ts` — GET/PUT dla `~/.claude/CLAUDE.md`
- [ ] `app/api/claude-md/[slug]/route.ts` — GET/PUT dla `<decoded-project-path>/CLAUDE.md`:
  - path-guard: resolved path **literalnie** `<decoded-project-path>/CLAUDE.md` (nic innego — nie `settings.json`, nie `claude.md.bak`, nic)
  - `assertInside($HOME, <decoded-project-path>)` przed IO
- [ ] `lib/jsonl/write-guard.ts` — wspólny write-guard (fuzz 100 payloadów)
- [ ] Body limit 1 MB (check `Content-Length` przed parse body) → 413
- [ ] Atomic write: `fs.writeFile(target + '.tmp', content, {mode: 0o644})` → `fs.rename(tmp, target)` (atomic na tym samym fs)
- [ ] `If-Unmodified-Since` header check: jeśli plik mtime > header → 412 Precondition Failed
- [ ] Audit log: `{event:"claude-md-write", path, bytes, ts}` (bez treści)

### UI: editor

- [ ] `pnpm add @codemirror/lang-markdown @codemirror/theme-one-dark @codemirror/view @codemirror/state`
- [ ] `app/(ui)/editor/MarkdownEditor.tsx` — CodeMirror 6, dynamic import (chunk ~300 kB)
- [ ] Toolbar: target selector (global vs per-project), Save button, "Unsaved changes" indicator
- [ ] Keyboard: Ctrl+S → save
- [ ] Fetch `If-Modified-Since`-aware: przy GET zapamiętaj `Last-Modified`, przy PUT wyślij jako `If-Unmodified-Since`
- [ ] Conflict UI: dialog "Plik zmieniony na dysku — Twoja wersja / Wersja z dysku / Merge manual"

### UX

- [ ] Sidebar link "Edit CLAUDE.md" per projekt + globalny
- [ ] Status "Saved 2 min ago" w toolbar
- [ ] Autosave **nie** (za ryzykowne dla conflict), tylko manual save

### Testy

- [ ] `tests/unit/write-guard.test.ts` — 100 fuzz payloadów: `../`, null bytes, symlinks, niepoprawne nazwy plików
- [ ] `tests/integration/claude-md.test.ts`:
  - PUT < 1 MB OK
  - PUT > 1 MB → 413
  - PUT bez CSRF → 403
  - PUT z tampered CSRF → 403
  - Conflict: dwa PUT z tym samym `If-Unmodified-Since` → drugi 412
  - path traversal w slug → 400
  - próba zapisu do `settings.json` przez slug manipulation → 400
- [ ] `tests/e2e/phase-7-smoke.spec.ts`:
  - edytuję `~/.claude/CLAUDE.md`, zapisuję, refresh → zmiany widoczne
  - plik na dysku zaktualizowany atomicznie (brak pośredniego pustego stanu — monitorujemy poprzez fs events)
  - edit + external change + Save → conflict dialog

## Security gate

- [ ] Write-guard fuzz 100 payloadów → zero escape
- [ ] Próba zapisu do `~/.claude/settings.json` (przez slug manipulation albo direct path) → 400/403
- [ ] PUT > 1 MB → 413 (brak body parse OOM)
- [ ] CSRF enforcement 100% (middleware wymusza dla PUT)
- [ ] Atomic write: `stat` pliku podczas PUT (intermediate) → stary content lub nowy, nigdy pusty plik (race test)
- [ ] Audit log zawiera write entry, **nie** zawiera treści pliku
- [ ] mode pliku zachowany (nie zmieniamy 0644→0600 lub odwrotnie)

## Deliverables

- `git tag phase-7-done`
- Screencast edit + save + conflict w PR
- Cross-cutting security suite uruchomiona i zielona (patrz SECURITY.md)
- v1.0.0 release ready
