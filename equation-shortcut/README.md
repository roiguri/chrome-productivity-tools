# Google Docs Equation Shortcut

A lightweight Chrome extension that adds the **Alt+=** keyboard shortcut to insert equations in Google Docs, matching Microsoft Word behavior.

## Features

- **Simple Shortcut**: Press `Alt+=` to insert an equation
- **Auto-show Toolbar**: Automatically shows equation toolbar if hidden
- **Minimal Permissions**: Only requests access to Google Docs
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

1. Open any Google Docs document (https://docs.google.com/document/...)
2. Click anywhere in the document to focus
3. Press **Alt+=** on your keyboard
4. The equation editor will open automatically

## How It Works

1. **Direct Click**: Tries to click "New equation" button if toolbar is visible (instant)
2. **Auto-show**: If toolbar is hidden, opens Help search (`Alt+/`) and executes "show equation toolbar"
3. **Retry**: After showing toolbar, clicks the equation button

Works reliably whether the equation toolbar is visible or hidden.

## Development

### Project Structure

```
equation-shortcut/
├── manifest.json          # Chrome extension configuration (Manifest V3)
├── content-script.js      # Keyboard event handler and iframe detection
├── equation-trigger.js    # Equation insertion and toolbar management
├── icons/                 # Extension icons (16x16, 48x48, 128x128)
└── README.md             # This file
```

### Technical Details

- **Manifest Version**: V3 (future-proof, compliant with Chrome's latest standards)
- **Permissions**: Only `host_permissions` for `https://docs.google.com/*`
- **Content Script Injection**: Runs on all frames with `all_frames: true` to access Google Docs' iframe
- **Event Handling**: Uses MutationObserver to detect Google Docs' text event iframe
- **Keyboard Capture**: Listens for `keydown` events with capture phase (`useCapture: true`)

### Debugging

1. Open a Google Docs document and Chrome DevTools (F12)
2. Check Console for warnings (only errors are logged)
3. Common issues logged:
   - `Failed to show toolbar` - Help search didn't work
   - `Failed to insert equation` - Button not found after showing toolbar

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

Icons are included. If they don't appear, check that the `icons/` folder contains `icon16.png`, `icon48.png`, and `icon128.png`.

## Support

For issues, questions, or feature requests, please open an issue on the GitHub repository.
