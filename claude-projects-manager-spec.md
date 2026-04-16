# Claude Projects Manager — Specyfikacja

## Opis produktu

Lokalne webowe UI do zarządzania sesjami Claude Code CLI. Zastępuje żonglowanie wieloma oknami terminala — wszystkie projekty, ich historia konwersacji i interaktywny shell w jednym miejscu, dostępnym przez przeglądarkę.

Działa wyłącznie lokalnie, zero chmury, zero dodatkowych kosztów API.

---

## Architektura

```
Browser (Next.js)
  ├── Panel projektów + historia (React)
  └── xterm.js ──WebSocket──► Node.js backend
                                ├── node-pty (shell/claude CLI)
                                ├── fs watcher (~/.claude/projects/)
                                └── REST API (odczyt JSONL)
```

---

## Moduły

### 1. Projects Sidebar

- Lista projektów wykryta z `~/.claude/projects/`
- Nazwa projektu = ścieżka na dysku (skrócona)
- Liczba sesji per projekt
- Ostatnia aktywność (timestamp)
- Wyszukiwarka po nazwie projektu

### 2. Session Explorer

- Lista sesji danego projektu (pliki JSONL)
- Timestamp, liczba wiadomości, rozmiar
- Podgląd tytułu/pierwszej wiadomości jako preview
- Akcje: otwórz w terminalu, usuń, eksportuj do MD

### 3. Conversation Viewer

- Renderowanie historii z JSONL
- Osobny styl dla user/assistant/tool calls
- Syntax highlighting w blokach kodu
- Podgląd tool use (jakie pliki czytał, jakie komendy wykonał)
- Wyszukiwanie po treści konwersacji

### 4. Embedded Terminal

- `xterm.js` jako emulator
- Backend: `node-pty` przez WebSocket
- Każda zakładka terminala = osobny pseudoterminal
- Przy otwarciu sesji: automatycznie odpala `claude --resume <session-id>` w odpowiednim katalogu roboczym projektu
- Możliwość odpalenia zwykłego bash (nie tylko claude)

### 5. Multi-tab Terminal

- Wiele zakładek terminala jednocześnie
- Każda zakładka przypisana do projektu
- Wizualne oznaczenie który projekt/sesja jest aktywna
- Zamknięcie zakładki = kill procesu

### 6. CLAUDE.md Manager

- Podgląd i edycja `CLAUDE.md` per projekt
- Edycja `~/.claude/CLAUDE.md` (globalny)
- Prosty edytor tekstowy (CodeMirror lub Monaco)

---

## Stack techniczny

| Warstwa          | Technologia                                        |
| ---------------- | -------------------------------------------------- |
| Frontend         | Next.js 15, React, Tailwind                        |
| Terminal UI      | xterm.js + xterm-addon-fit + xterm-addon-web-links |
| WebSocket        | ws (server) + natywny WebSocket (browser)          |
| Pseudoterminal   | node-pty                                           |
| Backend API      | Next.js Route Handlers lub Express custom server   |
| File watching    | chokidar (watch `~/.claude/projects/`)             |
| Code editor      | Monaco Editor (dla CLAUDE.md)                      |
| Syntax highlight | Shiki                                              |

---

## Layout UI

```
┌─────────────────────────────────────────────────────┐
│  Claude Projects Manager                    [settings]│
├──────────────┬──────────────────────────────────────┤
│ PROJEKTY     │  [Historia] [Terminal] [CLAUDE.md]   │
│              │                                       │
│ > proj-A  3  │  Sesja: 2026-04-15 14:32             │
│   proj-B  1  │  ┌─────────────────────────────────┐ │
│   proj-C  7  │  │ $ claude --resume xyz123        │ │
│              │  │                                  │ │
│ [+ nowy]     │  │ > Zrób mi testy do AuthService  │ │
│              │  │ ◆ Odczytuję AuthService.ts...   │ │
│              │  │ ◆ Piszę auth.test.ts...         │ │
│              │  └─────────────────────────────────┘ │
│              │                                       │
│              │  [T1: proj-A] [T2: proj-C] [+]       │
│              │  ┌─────────────────────────────────┐ │
│              │  │ Terminal (xterm.js)              │ │
│              │  │ $▋                               │ │
│              │  └─────────────────────────────────┘ │
└──────────────┴──────────────────────────────────────┘
```

---

## Format danych — JSONL sesji

Każda linia to JSON event. Typy do obsłużenia:

- `user` — wiadomość użytkownika
- `assistant` — odpowiedź modelu
- `tool_use` — wywołanie narzędzia (Read, Bash, Glob...)
- `tool_result` — wynik narzędzia

Parser musi obsłużyć te 4 typy żeby sensownie renderować historię.

---

## Działanie file watchera

`chokidar` obserwuje `~/.claude/projects/` i przez WebSocket pushuje do frontendu eventy:

- nowy projekt wykryty
- nowa sesja w projekcie
- sesja zaktualizowana (trwa aktywna rozmowa)

Dzięki temu sidebar i historia odświeżają się live bez polling.

---

## Co NIE wchodzi w scope (v1)

- Wysyłanie wiadomości do Claude przez własne API (terminal wystarczy)
- Sync między maszynami
- Autentykacja (lokalny tool)
- Mobile
- Edycja historii sesji

---

## Kolejność budowania

1. Backend: odczyt `~/.claude/projects/` + REST API
2. Sidebar + Session Explorer (statyczne dane)
3. Conversation Viewer z parserem JSONL
4. WebSocket + node-pty + xterm.js (terminal)
5. Multi-tab terminal
6. File watcher + live updates
7. CLAUDE.md editor
