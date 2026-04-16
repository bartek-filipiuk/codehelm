# PHASE 3 — Conversation Viewer (parser + virtual list + highlighting)

**Cel**: kliknięcie sesji pokazuje historię z JSONL streamowo, z virtual listą, syntax highlightingiem, safe markdown dla assistant. Search w sesji. Follow mode (auto-scroll do najnowszej wiadomości).

**Prerequisites**: faza 2 (UI layout, Zustand, TanStack Query).

## Checklist

### Streaming ingestion

- [ ] `hooks/use-session-stream.ts`:
  - `fetch('/api/sessions/:id', {credentials:'include'})`
  - `response.body.getReader()` + progressive line parse
  - stan: `events: Event[]`, `loading`, `error`, `done`
  - cleanup: cancel readera przy unmount
- [ ] Kiedy `done`, jeśli sesja jest aktywna (fs watcher w fazie 6 push), hook dopina kolejne eventy bez full reload (preparacja API pod fazę 6)

### Renderery per typ

- [ ] `app/(ui)/conversation/Viewer.tsx` — `<Virtuoso>` z `itemContent` + `followOutput` (sticky toggle)
- [ ] `app/(ui)/conversation/messages/UserMsg.tsx` — prosta wiadomość, `<pre class="whitespace-pre-wrap">` dla multiline
- [ ] `app/(ui)/conversation/messages/AssistantMsg.tsx` — `react-markdown` + `rehype-sanitize` (domyślny schema), Shiki dla code blocks
- [ ] `app/(ui)/conversation/messages/ToolUseMsg.tsx` — collapsed domyślnie: `{name}: {truncated(input, 200)}`, expand → pełny JSON w `<pre>`
- [ ] `app/(ui)/conversation/messages/ToolResultMsg.tsx` — stdout/stderr collapsed, exitCode badge, expand pokazuje text
- [ ] `app/(ui)/conversation/messages/SystemMsg.tsx` — wyszarzony, małym fontem
- [ ] `app/(ui)/conversation/messages/AttachmentMsg.tsx` — hook info (name, duration, exit)
- [ ] `app/(ui)/conversation/messages/PermissionMsg.tsx` — badge z mode (plan/edit/default)
- [ ] `app/(ui)/conversation/messages/QueueMsg.tsx` — jedno-liniowa info

### Syntax highlighting

- [ ] `lib/ui/shiki.ts` — lazy `createHighlighter` z lang detection; cache w module
- [ ] Fallback `<pre><code>` dla unrecognized language
- [ ] Highlighter lazy-loaded per session open (nie w głównym chunku)

### Search

- [ ] `app/(ui)/conversation/SearchBar.tsx` — Input + prev/next button
- [ ] `lib/jsonl/search.ts` — case-insensitive match w treści user/assistant/tool_result
- [ ] Podświetlenie match w rendererze (`<mark>`)
- [ ] Skoki między matchami → `virtuoso.scrollToIndex`

### UX

- [ ] Follow mode toggle (pin/unpin) — dzwięk gdy nowy event podczas historycznego scrolla
- [ ] "Jump to top" / "Jump to bottom" buttons (keyboard: `g g` / `G`)
- [ ] Timestamp relative per message, hover → absolute ISO
- [ ] Truncate pojedynczego pola tekstowego > 10 MB → "show more" button, wtedy full content (nie trzymamy w RAM od początku — on-demand fetch)
- [ ] Copy button na każdej wiadomości + copy-code na blokach

### Testy

- [ ] `tests/unit/conversation/*.test.tsx` — snapshot test dla każdego renderera (8 plików)
- [ ] `tests/unit/search.test.ts` — 1000 wiadomości, case-insensitive match, perf < 50 ms
- [ ] `tests/e2e/phase-3-smoke.spec.ts`:
  - otwieram sesję (200 wiadomości z fixture)
  - widzę pierwsze 10 wiadomości < 300 ms after click
  - scroll: FPS > 30 (playwright performance API)
  - klik na tool_use expanduje
  - search "token" podświetla matches, next/prev działa
  - XSS: fixture z `<img src=x onerror=alert(1)>` w assistant → renderowane jako text (rehype-sanitize)

## Security gate

- [ ] **Żadnego `dangerouslySetInnerHTML`** z user input (grep wyegzekwuje)
- [ ] `rehype-sanitize` na każdym markdown render (react-markdown plugin config check)
- [ ] Tool output z `<script>` → text, nie exec (playwright alert listener: zero triggerów)
- [ ] Pole > 10 MB truncate, full content **nie** w React state (on-demand)
- [ ] Shiki nie używa `eval`/`new Function` (manual review + CSP nie triggeruje violation)
- [ ] Link w markdown (`[x](javascript:alert)`) → stripped przez rehype-sanitize

## Deliverables

- `git tag phase-3-done`
- Demo GIF scrollowania 2000 wiadomości w PR
- Playwright + unit zielone
