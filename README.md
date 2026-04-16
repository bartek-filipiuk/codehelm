# claude-ui

Lokalny web UI do zarządzania sesjami Claude Code CLI. Zastępuje żonglowanie wieloma oknami terminala — wszystkie projekty, historia konwersacji i interaktywny shell w jednej zakładce Chromium.

Działa wyłącznie lokalnie (`127.0.0.1` + token + CSRF + CSP), zero chmury, zero dodatkowych kosztów API.

## Status

Aktywny rozwój. Plan etapowy w `docs/`.

| Faza                 | Zakres                                   | Status         |
| -------------------- | ---------------------------------------- | -------------- |
| [0](docs/PHASE-0.md) | Setup + security primitives + CI         | 🟡 in progress |
| [1](docs/PHASE-1.md) | Backend: odczyt + REST + streaming JSONL | ⏳             |
| [2](docs/PHASE-2.md) | Sidebar + Session Explorer (UI)          | ⏳             |
| [3](docs/PHASE-3.md) | Conversation Viewer                      | ⏳             |
| [4](docs/PHASE-4.md) | WebSocket + node-pty + xterm             | ⏳             |
| [5](docs/PHASE-5.md) | Multi-tab terminal + spawn-in-project    | ⏳             |
| [6](docs/PHASE-6.md) | File watcher + live updates              | ⏳             |
| [7](docs/PHASE-7.md) | CLAUDE.md editor                         | ⏳             |

## Dokumentacja

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) — przepływy, warstwy, performance targety
- [SECURITY.md](docs/SECURITY.md) — threat model, 25-punktowy stack obronny, cross-cutting gates

## Uruchamianie (po ukończeniu fazy 0)

```bash
pnpm install
pnpm build
./bin/claude-ui
```

## Wymagania

- Node.js ≥ 20.11.0
- pnpm ≥ 9
- Linux (Ubuntu 22.04+) — aktualnie testowane; macOS/Windows nie w scope v1
- Chromium lub Google Chrome (auto-detected)

## Rozwój

```bash
pnpm install
pnpm dev        # custom server z HMR
pnpm test       # vitest + supertest
pnpm test:e2e   # playwright
pnpm lint
pnpm typecheck
```

## Scope v1

**W**: odczyt sesji, embedded terminal (pełny shell), file watcher, edycja CLAUDE.md, eksport do MD.
**Poza**: usuwanie sesji, wysyłanie promptów z UI (terminal wystarczy), multi-user, mobile, sync między maszynami.

## Licencja

(TBD)
