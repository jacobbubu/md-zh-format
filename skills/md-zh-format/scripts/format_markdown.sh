#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  format_markdown.sh [--workspace /abs/path] <md-zh-format args...>

Examples:
  format_markdown.sh README.md
  format_markdown.sh docs/a.md docs/b.md --write
  format_markdown.sh docs/a.md docs/b.md --check
  format_markdown.sh --workspace /repo README.md --print-width 100 --prose-wrap always

Notes:
  - All trailing arguments are passed to md-zh-format CLI as-is.
  - Wrapper resolves runnable CLI in this order:
    1) <workspace>/node_modules/.bin/tsx + <workspace>/src/cli.ts
    2) node <workspace>/dist/cli.js
    3) md-zh-format from PATH
EOF
}

workspace="${PWD}"
if [[ "${1:-}" == "--workspace" ]]; then
  if [[ $# -lt 3 ]]; then
    echo "Error: --workspace requires a path and CLI arguments." >&2
    usage >&2
    exit 2
  fi
  workspace="$2"
  shift 2
fi

if [[ "${1:-}" == "--help-wrapper" ]]; then
  usage
  exit 0
fi

if [[ $# -lt 1 ]]; then
  echo "Error: missing md-zh-format arguments." >&2
  usage >&2
  exit 2
fi

workspace="$(cd "${workspace}" && pwd)"

cmd=()
if [[ -x "${workspace}/node_modules/.bin/tsx" && -f "${workspace}/src/cli.ts" ]]; then
  cmd=("${workspace}/node_modules/.bin/tsx" "${workspace}/src/cli.ts")
elif [[ -f "${workspace}/dist/cli.js" ]]; then
  cmd=("node" "${workspace}/dist/cli.js")
elif command -v md-zh-format >/dev/null 2>&1; then
  cmd=("md-zh-format")
else
  echo "Error: unable to find runnable md-zh-format CLI in workspace or PATH." >&2
  echo "Hint: run npm install in ${workspace}, or build dist/cli.js, or install @jacobbubu/md-zh-format globally." >&2
  exit 127
fi

(
  cd "${workspace}"
  "${cmd[@]}" "$@"
)
