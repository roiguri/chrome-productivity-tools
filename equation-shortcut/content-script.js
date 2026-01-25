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
      // Assumes triggerEquationInsertion is available globally from equation-trigger.js
      await triggerEquationInsertion();
    }
  }

  async function handlePaste(event) {
    const clipboardData = event.clipboardData || window.clipboardData;
    if (!clipboardData) return;

    const text = clipboardData.getData('text');
    // Regex for ${...}$ pattern
    // Matches ${ followed by anything (non-greedy) until }$
    const formulaPattern = /\$\{([\s\S]*?)\}\$/;

    // Quick check if we need to intervene
    if (!formulaPattern.test(text)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    // Split text into chunks (text and formulas)
    // Using split with capturing group to keep the delimiters/formulas
    const chunks = text.split(/(\$\{[\s\S]*?\}\$)/g);

    for (const chunk of chunks) {
      if (!chunk) continue;

      if (chunk.startsWith('${') && chunk.endsWith('}$')) {
        // Extract content between ${ and }$
        const formulaContent = chunk.slice(2, -2);

        // Insert equation
        // Assumes functions are available globally from equation-trigger.js
        const success = await triggerEquationInsertion();
        if (success) {
          await typeText(formulaContent);
          await simulateRightArrow();
        } else {
          // Fallback: just insert the original text if equation trigger fails
          await insertText(chunk);
        }
      } else {
        // Regular text
        await insertText(chunk);
      }
    }
  }

  function attachListeners(iframe) {
    if (!iframe.contentDocument) {
      return false;
    }

    iframe.contentDocument.addEventListener('keydown', handleKeyPress, true);
    iframe.contentDocument.addEventListener('paste', handlePaste, true);
    return true;
  }

  function detectIframe() {
    const iframe = document.querySelector('.docs-texteventtarget-iframe');

    if (iframe && !iframeDetected) {
      if (attachListeners(iframe)) {
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
