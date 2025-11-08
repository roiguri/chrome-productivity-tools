/**
 * Modular equation trigger functionality for Google Docs
 * This file contains the core logic for inserting equations
 */

/**
 * Attempts to trigger equation insertion in Google Docs
 * Finds and clicks the equation button using mouse events
 * If toolbar is not visible, shows it first then retries
 *
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
async function triggerEquationInsertion() {
  // First attempt: try clicking button if toolbar is visible
  if (tryDirectButtonClick()) {
    return true;
  }

  // Button not found - show toolbar first
  const toolbarShown = await ensureToolbarVisible();
  if (!toolbarShown) {
    console.warn('[Equation Shortcut] Failed to show toolbar');
    return false;
  }

  // Wait for toolbar to render
  await sleep(500);

  // Retry clicking the button
  if (tryDirectButtonClick()) {
    return true;
  }

  console.warn('[Equation Shortcut] Failed to insert equation');
  return false;
}

/**
 * Strategy 1: Attempt to find and click the equation button in the toolbar
 * This searches for common selectors used by Google Docs
 *
 * @returns {boolean} True if button found and clicked
 */
function tryDirectButtonClick() {
  const selectors = [
    '#insert-equation-button',
    'div[aria-label*="Equation"]',
    'div[aria-label*="equation"]',
    'div[data-tooltip*="Equation"]',
    'div[data-tooltip*="equation"]',
    '.docs-icon-equation',
    '[role="button"][aria-label*="Equation"]'
  ];

  for (const selector of selectors) {
    const button = document.querySelector(selector);
    if (button) {
      // Google Docs requires full mouse event sequence
      button.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        view: window
      }));

      button.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window
      }));

      button.dispatchEvent(new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        view: window
      }));

      return true;
    }
  }

  return false;
}

/**
 * Helper function to sleep/delay
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Dispatch keyboard event to the Google Docs iframe
 * @param {string} key - The key to press
 * @param {Object} options - Additional KeyboardEvent options
 */
function dispatchKey(key, options = {}) {
  const iframe = document.querySelector('.docs-texteventtarget-iframe');
  if (!iframe || !iframe.contentDocument) {
    return false;
  }

  const target = iframe.contentDocument.activeElement || iframe.contentDocument.body;
  const event = new KeyboardEvent('keydown', {
    key: key,
    code: options.code || `Key${key.toUpperCase()}`,
    keyCode: options.keyCode || key.charCodeAt(0),
    which: options.which || key.charCodeAt(0),
    altKey: options.altKey || false,
    ctrlKey: options.ctrlKey || false,
    shiftKey: options.shiftKey || false,
    bubbles: true,
    cancelable: true,
    ...options
  });

  target.dispatchEvent(event);
  return true;
}

/**
 * Ensures the equation toolbar is visible by using Help search
 * Simulates: Alt+/ → "show equation toolbar" → Enter
 * @returns {Promise<boolean>} True if successful
 */
async function ensureToolbarVisible() {
  // Open Help search with Alt+/
  if (!dispatchKey('/', { altKey: true, keyCode: 191, code: 'Slash' })) {
    return false;
  }

  await sleep(300);

  const searchInput = document.activeElement;
  if (!searchInput || (searchInput.tagName !== 'INPUT' && !searchInput.isContentEditable)) {
    return false;
  }

  // Type search query
  const searchText = 'show equation toolbar';
  searchInput.value = searchText;
  searchInput.dispatchEvent(new InputEvent('input', {
    data: searchText,
    inputType: 'insertText',
    bubbles: true,
    cancelable: true
  }));

  await sleep(300);

  // Press Enter to select first result
  searchInput.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Enter',
    code: 'Enter',
    keyCode: 13,
    which: 13,
    bubbles: true,
    cancelable: true
  }));

  searchInput.dispatchEvent(new KeyboardEvent('keypress', {
    key: 'Enter',
    code: 'Enter',
    keyCode: 13,
    which: 13,
    bubbles: true,
    cancelable: true
  }));

  searchInput.dispatchEvent(new KeyboardEvent('keyup', {
    key: 'Enter',
    code: 'Enter',
    keyCode: 13,
    which: 13,
    bubbles: true,
    cancelable: true
  }));

  return true;
}

// Export for use in content script
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { triggerEquationInsertion };
}
