# PHASE 3 — Conversation Viewer (parser + virtual list + highlighting)

**Goal**: clicking a session shows the history streamed from JSONL with a virtualised list, syntax highlighting, and safe markdown for the assistant role. In-session search. Follow mode (auto-scroll to the newest message).

**Prerequisites**: phase 2 (UI layout, Zustand, TanStack Query).

## Checklist

### Streaming ingestion

- [ ] `hooks/use-session-stream.ts`:
  - `fetch('/api/sessions/:id', {credentials:'include'})`
  - `response.body.getReader()` + progressive line parse
  - state: `events: Event[]`, `loading`, `error`, `done`
  - cleanup: cancel the reader on unmount
- [ ] Once `done`, if the session is still live (fs watcher in phase 6 will push), the hook attaches further events without a full reload (prepares the API for phase 6)

### Per-type renderers

- [ ] `app/(ui)/conversation/Viewer.tsx` — `<Virtuoso>` with `itemContent` + `followOutput` (sticky toggle)
- [ ] `app/(ui)/conversation/messages/UserMsg.tsx` — simple message, `<pre class="whitespace-pre-wrap">` for multiline
- [ ] `app/(ui)/conversation/messages/AssistantMsg.tsx` — `react-markdown` + `rehype-sanitize` (default schema), Shiki for code blocks
- [ ] `app/(ui)/conversation/messages/ToolUseMsg.tsx` — collapsed by default: `{name}: {truncated(input, 200)}`, expand → full JSON in a `<pre>`
- [ ] `app/(ui)/conversation/messages/ToolResultMsg.tsx` — stdout/stderr collapsed, exitCode badge, expand reveals the text
- [ ] `app/(ui)/conversation/messages/SystemMsg.tsx` — greyed out, small font
- [ ] `app/(ui)/conversation/messages/AttachmentMsg.tsx` — hook info (name, duration, exit)
- [ ] `app/(ui)/conversation/messages/PermissionMsg.tsx` — badge showing the mode (plan/edit/default)
- [ ] `app/(ui)/conversation/messages/QueueMsg.tsx` — single-line info

### Syntax highlighting

- [ ] `lib/ui/shiki.ts` — lazy `createHighlighter` with language detection; cache at module scope
- [ ] Fallback `<pre><code>` for an unrecognised language
- [ ] Highlighter lazy-loaded per session open (not in the main chunk)

### Search

- [ ] `app/(ui)/conversation/SearchBar.tsx` — Input + prev/next buttons
- [ ] `lib/jsonl/search.ts` — case-insensitive match across user/assistant/tool_result content
- [ ] Highlight matches in the renderer (`<mark>`)
- [ ] Jump between matches → `virtuoso.scrollToIndex`

### UX

- [ ] Follow-mode toggle (pin/unpin) — sound cue on a new event while the user is scrolled back in history
- [ ] "Jump to top" / "Jump to bottom" buttons (keyboard: `g g` / `G`)
- [ ] Relative timestamp per message, hover → absolute ISO
- [ ] Truncate a single text field > 10 MB → "show more" button, which then fetches the full content on demand (we don't keep the whole blob in RAM up front)
- [ ] Copy button on each message + copy-code on code blocks

### Tests

- [ ] `tests/unit/conversation/*.test.tsx` — snapshot test per renderer (8 files)
- [ ] `tests/unit/search.test.ts` — 1000 messages, case-insensitive match, perf < 50 ms
- [ ] `tests/e2e/phase-3-smoke.spec.ts`:
  - open a session (200 messages from fixture)
  - first 10 messages visible < 300 ms after click
  - scroll: FPS > 30 (playwright performance API)
  - clicking tool_use expands it
  - search "token" highlights matches, prev/next navigates
  - XSS: fixture with `<img src=x onerror=alert(1)>` in assistant content → rendered as text (rehype-sanitize)

## Security gate

- [ ] **No `dangerouslySetInnerHTML`** with user input (enforced by grep)
- [ ] `rehype-sanitize` on every markdown render (check react-markdown plugin config)
- [ ] Tool output containing `<script>` → text, never executed (playwright alert listener: zero triggers)
- [ ] Fields > 10 MB truncated; the full content stays **out** of React state (on-demand fetch)
- [ ] Shiki does not use `eval` / `new Function` (manual review + CSP does not fire a violation)
- [ ] Markdown links (`[x](javascript:alert)`) → stripped by rehype-sanitize

## Deliverables

- `git tag phase-3-done`
- Demo GIF of scrolling 2000 messages in the PR
- Playwright + unit green
