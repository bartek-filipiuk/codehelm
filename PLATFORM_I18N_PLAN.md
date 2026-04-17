# Plan: Cross-platform (Linux + macOS) + English-only UI

Standard: **security-first**, zero kompromisów na bezpieczeństwie, każdy task ma test + security gate przed commitem. Zasady fazy 0–7 zostają w mocy: CSP bez `unsafe-inline`, path-guard przez `fs.realpath` + prefix check, Host/Origin allowlist, CSRF double-submit, timing-safe compare, brak `eval`/`Function`/`dangerouslySetInnerHTML` z user input, audit log bez tokenów i env, resource caps nie ruszane.

## Context

`claude-ui` (docelowo `ptybook`) działa dziś tylko na Linuxie (README: "macOS/Windows out of scope for v1"). Celujemy w lokalny tool który każdy na macOS postawi bez walki z node-gyp. Równolegle UI jest po polsku — publikujemy repo i chcemy przyjmować zewnętrzne PRy, więc wszystko user-facing po angielsku.

Dwa osobne fronty w jednym planie:

1. **Cross-platform Linux + macOS** — Windows świadomie poza scope (WSL wystarczy).
2. **Rip & replace polskich stringów** — bez biblioteki i18n (lokalny tool dla jednego usera, nikt nie potrzebuje switchera).

Rebranding `claude-ui → ptybook` jest **osobny** (`REBRANDING_PLAN.md`). Kolejność: najpierw ten plan → potem rebrand (rebrand nie orze plików które i tak byśmy tłumaczyli).

## Decyzje (ustalone z userem)

| Obszar     | Decyzja                                                                  |
| ---------- | ------------------------------------------------------------------------ |
| Target OS  | Linux + macOS; Windows only via WSL (tylko sekcja w README)              |
| Installer  | Node-based `npx claude-ui-install` (po rebrandzie `npx ptybook install`) |
| i18n       | English-only, rip & replace, brak biblioteki                             |
| Komentarze | Tłumaczymy wszystkie na angielski                                        |

## Audit findings

**Blokery macOS (z Explore):**

1. `node-pty` — `@homebridge/node-pty-prebuilt-multiarch@0.12.0` nie ma darwin prebuildów per `package.json`. `pnpm install` na Macu próbuje node-gyp, zwykle pada.
2. Chromium discovery w `bin/claude-ui:62–77` pomija `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` oraz `Chromium.app`.
3. `lib/pty/spawn.ts:23` fallbackuje na `/bin/bash`; macOS domyślnie `zsh`. Przy ustawionym `$SHELL` działa.
4. `$XDG_RUNTIME_DIR` w `bin/claude-ui:54` — na macOS brak, fallback na `$TMPDIR` już jest.
5. Signal handling (SIGHUP/SIGTERM/SIGINT) — działa na macOS bez zmian (POSIX).

**i18n (z Explore):**

- 15 plików, ~140 unikalnych polskich stringów, wszystko w JSX.
- Największe skupiska: `SettingsDialog.tsx` (21), `CommandPalette.tsx` (14), `StatsBar.tsx` (14), `ProjectList.tsx` (12), `HelpOverlay.tsx` (10).
- `lib/jsonl/format-timestamp.ts` używa `Intl.RelativeTimeFormat('pl')` — zamienić na `'en'`.
- 11 polskich komentarzy w `lib/`, `tests/`.
- API error messages już po angielsku.
- `Intl.Collator` bez explicit locale — zostaje.
- `README.md:174` mówi "macOS out of scope" — poprawić.
- `app/layout.tsx` ma `<html lang="pl">` — zmienić na `"en"`.

## 6 nowych tasków (T24–T29) — zakres, DoD, security gate

### Cluster A — Cross-platform (T24–T26)

---

**T24 — Platform helpers + macOS shell/paths plumbing**

- **Goal:** centralny `lib/server/platform.ts` z `isMacOS()`, `isLinux()`, `defaultShell()`, `runtimeRootDir()`, `chromiumCandidates()`. Istniejące miejsca przechodzą na te helpery. Koniec hardcodów per-OS.
- **Touch:**
  - `lib/server/platform.ts` (new)
  - `bin/claude-ui` (XDG_RUNTIME_DIR + chromium lookup)
  - `lib/pty/spawn.ts` (resolveShell)
  - Nie ruszamy `lib/server/audit.ts` — `mode 0700` respektowane przez oba Unix-y.
