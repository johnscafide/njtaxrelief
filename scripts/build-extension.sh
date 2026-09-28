#!/usr/bin/env bash
# Package the Watchdog browser extension for the Chrome Web Store.
set -euo pipefail
cd "$(dirname "$0")/.."
version=$(python3 -c "import json;print(json.load(open('extension/manifest.json'))['version'])")
mkdir -p dist
out="dist/watchdog-extension-${version}.zip"
rm -f "$out"
(cd extension && python3 -m zipfile -c "../$out" manifest.json background.js content.js popup.html popup.css popup.js icons)
echo "$out"
