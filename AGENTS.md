# AGENTS.md

## Agent skills

### Issue tracker

Issues live in GitHub Issues for andr-235/systemdeck (via `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles using default label names (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at repo root. See `docs/agents/domain.md`.

### Agent Skills

Runtime — OpenCode (`.agents/skills` + `skills-lock.json`). Курированный набор из `github/awesome-copilot`: `create-architectural-decision-record`, `create-specification`, `create-implementation-plan`, `conventional-commit`, `security-review`, `git-commit` (+ существующие 7 из `PyModel`). Установка — `npx skills add github/awesome-copilot --skill <name> -y` с фиксацией `computedHash`. Агент берёт только `ready-for-agent` → PR, обязателен `npm run check` (`lint`, `format:check`, `check:boundaries`, `typecheck`, `test`). См. `CONTEXT.md` раздел `Agent Skills` и `docs/adr/0014-agent-skills-from-awesome-copilot.md`.

### SystemDeck Agent

Автономный агент `systemdeck` (`opencode.json:1`, `mode: primary`). Запуск: `opencode run --agent systemdeck "выполни #<issue>"` или `opencode --agent systemdeck`. Читает `AGENTS.md`/`CONTEXT.md`/`docs/adr/*.md` (поле `instructions`), вызывает скиллы через `Skill` tool по чеклисту из `prompt` (triage → spec/plan/ADR → implement → security-review → check → commit/PR). См. `opencode.json`.

## Commits

All commit messages are written in **Russian**. Format — `type: brief description` (e.g., `feat:`, `fix:`, `chore:`, `docs:`), body in Russian if needed.