- **Logic:**
  - `defaultShell()`: `$SHELL` jeśli zaczyna od `/` i `fs.existsSync`, inaczej `/bin/zsh` na darwin, `/bin/bash` na linux. Nigdy nie uruchamiamy `sh -c` (command injection risk).
  - `runtimeRootDir()`: `$XDG_RUNTIME_DIR` → `$TMPDIR` → `os.tmpdir()`. Zwrócona ścieżka zawsze przechodzi `fs.realpath` przed użyciem (path-guard style, nawet jeśli to naszego pliku — zero trust).
  - `chromiumCandidates()`: lista ścieżek per `process.platform`. Darwin: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, `/Applications/Chromium.app/...`, `/Applications/Arc.app/...`. Linux: `chromium`, `chromium-browser`, `google-chrome-stable`, `google-chrome`.
- **Security gate:**
  - Żadnych wywołań `spawn(shell, {shell: true})` — zawsze explicit binary + array args.
  - Każda kandydat-ścieżka przechodzi przez `fs.realpath` + check że plik istnieje i jest executable (`fs.accessSync(X_OK)`) zanim ją odpalimy.
  - Unit test: `chromiumCandidates('darwin')` zwraca tylko ścieżki pod `/Applications/`.
- **Tests:**
  - `tests/unit/server/platform.test.ts` — 6 scenariuszy: shell fallback dla każdej platformy, runtime dir z/bez XDG/TMPDIR, chromium candidates per-OS, chromium candidates ignoruje nieistniejące binaries.
- **DoD:**
  - Typecheck + lint + test:unit zielone.
  - Manualny test macOS: znajduje Google Chrome, PTY startuje z `zsh`, profile leci do `$TMPDIR/claude-ui/<uuid>` z mode 0700.
  - Manualny test Linux: regresja — nic się nie zmieniło.
  - Path-guard dalej passuje fuzz test (100 payloadów).

---

**T25 — node-pty macOS prebuild path**

- **Goal:** `pnpm install` na macOS (arm64 + x86_64) i Linux kończy się bez node-gyp. Zero natywnej kompilacji w CI i lokalnie.
- **Touch:** `package.json`, `pnpm-lock.yaml`, ewentualnie `lib/pty/spawn.ts` (import jeśli API się zmienia).
- **Logic:**
  - Plan A: `pnpm update @homebridge/node-pty-prebuilt-multiarch@latest` i weryfikacja że `node_modules/@homebridge/.../prebuilds/` zawiera `darwin-arm64/`, `darwin-x64/`, `linux-x64/`, `linux-arm64/`.
  - Plan B (jeśli A nie daje darwin): migracja na `node-pty@1.0.0` (upstream Microsoft, prebuildy dla wszystkich platform). API zgodne w 95%, `IPty` interface ten sam, `onData` / `onExit` / `resize` / `kill` bez zmian.
  - Plan C (ostateczność): dodanie `optionalDependencies` z prebuildami per-platform + postinstall walidacja.
- **Security gate:**
  - **Supply chain**: `pnpm audit --production` zero high/critical po upgrade.
  - `onlyBuiltDependencies` w `package.json` zostawiony, żeby nie odpalać arbitrary postinstallów.
  - Lockfile committed, `--frozen-lockfile` w CI wymuszony.
  - Nowa paczka pod shasum weryfikacja (pnpm robi to auto, ale upewnij się że nie wyłączono integrity checks).
- **Tests:**
  - Istniejące `tests/integration/pty/*` muszą przejść bez zmian.
  - Nowe smoke: `tests/unit/pty/load.test.ts` — `import('@homebridge/node-pty-prebuilt-multiarch')` lub `import('node-pty')` nie rzuca (catchowane, żeby test nie odpalał prebuild-install).
- **DoD:**
  - `pnpm install --frozen-lockfile` na świeżym Linuxie i świeżym macOS (ARM + Intel) kończy się 0-exit bez odpalania `node-gyp`.
  - `tests/integration/pty/manager.spec.ts` passuje (spawn, data, resize, kill, backpressure).
  - Audit log smoke: PTY spawn na macOS — linia w audit.log bez `env`, bez tokenu, bez `cwd` absolute jeśli poza `$HOME`.

---

**T26 — `claude-ui install` Node-based installer**

- **Goal:** jedno-komendowy setup dla świeżego systemu. `npx claude-ui-install` wykrywa OS, weryfikuje deps, instaluje, buduje, tworzy symlink.
- **Touch:**
  - `bin/install.ts` (new, ES module, shebang `#!/usr/bin/env node`).
  - `package.json` — entry `"bin": { ..., "claude-ui-install": "bin/install.ts" }`.
  - Helper `lib/install/checks.ts` (testowalne pure functions: `detectOs`, `resolveHomeBinDir`, `needsPathUpdate`).
