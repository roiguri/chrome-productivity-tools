# Grammar Checker Extension

A Chrome extension that checks grammar and spelling in the active input field using the LanguageTool API.

## Features

- **On-Demand Checking:** Press `Alt+G` to check the text in the currently focused input field.
- **Privacy Focused:** Only sends the text of the *active field* when you explicitly press the shortcut.
- **Visual Feedback:** clear red (spelling) and blue (grammar) underlines overlaying your text.
- **One-Click Corrections:** Hover over errors to see suggestions and click to apply them.
- **Broad Support:** Works on standard inputs, textareas, and rich text editors (like Google Docs or contenteditable divs).

## Installation

1. Clone this repository.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable "Developer mode" (top right).
4. Click "Load unpacked" and select the `grammar-checker` directory.

## Usage

1. Click inside any text field (or select a text cell in Google Colab).
2. Press **Alt+G** (Mac: Option+G).
3. Wait a moment for the check to complete.
4. Errors will be underlined:
   - **Red:** Spelling errors.
   - **Blue:** Grammar/Style issues.
5. Click on an underlined word to see corrections.
6. Click a suggestion to replace the text.

## Privacy & Security

**Important:** This extension uses the [LanguageTool Public API](https://languagetool.org/http-api) to perform grammar checks.

- When you press `Alt+G`, the text in the *focused input field only* is sent securely (HTTPS) to `https://api.languagetool.org`.
- No other data (browsing history, other fields, cookies) is sent.
- Text is sent only when you trigger the action.

## Google Colab & Rich Text Editors

The extension is designed to work with complex editors like Google Colab. It detects `contenteditable` regions and attempts to overlay corrections accurately.

*Note: In complex editors, formatting might be slightly offset due to the dynamic nature of these web apps. If the overlay is misaligned, try scrolling slightly or resizing the window to force a redraw.*
