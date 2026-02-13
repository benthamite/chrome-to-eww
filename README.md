# Open in eww

A Chrome/Chromium extension that opens the current page or a link in
[Emacs eww](https://www.gnu.org/software/emacs/manual/html_mono/eww.html),
the built-in Emacs web browser.

## Features

- **Toolbar button**: click the extension icon to open the current tab in eww
- **Context menu**: right-click a link or page to open it in eww

## Requirements

- [Emacs](https://www.gnu.org/software/emacs/) with a running server
  (`M-x server-start` or `(server-start)` in your init file)
- Python 3

## Installation

### 1. Load the extension

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select the `extension/` directory
4. Copy the extension ID shown under the extension name

### 2. Install the native messaging host

```bash
./install.sh <extension-id>
```

This copies the host script to `~/.local/bin/` and registers it with
Chrome and/or Chromium. Restart your browser after running the script.

## How it works

The extension communicates with a small Python script (native messaging
host) that calls `emacsclient` to open the URL in eww. The host
automatically detects the location of `emacsclient` on your system.

## Supported platforms

- macOS (Homebrew ARM and Intel)
- Linux

Both Chrome and Chromium are supported.
