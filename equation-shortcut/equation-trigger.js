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
 * Types a single character into the Google Docs iframe
 * @param {string} char
 */
async function typeSingleChar(char) {
  if (char === '\n') {
    dispatchKey('Enter', { code: 'Enter', keyCode: 13 });
  } else {
    const iframe = document.querySelector('.docs-texteventtarget-iframe');
    if (iframe && iframe.contentDocument) {
      const target = iframe.contentDocument.activeElement || iframe.contentDocument.body;
      const isSpace = char === ' ';
      target.dispatchEvent(new KeyboardEvent('keydown', { key: char, code: isSpace ? 'Space' : undefined, keyCode: isSpace ? 32 : undefined, bubbles: true, cancelable: true }));
      target.dispatchEvent(new KeyboardEvent('keypress', { key: char, charCode: char.charCodeAt(0), bubbles: true, cancelable: true }));
      target.dispatchEvent(new InputEvent('beforeinput', { data: char, inputType: 'insertText', bubbles: true, cancelable: true }));
      target.dispatchEvent(new InputEvent('input', { data: char, inputType: 'insertText', bubbles: true, cancelable: true }));
      target.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true, cancelable: true }));
    }
  }
  await sleep(20);
}

/**
 * Types text character by character to trigger Google Docs auto-formatting
 * @param {string} text
 */
async function typeText(text) {
  for (let i = 0; i < text.length; i++) {
    await typeSingleChar(text[i]);
  }
}

/**
 * Entry point: types LaTeX content into the Google Docs equation editor.
 * Handles \commands, subscripts/superscripts, and braced arguments correctly.
 * @param {string} text - LaTeX content to type
 */
async function typeEquationText(text) {
  let i = 0;
  while (i < text.length) {
    i = await typeEquationToken(text, i);
  }
}

/**
 * Processes one LaTeX token starting at index i.
 * Returns the index after the token.
 * @param {string} text
 * @param {number} i
 * @returns {Promise<number>}
 */
async function typeEquationToken(text, i) {
  const char = text[i];

  if (char === '\\') {
    return await handleLatexCommand(text, i);
  }

  if ((char === '_' || char === '^') && i + 1 < text.length) {
    await typeSingleChar(char);
    i++;
    if (text[i] === '{') {
      i++; // skip {
      i = await typeEquationContent(text, i, '}');
      if (i < text.length) i++; // skip }
    } else {
      i = await typeEquationToken(text, i);
    }
    dispatchKey('ArrowRight', { code: 'ArrowRight', keyCode: 39 });
    await sleep(30);
    return i;
  }

  await typeSingleChar(char);
  return i + 1;
}

/**
 * Processes all tokens from i until stopChar (or end of string).
 * Returns the index of stopChar (not consumed).
 * @param {string} text
 * @param {number} i
 * @param {string} [stopChar]
 * @returns {Promise<number>}
 */
async function typeEquationContent(text, i, stopChar) {
  while (i < text.length && text[i] !== stopChar) {
    i = await typeEquationToken(text, i);
  }
  return i;
}

/**
 * Handles a \command starting at index i (where text[i] === '\\').
 * Looks up the command in latex-mathquill-map.js and dispatches the
 * correct MathQuill key sequence.
 * @param {string} text
 * @param {number} i
 * @returns {Promise<number>}
 */
/**
 * Types a string using only keydown+keypress — no input events.
 * Used for LaTeX command names so MathQuill's internal command buffer
 * is built through its normal keyboard pipeline, not bypassed via input events.
 * @param {string} str
 */
async function typeCommandSequence(str) {
  const iframe = document.querySelector('.docs-texteventtarget-iframe');
  if (!iframe || !iframe.contentDocument) return;
  const target = iframe.contentDocument.activeElement || iframe.contentDocument.body;
  for (const c of str) {
    target.dispatchEvent(new KeyboardEvent('keydown', {
      key: c, bubbles: true, cancelable: true
    }));
    target.dispatchEvent(new KeyboardEvent('keypress', {
      key: c, charCode: c.charCodeAt(0), bubbles: true, cancelable: true
    }));
    await sleep(20);
  }
}

