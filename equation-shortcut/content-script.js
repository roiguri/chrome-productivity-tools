/**
 * Google Docs Equation Shortcut - Content Script
 * Handles keyboard shortcut detection and iframe management
 */

(function() {
  'use strict';

  let iframeDetected = false;

  // Reads the currently selected Docs text, or '' when nothing is selected.
  //
  // Google Docs' canvas renderer draws the selection on a <canvas>, so there is
  // no reliable selection DOM to inspect. Instead we go through the clipboard,
  // but first stamp it with a unique sentinel: Docs' copy only overwrites the
  // clipboard when a selection actually exists. If the sentinel is still there
  // afterwards, nothing was copied -> there was no selection. This is what keeps
  // a STALE clipboard from being misread as "selected text".
  async function getSelectedText() {
    const iframe = document.querySelector('.docs-texteventtarget-iframe');
    if (!iframe || !iframe.contentDocument) {
      console.warn('[Equation Shortcut] getSelectedText: no iframe found');
      return '';
    }

    const sentinel =
      '__EQ_SHORTCUT_NO_SELECTION__' + Date.now() + '_' + Math.random().toString(36).slice(2);

    // Stamp the clipboard before asking Docs to copy. If we can't write it, we
    // fall back to plain copy behaviour (staleness detection is simply skipped).
    let stamped = false;
    try {
      await navigator.clipboard.writeText(sentinel);
      stamped = true;
    } catch (e) {
      console.warn('[Equation Shortcut] Failed to stamp clipboard sentinel', e);
    }

    // Copy the Docs selection (if any) over the sentinel. execCommand still runs
    // within the shortcut's user gesture, so the browser permits it.
    iframe.contentDocument.execCommand('copy');

    // Wait briefly for the clipboard to update
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      const text = await navigator.clipboard.readText();
      // Sentinel survived -> Docs copied nothing -> no selection.
      if (stamped && text === sentinel) {
        return '';
      }
      return text || '';
    } catch (e) {
      console.warn('[Equation Shortcut] Failed to read clipboard', e);
      return '';
    }
  }

  async function handleKeyPress(event) {
    if (event.altKey && event.key === '=' && !event.ctrlKey && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();

      // getSelectedText() returns '' when nothing is selected (sentinel intact),
      // so the empty check below distinguishes the two states.
      const selectedText = await getSelectedText();
      if (
        selectedText &&
        selectedText.trim().length > 0 &&
        typeof processSelectedTextWithEquations === 'function'
      ) {
        // State 1: something selected -> replace it with typed text + equations.
        await processSelectedTextWithEquations(selectedText);
      } else {
        // State 2: nothing selected (or text unreadable) -> insert empty formula.
        await triggerEquationInsertion();
      }
    }
  }

  function attachKeyboardListener(iframe) {
    if (!iframe.contentDocument) {
      return false;
    }

    iframe.contentDocument.addEventListener('keydown', handleKeyPress, true);
    return true;
  }

  function detectIframe() {
    const iframe = document.querySelector('.docs-texteventtarget-iframe');

    if (iframe && !iframeDetected) {
      if (attachKeyboardListener(iframe)) {
        iframeDetected = true;
        observer.disconnect();
      }
    }
  }

  const observer = new MutationObserver(() => detectIframe());

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  detectIframe();
})();
