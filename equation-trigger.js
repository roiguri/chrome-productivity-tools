/**
 * Modular equation trigger functionality for Google Docs
 * This file contains the core logic for inserting equations
 */

/**
 * Attempts to trigger equation insertion in Google Docs
 * Uses multiple strategies with fallback
 *
 * @returns {boolean} True if successful, false otherwise
 */
function triggerEquationInsertion() {
  console.log('[Equation Shortcut] Attempting to insert equation...');

  // Strategy 1: Try to find and click the equation button directly
  if (tryDirectButtonClick()) {
    console.log('[Equation Shortcut] Successfully triggered via direct button click');
    return true;
  }

  // Strategy 2: Fallback to menu navigation simulation
  if (tryMenuNavigationSimulation()) {
    console.log('[Equation Shortcut] Successfully triggered via menu navigation');
    return true;
  }

  console.warn('[Equation Shortcut] Failed to trigger equation insertion');
  return false;
}

/**
 * Strategy 1: Attempt to find and click the equation button in the toolbar
 * This searches for common selectors used by Google Docs
 *
 * @returns {boolean} True if button found and clicked
 */
function tryDirectButtonClick() {
  // Common selectors for the equation button in Google Docs
  const selectors = [
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
      console.log(`[Equation Shortcut] Found equation button with selector: ${selector}`);
      button.click();
      return true;
    }
  }

  return false;
}

/**
 * Strategy 2: Simulate keyboard menu navigation
 * Opens Insert menu (Ctrl+Shift+I) then presses 'E' for Equation
 *
 * @returns {boolean} True if simulation executed (doesn't guarantee success)
 */
function tryMenuNavigationSimulation() {
  const iframe = document.querySelector('.docs-texteventtarget-iframe');
  if (!iframe || !iframe.contentDocument) {
    console.warn('[Equation Shortcut] Cannot find Google Docs iframe for menu simulation');
    return false;
  }

  const target = iframe.contentDocument.activeElement || iframe.contentDocument.body;

  // Step 1: Simulate Ctrl+Shift+I to open Insert menu
  const insertMenuEvent = new KeyboardEvent('keydown', {
    key: 'i',
    code: 'KeyI',
    keyCode: 73,
    which: 73,
    ctrlKey: true,
    shiftKey: true,
    bubbles: true,
    cancelable: true
  });

  target.dispatchEvent(insertMenuEvent);

  // Step 2: Wait a moment, then press 'E' to select Equation
  setTimeout(() => {
    const equationSelectEvent = new KeyboardEvent('keydown', {
      key: 'e',
      code: 'KeyE',
      keyCode: 69,
      which: 69,
      bubbles: true,
      cancelable: true
    });

    target.dispatchEvent(equationSelectEvent);
  }, 100);

  return true;
}

// Export for use in content script
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { triggerEquationInsertion };
}
