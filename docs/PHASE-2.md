# PHASE 2 — Sidebar + Session Explorer (UI)

**Goal**: the first visual layout — a sidebar with the project list + search, a session panel, and a placeholder for the viewer. TanStack Query + Zustand are wired up. shadcn/ui components are installed and working.

**Prerequisites**: phase 1 (REST works, fixtures ready).

## Checklist

### Setup UI stack

- [ ] `pnpm dlx shadcn@latest init` (style: new-york, base color: neutral)
- [ ] `pnpm dlx shadcn@latest add button input command scroll-area separator tooltip skeleton`
- [ ] `tailwind.config.ts` + `app/globals.css` with Tailwind directives
- [ ] `app/layout.tsx` with CSP nonce (`headers().get('x-csp-nonce')`) + providers:
  - `QueryClientProvider` (staleTime: 30_000, refetchOnWindowFocus: false)
  - Zustand inline (no provider needed)
- [ ] `lib/security/csp.ts` used in the custom server: sets the nonce in the response header `x-csp-nonce` for the App Router

### State management

- [ ] `stores/ui-slice.ts` — Zustand: `selectedProjectSlug`, `selectedSessionId`, `sidebarOpen`, actions
- [ ] `hooks/use-projects.ts` — TanStack Query: `useProjects()` → `GET /api/projects`
- [ ] `hooks/use-sessions.ts` — `useSessions(slug)` → `GET /api/projects/:slug/sessions` enabled=!!slug

### Components

- [ ] `app/(ui)/sidebar/ProjectList.tsx` — `ScrollArea`, item = `Button variant="ghost"`, active state highlighted
- [ ] `app/(ui)/sidebar/Search.tsx` — `Command` (cmdk) + 150 ms debounce, filters projects by prefix+substring
- [ ] `app/(ui)/session-explorer/SessionList.tsx` — session list with relative timestamps ("2 h ago"), size, message count, preview of the first message
- [ ] `app/(ui)/session-explorer/SessionItem.tsx` — padded card with hover state
- [ ] `app/page.tsx` — main layout: 280 px sidebar + flex main, resizable (optional, low-pri)

### UX details

- [ ] Empty state for 0 projects (message + link to Claude Code docs)
- [ ] Loading skeleton (shadcn `Skeleton`) during fetch
- [ ] Error state with a retry button
- [ ] Slug → display name (e.g. `-home-bartek-main-projects-claude-ui` → `~/main-projects/claude-ui`)
- [ ] Tooltip on a project reveals the full path
- [ ] Sessions sort by `lastActivity` DESC by default, with an "oldest first" toggle

### Tests

- [ ] `tests/unit/components/ProjectList.test.tsx` — render 50 projects, search filters down
- [ ] `tests/unit/components/Search.test.tsx` — debounce works (fake timers)
- [ ] `tests/e2e/phase-2-smoke.spec.ts` — playwright:
  - launch `claude-ui`, Chromium opens
  - project list from the fixture is visible
  - clicking a project shows the session list
  - search "home" narrows to matching projects
  - XSS fixture: a `<script>` name appears as text, does NOT execute

## Security gate

- [ ] CSP response header present on `/`
- [ ] `script-src` **without** `unsafe-inline` (manual devtools check + playwright header assertion)
- [ ] CSP report-only **disabled** in prod (strict only)
- [ ] A project name containing `<script>` in the fixture renders as text (DOM check: `textContent` === payload, `innerHTML` does not contain `<script>`)
- [ ] No `dangerouslySetInnerHTML` in components (enforced by lint, plus explicit grep)
- [ ] TanStack Query fetch with `credentials: 'include'` so the cookie ships

## Deliverables

- `git tag phase-2-done`
- Screenshot of the sidebar + session list in the PR
- Playwright e2e green
