#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
HOST_NAME="com.emacs.eww"
LOCAL_BIN="$HOME/.local/bin"

if [ -z "${1:-}" ]; then
    echo "Usage: $0 <chrome-extension-id>"
    echo ""
    echo "To get the extension ID:"
    echo "  1. Open chrome://extensions"
    echo "  2. Enable 'Developer mode' (top right)"
    echo "  3. Click 'Load unpacked' and select:"
    echo "     $SCRIPT_DIR/extension"
    echo "  4. Copy the extension ID shown under the extension name"
    echo "  5. Run: $0 <extension-id>"
    exit 1
fi

EXTENSION_ID="$1"

# Copy host script to a local path (Chrome cannot execute from Dropbox).
mkdir -p "$LOCAL_BIN"
cp "$SCRIPT_DIR/open-in-eww-host" "$LOCAL_BIN/open-in-eww-host"
chmod +x "$LOCAL_BIN/open-in-eww-host"

mkdir -p "$HOST_DIR"
cat > "$HOST_DIR/$HOST_NAME.json" <<EOF
{
  "name": "$HOST_NAME",
  "description": "Open URLs in Emacs eww browser",
  "path": "$LOCAL_BIN/open-in-eww-host",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXTENSION_ID/"
  ]
}
EOF

echo "Installed native messaging host."
echo "  Manifest: $HOST_DIR/$HOST_NAME.json"
echo "  Script:   $LOCAL_BIN/open-in-eww-host"
echo ""
echo "Restart Chrome for changes to take effect."
