/**
 * Google Docs Equation Shortcut - Content Script
 * Handles keyboard shortcut detection and iframe management
 */

(function() {
  'use strict';

  let iframeDetected = false;

  async function handleKeyPress(event) {
    if (event.altKey && event.key === '=' && !event.ctrlKey && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      await triggerEquationInsertion();
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
