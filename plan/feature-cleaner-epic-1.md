---
goal: Детализация EPIC 5 Cleaner — план, ADR модели безопасности и дочерние issues (issue #22)
version: 1.0
date_created: 2026-09-23
last_updated: 2026-09-23
owner: systemdeck-agent
status: 'Completed'
tags: [feature, cleaner, epic-5, planning]
---

# Introduction

![Status: Completed](https://img.shields.io/badge/status-Completed-brightgreen)

План детализирует EPIC 5 Cleaner (issue #22) после стабилизации Storage Analyzer (EPIC 4 #21 закрыт): фиксирует модель безопасности `scan → candidates → preview → explicit selection → delete → report` в ADR 0017, раскладывает scope эпика на 6 дочерних issues и обновляет тело родителя по образцу EPIC 4. Изменений `src/` в данной работе нет — только `plan/`, `docs/adr/` и issue-трекер.

## 1. Requirements & Constraints

- **REQ-001**: Создан ADR 0017 с моделью безопасности Cleaner: запрет blind-очистки, узкие allow-правила на категорию, Protected Paths, per-item отчёт без скрытия частичных результатов.
- **REQ-002**: Создано 6 дочерних issues с телами по шаблону feature (Goal → Background → Scope → Acceptance criteria → Out of scope), каждое ссылается на родителя #22 и следует Constraints эпика.
- **REQ-003**: Тело родителя #22 обновлено: список дочерних issues, Architecture decisions (grill, ADR 0017), Definition of Done — по образцу тела #21.
- **REQ-004**: Новые дочерние issues стартуют с `needs-triage` (+ `enhancement`, если тип очевиден), по `docs/agents/create-issue.md`; метки вне таксономии не создаются (`docs/agents/backlog-triage.md`).
- **REQ-005**: Коммит и PR оформлены по conventional-commit/git-commit на русском; первая строка тела PR — `Refs #22` (эпик не закрывается детализацией), в теле PR и комментарии к issue — строка `Skills: ...`.
- **CON-001**: Без правок `src/` — границы Main/Preload/Renderer/Shared (ADR 0002) и IPC Contract не затрагиваются; проверки `check:boundaries`/`typecheck`/`test` остаются зелёными по построению.
- **CON-002**: EPIC 4 строго read-only (ADR 0013) — Cleaner не переиспользует Scan Result как источник кандидатов на удаление: файловая детальность для preview/selection проектируется отдельно в EPIC 5.
- **CON-003**: Renderer никогда не удаляет напрямую и не классифицирует: правила, Protected Paths и удаление — только Main; Renderer получает готовые кандидаты и отчёт.
- **GUD-001**: Язык тел EPIC/backlog — русский (`docs/agents/create-issue.md`).
- **PAT-001**: Гранулярность детей mirrors EPIC 4 (#35–#40): движок → протокол → категории группами → страница.

## 2. Implementation Steps

### Implementation Phase 1

- GOAL-001: Зафиксировать решение и разложить эпик на дочерние issues

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-001 | Создать plan/feature-cleaner-epic-1.md по шаблону create-implementation-plan, покрывает REQ-001, REQ-002, REQ-003, REQ-004, REQ-005, CON-001, CON-002, CON-003 | ✅ | 2026-09-23 |
| TASK-002 | Создать docs/adr/0017-cleaner-safety-model.md (модель безопасности, allow-правила, Protected Paths, per-item отчёт, альтернативы), покрывает REQ-001, CON-002, CON-003 | ✅ | 2026-09-23 |
| TASK-003 | Создать 6 дочерних issues через gh issue create с needs-triage (+enhancement), покрывает REQ-002, REQ-004 | ✅ | 2026-09-23 |
| TASK-004 | Обновить тело #22 (дочерние issues, Architecture decisions, Definition of Done), покрывает REQ-003 | ✅ | 2026-09-23 |

### Implementation Phase 2

- GOAL-002: Упаковать работу в коммит и PR

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-005 | Закоммитить plan + ADR сообщением на русском (conventional-commit/git-commit), покрывает REQ-005 | ✅ | 2026-09-23 |
| TASK-006 | Открыть PR с первой строкой тела Refs #22, лейблом ready-for-human и строкой Skills, прокомментировать #22, покрывает REQ-005 | ✅ | 2026-09-23 |

## 3. Alternatives

- **ALT-001**: **Description**: Реализовать Cleaner целиком одним PR без дочерних issues.
- **ALT-002**: **Rejection Reason**: Нарушает гранулярность EPIC 4 (#35–#40) и лимит 80 строк/файл; деструктивные операции требуют пошагового ревью.
- **ALT-003**: **Description**: Переиспользовать Scan Result EPIC 4 как источник кандидатов на удаление.
- **ALT-004**: **Rejection Reason**: Scan Result — lean без per-file дерева (ADR 0013), данные протухают; кандидаты Cleaner строятся отдельным движком с собственными allow-правилами.
- **ALT-005**: **Description**: Закрыть #22 этим PR через Closes #22.
- **ALT-006**: **Rejection Reason**: Детализация не реализует очистку; эпик закрывается только реализацией всех детей.

## 4. Dependencies

- **DEP-001**: Issue #22 (EPIC 5 Cleaner) — родитель данной работы.
- **DEP-002**: Issue #21 (EPIC 4, закрыт) — образец структуры тела и грань read-only (ADR 0013).
- **DEP-003**: ADR 0013 — Scan Result как грань-контракт, политика Reparse Point и Inaccessible Directory.

## 5. Files

- **FILE-001**: plan/feature-cleaner-epic-1.md — план данной работы.
- **FILE-002**: docs/adr/0017-cleaner-safety-model.md — модель безопасности Cleaner.

## 6. Testing

- **TEST-001**: `gh issue list --state all` показывает 6 новых дочерних issues с `needs-triage`, каждый ссылается на #22.
- **TEST-002**: Тело #22 содержит список детей, Architecture decisions (grill, ADR 0017) и Definition of Done.
- **TEST-003**: `npm run check:boundaries`, `npm run typecheck`, `npm run test` зелёные (src/ не тронут).

## 7. Risks & Assumptions

- **RISK-001**: Удаление файлов необратимо — mitigated REQ-001/CON-003 (явное подтверждение, allow-правила, Protected Paths, per-item отчёт).
- **RISK-002**: Корзина и браузерные кэши требуют разных Windows-механизмов (COM/Shell, профили браузеров) — mitigated разбиением на отдельные детские issues с собственными acceptance-критериями.
- **ASSUMPTION-001**: Storage Analyzer стабилен (EPIC 4 закрыт + фиксы #50/#52) — предпосылка тела #22 («детализация после стабилизации»).
- **ASSUMPTION-002**: Удаление выполняется средствами Main (PowerShell/Node fs, Shell API для корзины) — детали фиксируются в детских issues, не в ADR.

## 8. Related Specifications / Further Reading

- Issue #22 — EPIC 5 Cleaner (родитель).
- Issue #21 (EPIC 4) — образец тела с детьми, решениями и DoD.
- ADR 0013 — storage-scan-protocol (read-only грань, lean Scan Result).
- CONTEXT.md — Scan, Scan Result, Protected Process (прецедент хардкод-списка в Main), Log Redaction.
- docs/agents/create-issue.md — GitHub-only создание, стартовая метка needs-triage.
