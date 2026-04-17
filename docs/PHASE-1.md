# PHASE 1 — Backend: discovery + REST + streaming JSONL

**Goal**: the server can read `~/.claude/projects/`, list projects and sessions, stream JSONL chunk-by-chunk, and export to Markdown. Everything read-only and auth-gated.

**Prerequisites**: phase 0 complete (security primitives + server.ts + auth work).

## Checklist

### Core JSONL logic

- [ ] `tests/unit/jsonl/types.test.ts` — Zod schemas accept all 8 event types (user, assistant, tool_use, tool_result, system, attachment, queue-operation, permission-mode) and reject malformed input
- [ ] `lib/jsonl/types.ts` — discriminated-union Zod schema for events
- [ ] `tests/unit/jsonl/parser.test.ts` — readline stream, malformed line → warn + skip, CRLF/LF mixed
- [ ] `lib/jsonl/parser.ts` — `parseJsonlStream(readable: Readable): AsyncIterable<Event>` using `readline.createInterface({crlfDelay: Infinity})`
- [ ] `tests/unit/jsonl/index.test.ts` — slug decode round-trip (20 examples including `-a0`, `-home-bartek`), `listProjects` against a fixture HOME
- [ ] `lib/jsonl/index.ts` — `listProjects()`, `listSessions(slug)`, `decodeSlug(slug)` (note: path↔slug mapping is lossy — we keep the resolved path in the per-project index instead of reconstructing it)
- [ ] `tests/unit/jsonl/export-md.test.ts` — session → markdown, all 8 types mapped, code blocks preserved
- [ ] `lib/jsonl/export-md.ts` — `sessionToMarkdown(events): string`

### REST endpoints

- [ ] `tests/integration/projects.test.ts` — `GET /api/projects` against fixture HOME returns the list, auth required, Host check active
- [ ] `app/api/projects/route.ts` — GET, returns `[{slug, path, sessionCount, lastActivity}]`
- [ ] `tests/integration/sessions-list.test.ts` — `GET /api/projects/[slug]/sessions` (slug traversal → 400)
- [ ] `app/api/projects/[slug]/sessions/route.ts` — GET, path-guard on slug, returns `[{id, timestamp, size, messageCount, preview}]`
- [ ] `tests/integration/session-stream.test.ts` — chunked streaming, first byte < 50 ms for 5 MB, 50 MB fake does not OOM, path traversal → 400
- [ ] `app/api/sessions/[id]/route.ts` — GET, `ReadableStream` → chunked transfer, path-guard mandatory, Content-Type `application/x-ndjson`
- [ ] `tests/integration/session-export.test.ts` — export a 100-event session to MD, Content-Disposition `attachment`
- [ ] `app/api/sessions/[id]/export/route.ts` — GET, returns MD with `Content-Disposition: attachment; filename="<sessionId>.md"`

### Fixtures

- [ ] `tests/fixtures/fake-home/.claude/projects/` — 5 projects, 20 sessions total
- [ ] Fixture covers: user + assistant + tool_use + tool_result + system + attachment + permission-mode + queue-operation + one malformed line
- [ ] Fixture includes a project with slug `<script>alert(1)</script>-encoded` (XSS smoke)
- [ ] Fixture includes a symlink escaping `~/.claude/projects/` (escape attempt test)

### Path/security hardening

- [ ] All four handlers call `assertInside(CLAUDE_PROJECTS_DIR, resolvedPath)` **before** any IO
- [ ] Slug decode does a round-trip verify (decode → encode → compare) and rejects mismatches
- [ ] Response streaming uses `ReadableStream` — never `fs.readFile` on the full file
- [ ] Memory limit test: 50 MB fixture JSONL → process RSS < 200 MB during streaming

## Security gate

- [ ] `GET /api/sessions/../../../etc/passwd` → 400
- [ ] `GET /api/projects/..%2F..%2Fetc` → 400 (url-encoded traversal)
- [ ] Slug with a null byte → 400
- [ ] Symlink escape from the fixture → 403
- [ ] 50 MB JSONL does not OOM (observability: `process.memoryUsage` during the test)
- [ ] Every endpoint without a cookie → 401 (automated route scan)
- [ ] Response headers: `Cache-Control: no-store` on JSONL (live data)

## Deliverables

- `git tag phase-1-done`
- `pnpm test:unit && pnpm test:integration` green
- `README.md` progress: `[x] Phase 1`
