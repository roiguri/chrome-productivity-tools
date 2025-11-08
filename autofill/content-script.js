(function() {
  'use strict';

  /**
   * Configuration for auto-fill targets
   * Future versions can expand this to support multiple sites and fields
   */
  const AUTOFILL_CONFIGS = [
    {
      id: 'tau_id_field',
      urlPattern: 'https://nidp.tau.ac.il/*',  // Reserved for future URL matching
      fieldSelector: '#Ecom_User_Pid',
      storageKey: 'tau_id_number',
      enabled: true
    }
    // Future configurations can be added here:
    // {
    //   id: 'other_site_field',
    //   urlPattern: 'https://example.com/*',
    //   fieldSelector: '#custom-field-id',
    //   storageKey: 'other_site_value',
    //   enabled: true
    // }
  ];

  /**
   * Checks if a URL matches a pattern (supports wildcards)
   * @param {string} url - The URL to check
   * @param {string} pattern - The pattern to match against (supports * wildcard)
   * @returns {boolean} - True if URL matches pattern
   *
   * Examples:
   *   matchesUrlPattern('https://nidp.tau.ac.il/login', 'https://nidp.tau.ac.il/*') -> true
   *   matchesUrlPattern('https://other.com/', 'https://nidp.tau.ac.il/*') -> false
   */
  function matchesUrlPattern(url, pattern) {
    // Convert wildcard pattern to regex
    // * matches any characters
    // ? matches single character
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // Escape regex special chars
      .replace(/\*/g, '.*')                   // * -> match any characters
      .replace(/\?/g, '.');                   // ? -> match single character

    const regex = new RegExp('^' + regexPattern + '$');
    return regex.test(url);
  }

  /**
   * Checks if the extension should activate on the current page
   * Checks current URL against configured patterns
   *
   * @returns {boolean} - True if should activate
   */
  function shouldActivateOnCurrentPage() {
    const currentUrl = window.location.href;

    // Check if current URL matches any enabled configuration
    for (const config of AUTOFILL_CONFIGS) {
      if (!config.enabled) {
        continue;
      }

      if (matchesUrlPattern(currentUrl, config.urlPattern)) {
        console.log(`[Auto-Fill] Page matched pattern: ${config.urlPattern} (config: ${config.id})`);
        return true;
      }
    }

    console.log(`[Auto-Fill] No matching pattern for URL: ${currentUrl}`);
    return false;
  }

  /**
   * Waits for an element to appear in the DOM
   * @param {string} selector - CSS selector for the element
   * @param {number} timeout - Maximum time to wait in milliseconds
   * @returns {Promise<Element|null>} - The element or null if timeout
   */
  function waitForElement(selector, timeout = 5000) {
    return new Promise((resolve) => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }

      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector);
        if (element) {
          observer.disconnect();
          resolve(element);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeout);
    });
  }

  /**
   * Delays execution for a specified time
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Attempts to fill a field with a value
   * @param {Element} field - The input field to fill
   * @param {string} value - The value to fill
   */
  function fillField(field, value) {
    // Don't overwrite if field already has a value
    // (e.g., from password manager or manual input)
    if (field.value && field.value.trim() !== '') {
      console.log('[Auto-Fill] Field already has value, skipping');
      return;
    }

    // Set the value
    field.value = value;

    // Dispatch input event to trigger any listeners
    const inputEvent = new Event('input', { bubbles: true });
    field.dispatchEvent(inputEvent);

    // Dispatch change event as well
    const changeEvent = new Event('change', { bubbles: true });
    field.dispatchEvent(changeEvent);

    console.log('[Auto-Fill] Field filled successfully');
  }

  /**
   * Processes a single autofill configuration
   * @param {Object} config - The configuration object
   * @returns {Promise<void>}
   */
  async function processConfig(config) {
    if (!config.enabled) {
      return;
    }

    console.log(`[Auto-Fill] Processing config: ${config.id}`);

    // Wait for the field to appear (with timeout)
    const field = await waitForElement(config.fieldSelector);

    if (!field) {
      console.log(`[Auto-Fill] Field not found: ${config.fieldSelector}`);
      return;
    }

    // Retrieve the stored value
    chrome.storage.local.get([config.storageKey], (result) => {
      const value = result[config.storageKey];

      if (!value) {
        console.log(`[Auto-Fill] No value stored for: ${config.storageKey}`);
        return;
      }

      // Small delay to ensure password managers have filled their fields first
      sleep(100).then(() => {
        fillField(field, value);
      });
    });
  }

  /**
   * Main initialization function
   * Runs when the content script loads
   */
  async function init() {
    console.log('[Auto-Fill] Content script loaded');

    // Check if we should activate on this page
    if (!shouldActivateOnCurrentPage()) {
      console.log('[Auto-Fill] Not activating on this page');
      return;
    }

    console.log('[Auto-Fill] Activating on this page');

    // Process each enabled configuration
    for (const config of AUTOFILL_CONFIGS) {
      await processConfig(config);
    }
  }

  // Wait for DOM to be ready, then initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // DOM is already loaded
    init();
  }
})();
