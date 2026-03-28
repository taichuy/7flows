#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
TMP_DIR="${REPO_ROOT}/tmp/dev-up"
LOG_DIR="${REPO_ROOT}/tmp/logs"
PID_DIR="${TMP_DIR}/pids"
MIDDLEWARE_DIR="${REPO_ROOT}/docker"
API_DIR="${REPO_ROOT}/api"
WEB_DIR="${REPO_ROOT}/web"

mkdir -p "${LOG_DIR}" "${PID_DIR}"

ACTION="start"
START_WORKER=1
START_BEAT=1
SKIP_INSTALL=0
COMPOSE_CMD=()

usage() {
  cat <<'USAGE'
用法：bash scripts/dev-up.sh [选项] [start|stop|status]

默认动作：start

选项：
  --skip-install  跳过 `uv sync` 与 `pnpm install`
  --no-worker     不启动 Celery worker
  --no-beat       不启动 Celery beat
  -h, --help      查看帮助

示例：
  bash scripts/dev-up.sh
  bash scripts/dev-up.sh --skip-install
  bash scripts/dev-up.sh start --skip-install
  bash scripts/dev-up.sh status
  bash scripts/dev-up.sh stop
USAGE
}

log() {
  printf '[7flows-dev-up] %s\n' "$*"
}

require_command() {
  local command_name="$1"
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "缺少命令：${command_name}" >&2
    exit 1
  fi
}

display_path() {
  local path="$1"
  if [[ "${path}" == "${REPO_ROOT}/"* ]]; then
    printf '%s' "${path#"${REPO_ROOT}/"}"
  else
    printf '%s' "${path}"
  fi
}

resolve_compose_command() {
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD=(docker compose)
    return 0
  fi

  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD=(docker-compose)
    return 0
  fi

  echo '缺少 `docker compose` 或 `docker-compose` 命令' >&2
  exit 1
}

run_middleware_compose() {
  (
    cd "${MIDDLEWARE_DIR}"
    "${COMPOSE_CMD[@]}" -f docker-compose.middleware.yaml "$@"
  )
}

copy_if_missing() {
  local example_path="$1"
  local target_path="$2"
  if [[ ! -f "${target_path}" ]]; then
    cp "${example_path}" "${target_path}"
    log "已创建 $(display_path "${target_path}")"
  fi
}

pid_file_for() {
  local service_name="$1"
  printf '%s/%s.pid' "${PID_DIR}" "${service_name}"
}

log_file_for() {
  local service_name="$1"
  printf '%s/%s.log' "${LOG_DIR}" "${service_name}"
}

is_pid_running() {
  local pid_file="$1"
  if [[ ! -f "${pid_file}" ]]; then
    return 1
  fi

  local pid
  pid="$(cat "${pid_file}")"
  if [[ -z "${pid}" ]]; then
    return 1
  fi

  kill -0 "${pid}" >/dev/null 2>&1
}

cleanup_stale_pid() {
  local pid_file="$1"
  if [[ -f "${pid_file}" ]] && ! is_pid_running "${pid_file}"; then
    rm -f "${pid_file}"
  fi
}

start_background_process() {
  local service_name="$1"
  local workdir="$2"
  local command_line="$3"
  local pid_file
  local log_file

  pid_file="$(pid_file_for "${service_name}")"
  log_file="$(log_file_for "${service_name}")"
  cleanup_stale_pid "${pid_file}"

  if is_pid_running "${pid_file}"; then
    log "${service_name} 已在运行，PID=$(cat "${pid_file}")"
    return 0
  fi

  log "启动 ${service_name}，日志：$(display_path "${log_file}")"
  (
    cd "${workdir}"
    nohup bash -lc "${command_line}" >>"${log_file}" 2>&1 &
    echo $! >"${pid_file}"
  )

  sleep 1
  if is_pid_running "${pid_file}"; then
    log "${service_name} 已启动，PID=$(cat "${pid_file}")"
    return 0
  fi

  echo "${service_name} 启动失败，请查看 ${log_file}" >&2
  tail -n 40 "${log_file}" >&2 || true
  return 1
}

