# Form Auto-Fill Extension

A Chrome extension that automatically fills form fields with saved values on any website. Supports custom configurations for unlimited sites and form fields.

## Current Implementation

**Version 2.0.0** - Universal Auto-Fill with Custom Configurations

Key capabilities:
- **Any Website Support**: Configure auto-fill for unlimited websites
- **Custom Field Selectors**: Use CSS selectors (including wildcards) to target any form field
- **Multiple Values**: Store and manage multiple values (IDs, emails, etc.)
- **Flexible Mapping**: One value can be used across multiple sites and fields
- **Full Management UI**: Comprehensive options page for configuration management
- **Import/Export**: Backup and restore your configurations

## Features

### Configuration Management
- **Options Page**: Full-featured UI for managing values and configurations
- **Stored Values**: Create reusable values with custom labels
- **Site Configurations**: Define URL patterns, CSS selectors, and value mappings
- **Enable/Disable**: Toggle configurations without deletion
- **Import/Export**: Backup configurations as JSON files

### Auto-Fill Intelligence
- **URL Pattern Matching**: Supports wildcards (`*` and `?`) in URL patterns
- **CSS Selector Wildcards**: Advanced selectors like `input[id*="username"]`, `[name^="email"]`
- **Dynamic Loading**: Configurations loaded from storage on every page
- **Password Manager Friendly**: Waits for password managers to fill before auto-filling
- **Event Triggering**: Properly triggers input/change events for form validation

### User Interface
- **Modern Design**: Beautiful gradient-based UI with RTL (Hebrew) support
- **Stats Dashboard**: Popup shows count of stored values and active configurations
- **Badge Notifications**: Icon badge shows active configuration count or "!" if unconfigured
- **Privacy-First**: Values displayed masked in UI (e.g., `12****89`)

### Security & Privacy
- **Secure Local Storage**: All data stored only on your device using Chrome's local storage
- **Optional Permissions**: Requests host permissions only when adding new sites
- **No Cloud Sync**: Data never leaves your machine
- **Input Validation**: CSS selectors and patterns validated before saving

## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top-right)
4. Click "Load unpacked"
5. Select the `autofill/` directory
6. **The options page will automatically open** - proceed to Initial Setup

## Initial Setup

On first install, the options page opens automatically:

### 1. Add Stored Values

First, create values that you want to auto-fill:

1. In the "ערכים שמורים" (Stored Values) section, click "+ הוסף ערך חדש"
2. Enter a label (e.g., "ת.ז." for ID number, "מייל עבודה" for work email)
3. Enter the actual value
4. Click "שמור"

**Example**:
- Label: `ת.ז.`
- Value: `123456789`

### 2. Add Site Configurations

Next, configure which sites and fields should be auto-filled:

1. In the "הגדרות אתרים" (Site Configurations) section, click "+ הוסף הגדרה חדשה"
2. Fill in the form:
   - **שם ההגדרה** (Name): Descriptive name (e.g., "התחברות אוניברסיטת תל אביב")
   - **תבנית URL** (URL Pattern): URL pattern with wildcards (e.g., `https://nidp.tau.ac.il/*`)
   - **בורר CSS** (CSS Selector): Field selector (e.g., `#Ecom_User_Pid` or `input[name*="userid"]`)
   - **ערך למילוי** (Value): Select from your stored values
   - **הגדרה פעילה** (Enabled): Check to activate
3. Click "שמור הגדרה"
4. Grant permission when Chrome prompts for site access

**Example Configuration**:
- Name: `התחברות אוניברסיטת תל אביב`
- URL Pattern: `https://nidp.tau.ac.il/*`
- CSS Selector: `#Ecom_User_Pid`
- Value: `ת.ז.` (select from dropdown)

### 3. Verify Setup

1. Click the extension icon to see your stats
2. You should see the count of stored values and active configurations
3. The badge will show the number of active configurations

## Usage

### Basic Usage

1. Navigate to any configured website
2. The extension will automatically fill the configured field(s)
3. Continue with your normal login/form submission process

### Managing Configurations

Access the options page at any time:
- Right-click the extension icon → "Options"
- Or click "נהל הגדרות" in the popup

From the options page you can:
- Add/edit/delete stored values
- Add/edit/delete configurations
- Enable/disable configurations without deletion
- Export your configurations as JSON backup
- Import previously exported configurations

### CSS Selector Examples

The extension supports standard CSS selectors with wildcards:

**Basic Selectors**:
- `#username` - Element with id="username"
- `.login-field` - Element with class="login-field"
- `input[name="user"]` - Input with exact name="user"

