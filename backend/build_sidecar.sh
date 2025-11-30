#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT/backend"
DESKTOP_DIR="$ROOT/desktop"
OUT_DIR="$BACKEND_DIR/dist"
BIN_NAME="litefetch-backend"

command -v poetry >/dev/null 2>&1 || { echo "poetry required"; exit 1; }

cd "$BACKEND_DIR"
rm -rf build "$OUT_DIR"
poetry run pyinstaller \
  --name "$BIN_NAME" \
  --onefile \
  --clean \
  --paths "$BACKEND_DIR" \
  run.py

mkdir -p "$DESKTOP_DIR/bin"
cp "$OUT_DIR/$BIN_NAME" "$DESKTOP_DIR/bin/$BIN_NAME"

if command -v rustc >/dev/null 2>&1; then
  TRIPLE="$(rustc -vV | sed -n 's/^host: //p')"
  if [ -n "$TRIPLE" ]; then
    cp "$OUT_DIR/$BIN_NAME" "$DESKTOP_DIR/bin/${BIN_NAME}-${TRIPLE}"
  fi
fi

echo "Sidecar built at: $OUT_DIR/$BIN_NAME"