stop_background_process() {
  local service_name="$1"
  local pid_file
  pid_file="$(pid_file_for "${service_name}")"
  cleanup_stale_pid "${pid_file}"

  if ! [[ -f "${pid_file}" ]]; then
    log "${service_name} 未运行"
    return 0
  fi

  local pid
  pid="$(cat "${pid_file}")"
  if kill -0 "${pid}" >/dev/null 2>&1; then
    kill "${pid}" >/dev/null 2>&1 || true
    sleep 1
    if kill -0 "${pid}" >/dev/null 2>&1; then
      kill -9 "${pid}" >/dev/null 2>&1 || true
    fi
  fi

  rm -f "${pid_file}"
  log "${service_name} 已停止"
}

print_process_status() {
  local service_name="$1"
  local pid_file
  pid_file="$(pid_file_for "${service_name}")"
  cleanup_stale_pid "${pid_file}"

  if is_pid_running "${pid_file}"; then
    printf '%-12s running (PID=%s)\n' "${service_name}" "$(cat "${pid_file}")"
  else
    printf '%-12s stopped\n' "${service_name}"
  fi
}

run_with_retries() {
  local description="$1"
  local attempts="$2"
  shift 2

  local attempt=1
  while (( attempt <= attempts )); do
    if "$@"; then
      return 0
    fi

    if (( attempt == attempts )); then
      echo "${description} 失败，已尝试 ${attempts} 次" >&2
      return 1
    fi

    log "${description} 第 ${attempt} 次失败，3 秒后重试"
    sleep 3
    attempt=$((attempt + 1))
  done
}

prepare_env_files() {
  copy_if_missing "${MIDDLEWARE_DIR}/middleware.env.example" "${MIDDLEWARE_DIR}/middleware.env"
  copy_if_missing "${API_DIR}/.env.example" "${API_DIR}/.env"
  copy_if_missing "${WEB_DIR}/.env.example" "${WEB_DIR}/.env.local"
}

ensure_dependencies() {
  if (( SKIP_INSTALL == 1 )); then
    log "按参数跳过依赖同步"
    return 0
  fi

  log "同步 API 依赖"
  (cd "${API_DIR}" && uv sync --extra dev)

  log "同步 Web 依赖"
  (cd "${WEB_DIR}" && corepack pnpm install)
}

start_middleware() {
  log "启动 docker 中间件"
  run_middleware_compose up -d
}

run_migrations() {
  log "执行 API migration"
  run_with_retries "API migration" 10 bash -lc "cd '${API_DIR}' && uv run alembic upgrade head"
}

start_all() {
  require_command docker
  require_command uv
  require_command corepack
  require_command bash
  resolve_compose_command

  prepare_env_files
  ensure_dependencies
  start_middleware
  run_migrations

  start_background_process api "${API_DIR}" "exec uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
  if (( START_WORKER == 1 )); then
    start_background_process worker "${API_DIR}" "exec uv run celery -A app.core.celery_app.celery_app worker --loglevel INFO --pool solo"
  fi
  if (( START_BEAT == 1 )); then
    start_background_process beat "${API_DIR}" "exec uv run celery -A app.core.celery_app.celery_app beat --loglevel INFO"
  fi
  start_background_process web "${WEB_DIR}" "exec corepack pnpm dev"

  cat <<SUMMARY

启动完成：
- API:  http://localhost:8000
- Web:  http://localhost:3010
- 日志: tmp/logs/

常用命令：
- 查看状态：bash scripts/dev-up.sh status
- 停止全部：bash scripts/dev-up.sh stop
SUMMARY
}

stop_all() {
  require_command docker
  resolve_compose_command

  stop_background_process web
  stop_background_process beat
  stop_background_process worker
  stop_background_process api

  log "停止 docker 中间件"
  run_middleware_compose down
}

status_all() {
  require_command docker
  resolve_compose_command

  print_process_status api
  print_process_status worker
  print_process_status beat
  print_process_status web
  printf '\nDocker middleware:\n'
  run_middleware_compose ps || true
}

while (( $# > 0 )); do
  case "$1" in
    start|stop|status)
      if [[ "${ACTION}" != "start" ]]; then
        echo "动作只能指定一次：已收到 ${ACTION}，又收到 $1" >&2
        usage >&2
        exit 1
      fi
      ACTION="$1"
      ;;
    --skip-install)
      SKIP_INSTALL=1
      ;;
    --no-worker)
      START_WORKER=0
      ;;
    --no-beat)
      START_BEAT=0
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "未知参数：$1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

case "${ACTION}" in
  start)
    start_all
    ;;
  stop)
    stop_all
    ;;
  status)
    status_all
    ;;
  *)
    usage >&2
    exit 1
    ;;
esac