/**
 * Reads a subscript/superscript argument beginning at text[i] (which is '_' or
 * '^'). Handles both braced ({...}, brace-balanced) and single-character forms.
 * @param {string} text
 * @param {number} i
 * @returns {{kind: string, content: string, next: number}}
 */
function readScriptArg(text, i) {
  const kind = text[i]; // '_' or '^'
  i++;
  let content = '';
  if (text[i] === '{') {
    i++; // skip {
    let depth = 1;
    while (i < text.length && depth > 0) {
      if (text[i] === '{') {
        depth++;
      } else if (text[i] === '}') {
        depth--;
        if (depth === 0) break;
      }
      content += text[i++];
    }
    if (i < text.length) i++; // skip closing }
  } else if (text[i] === '\\') {
    // Unbraced \command argument, e.g. ^\infty — capture the whole token.
    content += text[i++]; // backslash
    if (i < text.length && /[a-zA-Z]/.test(text[i])) {
      while (i < text.length && /[a-zA-Z]/.test(text[i])) content += text[i++];
    } else if (i < text.length) {
      content += text[i++]; // non-alpha escape like \{
    }
  } else if (i < text.length) {
    content = text[i++]; // single character
  }
  return { kind, content, next: i };
}

/**
 * Fills the below/above slots of a Docs "limits" template (already opened by
 * "\op "). The cursor starts in the BELOW slot. Reads the following _ and ^
 * arguments (in either order), types below, ArrowRight to the ABOVE slot, types
 * above, ArrowRight to exit the template.
 * @param {string} text
 * @param {number} i
 * @returns {Promise<number>}
 */
async function typeLimitScripts(text, i) {
  let below = '';
  let above = '';
  // Up to two scripts may follow, in either order (\sum_{}^{} or \sum^{}_{}).
  for (let n = 0; n < 2; n++) {
    if (text[i] === '_' || text[i] === '^') {
      const arg = readScriptArg(text, i);
      if (arg.kind === '_') {
        below = arg.content;
      } else {
        above = arg.content;
      }
      i = arg.next;
    }
  }

  // Cursor is in the below slot: type it, move up to the above slot, type it, exit.
  if (below) await typeEquationText(below);
  dispatchKey('ArrowRight', { code: 'ArrowRight', keyCode: 39 });
  await sleep(30);
  if (above) await typeEquationText(above);
  dispatchKey('ArrowRight', { code: 'ArrowRight', keyCode: 39 });
  await sleep(30);
  return i;
}

