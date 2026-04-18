# Google Docs Equation Shortcut

A lightweight Chrome extension that adds the **Alt+=** keyboard shortcut to insert equations in Google Docs, matching Microsoft Word behavior. It also converts selected LaTeX-formatted text into native Google Docs equations.

## Features

- **Simple Shortcut**: Press `Alt+=` to insert an equation
- **Selected Text Conversion**: Select text containing `$...$` (inline) or `$$...$$` (block) LaTeX expressions and press `Alt+=` to convert them into native Google Docs equations
- **Sub/Superscript Handling**: Correctly handles `_` and `^` in equations, including braced forms like `_{abc}`
- **Auto-show Toolbar**: Automatically shows equation toolbar if hidden
- **Minimal Permissions**: Only requests access to Google Docs and clipboard (required for reading selected text)
- **No Background Processes**: Efficient content-script-only design

## Installation

### Local Installation (For Development/Personal Use)

1. **Download or Clone** this repository to your local machine

2. **Open Chrome Extensions Page**:
   - Navigate to `chrome://extensions/`
   - Or click the three-dot menu → Extensions → Manage Extensions

3. **Enable Developer Mode**:
   - Toggle the "Developer mode" switch in the top-right corner

4. **Load the Extension**:
   - Click "Load unpacked" button
   - Select the `chrome-productivity-tools/equation-shortcut` directory (the folder containing `manifest.json`)

5. **Verify Installation**:
   - You should see "Google Docs Equation Shortcut" appear in your extensions list
   - The extension is now active!

## Usage

### Insert a New Equation

1. Open any Google Docs document
2. Click in the document to focus
3. Press **Alt+=** — the equation editor opens

### Convert Selected Text to Equations

1. Write text with LaTeX math expressions using `$...$` for inline or `$$...$$` for block equations
   - Example: `The formula is $E = mc^2$ and the integral $$\int_0^\infty f(x)dx$$`
2. Select the text
3. Press **Alt+=** — the selected text is replaced with native Google Docs equations

## How It Works

**When no text is selected (insert mode):**

1. **Direct Click**: Tries to click "New equation" button if toolbar is visible (instant)
2. **Auto-show**: If toolbar is hidden, opens Help search (`Alt+/`) and executes "show equation toolbar"
3. **Retry**: After showing toolbar, clicks the equation button

**When text is selected (conversion mode):**

1. Reads selected text from clipboard (`execCommand('copy')` + `navigator.clipboard.readText()`)
2. Parses the text into plain text and equation tokens (`$...$` inline, `$$...$$` block)
3. Deletes the selection, then replays the content — plain text is typed character by character, each equation token is inserted via the equation editor with full sub/superscript awareness

## Development

### Project Structure

```
equation-shortcut/
├── manifest.json             # Chrome extension configuration (Manifest V3)
├── content-script.js         # Keyboard event handler, iframe detection, selected text reading
├── equation-trigger.js       # Equation insertion, text parsing, and typing logic
├── latex-mathquill-map.js    # LaTeX → MathQuill command mapping reference
├── icons/                    # Extension icons (16x16, 48x48, 128x128)
└── README.md                 # This file
```

### Technical Details

- **Manifest Version**: V3 (compliant with Chrome's latest standards)
- **Permissions**: `clipboardRead` and `clipboardWrite` (for reading selected text); `host_permissions` for `https://docs.google.com/*`
- **Content Script Injection**: Runs on all frames with `all_frames: true` to access Google Docs' iframe
- **Event Handling**: Uses MutationObserver to detect Google Docs' text event iframe
- **Keyboard Capture**: Listens for `keydown` events with capture phase (`useCapture: true`)
- **Selected Text Reading**: Uses `execCommand('copy')` synchronously during the user gesture, then `navigator.clipboard.readText()`
- **Equation Typing**: Dispatches `keydown`, `keypress`, `beforeinput`, `input`, and `keyup` events character by character; sub/superscripts (`_`, `^`) are followed by `ArrowRight` to exit the sub/superscript mode

### Debugging

1. Open a Google Docs document and Chrome DevTools (F12)
2. Check Console for log messages:
   - `[Equation Shortcut] Alt+= detected` — shortcut was captured
   - `[Equation Shortcut] selectedText: "..."` — shows what text was read from clipboard
   - `[Equation Shortcut] Failed to show toolbar` — help search didn't work
   - `[Equation Shortcut] Failed to insert equation` — button not found after showing toolbar

### Testing

After making changes:
1. Go to `chrome://extensions/`
2. Click the reload icon on the "Google Docs Equation Shortcut" card
3. Refresh your Google Docs tab
4. Test the Alt+= shortcut — both with and without selected text

## Future Enhancements

Potential features to add:

- Support for Google Slides and Google Sheets
- Additional keyboard shortcuts for other insert options (images, tables, etc.)
- Customizable shortcuts via options page
- Visual feedback when shortcut is triggered
- Chrome Web Store publication

## Contributing

Contributions are welcome! To add new features:

1. **For New Shortcuts**: Add handler functions in `equation-trigger.js`
2. **For New Apps**: Add URL patterns to `matches` array in `manifest.json`
3. **For New LaTeX Commands**: Update `latex-mathquill-map.js` with the MathQuill mapping
4. **For Configuration**: Consider adding a settings page

Keep the modular structure — each feature should be self-contained and easy to enable/disable.

## Browser Compatibility

- **Chrome**: Fully supported (Manifest V3)
- **Edge**: Should work (Chromium-based, supports Manifest V3)
- **Firefox**: Not tested (uses different extension APIs)

## License

MIT License - feel free to use, modify, and distribute.

## Troubleshooting

### Extension Not Working

1. **Check Extension is Enabled**: Visit `chrome://extensions/` and verify the extension is ON
2. **Check URL**: Extension only works on `https://docs.google.com/document/*` URLs
3. **Reload Extension**: Click reload button on `chrome://extensions/`
4. **Check Console**: Open DevTools console for `[Equation Shortcut]` log messages

### Selected Text Not Converting

1. **Grant Clipboard Permission**: On first use, Chrome may prompt for clipboard access — allow it
2. **Check Selection**: Make sure text is selected before pressing Alt+=
3. **Check Syntax**: Inline equations use single `$...$`, block equations use `$$...$$`
4. **Console Check**: Look for `[Equation Shortcut] clipboard text:` to see what was read

### Keyboard Shortcut Not Responding

1. **Verify Focus**: Click in the document to ensure Google Docs has focus
2. **Check for Conflicts**: Ensure no other extension is capturing Alt+=
3. **Check DevTools Console**: Look for `[Equation Shortcut] Alt+= detected` message
4. **Try Different Document**: Some Google Docs features may behave differently in older documents

### Icons Not Showing

Icons are included. If they don't appear, check that the `icons/` folder contains `icon16.png`, `icon48.png`, and `icon128.png`.

## Support

For issues, questions, or feature requests, please open an issue on the GitHub repository.
