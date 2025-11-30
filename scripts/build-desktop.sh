#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT/backend"
FRONTEND_DIR="$ROOT/frontend"
DESKTOP_DIR="$ROOT/desktop"
BIN_DST="$DESKTOP_DIR/bin/litefetch-backend"

command -v poetry >/dev/null 2>&1 || { echo "poetry required"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "npm required"; exit 1; }

ensure_rust() {
  if command -v cargo >/dev/null 2>&1; then
    return
  fi
  echo "Installing Rust toolchain (rustup)..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  # shellcheck disable=SC1091
  source "$HOME/.cargo/env"
}

ensure_linux_deps() {
  # Tauri 2 prerequisites (Ubuntu/Debian)
  local pkgs=(
    build-essential
    libwebkit2gtk-4.1-dev
    libgtk-3-dev
    libayatana-appindicator3-dev
    librsvg2-dev
    libxdo-dev
    libssl-dev
    curl
    wget
    file
    pkg-config
    patchelf
  )
  if command -v apt-get >/dev/null 2>&1; then
    echo "Installing build dependencies via apt-get: ${pkgs[*]}"
    sudo apt-get update
    sudo apt-get install -y "${pkgs[@]}"
  else
    echo "Non-apt system detected; install WebKitGTK 4.1 + GTK/appindicator/openssl build deps manually."
  fi
}

ensure_linux_deps
ensure_rust

echo "==> Ensuring backend dependencies (Poetry with dev for PyInstaller)"
(cd "$BACKEND_DIR" && poetry install --with dev)

echo "==> Building backend sidecar (PyInstaller)"
(cd "$BACKEND_DIR" && ./build_sidecar.sh)

echo "==> Installing frontend dependencies"
if [ -f "$FRONTEND_DIR/package-lock.json" ]; then
  set +e
  (cd "$FRONTEND_DIR" && npm ci)
  NPM_STATUS=$?
  set -e
  if [ $NPM_STATUS -ne 0 ]; then
    echo "npm ci failed (lock mismatch). Falling back to npm install..."
    (cd "$FRONTEND_DIR" && npm install)
  fi
else
  (cd "$FRONTEND_DIR" && npm install)
fi

echo "==> Building frontend assets"
(cd "$FRONTEND_DIR" && npm run build)

echo "==> Verifying sidecar copy at $BIN_DST"
[ -f "$BIN_DST" ] || { echo "Sidecar not found at $BIN_DST"; exit 1; }
if command -v rustc >/dev/null 2>&1; then
  TRIPLE="$(rustc -vV | sed -n 's/^host: //p')"
  if [ -n "$TRIPLE" ]; then
    cp "$BIN_DST" "$DESKTOP_DIR/bin/litefetch-backend-$TRIPLE"
  fi
fi

echo "==> Building Tauri desktop package"
(cd "$FRONTEND_DIR" && npm run tauri:build)

DIST_DIR="$ROOT/dist/linux"
echo "==> Copying desktop bundles to $DIST_DIR"
mkdir -p "$DIST_DIR"
if ls "$DESKTOP_DIR/target/release/bundle/deb/"*.deb >/dev/null 2>&1; then
  cp "$DESKTOP_DIR/target/release/bundle/deb/"*.deb "$DIST_DIR/"
  echo "Copied Debian bundle(s) to $DIST_DIR"
else
  echo "No .deb bundles found at $DESKTOP_DIR/target/release/bundle/deb/"
fi

echo "==> Done"
