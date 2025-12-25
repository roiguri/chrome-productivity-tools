# Grammar & Spelling Checker

A Chrome extension that checks the grammar and spelling of the text in your currently focused input field using LanguageTool.

## Features

- **Shortcut Activated:** Press **Alt+G** (or customized shortcut) to check the focused field.
- **Visual Feedback:** Red wavy lines for spelling errors, blue for grammar/style issues.
- **Smart Corrections:** Hover over errors to see suggestions and apply them with a click.
- **Non-Intrusive:** Only runs when you ask it to. Clears automatically when you continue typing.
- **Privacy Focused:** Only sends the text of the *focused field* to the API when triggered.

## Installation

1. Clone this repository.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked**.
5. Select the `grammar-checker` directory.

## Usage

1. Click inside any text input or textarea on a webpage.
2. Type some text (e.g., "This is a exmaple.").
3. Press **Alt+G**.
4. Wait a moment for the check to complete (input border turns yellow briefly).
5. Hover over the underlined words to see corrections.
6. Click a suggestion to apply it.

## Privacy Note

This extension uses the [LanguageTool Public API](https://languagetool.org/http-api) to analyze text.
- When you trigger the check, the text content of the focused input is sent to `https://api.languagetool.org/v2/check` over HTTPS.
- No data is stored by the extension itself.
- Please refer to LanguageTool's privacy policy for how they handle API requests.

## Tech Stack

- Manifest V3
- Plain JavaScript (No frameworks)
- LanguageTool API
