# Google Docs Equation Shortcut

A lightweight Chrome extension that adds the **Alt+=** keyboard shortcut to insert equations in Google Docs, matching the familiar Microsoft Word behavior.

## Features

- **Simple Shortcut**: Press `Alt+=` to instantly insert an equation
- **Minimal Permissions**: Only requests access to Google Docs (docs.google.com)
- **No Background Processes**: Efficient content-script-only design
- **Modular Architecture**: Easy to extend with additional shortcuts in the future

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
   - Select the `equation-shortcut` directory (the folder containing `manifest.json`)

5. **Verify Installation**:
   - You should see "Google Docs Equation Shortcut" appear in your extensions list
   - The extension is now active!

## Usage

1. Open any Google Docs document (https://docs.google.com/document/...)
2. Click anywhere in the document to focus
3. Press **Alt+=** on your keyboard
4. The equation editor will open automatically

## How It Works

The extension uses two strategies to trigger equation insertion:

1. **Direct Button Click** (Primary): Attempts to find and click the equation button in the Google Docs toolbar
2. **Menu Navigation** (Fallback): Simulates the keyboard shortcut `Ctrl+Shift+I` → `E` to open Insert menu and select Equation

This dual-strategy approach ensures reliability even if Google updates their UI.

## Development

### Project Structure

```
equation-shortcut/
├── manifest.json          # Chrome extension configuration (Manifest V3)
├── content-script.js      # Keyboard event handler and iframe detection
├── equation-trigger.js    # Modular equation insertion logic
├── icons/                 # Icon files (see icons/README.md)
│   └── README.md         # Instructions for creating icons
└── README.md             # This file
```

### Technical Details

- **Manifest Version**: V3 (future-proof, compliant with Chrome's latest standards)
- **Permissions**: Only `host_permissions` for `https://docs.google.com/*`
- **Content Script Injection**: Runs on all frames with `all_frames: true` to access Google Docs' iframe
- **Event Handling**: Uses MutationObserver to detect Google Docs' text event iframe
- **Keyboard Capture**: Listens for `keydown` events with capture phase (`useCapture: true`)

### Debugging

1. Open a Google Docs document
2. Open Chrome DevTools (F12 or right-click → Inspect)
3. Check the Console for extension logs prefixed with `[Equation Shortcut]`
4. Common messages:
   - `Extension loaded` - Content script initialized
   - `Found Google Docs iframe` - Successfully detected the iframe
   - `Alt+= detected` - Keyboard shortcut captured
   - `Successfully triggered via...` - Equation insertion succeeded

### Testing

After making changes:
1. Go to `chrome://extensions/`
2. Click the reload icon on the "Google Docs Equation Shortcut" card
3. Refresh your Google Docs tab
4. Test the Alt+= shortcut

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
3. **For Configuration**: Consider adding a settings page

Keep the modular structure - each feature should be self-contained and easy to enable/disable.

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
4. **Check Console**: Open DevTools console to see if there are any error messages
5. **Try Fallback**: The menu navigation fallback should work even if direct click fails

### Keyboard Shortcut Not Responding

1. **Verify Focus**: Click in the document to ensure Google Docs has focus
2. **Check for Conflicts**: Ensure no other extension is capturing Alt+=
3. **Check DevTools Console**: Look for "[Equation Shortcut] Alt+= detected" message
4. **Try Different Document**: Some Google Docs features may behave differently in older documents

### Icons Not Showing

The extension will work perfectly without custom icons - Chrome will show a default puzzle piece icon. See [icons/README.md](icons/README.md) for instructions on adding custom icons.

## Support

For issues, questions, or feature requests, please open an issue on the GitHub repository.
