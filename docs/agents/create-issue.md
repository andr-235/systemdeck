# Создание issue (адаптация `n8n:create-issue`)

Канон структуры — из скилла `n8n:create-issue` (`.agents/skills/n8n-create-issue/SKILL.md`).
Системные отличия SystemDeck зафиксированы здесь и приоритетны над текстом скилла.

## Что берём из скилла без изменений

Шаблоны тел по типам:

- **bug** — `Description → Expected → Actual → Steps to reproduce → Context`.
- **feature / enhancement** — `Goal → Background → Scope → Acceptance criteria → Out of scope`.
- **tech debt** — `Summary → Current state → Proposed improvement → Motivation → Scope`.
- **spike** — `Goal → Context → Questions → Expected output → Acceptance criteria`.

Правила превью: показать заголовок и тело до создания, создавать только после подтверждения.

## Что отвязываем от n8n

1. **Только GitHub.** Ветка Linear из скилла (Linear MCP, команды, приоритеты
   `P0–P4`, статусы `Backlog/Todo`, Notion-lookup) в SystemDeck не используется.
   Создание — только через `gh issue create` (см. `docs/agents/issue-tracker.md`).
2. **Без n8n-специфики.** Не использовать: ограничение «GitHub — только баги»,
   редирект на форум, запрет ручных лейблов (`triage:pending`, `status:in-linear`),
   кросс-линковку Linear↔GitHub, версии n8n/Node/БД/режим исполнения из шаблона.
   Контекст бага для SystemDeck: версия приложения, сборка Windows, слой
   (`Main`/`Preload`/`Renderer`/`Shared` по `CONTEXT.md`).
3. **Стартовая метка — `needs-triage`.** Гардрэйл скилла «никогда не создавать
   в Triage» относится к Linear-пайплайну n8n и здесь инвертирован: новый issue
   SystemDeck создаётся с `needs-triage`, дальше его ведёт `triage`
   (см. `docs/agents/triage-labels.md`). Типовая метка (`bug`/`enhancement`)
   ставится сразу, если тип очевиден.
4. **Язык.** Тела EPIC/backlog в репозитории — на русском; ему следовать.
   Требование скилла про ASD-STE100 применяется только к англоязычным текстам
   при явной просьбе.

## Создание

```bash
gh auth status
gh issue create --title "<заголовок>" --body "$(cat <<'EOF'
<тело по шаблону типа>
EOF
)"
gh issue edit <n> --add-label "needs-triage"
```

Заголовок: sentence case, 5–15 слов, для фич — императив («Добавить …»),
для багов — симптом без префиксов вида `Bug:`. Дубликаты перед созданием —
поиск через `gh issue list --search`.
