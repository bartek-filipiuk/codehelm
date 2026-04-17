# Rebranding plan: `claude-ui` → `codehelm`

Target name: **`codehelm`**. Pre-flight verification still needed
before any rename (npm / pypi / github user+org / trademark search /
common product names). Previous candidate `ptybook` was dropped in
favour of `codehelm` — no availability research has been done on the
new name yet, so **Phase 0 starts with availability checks**; if
`codehelm` is taken, we stop and pick again before touching any code.

**Rule of thumb:** we stop saying "claude-ui" everywhere except when
referring to Claude Code CLI's ecosystem (`~/.claude/projects/`,
`CLAUDE.md`, `claude --resume`). That stays — it's Anthropic's naming.

---

## Phase 0 — Safety first

- **Verify `codehelm` is available.** Hard gate — if any of the
  following hits, stop and pick another name:
  - `npm view codehelm` returns a package (404 = free).
  - `pip show codehelm` / pypi web lookup (`https://pypi.org/project/codehelm/`).
  - `gh api /users/codehelm` and `gh api /orgs/codehelm` both 404.
  - Repo search: `gh search repos codehelm --limit 10` — no hits with
    stars or active development.
  - Trademark search: USPTO TESS + EUIPO eSearch + basic google
    `"codehelm" site:trademarks.*`.
  - Domain: `codehelm.dev` / `.io` availability (nice-to-have, not
    blocker).
- **Disable the scheduler trigger** before any rename. If it fires
  mid-migration it will try to commit against a moving target.
- Kill all running `./bin/claude-ui` instances locally — cookie names
  change, stale sessions will 401.

## Phase 1 — GitHub repo rename

```bash
gh repo rename codehelm -R bartek-filipiuk/claude-ui
git remote set-url origin https://github.com/bartek-filipiuk/codehelm.git
git fetch origin && git branch -u origin/main main
```

GitHub issues a permanent redirect from the old URL so existing links
(scheduler prompt, bookmarks, IMPROVEMENTPLAN references) keep working.

## Phase 2 — Code changes (renames)

| Area                     | Before                       | After                      |
| ------------------------ | ---------------------------- | -------------------------- |
| `package.json` name      | `claude-ui`                  | `codehelm`                  |
| `package.json` bin entry | `claude-ui`                  | `codehelm`                  |
| Launcher script path     | `bin/claude-ui`              | `bin/codehelm`              |
| Env var (auth token)     | `CLAUDE_UI_TOKEN`            | `CODEHELM_TOKEN`            |
| Env var (chromium path)  | `CLAUDE_UI_CHROMIUM`         | `CODEHELM_CHROMIUM`         |
| Auth cookie name         | `claude_ui_auth`             | `codehelm_auth`             |
| CSRF cookie name         | `claude_ui_csrf`             | `codehelm_csrf`             |
| Chromium profile dir     | `claude-ui-<uid>-<uuid>`     | `codehelm-<uid>-<uuid>`     |
| Audit log dir            | `~/.claude/claude-ui/`       | `~/.codehelm/`              |
| UI `<title>`             | `claude-ui`                  | `codehelm`                  |
| UI sidebar header        | `claude-ui`                  | `codehelm`                  |
| Logger event names       | `claude_ui_ready` etc.       | `codehelm_ready` etc.       |

## Phase 3 — Code that stays

- `~/.claude/projects/` — owned by Claude Code CLI. Do not touch.
- `CLAUDE.md`, `claude --resume`, "Claude Code CLI" references — not ours.
- Slug encoding `-home-bartek-...` — CLI format, we only read it.
- Internal TypeScript identifiers (class / function / type names) —
  not user-facing, no need to churn them.

## Phase 4 — README + banner

- Regenerate the flux-2-pro banner with the same prompt but swap
  `"claude-ui"` → `"codehelm"` in the wordmark. Overwrite
  `screens/banner.webp`.
- Global find-replace in README, with manual review to avoid touching
  "Claude Code CLI" references.

## Phase 5 — Docs

- Update: `IMPROVEMENTPLAN.md`, `TASKS.md`, `docs/ARCHITECTURE.md`,
  `docs/SECURITY.md`, `docs/PHASE-0..7.md`.
- Leave untouched: `claude-projects-manager-spec.md` (original spec, a
  historical document), `~/.claude/plans/...` (separate system).

## Phase 6 — Tests

- `tests/fixtures/fake-home/.claude/...` — path stays (CLI format).
- `tests/integration/helpers/start-server.ts` — env var rename.
- All 18 playwright specs — batch sed on `CLAUDE_UI_TOKEN`.
- Full pipeline must pass:
  ```
  pnpm typecheck && pnpm lint && pnpm test:unit \
    && pnpm test:integration && pnpm test:e2e \
    && pnpm audit && pnpm build
  ```

## Phase 7 — Scheduler re-enable

Update the `claude-ui-nightly-worker` trigger:
- Rename to `codehelm-nightly-worker`.
- Prompt URL: `https://github.com/bartek-filipiuk/codehelm`.
- Flip `enabled: true` once smoke passes.

## Phase 8 — Smoke test

```bash
./bin/codehelm
```

Manual checks:
- Chromium opens on `127.0.0.1:<port>`, no `unauthorized` page.
- Sidebar loads projects, alias rename works.
- Shell tab spawns, `echo hello` echoes.
- `claude --resume <id>` tab types the command correctly.
- CLAUDE.md edit + save writes to disk.
- Category filters (User/Assistant/Tools/System) toggle.

---

## Commit strategy

Single commit: `chore: rename project to codehelm`. Easier review, one
rollback point, one tag:

```bash
git tag v1.0.0-codehelm
git push origin v1.0.0-codehelm
```

If something slips through, `git revert` that commit and we're back.

## Local cleanup for the operator

After migration succeeds, the operator's machine will have orphan state
under the old paths:

```bash
# keep history
mv ~/.claude/claude-ui ~/.codehelm

# or nuke it
rm -rf ~/.claude/claude-ui
```

Shell aliases (`.bashrc` / `.zshrc`) pointing at `claude-ui` should be
flipped to `codehelm`.

---

## Open decision

**Audit log path.** Two options:

1. `~/.codehelm/` — clean break from the CLI namespace. Logs from codehelm
   get their own home. Preferred.
2. `~/.claude/codehelm/` — keeps logs under CLI's hierarchy. Tidier from
   the OS perspective but implies more coupling than we actually have.

Default to option 1 unless a reason surfaces to stay nested.

---

## Estimated time

Around 45–60 minutes of attended work:

- 5 min: disable scheduler, rename repo, set upstream
- 20 min: find-replace + fix tests (dev server hot-reloads)
- 10 min: regenerate banner + polish README
- 10 min: full pipeline + smoke test
- 5 min: re-enable scheduler, confirm next run

Schedule the rebrand for a window outside the scheduler's active hours
(so: before 20:30 UTC or after 05:00 UTC).
