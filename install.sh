#!/usr/bin/env sh
# Install opencode-quota into the global OpenCode config directory.
set -eu

SRC=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DEST="${XDG_CONFIG_HOME:-$HOME/.config}/opencode/plugins/opencode-quota"

mkdir -p "$(dirname "$DEST")"
rm -rf "$DEST"
mkdir -p "$DEST"
cp "$SRC/index.ts" "$SRC/tui.tsx" "$SRC/tui.js" "$SRC/package.json" "$DEST/"

echo "Installed opencode-quota -> $DEST"
echo "Restart OpenCode or run: opencode service restart"
