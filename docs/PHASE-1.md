# PHASE 1 — Backend: discovery + REST + streaming JSONL

**Cel**: serwer umie czytać `~/.claude/projects/`, listować projekty/sesje, streamować JSONL chunk-by-chunk, eksportować do Markdown. Wszystko read-only, auth-gated.

**Prerequisites**: faza 0 zakończona (security primitives + server.ts + auth działa).

## Checklist

### Core JSONL logic

- [ ] `tests/unit/jsonl/types.test.ts` — Zod schemas akceptują all 8 event types (user, assistant, tool_use, tool_result, system, attachment, queue-operation, permission-mode) + odrzucają malformed
- [ ] `lib/jsonl/types.ts` — discriminated union Zod schema dla events
- [ ] `tests/unit/jsonl/parser.test.ts` — readline stream, malformed line → warn + skip, CRLF/LF mixed
- [ ] `lib/jsonl/parser.ts` — `parseJsonlStream(readable: Readable): AsyncIterable<Event>` z `readline.createInterface({crlfDelay: Infinity})`
- [ ] `tests/unit/jsonl/index.test.ts` — slug decode round-trip (20 przykładów, w tym `-a0`, `-home-bartek`), listProjects z fixture HOME
- [ ] `lib/jsonl/index.ts` — `listProjects()`, `listSessions(slug)`, `decodeSlug(slug)` (UWAGA: mapowanie path↔slug jest stratne — trzymamy resolved path w indeksie per-project, nie rekonstruujemy)
- [ ] `tests/unit/jsonl/export-md.test.ts` — session → markdown, 8 typów mapowanych, code blocks zachowane
- [ ] `lib/jsonl/export-md.ts` — `sessionToMarkdown(events): string`

### REST endpoints

- [ ] `tests/integration/projects.test.ts` — `GET /api/projects` z fixture HOME zwraca listę, auth required, Host check aktywny
- [ ] `app/api/projects/route.ts` — GET, zwraca `[{slug, path, sessionCount, lastActivity}]`
- [ ] `tests/integration/sessions-list.test.ts` — `GET /api/projects/[slug]/sessions` (slug traversal → 400)
- [ ] `app/api/projects/[slug]/sessions/route.ts` — GET, path-guard na slug, zwraca `[{id, timestamp, size, messageCount, preview}]`
- [ ] `tests/integration/session-stream.test.ts` — streaming chunked, first byte < 50 ms na 5 MB, 50 MB fake nie OOM, path traversal → 400
- [ ] `app/api/sessions/[id]/route.ts` — GET, `ReadableStream` → chunked transfer, path-guard obowiązkowy, Content-Type `application/x-ndjson`
- [ ] `tests/integration/session-export.test.ts` — export 100-event session do MD, Content-Disposition `attachment`
- [ ] `app/api/sessions/[id]/export/route.ts` — GET, zwraca MD z `Content-Disposition: attachment; filename="<sessionId>.md"`

### Fixtures

- [ ] `tests/fixtures/fake-home/.claude/projects/` — 5 projektów, 20 sesji total
- [ ] Fixture zawiera: user+assistant+tool_use+tool_result+system+attachment+permission-mode+queue-operation + jedna malformed linia
- [ ] Fixture zawiera jeden project ze slug `<script>alert(1)</script>-encoded` (XSS smoke)
- [ ] Fixture zawiera symlink poza `~/.claude/projects/` (escape attempt test)

### Path/security hardening

- [ ] Wszystkie 4 handlery wołają `assertInside(CLAUDE_PROJECTS_DIR, resolvedPath)` **przed** IO
- [ ] Slug decode robi round-trip verify (decode → encode → porównanie) i odrzuca różne
- [ ] Response streaming używa `ReadableStream` — zero `fs.readFile` na pełny plik
- [ ] Memory limit test: 50 MB fixture JSONL → process RSS < 200 MB w trakcie streamingu

## Security gate

- [ ] `GET /api/sessions/../../../etc/passwd` → 400
- [ ] `GET /api/projects/..%2F..%2Fetc` → 400 (url-encoded traversal)
- [ ] Slug with null byte → 400
- [ ] Symlink escape z fixture → 403
- [ ] 50 MB JSONL nie OOM (observability: process.memoryUsage podczas testu)
- [ ] Wszystkie endpointy bez cookie → 401 (automated route scan)
- [ ] Response headers: `Cache-Control: no-store` na JSONL (bo live data)

## Deliverables

- `git tag phase-1-done`
- `pnpm test:unit && pnpm test:integration` zielone
- `README.md` progress: `[x] Phase 1`
