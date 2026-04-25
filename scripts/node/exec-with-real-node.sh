#!/usr/bin/env bash

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "[1flowbase-exec-with-real-node] 缺少 Node 脚本入口" >&2
  exit 1
fi

resolve_realpath() {
  readlink -f "$1" 2>/dev/null || realpath "$1" 2>/dev/null || printf '%s' "$1"
}

resolve_node_near_pnpm() {
  local pnpm_path="$1"
  local candidate_node
  local current_dir
  local parent_dir

  candidate_node="$(dirname "${pnpm_path}")/node"
  if [[ -x "${candidate_node}" ]]; then
    resolve_realpath "${candidate_node}"
    return 0
  fi

  current_dir="$(dirname "${pnpm_path}")"
  while true; do
    candidate_node="${current_dir}/bin/node"
    if [[ -x "${candidate_node}" ]]; then
      resolve_realpath "${candidate_node}"
      return 0
    fi

    parent_dir="$(dirname "${current_dir}")"
    if [[ "${parent_dir}" == "${current_dir}" ]]; then
      return 1
    fi
    current_dir="${parent_dir}"
  done
}

resolved_pnpm=""
pnpm_binary="$(command -v pnpm || true)"

if [[ -n "${ONEFLOWBASE_NODE:-}" ]]; then
  if [[ ! -x "${ONEFLOWBASE_NODE}" ]]; then
    echo "[1flowbase-exec-with-real-node] ONEFLOWBASE_NODE 不可执行: ${ONEFLOWBASE_NODE}" >&2
    exit 1
  fi
  node_binary="$(resolve_realpath "${ONEFLOWBASE_NODE}")"
elif [[ -n "${pnpm_binary}" ]]; then
  resolved_pnpm="$(resolve_realpath "${pnpm_binary}")"
  node_binary="$(resolve_node_near_pnpm "${resolved_pnpm}" || true)"
else
  node_binary=""
fi

if [[ -z "${node_binary}" ]]; then
  node_binary="$(command -v node)"
fi

export PATH="$(dirname "${node_binary}")${PATH:+:${PATH}}"
export NODE="${node_binary}"
export npm_node_execpath="${node_binary}"
if [[ -n "${resolved_pnpm}" ]]; then
  export npm_execpath="${resolved_pnpm}"
fi

exec "${node_binary}" "$@"
