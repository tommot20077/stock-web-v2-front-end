# Browser E2E 一鍵腳本(PowerShell 版,行為對齊 run-e2e.sh)
# 環境變數:E2E_BACKEND_DIR / E2E_BACKEND_PORT / E2E_SKIP_BUILD / E2E_KEEP / E2E_ENV_ONLY
# 參數:原樣傳給 playwright test(預設 --grep @smoke)
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$PlaywrightArgs)
$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppDir = (Resolve-Path (Join-Path $ScriptDir '..')).Path
$BackendDir = if ($env:E2E_BACKEND_DIR) { $env:E2E_BACKEND_DIR } else { Join-Path $AppDir '..\..\..\java\stock-web-v2' }
$BackendPort = if ($env:E2E_BACKEND_PORT) { $env:E2E_BACKEND_PORT } else { '8080' }
$ArtifactsDir = Join-Path $ScriptDir 'artifacts'
$ComposeFile = Join-Path $ScriptDir 'docker-compose.yml'
$HealthUrl = "http://localhost:$BackendPort/actuator/health"
$BackendLog = Join-Path $ArtifactsDir 'backend.log'
$script:BackendProc = $null

New-Item -ItemType Directory -Force -Path $ArtifactsDir | Out-Null

function Write-Log([string]$Message) { Write-Host "[run-e2e] $Message" }

function Dump-Diagnostics {
    Write-Log '=== compose logs(最後 100 行/服務)==='
    docker compose -f $ComposeFile logs --tail 100
    if (Test-Path $BackendLog) {
        Write-Log '=== backend log(最後 100 行)==='
        Get-Content $BackendLog -Tail 100
    }
}

function Invoke-Cleanup {
    if ($env:E2E_KEEP -eq '1' -or $env:E2E_ENV_ONLY -eq '1') {
        Write-Log '保留 infra 與後端(E2E_KEEP/E2E_ENV_ONLY)'
        return
    }
    if ($script:BackendProc -and -not $script:BackendProc.HasExited) {
        Write-Log "停止後端(pid=$($script:BackendProc.Id))"
        Stop-Process -Id $script:BackendProc.Id -Force -ErrorAction SilentlyContinue
    }
    Write-Log '停止 compose infra'
    docker compose -f $ComposeFile down -v --remove-orphans | Out-Null
}

function Test-HealthUp {
    try {
        $res = Invoke-WebRequest -Uri $HealthUrl -TimeoutSec 2 -UseBasicParsing
        # actuator 的 Content-Type(vnd.spring-boot.actuator.v3+json)在 PS 5.1 會以 byte[] 回傳
        $text = if ($res.Content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($res.Content) } else { [string]$res.Content }
        return ($text -match '"status"\s*:\s*"UP"')
    } catch { return $false }
}

try {
    # 0. 前置檢查
    if (Test-HealthUp) {
        Write-Log "ERROR: port $BackendPort 已有服務回應 health,請先停止舊的後端"
        exit 1
    }

    # 1. infra
    Write-Log '啟動 compose infra…'
    docker compose -f $ComposeFile up -d --wait
    if ($LASTEXITCODE -ne 0) { throw 'compose up 失敗' }

    # 2. 後端 build
    if ($env:E2E_SKIP_BUILD -ne '1') {
        Write-Log '後端 package(skipTests)…'
        Push-Location $BackendDir
        try {
            & .\mvnw.cmd -pl stock-start -am package -DskipTests --no-transfer-progress -q
            if ($LASTEXITCODE -ne 0) { throw 'mvn package 失敗' }
        } finally { Pop-Location }
    }

    $Jar = Get-ChildItem (Join-Path $BackendDir 'stock-start\target\stock-start-*.jar') -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $Jar) { throw "找不到 stock-start jar(於 $BackendDir\stock-start\target\)" }

    # 3. 啟動後端
    Write-Log "啟動後端:$($Jar.FullName)(profile=e2e-browser,log → $BackendLog)"
    $env:SERVER_PORT = $BackendPort
    $script:BackendProc = Start-Process -FilePath 'java' `
        -ArgumentList @('-jar', $Jar.FullName, '--spring.profiles.active=e2e-browser') `
        -RedirectStandardOutput $BackendLog -RedirectStandardError "$BackendLog.err" `
        -NoNewWindow -PassThru

    # 4. 等待 health UP(timeout 90s)
    Write-Log "等待 $HealthUrl …"
    $elapsed = 0
    while (-not (Test-HealthUp)) {
        if ($script:BackendProc.HasExited) {
            Write-Log 'ERROR: 後端行程已退出'
            Dump-Diagnostics
            exit 1
        }
        if ($elapsed -ge 90) {
            Write-Log 'ERROR: health 等待逾時(90s)'
            Dump-Diagnostics
            exit 1
        }
        Start-Sleep -Seconds 2
        $elapsed += 2
    }
    Write-Log "後端 health UP(${elapsed}s)"

    if ($env:E2E_ENV_ONLY -eq '1') {
        Write-Log "E2E_ENV_ONLY=1:環境已就緒(backend pid=$($script:BackendProc.Id)),不執行 Playwright"
        exit 0
    }

    # 5. Playwright(無參數預設只跑 @smoke;其他參數原樣傳遞,如 --grep @extended)
    if (-not $PlaywrightArgs -or $PlaywrightArgs.Count -eq 0) {
        $PlaywrightArgs = @('--grep', '@smoke')
    }
    Write-Log "執行 Playwright:npx playwright test $($PlaywrightArgs -join ' ')"
    Push-Location $AppDir
    try {
        & npx playwright test @PlaywrightArgs
        $testExit = $LASTEXITCODE
    } finally { Pop-Location }

    if ($testExit -ne 0) {
        Write-Log "Playwright 失敗(exit=$testExit)。artifacts:"
        Write-Log "  - 後端 stdout:$BackendLog"
        Write-Log "  - HTML report:$(Join-Path $ArtifactsDir 'playwright-report')"
        Write-Log "  - trace/screenshot:$(Join-Path $ArtifactsDir 'test-results')"
    }
    exit $testExit
} finally {
    Invoke-Cleanup
}
