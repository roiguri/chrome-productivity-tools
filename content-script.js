/**
 * Google Docs Equation Shortcut - Content Script
 * Handles keyboard shortcut detection and iframe management
 */

(function() {
  'use strict';

  console.log('[Equation Shortcut] Extension loaded');

  let iframeDetected = false;

  /**
   * Handle keyboard events for the Alt+= shortcut
   */
  function handleKeyPress(event) {
    // Check for Alt+= (Alt + Equal sign)
    if (event.altKey && event.key === '=' && !event.ctrlKey && !event.shiftKey) {
      console.log('[Equation Shortcut] Alt+= detected');
      event.preventDefault();
      event.stopPropagation();

      // Trigger the equation insertion
      triggerEquationInsertion();
    }
  }

  /**
   * Attach keyboard listener to the Google Docs iframe
   */
  function attachKeyboardListener(iframe) {
    if (!iframe.contentDocument) {
      console.warn('[Equation Shortcut] Cannot access iframe contentDocument');
      return false;
    }

    console.log('[Equation Shortcut] Attaching keyboard listener to iframe');

    // Add event listener with capture phase to intercept before Google Docs
    iframe.contentDocument.addEventListener('keydown', handleKeyPress, true);

    return true;
  }

  /**
   * Detect the Google Docs text event target iframe
   * Uses MutationObserver to wait for iframe to appear in DOM
   */
  function detectIframe() {
    const iframe = document.querySelector('.docs-texteventtarget-iframe');

    if (iframe && !iframeDetected) {
      console.log('[Equation Shortcut] Found Google Docs iframe');

      if (attachKeyboardListener(iframe)) {
        iframeDetected = true;
        observer.disconnect();
      }
    }
  }

  // Set up MutationObserver to watch for iframe appearance
  const observer = new MutationObserver((mutations) => {
    detectIframe();
  });

  // Start observing the document for changes
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Also try to detect iframe immediately in case it's already loaded
  detectIframe();

  // Fallback: Add listener to main document as well (may help in some cases)
  document.addEventListener('keydown', handleKeyPress, true);

  console.log('[Equation Shortcut] Content script initialized, watching for iframe...');
})();
