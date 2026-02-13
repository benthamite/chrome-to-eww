#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
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
echo "Installed script: $LOCAL_BIN/open-in-eww-host"

# Install manifest for a browser if its parent directory exists.
installed=0
install_manifest() {
    local browser="$1" host_dir="$2"
    local parent_dir
    parent_dir="$(dirname "$host_dir")"
    if [ ! -d "$parent_dir" ]; then
        return
    fi
    mkdir -p "$host_dir"
    cat > "$host_dir/$HOST_NAME.json" <<EOF
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
    echo "Installed manifest: $host_dir/$HOST_NAME.json ($browser)"
    installed=$((installed + 1))
}

case "$(uname -s)" in
    Darwin)
        install_manifest Chrome "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
        install_manifest Chromium "$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
        ;;
    Linux)
        install_manifest Chrome "$HOME/.config/google-chrome/NativeMessagingHosts"
        install_manifest Chromium "$HOME/.config/chromium/NativeMessagingHosts"
        ;;
    *)
        echo "Unsupported OS: $(uname -s)" >&2
        exit 1
        ;;
esac

if [ "$installed" -eq 0 ]; then
    echo "No supported browsers found" >&2
    exit 1
fi

echo ""
echo "Restart your browser for changes to take effect."
