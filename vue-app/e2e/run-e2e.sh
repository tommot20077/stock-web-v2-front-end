#!/usr/bin/env bash
# Browser E2E 一鍵腳本:compose infra → 後端 build+run(e2e-browser)→ health 等待 → Playwright
# 環境變數:
#   E2E_BACKEND_DIR   後端 repo 路徑(預設 ../../../java/stock-web-v2,相對 vue-app)
#   E2E_BACKEND_PORT  後端 port(預設 8080)
#   E2E_SKIP_BUILD=1  略過 mvn package(需已有 jar)
#   E2E_KEEP=1        結束後保留 infra 與後端(除錯用)
#   E2E_ENV_ONLY=1    只起環境(不跑 Playwright),隱含 E2E_KEEP=1
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="${E2E_BACKEND_DIR:-$APP_DIR/../../../java/stock-web-v2}"
BACKEND_PORT="${E2E_BACKEND_PORT:-8080}"
ARTIFACTS_DIR="$SCRIPT_DIR/artifacts"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
HEALTH_URL="http://localhost:${BACKEND_PORT}/actuator/health"
BACKEND_LOG="$ARTIFACTS_DIR/backend.log"
BACKEND_PID=""

mkdir -p "$ARTIFACTS_DIR"

log() { printf '[run-e2e] %s\n' "$*"; }

dump_diagnostics() {
  log "=== compose logs(最後 100 行/服務)==="
  docker compose -f "$COMPOSE_FILE" logs --tail 100 || true
  if [ -f "$BACKEND_LOG" ]; then
    log "=== backend log(最後 100 行)==="
    tail -100 "$BACKEND_LOG" || true
  fi
}

cleanup() {
  if [ "${E2E_KEEP:-0}" = "1" ] || [ "${E2E_ENV_ONLY:-0}" = "1" ]; then
    log "E2E_KEEP/E2E_ENV_ONLY 已設,保留 infra 與後端(backend pid=${BACKEND_PID:-n/a})"
    return
  fi
  if [ -n "$BACKEND_PID" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    log "停止後端(pid=$BACKEND_PID)"
    kill "$BACKEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true
  fi
  log "停止 compose infra"
  docker compose -f "$COMPOSE_FILE" down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

# 0. 前置檢查:port 未被占用
if curl -fsS -o /dev/null --max-time 2 "$HEALTH_URL" 2>/dev/null; then
  log "ERROR: port ${BACKEND_PORT} 已有服務回應 health,請先停止舊的後端"
  BACKEND_PID=""; E2E_KEEP=1
  exit 1
fi

# 1. infra
log "啟動 compose infra…"
docker compose -f "$COMPOSE_FILE" up -d --wait

# 2. 後端 build
if [ "${E2E_SKIP_BUILD:-0}" != "1" ]; then
  log "後端 package(skipTests)…"
  (cd "$BACKEND_DIR" && ./mvnw -pl stock-start -am package -DskipTests --no-transfer-progress -q)
fi

JAR="$(ls "$BACKEND_DIR"/stock-start/target/stock-start-*.jar 2>/dev/null | head -1 || true)"
if [ -z "$JAR" ]; then
  log "ERROR: 找不到 stock-start jar(於 $BACKEND_DIR/stock-start/target/)"
  exit 1
fi

# 3. 啟動後端
log "啟動後端:$JAR(profile=e2e-browser,log → $BACKEND_LOG)"
SERVER_PORT="$BACKEND_PORT" java -jar "$JAR" --spring.profiles.active=e2e-browser >"$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!

# 4. 等待 health UP(timeout 90s)
log "等待 $HEALTH_URL …"
elapsed=0
until curl -fsS --max-time 2 "$HEALTH_URL" 2>/dev/null | grep -q '"status":"UP"'; do
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    log "ERROR: 後端行程已退出"
    dump_diagnostics
    exit 1
  fi
  if [ "$elapsed" -ge 90 ]; then
    log "ERROR: health 等待逾時(90s)"
    dump_diagnostics
    exit 1
  fi
  sleep 2
  elapsed=$((elapsed + 2))
done
log "後端 health UP(${elapsed}s)"

if [ "${E2E_ENV_ONLY:-0}" = "1" ]; then
  log "E2E_ENV_ONLY=1:環境已就緒(backend pid=$BACKEND_PID),不執行 Playwright"
  exit 0
fi

# 5. Playwright(Task 10 串接)
log "Playwright 串接尚未啟用(Task 10)"
