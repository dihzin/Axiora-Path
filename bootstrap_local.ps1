param(
  [switch]$ResetDb,
  [switch]$SkipNpmInstall,
  [switch]$SkipPythonInstall,
  [switch]$SkipSeeds
)

$ErrorActionPreference = "Stop"

function Write-Step($message) {
  Write-Host ""
  Write-Host "[bootstrap-local] $message" -ForegroundColor Cyan
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
$RootDir = $ScriptDir
$ApiDir = (Resolve-Path (Join-Path $RootDir "apps/api")).Path
$WebDir = (Resolve-Path (Join-Path $RootDir "apps/web")).Path
$DockerComposeFile = Join-Path $RootDir "infra/docker/docker-compose.yml"
$ApiEnvFile = Join-Path $ApiDir ".env"
$ApiEnvExample = Join-Path $ApiDir ".env.example"
$WebEnvFile = Join-Path $WebDir ".env.local"
$WebEnvExample = Join-Path $WebDir ".env.example"
$VenvPython = Join-Path $ApiDir ".venv\Scripts\python.exe"

Write-Step "Root: $RootDir"
Set-Location $RootDir

Write-Step "Starting infrastructure (Postgres + Redis)"
if ($ResetDb) {
  docker compose -f $DockerComposeFile down -v
}
docker compose -f $DockerComposeFile up -d
docker compose -f $DockerComposeFile ps

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

if (!$SkipNpmInstall) {
  Write-Step "Installing monorepo npm dependencies"
  Set-Location $RootDir
  npm install
}

if (!$SkipPythonInstall) {
  Write-Step "Preparing Python virtualenv"
  Set-Location $ApiDir
  if (!(Test-Path (Join-Path $ApiDir ".venv\Scripts\Activate.ps1"))) {
    python -m venv .venv
  }
  & $VenvPython -m pip install --upgrade pip
  & $VenvPython -m pip install -e ".[dev]"
}

Write-Step "Running migrations + schema audit"
Set-Location $RootDir
powershell -ExecutionPolicy Bypass -File (Join-Path $RootDir "scripts/axion_db_migrate_and_audit.ps1")

if (!$SkipSeeds) {
  Write-Step "Running recommended learning seeds"
  Set-Location $ApiDir
  & $VenvPython "scripts/seed_aprender_curriculum_structure.py"
  & $VenvPython "scripts/seed_aprender_content.py"
  & $VenvPython "scripts/bootstrap_learning_retention.py"
  & $VenvPython "scripts/seed_question_bank_math_portuguese.py"
  & $VenvPython "scripts/seed_question_templates_hybrid.py"
}

Write-Step "Done"
Write-Host "Next steps:"
Write-Host "1) API: cd `"$ApiDir`" ; .venv\Scripts\Activate.ps1 ; uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
Write-Host "2) WEB: cd `"$RootDir`" ; npm run dev --workspace @axiora/web"
Write-Host "3) Open: http://localhost:3000"
