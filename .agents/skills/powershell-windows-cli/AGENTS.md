# Agent Guide for This Repository

## What this repo is

This is an **agent skill** for PowerShell and Windows CMD/Batch command generation. It is designed to be loaded by AI coding agents when the user asks about Windows command-line automation.

## How to use this repo

1. **Primary entry point**: read `SKILL.md` first. It contains the trigger conditions, core principles, command patterns, and safety rules.
2. **Deep dives**: use files in `references/` when the topic requires detailed Windows-specific knowledge.
3. **Tools**: invoke `scripts/validate_ps.py` to check generated PowerShell for safety issues, and `scripts/generate_template.py` to generate boilerplate commands.
4. **Evals**: see `evals/evals.json` for expected behavior test cases.

## When to trigger

Trigger this skill when the user mentions any of the following:

- PowerShell, pwsh, Windows PowerShell, PowerShell 7
- CMD, command prompt, batch, `.bat`, `.cmd`
- Windows Terminal, Windows command line, Windows shell
- Windows administration, Windows automation
- Registry, services, event logs, scheduled tasks
- WMI, CIM, Active Directory, UAC, execution policy
- Converting a bash/Linux command to Windows

## Scope and anti-goals

**In scope:** local PowerShell 5.1/7+ and CMD/Batch command generation; Windows file system, services, processes, registry, event logs, scheduled tasks, networking, environment variables, ACLs, UAC, execution policy.

**Out of scope:** Azure/Entra/Microsoft Graph, Exchange Online/Intune/SCCM deep administration, PowerShell DSC/module authoring, full GUI automation, COM interop beyond one-liners, malware analysis. For these, use domain-specific tooling.

**Definitions:**
- *New work* = scripts authored today on Windows 10/11, Server 2016+, or cross-platform. Default to `pwsh.exe`.
- *Destructive operation* = deletes, overwrites, stops, restarts, reconfigures system state, or modifies registry. Preview with `-WhatIf` first.
- *Critical step* = mutates state, runs external program, accesses remote resource, or runs unattended. Use `-ErrorAction Stop` or `try/catch`.
- *Untrusted input* = user chat, web requests, environment variables, external files, or regex-parsed command output.

## Coding conventions

- Prefer PowerShell 7 (`pwsh.exe`) for new work.
- Use full cmdlet names, not aliases, in scripts and examples.
- Always warn about destructive operations and offer `-WhatIf` first.
- Note when elevation / "Run as Administrator" is required.
- Quote paths that contain spaces; use `Join-Path` when possible.
- Explicitly specify `-Encoding UTF8` for text file operations.

## Output format

When answering user questions, follow the format in `SKILL.md`:

1. Brief answer.
2. Code block labeled `powershell` or `batch`.
3. Explanation of key parts.
4. Caveats / safety notes.
5. Alternative shell version if relevant.

## Safety rules

- Never suggest `Set-ExecutionPolicy Unrestricted` as a default.
- Never use `Invoke-Expression` on untrusted input.
- Always preview destructive commands with `-WhatIf` before giving the real command.
- Warn users about registry and service modifications that require elevation.
- If running on a non-Windows host, generate commands/scripts for the user to run; do not attempt to execute PowerShell/CMD locally unless `pwsh` is available and the user explicitly asks.
- For remote Windows targets, suggest WinRM/SSH remoting. Do not automate UAC elevation without user confirmation.
