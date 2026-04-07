/**
 * Google Docs Equation Shortcut - Content Script
 * Handles keyboard shortcut detection and iframe management
 */

(function() {
  'use strict';

  let iframeDetected = false;

  async function getSelectedText() {
    try {
      // Save current clipboard content if possible
      let originalClipboard = '';
      try {
        originalClipboard = await navigator.clipboard.readText();
      } catch (e) {
        // Might fail if clipboard is empty or lacks permission for read
      }

      // Write a known dummy string
      const dummyString = '___EQUATION_SHORTCUT_DUMMY___';
      await navigator.clipboard.writeText(dummyString);

      // Simulate Copy
      document.execCommand('copy');

      // Wait a tiny bit for the clipboard to update
      await new Promise(resolve => setTimeout(resolve, 50));

      const newClipboard = await navigator.clipboard.readText();

      // If it's still the dummy string, nothing was selected/copied
      if (newClipboard === dummyString) {
        // Restore original
        if (originalClipboard) {
          await navigator.clipboard.writeText(originalClipboard);
        } else {
          await navigator.clipboard.writeText(''); // Clear dummy
        }
        return '';
      }

      // Restore original clipboard
      if (originalClipboard) {
        await navigator.clipboard.writeText(originalClipboard);
      } else {
        await navigator.clipboard.writeText(''); // Clear if it was originally empty
      }

      return newClipboard;

    } catch (e) {
      console.warn('[Equation Shortcut] Failed to read selection via clipboard', e);
      return '';
    }
  }

  async function handleKeyPress(event) {
    if (event.altKey && event.key === '=' && !event.ctrlKey && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();

      const selectedText = await getSelectedText();

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
