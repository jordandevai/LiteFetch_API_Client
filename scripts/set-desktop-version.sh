#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TAURI_CONF="$ROOT/desktop/tauri.conf.json"
CARGO_TOML="$ROOT/desktop/Cargo.toml"

if [ $# -ne 1 ]; then
  echo "usage: $0 <version>" >&2
  exit 1
fi

NEXT_VERSION="$1"
if ! [[ "$NEXT_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "error: version must be semver-like MAJOR.MINOR.PATCH (got '$NEXT_VERSION')" >&2
  exit 1
fi

node - "$TAURI_CONF" "$NEXT_VERSION" <<'NODE'
const fs = require('fs');
const path = process.argv[2];
const next = process.argv[3];
const raw = fs.readFileSync(path, 'utf8');
const json = JSON.parse(raw);
json.version = next;
fs.writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
NODE

perl -0pi -e "s/^version\\s*=\\s*\"[0-9]+\\.[0-9]+\\.[0-9]+\"/version = \"$NEXT_VERSION\"/m" "$CARGO_TOML"

echo "desktop version set to $NEXT_VERSION"
