(function() {
  'use strict';

  const STORAGE_KEYS = {
    VALUES: 'stored_values',
    CONFIGS: 'autofill_configs'
  };

  /**
   * Handles extension installation and updates
   * Opens options page on first install to guide user setup
   */
  chrome.runtime.onInstalled.addListener((details) => {
    console.log('[Auto-Fill Background] Extension installed/updated:', details.reason);

    if (details.reason === 'install') {
      // Open options page automatically on first install
      console.log('[Auto-Fill Background] First install - opening options page');
      chrome.runtime.openOptionsPage().catch((error) => {
        console.log('[Auto-Fill Background] Could not open options page:', error);
        updateBadge();
      });
    }

    // Check configuration and update badge accordingly
    updateBadge();
  });

  /**
   * Updates the extension badge based on configuration state
   * Shows count of active configurations or "!" if none configured
   */
  function updateBadge() {
    chrome.storage.local.get([STORAGE_KEYS.VALUES, STORAGE_KEYS.CONFIGS], (result) => {
      const values = result[STORAGE_KEYS.VALUES] || {};
      const configs = result[STORAGE_KEYS.CONFIGS] || [];

      const valuesCount = Object.keys(values).length;
      const activeConfigsCount = configs.filter(c => c.enabled).length;

      if (valuesCount === 0 || activeConfigsCount === 0) {
        // No configuration - show badge reminder
        chrome.action.setBadgeText({ text: '!' });
        chrome.action.setBadgeBackgroundColor({ color: '#FF5722' });
        chrome.action.setTitle({
          title: 'Form Auto-Fill - Configuration Required'
        });
        console.log('[Auto-Fill Background] Badge set - no configurations');
      } else {
        // Show count of active configurations
        chrome.action.setBadgeText({ text: activeConfigsCount.toString() });
        chrome.action.setBadgeBackgroundColor({ color: '#009efd' });
        chrome.action.setTitle({
          title: `Form Auto-Fill - ${activeConfigsCount} active configuration(s)`
        });
        console.log(`[Auto-Fill Background] Badge set - ${activeConfigsCount} active config(s)`);
      }
    });
  }

  /**
   * Listen for storage changes to update badge dynamically
   * When user saves/clears values or configs, badge updates immediately
   */
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && (changes[STORAGE_KEYS.VALUES] || changes[STORAGE_KEYS.CONFIGS])) {
      console.log('[Auto-Fill Background] Storage changed, updating badge');
      updateBadge();
    }
  });

  // Initialize badge on service worker startup
  updateBadge();
})();
