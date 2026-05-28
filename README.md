# Chrome Productivity Tools

A collection of lightweight Chrome extensions for enhancing productivity in web applications.


<p align="center">
  <a href="./equation-shortcut/"><img src="./equation-shortcut/icons/icon128.png" width="80" alt="Equation Shortcut" /><br>Equation Shortcut</a>
  &nbsp;&nbsp;&nbsp;
  <a href="./autofill/"><img src="./autofill/icons/icon128.png" width="80" alt="Form Autofill" /><br>Form Autofill</a>
  &nbsp;&nbsp;&nbsp;
  <a href="./gibberish-fixer/"><img src="./gibberish-fixer/icons/icon128.png" width="80" alt="Gibberish Fixer" /><br>Gibberish Fixer</a>
  &nbsp;&nbsp;&nbsp;
  <a href="./direction-switcher/"><img src="./direction-switcher/icons/icon128.png" width="80" alt="Direction Switcher" /><br>Direction Switcher</a>
  &nbsp;&nbsp;&nbsp;
  <a href="./peer-share/"><img src="./peer-share/icons/icon128.png" width="80" alt="Peer Share" /><br>Peer Share</a>
</p>

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

### Direction Switcher
📁 [`direction-switcher/`](./direction-switcher/)

Pick any element on the page and toggle its text direction (RTL/LTR) with a click. Essential for testing and fixing layout issues on mixed-direction sites.

- **Status:** ✅ Production Ready
- **Version:** 1.0.0
- **Features:**
  - Interactive element picker
  - **Alt+R** keyboard shortcut
  - Works on any website

[📖 Read more →](./direction-switcher/README.md)

---

### Peer Share
📁 [`peer-share/`](./peer-share/)

Send a screenshot of the current tab, a file, or pasted text straight to a paired peer's browser — they get a notification and the item lands in their extension Inbox.

- **Status:** ✅ Ready (requires one-time Firebase setup)
- **Version:** 1.0.0
- **Features:**
  - Screenshot / file / text sharing to a specific peer
  - Real-time RTDB "doorbell" delivery (~0.1–0.4s when open, ~1 min idle backstop) — no Cloud Function, free Spark tier
  - Anonymous pairing-code identity (no accounts)
  - User-provisioned Firebase relay — no other backend

[📖 Read more →](./peer-share/README.md)

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
├── gibberish-fixer/       # Hebrew-English Text Swapper extension
├── direction-switcher/    # Text Direction (RTL/LTR) toggler
├── peer-share/            # Screenshot/file/text peer sharing extension
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
