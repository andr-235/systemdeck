# Common Pitfalls and Fixes

## PowerShell

### 1. Execution policy blocks scripts

**Symptom**: `cannot be loaded because running scripts is disabled on this system`

**Fixes**:

```powershell
# Check current policy
Get-ExecutionPolicy -List

# Run a single script with bypass (does not change policy; prefer pwsh on PS 7)
pwsh -ExecutionPolicy Bypass -File C:\scripts\myscript.ps1
# Fallback for Windows PowerShell 5.1-only systems:
# powershell -ExecutionPolicy Bypass -File C:\scripts\myscript.ps1

# Set user-scope policy (less risky than machine-scope)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

Do not recommend `Unrestricted` as a default.

### 2. `$null` on the left side of comparisons

```powershell
# WRONG: can return unexpected results with collections
if ($myArray -eq $null) { ... }

# RIGHT
if ($null -eq $myArray) { ... }
```

### 3. Using `Invoke-Expression` on untrusted input

**Risk**: command injection.

**Fix**: use argument lists or parameterized calls instead.

```powershell
# Risky
Invoke-Expression "Get-Process -Name $name"

# Safer
Get-Process -Name $name

# For external programs
Start-Process -FilePath 'myapp.exe' -ArgumentList '--input', $userInput
```

### 4. Aliases in scripts

**Fix**: use full cmdlet names in scripts that will be shared or reused.

```powershell
# Avoid in scripts
ls | ?{ $_.Length -gt 1MB }

# Prefer
Get-ChildItem | Where-Object { $_.Length -gt 1MB }
```

### 5. Accidental string interpolation in file paths

```powershell
# If $env:TEMP contains backslashes, this is usually fine,
# but user-supplied paths should be validated.
$path = Join-Path -Path $env:TEMP -ChildPath 'log.txt'
```

### 6. `Write-Host` vs `Write-Output`

- `Write-Output` sends to the pipeline (use this for returning data).
- `Write-Host` writes to the console only and bypasses the pipeline.

### 7. `-eq` vs `=`

- `-eq` is comparison.
- `=` is assignment.

```powershell
if ($x -eq 5) { ... }   # comparison
$x = 5                   # assignment
```

### 8. Collection enumeration with `ForEach-Object`

```powershell
# Good for pipeline
Get-Process | ForEach-Object { $_.Name }

# Good for arrays
foreach ($proc in Get-Process) { $proc.Name }
```

### 9. String vs number comparison

```powershell
# This is string comparison
'10' -lt '2'    # True (lexicographic)

# Convert first
[int]'10' -lt [int]'2'  # False
```

## CMD / Batch

### 1. Variables inside blocks

**Symptom**: Variables set inside `if` or `for` blocks do not update.

**Fix**: enable delayed expansion.

```batch
setlocal enabledelayedexpansion
for /L %%i in (1,1,5) do (
    set "x=%%i"
    echo !x!
)
```

### 2. Percent signs in batch files

**Symptom**: `Echo is off.` or unexpected output.

**Fix**: double percent signs inside batch files.

```batch
for %%f in (*.txt) do echo %%f
```

### 3. Trailing spaces in `set` assignments

**Symptom**: Extra space in variable value.

**Fix**: use `set "var=value"` syntax.

```batch
set "name=John"
```

### 4. `if exist` with directories

```batch
if exist "C:\MyDir\" (
    echo directory exists
) else (
    echo directory does not exist
)
```

### 5. Escaping special characters

```batch
echo ^&       # prints &
echo ^|       # prints |
echo ^>       # prints >
echo ^^       # prints ^
```

## Cross-shell issues

### 1. Path separators

PowerShell accepts both `/` and `\`. CMD generally requires `\` or quoted paths.

### 2. Single vs double quotes

- PowerShell: single quotes are literal, double quotes expand variables.
- CMD: single quotes have no special meaning; double quotes group arguments.

### 3. Exit codes

- PowerShell: `$LASTEXITCODE` for external programs; `$?` for cmdlet success.
- CMD: `%ERRORLEVEL%`.

### 4. Environment variable persistence

- PowerShell: `[Environment]::SetEnvironmentVariable('NAME', 'value', 'User')` persists.
- CMD: `setx NAME value` persists (but truncates values over 1024 characters).
