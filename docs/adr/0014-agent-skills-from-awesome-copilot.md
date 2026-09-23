# Агент и курированные скиллы из awesome-copilot

Контекст — нужен автономный агент для triage/implement в `systemdeck` без размывания границ `Main`/`Preload`/`Renderer`/`Shared` (ADR 0002) и без дублирования 7 существующих скиллов (`skills-lock.json`). Решили: рантайм — OpenCode (`.agents/skills` + `skills-lock.json` как единственный источник правды), `awesome-copilot` подключать курированно через `npx skills add` / прямое копирование `SKILL.md` (6 старт-скиллов: `create-architectural-decision-record`, `create-specification`, `create-implementation-plan`, `conventional-commit`, `security-review`, `git-commit`), `AGENTS.md`/`CONTEXT.md` — канон терминов `Agent`/`Skill`/`Instruction` (раздел `## Agent Skills`).

## Considered Options

- Полный импорт 300+ скиллов из `github/awesome-copilot` — покрывает всё, но засоряет `.agents/skills`, усложняет `skills-lock.json` и триггерит ложные срабатывания скиллов.
- GitHub Copilot как primary (`.github/agents/`, `.github/instructions/`, `copilot-instructions.md`) — нативно для awesome-copilot, но требует второго источника правды параллельно OpenCode и дублирует `AGENTS.md`.
- Ручное копирование без `skills-lock.json` — просто, но ломает воспроизводимость (`npx skills experimental_install`) и аудит хешей.

## Consequences

- Агент берёт только `ready-for-agent` (PR-only, `check:boundaries` + `typecheck` + `test` обязательны), `wontfix`/`ready-for-human` — человеку; коммиты — `conventional-commit` + требование `AGENTS.md` «на русском, `type: кратко`».
- 6 скиллов дополняют существующие `react`/`typescript`/`vitest`/`feature-arch`/`playwright` и т.д., без замены; обновление — `npx skills update` или повторное копирование с пересчётом `computedHash` в `skills-lock.json`.
- `.github/copilot-instructions.md` — опциональный ре-экспорт `AGENTS.md`/`CONTEXT.md` если понадобится Copilot Chat, не источник правды.
- Риск — дрейф awesome-copilot (хеши в `skills-lock.json` устаревают); митигация — пин хеша + периодический `skills update`.
