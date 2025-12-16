# Direction Switcher

A simple yet powerful tool that lets you toggle the text direction (RTL/LTR) of any element on a webpage. Perfect for developers, QA testers, and users who work with mixed-direction content (Hebrew, Arabic, etc.).

## Features

- **One-Click Toggle**: Switch any element between Right-to-Left (RTL) and Left-to-Right (LTR) instantly.
- **Visual Picker**: Clean, interactive element picker to select the exact content you want to fix.
- **Keyboard Shortcut**: Activate the picker quickly with **Alt+R** (or **Option+R** on Mac).
- **Universal Support**: Works on any website.
- **Non-Destructive**: Only changes the `dir` attribute of the selected element, preserving other styles.

## Installation

1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (top right corner).
4. Click **Load unpacked**.
5. Select the `direction-switcher` folder from this repository.

## Usage

### Method 1: Toolbar Icon
1. Click the **Direction Switcher** icon in your Chrome toolbar.
2. The interactive picker will activate (elements highlight as you hover).
3. Click on any text or element you want to switch.
4. The text direction will toggle immediately.

### Method 2: Keyboard Shortcut
1. Press **Alt+R** (Windows/Linux) or **Option+R** (Mac) to activate the picker.
2. Click the element you wish to modify.

To exit the picker mode without selecting anything, press **Esc** or click the extension icon again.

## Development

### Project Structure

```
direction-switcher/
├── manifest.json      # Extension configuration (Manifest V3)
├── background.js      # Handles keyboard shortcuts and state management
├── content.js         # The logic for highlighting and switching elements
├── icons/             # App icons (16, 48, 128px)
└── README.md          # This file
```

### Permissions

- `activeTab`: To potentially access the current tab (though main logic uses scripting).
- `scripting`: To inject the content script when the action is triggered.

## Contributing

Constructive feedback and pull requests are welcome! If you find a bug or have a feature request, please open an issue in the main repository.

## License

MIT License.