- **Logic (steps):**
  1. OS gate: `process.platform` musi być `linux` lub `darwin`; inaczej exit 1 z komunikatem "Windows: use WSL and run inside a Linux shell".
  2. Node version: `process.versions.node` ≥ 20.11; inaczej exit 1 z sugestią `nvm install 20`.
  3. pnpm: jeśli `which pnpm` (via `spawnSync`, **array args**, **no shell:true**) fail → `corepack enable` + `corepack prepare pnpm@9 --activate`.
  4. `pnpm install --frozen-lockfile` (spawnSync, inherit stdio).
  5. Dry-load node-pty (dynamic import w try/catch) — jeśli rzuca, wypisz instrukcję naprawy.
  6. `chromiumCandidates()` z T24 — info "Found Chrome at X" lub "No Chromium/Chrome detected, install via your package manager before running". **Nie fail** — browser można dodać później.
  7. `pnpm build` (`next build`; `postbuild` kopiuje `server.ts`).
  8. Symlink `~/.local/bin/claude-ui` → `<repoRoot>/bin/claude-ui` (`fs.symlinkSync`). Przed symlinkiem `mkdir -p ~/.local/bin` (mode 0700).
  9. PATH check: jeśli `~/.local/bin` nie jest w `$PATH`, wypisz instrukcję per shell (`echo 'export PATH=...' >> ~/.zshrc` / `~/.bashrc`). **Nigdy nie modyfikuj shell rc automatycznie** — user musi sam.
  10. Final message: "Done. Run `claude-ui` to start."
- **Flagi:** `--dry-run`, `--help`, `--skip-build`, `--no-symlink`.
- **Security gate:**
  - Wszystkie spawne tylko `spawnSync(binary, args, {shell: false, timeout: 300000})`. Nigdy string commands.
  - Żadnego `exec()` z user-controlled input.
  - Symlink target przez `fs.realpath` — upewnij się że wskazuje wewnątrz repo (path-guard style). Jeśli target już istnieje i nie jest symlinkiem → fail, user decyduje co zrobić (never clobber).
  - `~/.local/bin` mode 0700 (właściciel ma wszystko, nic dla innych) — inaczej odrzucamy.
  - Proces nie zbiera env zmiennych, nie loguje ich. Jedyne logi to step ticki i finalny summary.
- **Tests:**
  - `tests/unit/install/checks.test.ts` — detectOs (linux/darwin/win32→throw), resolveHomeBinDir (expanded), needsPathUpdate (3 scenariusze).
  - `tests/unit/install/symlink-guard.test.ts` — odmowa gdy target jest zwykłym plikiem, OK gdy nie istnieje lub jest symlinkiem w poprawnym miejscu.
  - Ciężkie sekwencje (pnpm install, build) nie są testowane jednostkowo — weryfikacja manualna.
- **DoD:**
  - `node bin/install.ts --dry-run` na Linux i macOS wypisuje plan bez modyfikacji systemu.
  - Świeży `git clone` → `node bin/install.ts` (pełny) kończy się symlinkiem w `~/.local/bin/claude-ui` i działającym `claude-ui` startem.
  - `rg -e 'shell:\\s*true' bin/install.ts lib/install/` = 0 trafień.
  - Symlink guard test zielony.
  - Security suite przed merge zielony (rebinding, origin, bez cookie, CSRF replay, path traversal) — installer nie rusza tej warstwy, ale upewniamy się że przez update deps nic nie pękło.

---

### Cluster B — English-only UI (T27–T29)

---

**T27 — Rip Polish UI strings → English**

- **Goal:** ~140 polskich stringów w JSX → angielski. Zero biblioteki i18n. Testy dostosowane.
- **Touch (15 plików):**
  - `app/(ui)/sidebar/ProjectList.tsx`, `Search.tsx`
  - `app/(ui)/session-explorer/SessionList.tsx`, `ProjectHeader.tsx`
  - `app/(ui)/conversation/{Viewer,Outline,StatsBar,ReplayBar,MainPanel}.tsx`
  - `app/(ui)/terminal/{TabBar,Terminal}.tsx`
  - `app/(ui)/editor/MarkdownEditor.tsx`
  - `components/{CommandPalette,HelpOverlay,SettingsDialog}.tsx`
  - `lib/jsonl/format-timestamp.ts` (`'pl'` → `'en'`)
  - `app/layout.tsx` (`<html lang="pl">` → `"en"`)
  - callsite toastów z `lib/ui/toast.ts`
  - testy z hardcoded polskich tytułów — `tests/unit/components/**`
