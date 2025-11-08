# Form Auto-Fill Extension

A Chrome extension that automatically fills form fields with saved values. Designed with extensibility in mind for future multi-site support.

## Current Implementation

**Version 1.0.0** - TAU Login Auto-Fill

Currently supports:
- **Tel Aviv University Login Page** (`nidp.tau.ac.il`)
- Automatically fills the ID number field (`Ecom_User_Pid`)
- Works seamlessly with password managers

## Features

- **Secure Local Storage**: Your ID number is stored only on your device using Chrome's local storage (never synced, never leaves your machine)
- **Privacy-First**: Displays masked ID in settings (e.g., `12****89`)
- **Password Manager Friendly**: Waits for password managers to fill username/password before auto-filling ID
- **Hebrew RTL Interface**: Settings popup in Hebrew with proper right-to-left layout
- **Extensible Architecture**: Code designed for easy addition of new sites and fields in future versions

## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top-right)
4. Click "Load unpacked"
5. Select the `autofill/` directory

## Initial Setup

After installation:

1. Click the extension icon in your Chrome toolbar
2. Enter your Israeli ID number (9 digits)
3. Click "שמור" (Save)
4. Your ID is now stored securely and will auto-fill on TAU login pages

## Usage

1. Navigate to the TAU login page: `https://nidp.tau.ac.il/`
2. The extension will automatically fill the ID number field
3. Use your password manager or manually enter username and password
4. Log in as usual

## How It Works

### Technical Flow

1. **Content Script Injection**: When you visit `nidp.tau.ac.il`, the extension injects `content-script.js`
2. **Page Activation Check**: Calls `shouldActivateOnCurrentPage()` (currently always returns `true`)
3. **Configuration Processing**: Loops through enabled configurations in `AUTOFILL_CONFIGS`
4. **Field Detection**: Waits for the target field (`#Ecom_User_Pid`) to appear in the DOM
5. **Value Retrieval**: Fetches your saved ID from `chrome.storage.local`
6. **Auto-Fill**: After a small delay (100ms to allow password managers), fills the field
7. **Event Dispatch**: Triggers `input` and `change` events for form validation

### Architecture

The extension uses a **config-driven architecture** for easy extensibility:

```javascript
const AUTOFILL_CONFIGS = [
  {
    id: 'tau_id_field',
    urlPattern: 'https://nidp.tau.ac.il/*',  // Future URL matching
    fieldSelector: '#Ecom_User_Pid',
    storageKey: 'tau_id_number',
    enabled: true
  }
  // Future configs can be added here
];
```

## Development

### Project Structure

```
autofill/
├── manifest.json          # Extension manifest (Manifest V3)
├── popup.html            # Settings UI (Hebrew RTL)
├── popup.js              # Settings logic & storage management
├── content-script.js     # Auto-fill logic & field detection
├── icons/                # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md            # This file
```

### Testing Workflow (WSL Users)

If you're developing in WSL (Windows Subsystem for Linux):

1. **Edit Files in WSL**:
   ```bash
   cd /home/roiguri/projects/private/chrome-productivity-tools/autofill
   # Make your changes
   ```

2. **Mirror to Windows**:
   ```bash
   cp -r /home/roiguri/projects/private/chrome-productivity-tools/autofill /mnt/c/dev/chrome-productivity-tools/
   ```

3. **Load in Chrome** (Windows):
   - Open `chrome://extensions/`
   - Click "Load unpacked"
   - Select `C:\dev\chrome-productivity-tools\autofill`

4. **Test on TAU Login**:
   - Navigate to `https://nidp.tau.ac.il/`
   - Check browser console for `[Auto-Fill]` logs
   - Verify ID field is filled correctly

5. **Reload Extension After Changes**:
   - Go to `chrome://extensions/`
   - Click the reload icon on the "Form Auto-Fill" extension

### Testing Outside WSL

For non-WSL development:

1. Clone the repository to a location accessible to Chrome
2. Load the `autofill/` directory as an unpacked extension
3. Make code changes
4. Reload the extension in Chrome
5. Test on the TAU login page

