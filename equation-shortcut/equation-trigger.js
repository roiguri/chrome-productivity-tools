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

/**
 * Types text character by character to trigger Google Docs auto-formatting
 * @param {string} text
 */
async function typeText(text) {
  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    // For spaces, we need to make sure we dispatch a space key properly
    if (char === ' ') {
      dispatchKey(' ', { code: 'Space', keyCode: 32 });
    } else if (char === '\n') {
      dispatchKey('Enter', { code: 'Enter', keyCode: 13 });
    } else {
      // It's crucial for equations that we send keypress with the actual char
      const iframe = document.querySelector('.docs-texteventtarget-iframe');
      if (iframe && iframe.contentDocument) {
        const target = iframe.contentDocument.activeElement || iframe.contentDocument.body;

        // keydown
        target.dispatchEvent(new KeyboardEvent('keydown', {
          key: char,
          bubbles: true, cancelable: true
        }));

        // keypress (legacy but often required by editors)
        target.dispatchEvent(new KeyboardEvent('keypress', {
          key: char,
          charCode: char.charCodeAt(0),
          bubbles: true, cancelable: true
        }));

        // Input event (the actual text insertion)
        target.dispatchEvent(new InputEvent('beforeinput', {
          data: char,
          inputType: 'insertText',
          bubbles: true, cancelable: true
        }));
        target.dispatchEvent(new InputEvent('input', {
          data: char,
          inputType: 'insertText',
          bubbles: true, cancelable: true
        }));

        // keyup
        target.dispatchEvent(new KeyboardEvent('keyup', {
          key: char,
          bubbles: true, cancelable: true
        }));
      }
    }
    // Small delay to allow Docs to process each char, especially important for backslash commands + space
    await sleep(20);
  }
}

/**
 * Simulate Right Arrow to exit equation editor
 */
function exitEquationEditor() {
  dispatchKey('ArrowRight', { code: 'ArrowRight', keyCode: 39 });
}

/**
 * Parse text into text, inline equation, and block equation tokens.
 * @param {string} text - The input text
 * @returns {Array<{type: string, value: string}>}
 */
function parseTextWithEquations(text) {
  const tokens = [];
  let i = 0;
  let currentText = '';

  while (i < text.length) {
    if (text.substring(i, i + 2) === '$$') {
      const closeIndex = text.indexOf('$$', i + 2);
      if (closeIndex !== -1) {
        if (currentText) {
          tokens.push({ type: 'text', value: currentText });
          currentText = '';
        }
        tokens.push({ type: 'block', value: text.substring(i + 2, closeIndex) });
        i = closeIndex + 2;
        continue;
      }
    } else if (text[i] === '$') {
      let closeIndex = -1;
      let searchIndex = i + 1;

      while (searchIndex < text.length) {
        if (text[searchIndex] === '$') {
          if (text[searchIndex + 1] !== '$') {
            closeIndex = searchIndex;
            break;
          } else {
            // Skip the nested/adjacent $$
            searchIndex += 2;
          }
        } else {
          searchIndex++;
        }
      }

      if (closeIndex !== -1) {
        if (currentText) {
          tokens.push({ type: 'text', value: currentText });
          currentText = '';
        }
        tokens.push({ type: 'inline', value: text.substring(i + 1, closeIndex) });
        i = closeIndex + 1;
        continue;
      }
    }

    currentText += text[i];
    i++;
  }

  if (currentText) {
    tokens.push({ type: 'text', value: currentText });
  }

  return tokens;
}

/**
 * Process selected text by replacing it with typed text and equations
 * @param {string} text
 */
async function processSelectedTextWithEquations(text) {
  // First, simulate backspace to delete the selected text
  dispatchKey('Backspace', { code: 'Backspace', keyCode: 8 });
  await sleep(100);

  const tokens = parseTextWithEquations(text);

  for (const token of tokens) {
    if (token.type === 'text') {
      await typeText(token.value);
    } else if (token.type === 'inline') {
      // Trigger equation insertion
      const success = await triggerEquationInsertion();
      if (success) {
        await sleep(200); // Wait for equation box to activate
        await typeText(token.value);
        exitEquationEditor();
        await sleep(100);
      } else {
        // Fallback to normal text if we can't open equation editor
        await typeText('$' + token.value + '$');
      }
    } else if (token.type === 'block') {
      // For block, insert newline, equation, newline
      dispatchKey('Enter', { code: 'Enter', keyCode: 13 });
      await sleep(100);

      const success = await triggerEquationInsertion();
      if (success) {
        await sleep(200);
        await typeText(token.value);
        exitEquationEditor();
        await sleep(100);
        dispatchKey('Enter', { code: 'Enter', keyCode: 13 });
        await sleep(100);
      } else {
        await typeText('$$' + token.value + '$$');
      }
    }
  }
}

// Export for use in content script
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { triggerEquationInsertion, parseTextWithEquations, processSelectedTextWithEquations };
}
