#!/bin/bash

# Sync icon.png and generate trayTemplate.png (fallback to a placeholder if needed).

ASSETS_DIR="$(dirname "$0")"
node "$ASSETS_DIR/create-icon.js"