- **Logic:** tłumaczenie wprost, zwarty register. Przykłady:
  - "Wybierz sesję z listy." → "Pick a session to start."
  - "Szukaj w sesji…" → "Search in session…"
  - "Pauza" / "Odtwarzaj" → "Pause" / "Play"
  - "Prędkość odtwarzania" → "Playback speed"
  - "Zamknij zakładkę" → "Close tab", "Nowa zakładka" → "New tab"
  - "Limit 16 zakładek" → "16-tab limit reached"
  - "Zapisano bufor terminala" → "Terminal buffer saved"
  - "Skróty klawiaturowe" → "Keyboard shortcuts"
  - Placeholder `np. 42 · 5m · 1h30m` → `e.g. 42 · 5m · 1h30m`
  - Plural `{n} sesji` → `{n} sessions` (1 session corner-case akceptowany na razie).
- **Security gate:**
  - Zero nowych stringów przechodzi przez `dangerouslySetInnerHTML`. Grep musi to potwierdzić.
  - Nic nie idzie do `alert()`, `document.write`, `innerHTML`.
  - Błędy API renderowane w Viewer dalej przechodzą przez `rehype-sanitize` (bez zmian).
  - Toasts — `sonner` sam escape'uje, ale sprawdzić że nie wywołujemy go z HTML markup.
- **Tests:**
  - Istniejące testy komponentów z polskimi labeli (`ProjectList.test`, `HelpOverlay.test`, `CommandPalette.test`, `ReplayBar` jeśli są) — update asercji.
  - Dodać `tests/unit/i18n/no-polish.test.ts` — programowy grep przez `app/` i `components/` na `[ąćęłńóśźż]` w `.tsx` files; fail jeśli znalezione. To guard-rail przeciw regresji.
- **DoD:**
  - `rg -e '[ąćęłńóśźż]' app/ components/` = 0.
  - Wszystkie 408+ testów zielone po aktualizacji asercji.
  - Snapshoty (jeśli) zaktualizowane deliberately.
  - Manual smoke: każdy dialog/toast otwarty, tekst sensowny, grammarly-clean.

---

**T28 — Translate Polish code comments to English**

- **Goal:** 11 polskich komentarzy w `lib/`, `tests/` (+ cokolwiek nowego znalezionego grepem) → angielski.
- **Touch:** wszystkie pliki z `rg -e '[ąćęłńóśźż]' lib/ tests/ hooks/ stores/ app/api` w komentarzach.
- **Logic:** tłumaczenie zachowujące sens (nie streszczenie) — komentarz tłumaczy _dlaczego_, nie _co_.
- **Security gate:** zmiana komentarzy nie dotyka kodu, ale sanity check: diff nie zawiera żadnych zmian w `.ts` poza komentarzami (`git diff --word-diff` review przed commit).
- **Tests:** brak nowych; istniejące dalej zielone.
- **DoD:**
  - `rg -e '[ąćęłńóśźż]' lib/ tests/ hooks/ stores/ app/api` = 0.
  - Code review własny: żaden komentarz nie zmienił logiki przez przypadek.

---

**T29 — Update README + docs + language metadata**

- **Goal:** spójna dokumentacja angielska, Linux+macOS jako target, install sekcja z `npx claude-ui-install`.
- **Touch:** `README.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/PHASE-0.md`..`PHASE-7.md` (jeśli zawierają polskie fragmenty — sprawdzić), `CLAUDE.md` (repo).
- **Logic:**
  - README: usuń linię "macOS out of scope for v1" (README.md:174). Dodaj "Platform support: Linux + macOS. Windows: use WSL." Install → `npx claude-ui-install`.
  - `docs/SECURITY.md` — zostaw jeśli EN, przejrzyj.
  - `docs/ARCHITECTURE.md` — jw.
  - `CLAUDE.md` repo — jeśli są instrukcje po polsku, tłumacz (user-level preferencje językowe żyją w `~/.claude/CLAUDE.md`, nie w repo).
- **Security gate:**
  - Żadnych URLi wprowadzonych na ślepo (zasada).
  - Żadnych credentials / tokenów / przykładów z realnymi sekretami.
  - Install instructions **nie zachęcają** do `curl ... | bash` z nieznanych źródeł. Tylko `npx` z oficjalnego pakietu lub `git clone` + `node bin/install.ts`.