async function handleLatexCommand(text, i) {
  i++; // skip backslash

  // Read alphabetic command name
  let name = '';
  while (i < text.length && /[a-zA-Z]/.test(text[i])) {
    name += text[i++];
  }

  // Non-alphabetic escape like \{ \} — type the following character literally
  if (name === '') {
    if (i < text.length) {
      await typeSingleChar(text[i]);
      return i + 1;
    }
    return i;
  }

  // Strip commands: \left( → (, \right) → )
  if (MATHQUILL_STRIP_COMMANDS.has(name)) {
    return i; // resume at the character after the command
  }

  // Remap aliases: \le → \leq, etc.
  if (MATHQUILL_COMMAND_ALIASES[name]) {
    name = MATHQUILL_COMMAND_ALIASES[name];
  }

  // Unicode substitution: command not supported by Google Docs — type Unicode directly
  if (MATHQUILL_UNICODE_SUBSTITUTIONS[name]) {
    const map = MATHQUILL_UNICODE_SUBSTITUTIONS[name];
    let arg = '';
    if (text[i] === '{') {
      i++; // skip {
      while (i < text.length && text[i] !== '}') arg += text[i++];
      if (i < text.length) i++; // skip }
    } else if (i < text.length) {
      arg = text[i++];
    }
    const unicode = map[arg];
    if (unicode) {
      await typeSingleChar(unicode);
    } else {
      // No mapping found — type the arg as-is
      for (const c of arg) await typeSingleChar(c);
    }
    return i;
  }

  // No-arg symbol: type Unicode directly — no need to go through MathQuill's command system
  if (MATHQUILL_SYMBOL_MAP[name]) {
    await typeSingleChar(MATHQUILL_SYMBOL_MAP[name]);
    return i;
  }

  // Type backslash + command name via keydown+keypress only so MathQuill's command
  // buffer is built through its normal keyboard pipeline (input events bypass it)
  await typeCommandSequence('\\' + name);

  if (MATHQUILL_LIMIT_OPERATORS.has(name)) {
    // "\sum " opens Docs' limits template with the cursor in the BELOW slot.
    await typeCommandSequence(' ');
    await sleep(50);
    return await typeLimitScripts(text, i);
  }

  if (MATHQUILL_BOX_COMMANDS.has(name)) {
    // Space (keydown+keypress) triggers MathQuill command conversion
    await typeCommandSequence(' ');
    await sleep(50);
    if (text[i] === '{') {
      i++;
      i = await typeEquationContent(text, i, '}');
      if (i < text.length) i++;
    } else {
      i = await typeEquationToken(text, i);
    }
    dispatchKey('ArrowRight', { code: 'ArrowRight', keyCode: 39 });
    await sleep(30);
    return i;
  }

  if (MATHQUILL_FONT_COMMANDS.has(name)) {
    await typeCommandSequence(' ');
    await sleep(50);
    if (text[i] === '{') {
      i++;
      i = await typeEquationContent(text, i, '}');
      if (i < text.length) i++;
    } else {
      i = await typeEquationToken(text, i);
    }
    // No ArrowRight — font commands don't create a box to exit
    return i;
  }

  if (MATHQUILL_TWO_ARG_COMMANDS.has(name)) {
    await typeCommandSequence(' ');
    await sleep(50);
    // First argument
    if (text[i] === '{') {
      i++;
      i = await typeEquationContent(text, i, '}');
      if (i < text.length) i++;
    } else {
      i = await typeEquationToken(text, i);
    }
    dispatchKey('ArrowRight', { code: 'ArrowRight', keyCode: 39 });
    await sleep(30);
    // Second argument
    if (text[i] === '{') {
      i++;
      i = await typeEquationContent(text, i, '}');
      if (i < text.length) i++;
    } else {
      i = await typeEquationToken(text, i);
    }
    dispatchKey('ArrowRight', { code: 'ArrowRight', keyCode: 39 });
    await sleep(30);
    return i;
  }

  // No-arg command Google Docs supports natively (e.g. \delta, \pi, \sum, \int):
  // press Space to trigger MathQuill's command conversion. Without this the
  // command only converts when the source happens to have a trailing space, so a
  // command at the end of a group, sub/superscript, or box renders literally.
  await typeCommandSequence(' ');
  await sleep(50);
  // Our trigger space stands in for a separating space in the source, so consume
  // one if present to avoid inserting a stray space after the symbol.
  if (text[i] === ' ') i++;
  return i;
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
  // Track whether cursor is at the start of a line so we don't add unnecessary newlines
  let atLineStart = true;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const hasMoreTokens = i < tokens.length - 1;

    if (token.type === 'text') {
      await typeText(token.value);
      atLineStart = token.value.endsWith('\n');
    } else if (token.type === 'inline') {
      const success = await triggerEquationInsertion();
      if (success) {
        await sleep(200); // Wait for equation box to activate
        await typeEquationText(token.value);
        exitEquationEditor();
        await sleep(100);
      } else {
        await typeText('$' + token.value + '$');
      }
      atLineStart = false;
    } else if (token.type === 'block') {
      // Only add a leading newline if there's preceding content on the same line
      if (!atLineStart) {
        dispatchKey('Enter', { code: 'Enter', keyCode: 13 });
        await sleep(100);
      }

      const success = await triggerEquationInsertion();
      if (success) {
        await sleep(200);
        await typeEquationText(token.value);
        exitEquationEditor();
        await sleep(100);
        // Only add a trailing newline if there's more content following
        if (hasMoreTokens) {
          dispatchKey('Enter', { code: 'Enter', keyCode: 13 });
          await sleep(100);
        }
      } else {
        await typeText('$$' + token.value + '$$');
      }
      atLineStart = true;
    }
  }
}

// Export for use in content script
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { triggerEquationInsertion, parseTextWithEquations, processSelectedTextWithEquations, typeEquationText };
}
