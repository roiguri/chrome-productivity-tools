/**
 * Google Docs Equation Shortcut - Content Script
 * Handles keyboard shortcut detection and iframe management
 */

(function() {
  'use strict';

  let iframeDetected = false;

  async function getSelectedText() {
    const iframe = document.querySelector('.docs-texteventtarget-iframe');
    if (!iframe || !iframe.contentDocument) {
      console.warn('[Equation Shortcut] getSelectedText: no iframe found');
      return '';
    }

    // execCommand must be called synchronously during the user gesture (before any
    // await), otherwise the browser blocks it. This copies selected text to clipboard.
    const copyResult = iframe.contentDocument.execCommand('copy');
    console.log('[Equation Shortcut] execCommand copy result:', copyResult);

    // Wait briefly for the clipboard to update
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      const text = await navigator.clipboard.readText();
      console.log('[Equation Shortcut] clipboard text:', JSON.stringify(text));
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

      const selectedText = await getSelectedText();
      console.log('[Equation Shortcut] selectedText:', JSON.stringify(selectedText));
      console.log('[Equation Shortcut] processSelectedTextWithEquations available:', typeof processSelectedTextWithEquations === 'function');

      if (selectedText && selectedText.trim().length > 0) {
        // Call the new handling function inside equation-trigger.js
        if (typeof processSelectedTextWithEquations === 'function') {
          await processSelectedTextWithEquations(selectedText);
        } else {
          // Fallback if not loaded
          await triggerEquationInsertion();
        }
      } else {
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