- **Tests:** brak nowych.
- **DoD:**
  - `rg -e '[ąćęłńóśźż]' README.md docs/` = 0.
  - README przeczytane end-to-end (świeżymi oczami), install flow działa na świeżej maszynie.
  - Żadnych dangling referencji do Polski w user-facing.

---

## Kolejność rekomendowana

1. **T25** — bez macOS node-pty nie ma co testować T24.
2. **T24** — platform helpers.
3. **T27 + T28** w jednym runie (czysty refactor, brak zależności).
4. **T26** — installer korzysta z T24 helpers.
5. **T29** — dokumentacja końcowa.

Jeśli scheduler bierze po kolei (T24→T29), też zadziała — T24 nie wymaga node-pty żeby się skompilować.

## Krytyczne pliki

- `bin/claude-ui`, `bin/install.ts` (new)
- `lib/server/platform.ts` (new)
- `lib/pty/spawn.ts`
- `package.json`, `pnpm-lock.yaml`
- `app/layout.tsx`, `lib/jsonl/format-timestamp.ts`
- 15 plików UI (patrz T27)
- `README.md`

## Reuse z istniejącego kodu

- `lib/security/path-guard.ts` — portable już dziś (`node:path.sep`). Nic nie ruszamy.
- `lib/server/config.ts` — `HOME` przez `homedir()`, portable.
- `lib/ui/toast.ts` — zostaje, tłumaczymy tylko content calli.
- `components/conversation/DiffView.tsx` — bez zmian.
- `hooks/use-replay.ts` — constants bez polskich labeli, zostaje.

## Cross-cutting security gates (przed merge całości)

- [ ] `pnpm audit --production` zero high/critical
- [ ] Playwright security suite zielony (rebinding, origin, bez cookie, CSRF replay, path traversal per endpoint)
- [ ] `audit.log` grep: brak tokenów, brak env, brak treści wiadomości
- [ ] `rg -e 'eval\\(|new Function\\(|dangerouslySetInnerHTML' app/ components/ lib/` = 0
- [ ] `rg -e 'shell:\\s*true' bin/ lib/install/` = 0
- [ ] CSP header bez `unsafe-inline` w `script-src`
- [ ] `Referrer-Policy: no-referrer` globalnie
- [ ] Chromium profile mode 0700, cleanup na SIGTERM (manual test macOS + Linux)
- [ ] Rate limits aktywne (REST + PTY + WS) — bez zmian, smoke test potwierdza
- [ ] Resource caps: 16 PTY, 1 MB body, 10 MB field — bez zmian
- [ ] `lsof -i :PORT` tylko 127.0.0.1 (Linux + macOS)
- [ ] Token rotation: restart → stare cookie → 401
- [ ] `rg -e '[ąćęłńóśźż]' app/ components/ lib/ tests/ hooks/ stores/ docs/ README.md` = 0
- [ ] README przeczytane end-to-end
- [ ] `tests/unit/i18n/no-polish.test.ts` zielony (guard przeciw regresji)

## Verification

1. **Unit**: `pnpm vitest run` — 408+ testów zielone + nowe dla platform helpers, install checks, symlink guard, i18n guard.
2. **Lint**: `pnpm lint` — zero warningów.
3. **Typecheck**: `pnpm typecheck` — zero.
4. **Integration**: `pnpm vitest run tests/integration` — REST + WS spawn/data/kill/backpressure zielone na obu platformach.
5. **Security suite**: `pnpm playwright test tests/security/*.spec.ts` — całość zielona.
6. **Manual macOS**: świeży klon → `node bin/install.ts --dry-run` (ok) → `node bin/install.ts` → `claude-ui` → Chrome otwiera UI → projekt → sesja → terminal `zsh` → CLAUDE.md save.
7. **Manual Linux**: to samo, regresja.
8. **String sweep**: `rg -e '[ąćęłńóśźż]' app/ components/ lib/ tests/ hooks/ stores/ docs/ README.md` = 0.
9. **Perf**: `pnpm playwright test tests/e2e/perf.spec.ts` — scroll 2000 msg FPS > 30, first byte < 50 ms, PTY RTT < 20 ms. Zero regresji po upgrade node-pty.

## Scope out (tego planu)

- Rebranding nazw `claude-ui → ptybook` (osobny, po tym planie).
- Windows natywnie (tylko README o WSL).
- i18n infrastructure (next-intl / react-intl) — jeśli w przyszłości.
- Homebrew tap / AUR / release binaries — po rebrandzie.
- Refactor komentarzy / nazw niezwiązanych z polskim — osobne porządki.
- systemd --user service integration.
