# PowerShell + Windows CLI Agent Skill

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PowerShell 7](https://img.shields.io/badge/PowerShell-7+-blue.svg)](https://github.com/PowerShell/PowerShell)
[![Windows](https://img.shields.io/badge/Windows-10%2F11%2FServer-blue.svg)](https://www.microsoft.com/windows)

> **The missing AI agent skill for Windows.** Most coding agents are trained on Linux/bash patterns and produce broken PowerShell, unsafe CMD commands, or treat Windows like a second-class citizen. This skill fixes that.

## What problem this solves

AI agents (Claude, Kimi, Cursor, Copilot, etc.) often fail on Windows because they:

- Generate bash idioms that do not exist in PowerShell or CMD.
- Confuse PowerShell's **object pipeline** with Unix text pipelines.
- Miss Windows-specific concepts: registry, services, event logs, WMI/CIM, UAC, execution policy.
- Produce destructive commands without `-WhatIf` or elevation warnings.
- Use deprecated aliases like `ls`, `rm`, `cat`, `sort` in production scripts.

This skill gives agents a structured, safety-first guide to writing correct PowerShell 7 / Windows PowerShell 5.1 and CMD/Batch commands.

## Keywords

`powershell agent`, `windows cli agent`, `ai agent windows`, `powershell skill`, `cmd skill`, `batch ai`, `windows automation agent`, `agent skill powershell`, `powershell vs cmd`, `windows command line ai`, `powershell static checker`, `powershell code generator`, `windows system administration ai`, `registry ai`, `wmi cim agent`, `active directory ai`, `event log ai`.

## Features

- 📘 **Comprehensive SKILL.md** — frontmatter-triggered guide for agents with explicit scope, definitions, and execution-context guidance.
- 🛡️ **Safety-first patterns** — `-WhatIf`, elevation warnings, execution policy guidance, and banned permissive policies.
- ⚡ **Command templates** — generate common PowerShell/CMD snippets from intent with input validation and escaping.
- 🔍 **Static checker** — catch dangerous cmdlets, deprecated aliases/WMI, risky execution policies, and missing error handling.
- 📚 **Deep references** — registry, services, networking, WMI/CIM, Active Directory, pitfalls, PowerShell vs CMD, and bash-to-PowerShell Rosetta stone.
- 🧪 **Evals** — 20+ regression tests covering safety, format, CMD, and negative cases.
- 🤖 **Agent-native** — designed to be consumed by AI agents via `SKILL.md` and `AGENTS.md`.
- 🔄 **Autoresearch-ready** — includes the Autoresearch skill/command files so Claude Code/Codex can iterate on the skill itself.

## Installation

### As an agent skill

Copy or symlink this directory into your agent's skill path:

```bash
# Example for Kimi / kimi-code
ln -s "$(pwd)" ~/.agents/skills/powershell-windows-cli
```

### As a GitHub project

```bash
git clone https://github.com/UncertaintyDeterminesYou4ndMe/powershell-windows-cli-agent-skill.git
```

## Quick start

### Validate PowerShell code

```bash
python3 scripts/validate_ps.py -c "Get-Process | Stop-Process"
# Exit code 2: Stop-Process is destructive without -WhatIf

python3 scripts/validate_ps.py -c "Get-Process | Stop-Process -WhatIf"
# Exit code 0
```

### Generate command templates

```bash
python3 scripts/generate_template.py list-services --status Stopped --start-type Automatic

python3 scripts/generate_template.py query-events --log System --level Error --hours 24

python3 scripts/generate_template.py test-port --host example.com --port 443 --json
```

## Project structure

```
powershell-windows-cli-agent-skill/
├── SKILL.md                              # Agent-facing main guide
├── AGENTS.md                             # How agents should use this repo
├── README.md                             # Human-facing project overview
├── LICENSE                               # MIT
├── autoresearch/                         # Autoresearch probe report and outputs
│   └── probe-report.md
├── .claude/                              # Autoresearch skill/commands for Claude Code
│   ├── skills/autoresearch/
│   └── commands/autoresearch/
├── scripts/
│   ├── validate_ps.py                    # Static PowerShell checker
│   └── generate_template.py              # Command template generator
├── references/
│   ├── powershell-vs-cmd.md              # When to use which + translation guide
│   ├── bash-to-powershell.md             # Linux/bash to PowerShell/CMD Rosetta stone
│   ├── registry.md                       # Registry operations
│   ├── services-processes.md             # Services, processes, scheduled tasks
│   ├── wmi-cim.md                        # Modern CIM vs legacy WMI
│   ├── networking.md                     # Network diagnostics and firewall
│   ├── active-directory.md               # AD users, groups, computers
│   └── common-pitfalls.md                # Frequent mistakes and fixes
└── evals/
    └── evals.json                        # 20+ regression tests
```

## Why this matters for AI agents

Most training data for coding assistants is Linux-centric. When users ask:

> "How do I list stopped services on Windows?"

Agents often answer with `systemctl` or fragile bash-like PowerShell. This skill teaches agents to answer with:

```powershell
Get-Service | Where-Object { $_.Status -eq 'Stopped' }
```

And to explain that Windows services are objects, not text, and that restarting them may require elevation.

## Contributing

Issues and PRs are welcome. Focus areas:

- More command templates
- Better static analysis via PowerShell AST
- Additional references (IIS, Exchange, WinGet, WSL, Intune)
- Eval cases for regression testing

## License

MIT — see [LICENSE](./LICENSE).
