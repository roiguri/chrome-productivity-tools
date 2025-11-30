# Gibberish Fixer

A Chrome extension that fixes text typed in the wrong language (Hebrew <-> English). It intelligently swaps characters based on keyboard layout mapping.

## Features

- **Smart Swap:** Detects the dominant language (Gibberish English vs. Hebrew) and swaps accordingly.
- **Keyboard Shortcut:** Select text and press **Alt+L** to fix it instantly.
- **Undo Support:** Uses `document.execCommand` to preserve browser undo history (Ctrl+Z).
- **Popup Interface:** Handy popup for manual text conversion (paste -> swap -> copy).
- **Works Everywhere:** Supports input fields, text areas, and `contenteditable` elements (Gmail, WhatsApp Web, etc.).

## Installation

1. **Clone or Download** this repository.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked**.
5. Select the `gibberish-fixer` folder from this repository.

## Usage

### Keyboard Shortcut (Recommended)
1. **Highlight** the gibberish text (e.g., "akuo" or "שדדןד").
2. Press **Alt+L**.
3. The text will be swapped to the correct language (e.g., "שלום" or "hello").

### Popup
1. Click the **Gibberish Fixer icon** in the Chrome toolbar.
2. Type or paste text into the box.
3. Click **Swap**.
4. The text is automatically selected for easy copying.

## Privacy
This extension runs entirely locally in your browser. No text is sent to any server.
