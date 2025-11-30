# Chrome Productivity Tools

A collection of lightweight Chrome extensions for enhancing productivity in web applications.

## Extensions

### Google Docs Equation Shortcut
📁 [`equation-shortcut/`](./equation-shortcut/)

Add **Alt+=** keyboard shortcut to Google Docs for inserting equations, matching Microsoft Word behavior.

- **Status:** ✅ Production Ready
- **Version:** 1.0.0
- **Supported Apps:** Google Docs
- **Features:**
  - Instant equation insertion with Alt+=
  - Auto-shows toolbar if hidden
  - Minimal permissions (Google Docs only)

[📖 Read more →](./equation-shortcut/README.md)

---

### Form Auto-Fill
📁 [`autofill/`](./autofill/)

Automatically fills form fields with saved values. Supports per-site configurations and programmatic injection so the content script only runs on pages you configure.

- **Status:** ✅ Production Ready
- **Version:** 2.0.0
- **Current Implementation:** TAU Login (nidp.tau.ac.il) with extensible per-site configs
- **Features:**
  - Auto-fills saved values in form fields
  - Config-driven architecture for easy expansion
  - Works seamlessly with password managers
  - Secure local storage (never synced)
  - Hebrew RTL interface

[📖 Read more →](./autofill/README.md)

---

### Gibberish Fixer
📁 [`gibberish-fixer/`](./gibberish-fixer/)

Fixes text typed in the wrong language (Hebrew <-> English) by swapping characters based on keyboard layout.

- **Status:** ✅ Production Ready
- **Version:** 1.0.0
- **Features:**
  - Instant text swap with **Alt+L**
  - Smart language detection
  - Preserves Undo history (Ctrl+Z)
  - Popup for manual text conversion

[📖 Read more →](./gibberish-fixer/README.md)

---

## Installation

Each extension is self-contained in its own directory. To install:

1. Clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (top-right toggle)
4. Click "Load unpacked"
5. Select the specific extension directory (e.g., `chrome-productivity-tools/equation-shortcut`)

See individual extension READMEs for detailed installation and usage instructions.

## Development

### Repository Structure

```
chrome-productivity-tools/
├── equation-shortcut/     # Google Docs equation shortcut extension
├── autofill/             # Form auto-fill extension
└── README.md             # This file
```

### Adding New Extensions

Each extension should:
- Live in its own directory at the root level
- Be fully self-contained with its own `manifest.json`
- Include a detailed README.md with installation and usage instructions
- Follow Manifest V3 standards
- Request minimal permissions

## Contributing

Contributions welcome! Each extension is independent:

1. **New Extensions:** Create a new directory at root level
2. **Bug Fixes:** Submit PRs to the specific extension directory
3. **Features:** Propose new extensions or enhancements via Issues

## Support

For issues or questions about specific extensions, please check their individual READMEs or open an issue on GitHub.
