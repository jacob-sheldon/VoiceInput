#!/bin/bash

# Create a simple placeholder icon for the menu bar

ASSETS_DIR="$(dirname "$0")"
ICON_FILE="$ASSETS_DIR/icon.png"

if [ ! -f "$ICON_FILE" ]; then
    echo "Creating placeholder icon..."
    # Use ImageMagick if available, otherwise create a basic one
    if command -v convert &> /dev/null; then
        convert -size 16x16 xc:#333 -fill white -gravity center -pointsize 12 -annotate +0+0 "K" "$ICON_FILE"
        echo "Icon created: $ICON_FILE"
    else
        echo "ImageMagick not found. Please install:"
        echo "  brew install imagemagick"
        echo ""
        echo "Or manually create a 16x16 icon at: $ICON_FILE"
    fi
fi
