# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

## Enrichment labels (non-canonical)

Batch sweep (`triage-issue` / `triage-issues`, see `docs/agents/backlog-triage.md`)
may also use existing tracker labels `question`, `documentation`, `duplicate`,
`invalid` for context. Dimensions `area:*`, `platform:*`, `api:*`, urgency,
importance and priority have no labels in this repo — they are recorded as text
in the triage summary, never auto-created. The canonical decision stays with the
five roles above plus categories `bug` / `enhancement`.
