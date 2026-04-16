# PHASE 2 — Sidebar + Session Explorer (UI)

**Cel**: pierwszy wizualny layout — sidebar z listą projektów + search, panel sesji, placeholder na viewer. TanStack Query + Zustand wpięte. shadcn/ui komponenty zainstalowane i działające.

**Prerequisites**: faza 1 (REST działa, fixtures gotowe).

## Checklist

### Setup UI stack

- [ ] `pnpm dlx shadcn@latest init` (style: new-york, base color: neutral)
- [ ] `pnpm dlx shadcn@latest add button input command scroll-area separator tooltip skeleton`
- [ ] `tailwind.config.ts` + `app/globals.css` z Tailwind directives
- [ ] `app/layout.tsx` z CSP nonce (`headers().get('x-csp-nonce')`) + Providers:
  - `QueryClientProvider` (staleTime: 30_000, refetchOnWindowFocus: false)
  - Zustand inline (bez providera)
- [ ] `lib/security/csp.ts` użyty w custom server: ustawia nonce w response header `x-csp-nonce` dla App Routera

### State management

- [ ] `stores/ui-slice.ts` — Zustand: `selectedProjectSlug`, `selectedSessionId`, `sidebarOpen`, actions
- [ ] `hooks/use-projects.ts` — TanStack Query: `useProjects()` → `GET /api/projects`
- [ ] `hooks/use-sessions.ts` — `useSessions(slug)` → `GET /api/projects/:slug/sessions` enabled=!!slug

### Komponenty

- [ ] `app/(ui)/sidebar/ProjectList.tsx` — `ScrollArea`, item = `Button variant="ghost"`, aktywny highlighted
- [ ] `app/(ui)/sidebar/Search.tsx` — `Command` (cmdk) + debounce 150 ms, filtruje projects po prefix+substring
- [ ] `app/(ui)/session-explorer/SessionList.tsx` — lista sesji z timestamp (relative: "2 h ago"), size, message count, preview pierwszej wiadomości
- [ ] `app/(ui)/session-explorer/SessionItem.tsx` — card z padding, hover state
- [ ] `app/page.tsx` — główny layout: 280px sidebar + flex main, resizable (opcjonalnie, low-pri)

### UX details

- [ ] Empty state dla 0 projektów (komunikat + link do dokumentacji Claude Code)
- [ ] Loading skeleton (shadcn `Skeleton`) podczas fetch
- [ ] Error state z retry button
- [ ] Slug → display name (np. `-home-bartek-main-projects-claude-ui` → `~/main-projects/claude-ui`)
- [ ] Tooltip na project pokazuje pełną ścieżkę
- [ ] Sortowanie sesji po `lastActivity` DESC default, opcja "oldest first"

### Testy

- [ ] `tests/unit/components/ProjectList.test.tsx` — render 50 projektów, search filtruje
- [ ] `tests/unit/components/Search.test.tsx` — debounce działa (fake timers)
- [ ] `tests/e2e/phase-2-smoke.spec.ts` — playwright:
  - start `claude-ui`, Chromium otwiera się
  - widzę listę projektów z fixture
  - klikam projekt → widzę listę sesji
  - search "home" filtruje do pasujących
  - XSS fixture: nazwa `<script>` widoczna jako text, NIE execute

## Security gate

- [ ] CSP response header obecny na `/`
- [ ] `script-src` **bez** `unsafe-inline` (manual devtools check + playwright assertion na headerze)
- [ ] CSP report-only **wyłączone** w prod (tylko strict)
- [ ] Nazwa projektu z `<script>` w fixture renderowana jako text (DOM check: `textContent` === payload, `innerHTML` nie zawiera `<script>`)
- [ ] Brak `dangerouslySetInnerHTML` w komponentach (lint enforced, ale explicit grep też)
- [ ] TanStack Query fetch z `credentials: 'include'` (cookie poleci)

## Deliverables

- `git tag phase-2-done`
- Screenshot sidebara + session listy w PR
- Playwright e2e zielony
