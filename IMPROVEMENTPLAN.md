# Improvement Plan — claude-ui

Stan bazowy: 7 faz ukończonych (phase-0-done → phase-7-done).
Ten plan porządkuje pomysły na dalszy rozwój UX/UI. Każdy punkt ma subiektywną
ocenę wartości/kosztu:

- 🟢 **łatwe, duży zysk**
- 🟡 **średnie, warte rozważenia**
- 🟠 **droższe / niszowe / ambitne**

---

## 1. Ustawienia globalne

Jeden modal "Settings", persist w `~/.claude/claude-ui/settings.json`.

- 🟢 **Font size** — xs/sm/md/lg (Viewer + Terminal osobno)
- 🟢 **Font family** — sans / mono / custom (JetBrains Mono, Fira Code, etc.)
- 🟢 **Theme** — presety: Dark / Darker / High contrast / Solarized dark /
  custom colors przez CSS variables
- 🟢 **Viewer density** — compact / comfortable / spacious (padding, line-height)
- 🟢 **Default filters** — domyślny stan chipów (np. "Tools: off")
- 🟡 **Keybindings override** — własne skróty (`/` = focus search, `t` = new
  shell, `g g` / `G` = scroll)
- 🟡 **Timestamp format** — relative / ISO / 24h local

## 2. Viewer — głębszy research w sesji

- 🟢 **Outline/minimap sesji** — cienka kolumna z markerami per wiadomość
  (kolor per typ, wysokość ≈ długość treści). Klik → skok.
- 🟢 **Jump to timestamp** — input `2026-04-16 17:30` → skok do najbliższego
  eventu
- 🟢 **Session stats bar** — expandowany pasek: tool calls per narzędzie
  (Bash: 42, Read: 18, Edit: 7), czas trwania, tokeny (jeśli są w JSONL)
- 🟡 **Diff-friendly tool_result dla Edit/Write** — rozpoznaj `Edit`/`Write`
  tool_use + tool_result, renderuj jako kolorowy diff zamiast raw stdout
- 🟡 **"Kontekst" na kliknięcie tool_result** — pokaż parent tool_use obok
  (pair up po tool_use_id)
- 🟠 **Copy session snippet** — zaznacz zakres → "Copy as markdown" /
  "Share URL" (deep-link)

## 3. Sidebar / projects

- 🟢 **Grupowanie** — po prefixie (`client-projects/`, `main-projects/`,
  `experiment-projects/`) lub ręczne tagi per projekt
- 🟢 **Favorite / pin** — gwiazdki, przypięte na górze
- 🟢 **Sort toggle** — last-activity / name / session-count
- 🟢 **Resizable columns** — drag na granicach (sidebar ↔ sessions ↔ viewer),
  localStorage persist
- 🟡 **Multi-select sesji → batch export do MD** (jeden plik, nagłówki per
  sesja)
- 🟡 **Alias edytowalny z wielu miejsc** — również w MainPanel header gdy
  projekt aktywny

## 4. Terminal

- 🟢 **Clear scrollback** + **Save session to file** (na aktywnej zakładce)
- 🟢 **Quick actions per projekt** — predefiniowane komendy (`git status`,
  `pnpm test`), config w `<project>/.claude-ui.json`
- 🟡 **Pasek kontekstowy** — git branch + dirty status (poll co 5 s)
- 🟡 **Split pane w tabie** — horizontal split, dwa shelle obok siebie
- 🟡 **Theme per-tab** — inny kolor dla `claude` vs `bash` vs `ssh`

## 5. CLAUDE.md editor

- 🟢 **Preview toggle** — podgląd markdown obok edytora (split)
- 🟢 **Diff przed zapisem** — "Show diff" pokazuje co się zmieni vs disk
- 🟢 **Recent files dropdown** — globalny + wszystkie per-project
- 🟡 **Skills/Agents editor** — analogiczny widok dla `~/.claude/agents/`
  i `~/.claude/skills/`
- 🟡 **Snippets manager** — zapisuj często używane bloki, wstaw Ctrl+Space

## 6. Kreatywne 🎨

- 🟠 **Conversation graph** — wizualizacja sesji jako DAG: user messages
  jako węzły, tool_use jako gałęzie (D3/dagre canvas)
- 🟠 **Replay mode** — przewijanie sesji z autoplay: 2× / 5× / real-time.
  Dla analizy po fakcie
- 🟠 **Cost estimator** — licz koszt per sesja/projekt z `usage.input_tokens`
  i `output_tokens` (konfigurowalne stawki per model)
- 🟠 **Daily digest** — widok "dzień X": wszystkie sesje chronologicznie,
  filtrable po projekcie, timeline view
- 🟠 **Komentarze do sesji** — notatki do konkretnej wiadomości,
  persist w `.claude/claude-ui/notes/`, eksport jako "learnings"

## 7. Polish

- 🟢 **Loading skeletons dopasowane** — część za generyczna (szare paski),
  lepiej naśladować finalny layout
- 🟢 **Empty states z ilustracją** — dziś gołe teksty
- 🟢 **Keyboard shortcuts overlay** — `?` pokazuje wszystkie skróty
- 🟢 **Command palette (Ctrl+K)** — switch projektu / sesji / action
  ("open CLAUDE.md for current project", "new shell", etc.)
- 🟡 **Toast system** — zapis, błędy, conflict, watcher reconnect (shadcn
  Sonner)

## 8. Technical / pod maską

- 🟢 **Resolve-cwd fallback** — dla 24 projektów bez `resolvedCwd` próbuj
  `decodeSlug` → `fs.stat` → jeśli istnieje i pod `$HOME`, użyj jako cwd.
  Dziś te projekty nie pozwalają na "+ claude".
- 🟡 **Per-project config `<project>/.claude-ui.json`** — quick actions,
  skróty, default shell, alias lokalny
- 🟡 **Session compact** — usuwanie starych sesji > N dni z backup do MD

---

## Top 6 "minimum viable UX" (proponowany pierwszy sprint)

1. **Settings modal** (fonts + theme + density) 🟢
2. **Command palette Ctrl+K** 🟢
3. **Resizable columns** 🟢
4. **Session outline/minimap** 🟢
5. **Diff preview dla Edit tool** 🟡 (duża wartość dla code-review)
6. **Favorites/pin projektów** 🟢
