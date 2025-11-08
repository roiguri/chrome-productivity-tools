(function() {
  'use strict';

  const STORAGE_KEY = 'tau_id_number';

  /**
   * Handles extension installation and updates
   * Opens popup on first install to guide user setup
   */
  chrome.runtime.onInstalled.addListener((details) => {
    console.log('[Auto-Fill Background] Extension installed/updated:', details.reason);

    if (details.reason === 'install') {
      // Open popup automatically on first install
      console.log('[Auto-Fill Background] First install - opening popup');
      chrome.action.openPopup().catch((error) => {
        // Note: openPopup() can fail if there's no active window
        // In that case, we'll just set the badge as a reminder
        console.log('[Auto-Fill Background] Could not open popup:', error);
        updateBadge();
      });
    }

    // Check if ID is configured and update badge accordingly
    updateBadge();
  });

  /**
   * Updates the extension badge based on configuration state
   * Shows "!" if no ID is configured, clears badge otherwise
   */
  function updateBadge() {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      if (!result[STORAGE_KEY]) {
        // No ID configured - show badge reminder
        chrome.action.setBadgeText({ text: '!' });
        chrome.action.setBadgeBackgroundColor({ color: '#FF5722' });
        chrome.action.setTitle({
          title: 'Form Auto-Fill - Configuration Required'
        });
        console.log('[Auto-Fill Background] Badge set - no ID configured');
      } else {
        // ID is configured - clear badge
        chrome.action.setBadgeText({ text: '' });
        chrome.action.setTitle({
          title: 'Form Auto-Fill - Click to manage settings'
        });
        console.log('[Auto-Fill Background] Badge cleared - ID configured');
      }
    });
  }

  /**
   * Listen for storage changes to update badge dynamically
   * When user saves/clears ID, badge updates immediately
   */
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes[STORAGE_KEY]) {
      console.log('[Auto-Fill Background] Storage changed, updating badge');
      updateBadge();
    }
  });

  // Initialize badge on service worker startup
  updateBadge();
})();