**Wildcard Selectors**:
- `input[id*="user"]` - Input with id containing "user"
- `input[name^="email"]` - Input with name starting with "email"
- `input[name$="ID"]` - Input with name ending with "ID"
- `input[type="text"][placeholder*="username"]` - Complex combinations

**URL Pattern Examples**:
- `https://example.com/*` - Entire domain
- `https://example.com/login*` - Specific path and subpaths
- `https://*.example.com/login` - Subdomains
- `https://example.com/*/auth` - Wildcard in middle

## How It Works

### Technical Flow

**On Installation:**
1. **Background Service Worker**: Starts on extension install
2. **Auto-Open Options**: Automatically opens options page for first-time setup
3. **Badge Management**: Sets "!" badge if no configurations exist

**On Any Web Page:**
1. **Content Script Injection**: Content script runs on all URLs (`<all_urls>`)
2. **Load Configurations**: Fetches all configurations and stored values from `chrome.storage.local`
3. **URL Pattern Matching**: Checks if current page URL matches any configured pattern
   - Compares `window.location.href` against all `urlPattern` values
   - Supports wildcard matching (`*` = any characters, `?` = single character)
   - Exits early if no pattern matches (performance optimization)
4. **Configuration Processing**: For each matching enabled configuration:
   - Waits for the target field to appear in DOM (5-second timeout)
   - Retrieves the associated value from stored values
   - After 100ms delay (for password manager compatibility), fills the field
   - Dispatches `input` and `change` events for form validation
5. **Multiple Fields**: Can fill multiple fields on same page if multiple configs match

**On Configuration Change:**
1. **Storage Update**: Values/configurations saved to `chrome.storage.local`
2. **Badge Update**: Background script listens to storage changes and updates badge
3. **Badge Display**: Shows count of active configurations or "!" if none configured
4. **Permission Request**: Requests host permission when adding new site

### Architecture

The extension uses a **dynamic config-driven architecture**:

**Storage Schema:**
```javascript
// Stored Values (reusable across configurations)
stored_values: {
  "tau_id_12345": {
    label: "ת.ז.",
    value: "123456789"
  },
  "work_email_67890": {
    label: "מייל עבודה",
    value: "user@example.com"
  }
}

// Configurations (loaded dynamically)
autofill_configs: [
  {
    id: "config_uuid_1",
    name: "התחברות אוניברסיטת תל אביב",
    urlPattern: "https://nidp.tau.ac.il/*",
    fieldSelector: "#Ecom_User_Pid",
    valueKey: "tau_id_12345",  // References stored value
    enabled: true
  },
  {
    id: "config_uuid_2",
    name: "פורטל אוניברסיטת תל אביב",
    urlPattern: "https://portal.tau.ac.il/*",
    fieldSelector: "input[name*='userid']",
    valueKey: "tau_id_12345",  // Same value, different field
    enabled: true
  }
]
```

### Selective Page Activation

For performance and security, the extension implements **selective page activation**:

**URL Pattern Matching:**
- Content script loads configurations from storage on every page
- Checks current URL against all configured patterns
- Supports wildcard matching: `*` matches any characters, `?` matches single character
- Only processes configurations when URL matches
- Exits immediately if no patterns match

**Benefits:**
- ⚡ **Performance**: No DOM manipulation on non-matching pages
- 🔒 **Security**: Minimal exposure, smaller attack surface
- 🔄 **Flexible**: Works with user-defined configurations
- 📦 **Lightweight**: Zero overhead when no configs match

## Development

### Project Structure

