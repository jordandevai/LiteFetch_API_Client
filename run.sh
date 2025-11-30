#!/usr/bin/env bash
set -euo pipefail

# Simple one-shot runner: uses existing defaults (backend 8333, frontend 5111).
# Auto-installs deps if missing, then runs both; Ctrl+C stops both.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT/backend"
FRONTEND_DIR="$ROOT/frontend"
BACKEND_PORT="${PORT:-8333}"
FRONTEND_PORT="${FRONTEND_PORT:-5111}"

command -v poetry >/dev/null 2>&1 || { echo "poetry required"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "npm required"; exit 1; }

[ -d "$FRONTEND_DIR/node_modules" ] || (cd "$FRONTEND_DIR" && npm install)
[ -d "$BACKEND_DIR/.venv" ] || (cd "$BACKEND_DIR" && poetry install)

cleanup() {
  [[ -n "${BACKEND_PID:-}" ]] && kill "$BACKEND_PID" 2>/dev/null || true
  [[ -n "${FRONTEND_PID:-}" ]] && kill "$FRONTEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

(cd "$BACKEND_DIR" && poetry run python run.py --port "$BACKEND_PORT" --dir "$ROOT/workspace") &
BACKEND_PID=$!

(cd "$FRONTEND_DIR" && npm run dev -- --host --port "$FRONTEND_PORT") &
FRONTEND_PID=$!

echo "Frontend: http://localhost:$FRONTEND_PORT"
echo "Backend:  http://127.0.0.1:$BACKEND_PORT"

wait "$BACKEND_PID" "$FRONTEND_PID"
