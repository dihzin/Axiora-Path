param(
  [switch]$ResetDb,
  [switch]$CleanWebCache,
  [switch]$SkipNpmInstall,
  [switch]$SkipPythonInstall,
  [switch]$SkipSeeds
)

$ErrorActionPreference = "Stop"

function Write-Step($message) {
  Write-Host ""
  Write-Host "[bootstrap-local] $message" -ForegroundColor Cyan
}

function Invoke-NativeStep {
  param(
    [Parameter(Mandatory = $true)][string]$Label,
    [Parameter(Mandatory = $true)][scriptblock]$Command
  )
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "[bootstrap-local] Failed at step: $Label (exit code $LASTEXITCODE)"
  }
}

function Set-Or-AppendEnvVar {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string]$Key,
    [Parameter(Mandatory = $true)][string]$Value
  )
  if (!(Test-Path $FilePath)) {
    New-Item -ItemType File -Path $FilePath -Force | Out-Null
  }
  $content = Get-Content $FilePath -Raw
  $pattern = "(?m)^" + [regex]::Escape($Key) + "=.*$"
  if ($content -match $pattern) {
    $updated = [regex]::Replace($content, $pattern, "$Key=$Value")
    Set-Content -Path $FilePath -Value $updated -NoNewline
  } else {
    if ($content.Length -gt 0 -and !$content.EndsWith("`n")) {
      $content += "`r`n"
    }
    $content += "$Key=$Value`r`n"
    Set-Content -Path $FilePath -Value $content -NoNewline
  }
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = (Resolve-Path (Join-Path $ScriptDir "..")).Path
$ApiDir = (Resolve-Path (Join-Path $RootDir "apps/api")).Path
$WebDir = (Resolve-Path (Join-Path $RootDir "apps/web")).Path
$DockerComposeFile = Join-Path $RootDir "infra/docker/docker-compose.yml"
$ApiEnvFile = Join-Path $ApiDir ".env"
$ApiEnvExample = Join-Path $ApiDir ".env.example"
$WebEnvFile = Join-Path $WebDir ".env.local"
$WebEnvExample = Join-Path $WebDir ".env.example"
$WebNextDir = Join-Path $WebDir ".next"
$VenvPython = Join-Path $ApiDir ".venv\Scripts\python.exe"

Write-Step "Root: $RootDir"
Set-Location $RootDir

Write-Step "Starting infrastructure (Postgres + Redis)"
if ($ResetDb) {
  Invoke-NativeStep -Label "docker compose down -v" -Command { docker compose -f $DockerComposeFile down -v }
}
Invoke-NativeStep -Label "docker compose up -d" -Command { docker compose -f $DockerComposeFile up -d }
Invoke-NativeStep -Label "docker compose ps" -Command { docker compose -f $DockerComposeFile ps }

Write-Step "Preparing env files"
if (!(Test-Path $ApiEnvFile)) {
  Copy-Item $ApiEnvExample $ApiEnvFile
}
if (!(Test-Path $WebEnvFile)) {
  Copy-Item $WebEnvExample $WebEnvFile
}

# Local defaults for DX (without HTTPS in localhost)
Set-Or-AppendEnvVar -FilePath $ApiEnvFile -Key "AXIORA_AUTH_COOKIE_SECURE" -Value "false"
Set-Or-AppendEnvVar -FilePath $ApiEnvFile -Key "AXIORA_AUTH_COOKIE_SAMESITE" -Value "lax"
Set-Or-AppendEnvVar -FilePath $ApiEnvFile -Key "AXIORA_CORS_ALLOWED_ORIGINS" -Value "http://localhost:3000"
Set-Or-AppendEnvVar -FilePath $WebEnvFile -Key "NEXT_PUBLIC_API_URL" -Value "http://localhost:8000"

if ($CleanWebCache) {
  Write-Step "Cleaning web build cache (.next)"
  if (Test-Path $WebNextDir) {
    Remove-Item -Recurse -Force $WebNextDir
  }
}

if (!$SkipNpmInstall) {
  Write-Step "Installing monorepo npm dependencies"
  Set-Location $RootDir
  Invoke-NativeStep -Label "npm install" -Command { npm install }
}

if (!$SkipPythonInstall) {
  Write-Step "Preparing Python virtualenv"
  Set-Location $ApiDir
  if (!(Test-Path (Join-Path $ApiDir ".venv\Scripts\Activate.ps1"))) {
    Invoke-NativeStep -Label "python -m venv .venv" -Command { python -m venv .venv }
  }
  Invoke-NativeStep -Label "pip install --upgrade pip" -Command { & $VenvPython -m pip install --upgrade pip }
  Invoke-NativeStep -Label "pip install -e .[dev]" -Command { & $VenvPython -m pip install -e ".[dev]" }
}

Write-Step "Running migrations + schema audit"
Set-Location $RootDir
Invoke-NativeStep -Label "axion_db_migrate_and_audit.ps1" -Command { powershell -ExecutionPolicy Bypass -File (Join-Path $RootDir "scripts/axion_db_migrate_and_audit.ps1") }

if (!$SkipSeeds) {
  Write-Step "Running recommended learning seeds"
  Set-Location $ApiDir
  Invoke-NativeStep -Label "seed_aprender_curriculum_structure.py" -Command { & $VenvPython "scripts/seed_aprender_curriculum_structure.py" }
  Invoke-NativeStep -Label "seed_aprender_content.py" -Command { & $VenvPython "scripts/seed_aprender_content.py" }
  Invoke-NativeStep -Label "bootstrap_learning_retention.py" -Command { & $VenvPython "scripts/bootstrap_learning_retention.py" }
  Invoke-NativeStep -Label "seed_question_bank_math_portuguese.py" -Command { & $VenvPython "scripts/seed_question_bank_math_portuguese.py" }
  Invoke-NativeStep -Label "seed_question_templates_hybrid.py" -Command { & $VenvPython "scripts/seed_question_templates_hybrid.py" }
}

Write-Step "Done"
Write-Host "Next steps:"
Write-Host "1) API: cd `"$ApiDir`" ; .venv\Scripts\Activate.ps1 ; uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
Write-Host "2) WEB: cd `"$RootDir`" ; npm run dev --workspace @axiora/web"
Write-Host "3) Open: http://localhost:3000"
