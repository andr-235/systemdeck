# AGENTS.md

## Agent skills

### Issue tracker

Issues live in GitHub Issues for andr-235/systemdeck (via `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles using default label names (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at repo root. See `docs/agents/domain.md`.

### Issue lifecycle

Create → sweep → triage → execute. See `docs/agents/create-issue.md` (structure
from `n8n-create-issue`, GitHub-only, new issues start at `needs-triage`),
`docs/agents/backlog-triage.md` (`triage-issues`/`triage-issue` as enrichment
only, no label auto-creation), `docs/agents/triage-labels.md` (canonical
`needs-triage`/`needs-info`/`ready-for-agent`/`ready-for-human`/`wontfix` +
`bug`/`enhancement`), `docs/agents/issue-tracker.md` (`gh` CLI as the only
GitHub substrate — no separate GitHub skill installed).

### Agent Skills

Skill-first: сначала вызови скилл через `Skill` tool, затем правь код. Каждая правка в `src/` имеет квитанцию `Skill`-вызова; без квитанции работа считается незавершённой.
Runtime — OpenCode (`.agents/skills` + `skills-lock.json`). Полный пайплайн — единственный источник правды в `opencode.json` (`agent.systemdeck.prompt`); здесь только гейт. В PR и комментарии к issue перечисли использованные скиллы (`Skills: id1, id2`) — это видимое доказательство вызова.

### SystemDeck Agent

Автономный агент `systemdeck` (`opencode.json:1`, `mode: primary`). Запуск: `opencode run --agent systemdeck "выполни #<issue>"` или `opencode --agent systemdeck`. Читает `AGENTS.md`/`CONTEXT.md`/`docs/adr/*.md` (поле `instructions`), вызывает скиллы через `Skill` tool по чеклисту из `prompt` (triage → spec/plan/ADR → implement → security-review → check → commit/PR). См. `opencode.json`.

## Commits

All commit messages are written in **Russian**. Format — `type: brief description` (e.g., `feat:`, `fix:`, `chore:`, `docs:`), body in Russian if needed.