```
autofill/
├── manifest.json          # Extension manifest (Manifest V3)
├── background.js          # Service worker for badge management
├── popup.html             # Popup UI showing stats (Hebrew RTL)
├── popup.js               # Popup logic for displaying stats
├── options.html           # Full options/settings page (Hebrew RTL)
├── options.js             # Configuration management logic
├── options.css            # Options page styling
├── content-script.js      # Auto-fill logic & field detection
├── icons/                 # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md             # This file
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

This extension uses a privacy-focused permission model:

### Required Permissions:
- **`storage`**: To save your values and configurations locally on your device
- **`host_permissions: ["https://nidp.tau.ac.il/*"]`**: Default permission for TAU (for backward compatibility)

### Optional Permissions (Requested On-Demand):
- **`optional_host_permissions: ["<all_urls>"]`**: Requested when you add a new site configuration
  - Chrome will prompt you to approve access to each specific domain
  - You can revoke permissions anytime via Chrome settings
  - Only requested domains are actually accessed

**Privacy Note**: Your data never leaves your device. The extension:
- ❌ Does NOT sync data to Chrome account
- ❌ Does NOT make network requests
- ❌ Does NOT send data to external servers
- ✅ Stores all data locally only
- ✅ Works completely offline
- ✅ Requests permissions only when you add sites
- ✅ You control exactly which sites it can access

## Future Enhancements

Possible features for future versions:

1. **Visual Field Picker**:
   - Click-to-select field on page
   - Auto-generate CSS selectors
   - Live selector testing

2. **Advanced Selectors**:
   - XPath selector support
   - Complex CSS combinations
   - Conditional field matching

3. **Enhanced UX**:
   - Drag-and-drop config reordering
   - Search/filter configurations
   - Bulk enable/disable
   - Configuration templates

4. **Security Enhancements**:
   - Optional value encryption
   - Master password protection
   - Auto-clear on browser close

5. **Sync Options**:
   - Manual sync via import/export (current)
   - Optional Chrome sync integration
   - Encrypted cloud backup

## Browser Compatibility

- **Chrome**: ✅ Fully supported (Manifest V3)
- **Edge**: ✅ Should work (Chromium-based)
- **Brave**: ✅ Should work (Chromium-based)
- **Firefox**: ❌ Not supported (requires Manifest V2 adaptation)

## Contributing

Contributions welcome! Ideas for improvements:

1. **Code Improvements**:
   - Optimize performance for pages with many DOM elements
   - Add unit tests for core functions
   - Improve error handling and user feedback

2. **Feature Additions**:
   - Implement visual field picker
   - Add XPath selector support
   - Create configuration templates library

3. **Documentation**:
   - Add video tutorials
   - Create troubleshooting guides for specific sites
   - Translate UI to other languages

4. **Testing**:
   - Test on various websites
   - Report bugs and edge cases
   - Suggest UX improvements

## Security Considerations

- **Input Validation**: Values and CSS selectors validated before saving
- **No Code Injection**: Values set via `.value` property, not innerHTML
- **Event Safety**: Uses native browser events only
- **Storage Isolation**: Chrome's storage API sandboxed per-extension
- **Permission Control**: User explicitly approves each domain
- **No Network Access**: Extension works completely offline
- **Unencrypted Storage**: Values stored in plain text locally (consider browser-level security)

## Troubleshooting

### Fields Not Filling

1. **Check configurations**:
   - Open options page (right-click icon → Options)
   - Verify you have stored values created
   - Verify you have configurations enabled for the current site
   - Check that the configuration's URL pattern matches the current page

2. **Check browser console**:
   - Open DevTools (F12) on the page
   - Look for `[Auto-Fill]` messages
   - Common messages:
     - `No configurations found` - You haven't created any configs yet
     - `Not activating on this page` - URL doesn't match any pattern
     - `Field not found` - CSS selector doesn't match any element
     - `No value found for key` - The value referenced in config doesn't exist

3. **Verify permissions**:
   - Go to `chrome://extensions/`
   - Click "Details" on Form Auto-Fill
   - Check "Site access" - should show configured domains
   - If missing, re-save the configuration in options page

4. **Test CSS selector**:
   - Open DevTools on the target page
   - Open Console tab
   - Type: `document.querySelector('YOUR_SELECTOR')`
   - Should return the input element (not null)
   - Example: `document.querySelector('#Ecom_User_Pid')`

### Configuration Not Saving

1. **Permission denied**:
   - Chrome asks for permission when adding new site
   - If you clicked "Deny", the config won't work
   - Delete and re-create the config, then click "Allow"

2. **Invalid CSS selector**:
   - Extension validates selector syntax
   - Check error message in options page
   - Test selector in browser console first

3. **Missing stored value**:
   - Configurations require a stored value
   - Create the value first, then create the config

### Password Manager Conflicts

If your password manager interferes:
- Extension waits 100ms before filling
- Some password managers may overwrite after filling
- Try disabling auto-fill for specific fields in password manager settings
- Adjust field selector to target different element if needed

### Import/Export Issues

1. **Import fails**:
   - Verify JSON file is valid
   - Check that file was exported from this extension
   - Look for error message in options page

2. **Exported file empty**:
   - Ensure you have values and configs before exporting
   - Check browser's download settings

## License

MIT License - Free to use, modify, and distribute.

## Support

For issues or questions:
- Check the [Troubleshooting](#troubleshooting) section
- Open an issue on GitHub
- Check browser console for error messages

---

**Version 2.0.0** - Universal Form Auto-Fill with Custom Configurations

Originally created for TAU students, now available for everyone!