### Debugging

**Enable Console Logging**:
- Open Chrome DevTools (F12) on the TAU login page
- Check the Console tab for `[Auto-Fill]` messages
- Common logs:
  - `Content script loaded` - Script initialized
  - `Activating on this page` - Page matched
  - `Processing config: tau_id_field` - Processing configuration
  - `Field filled successfully` - Auto-fill succeeded

**Common Issues**:
- **Field not filled**: Check if field selector is correct (`#Ecom_User_Pid`)
- **No console logs**: Extension may not be loaded or page URL doesn't match
- **Value not saved**: Check extension popup, ensure ID was saved
- **Storage errors**: Verify `storage` permission in manifest

## Permissions

This extension requests minimal permissions:

- **`storage`**: To save your ID number locally on your device
- **`host_permissions: ["https://nidp.tau.ac.il/*"]`**: To run the content script only on TAU login pages

**Privacy Note**: Your data never leaves your device. The extension:
- ❌ Does NOT sync data to Chrome account
- ❌ Does NOT make network requests
- ❌ Does NOT access other websites
- ✅ Stores data locally only
- ✅ Works offline

## Future Enhancements

Planned features for future versions:

1. **Multi-Site Support**:
   - User-configurable URL patterns
   - Custom field selectors
   - Multiple saved values per site

2. **Advanced Field Matching**:
   - XPath selectors
   - Attribute-based matching
   - Wildcard patterns

3. **URL Pattern Matching**:
   - Activate `shouldActivateOnCurrentPage()` logic
   - User-defined URL rules
   - Per-config activation

4. **Import/Export**:
   - Backup configurations
   - Share settings across devices (manually)

5. **Options Page**:
   - Full configuration UI
   - Add/edit/remove sites
   - Field testing tool

## Browser Compatibility

- **Chrome**: ✅ Fully supported (Manifest V3)
- **Edge**: ✅ Should work (Chromium-based)
- **Brave**: ✅ Should work (Chromium-based)
- **Firefox**: ❌ Not supported (requires Manifest V2 adaptation)

## Contributing

Contributions welcome! To add support for a new site:

1. Add a new config to `AUTOFILL_CONFIGS` in `content-script.js`
2. Add the URL to `host_permissions` in `manifest.json`
3. Update `matches` in `content_scripts` in `manifest.json`
4. Test thoroughly
5. Submit a pull request

## Security Considerations

- **Input Validation**: ID numbers are validated (non-empty check)
- **No Code Injection**: Values are set via `.value` property, not innerHTML
- **Event Safety**: Uses native browser events only
- **Storage Isolation**: Chrome's storage API is sandboxed per-extension

## Troubleshooting

### ID Not Filling

1. **Check if ID is saved**:
   - Click extension icon
   - Verify "ערך שמור נוכחי" shows your masked ID

2. **Check browser console**:
   - Open DevTools on login page
   - Look for `[Auto-Fill]` messages
   - If no logs appear, extension may not be loaded

3. **Verify extension is enabled**:
   - Go to `chrome://extensions/`
   - Ensure "Form Auto-Fill" is enabled

4. **Check field selector**:
   - TAU login page may have changed
   - Inspect the ID number field
   - Verify it still has `id="Ecom_User_Pid"`

### Password Manager Conflicts

If your password manager overwrites the ID field:
- The extension waits 100ms before filling
- Some password managers may fill all fields
- Try disabling autofill for the ID field in your password manager settings

### Extension Not Loading

1. **Check manifest errors**:
   - Go to `chrome://extensions/`
   - Look for error messages under the extension

2. **Reload extension**:
   - Click the reload icon
   - Check for console errors

3. **Verify permissions**:
   - Ensure `storage` and `host_permissions` are granted

## License

MIT License - Free to use, modify, and distribute.

## Support

For issues or questions:
- Check the [Troubleshooting](#troubleshooting) section
- Open an issue on GitHub
- Check browser console for error messages

---

**Made with ⚡ for TAU Students**
