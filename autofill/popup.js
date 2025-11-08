(function() {
  'use strict';

  const STORAGE_KEYS = {
    VALUES: 'stored_values',
    CONFIGS: 'autofill_configs'
  };

  const elements = {
    statsSection: document.getElementById('statsSection'),
    emptyState: document.getElementById('emptyState'),
    valuesCount: document.getElementById('valuesCount'),
    configsCount: document.getElementById('configsCount'),
    manageBtn: document.getElementById('manageBtn'),
    status: document.getElementById('status')
  };

  /**
   * Loads statistics from storage
   */
  function loadStats() {
    chrome.storage.local.get([STORAGE_KEYS.VALUES, STORAGE_KEYS.CONFIGS], (result) => {
      const values = result[STORAGE_KEYS.VALUES] || {};
      const configs = result[STORAGE_KEYS.CONFIGS] || [];

      const valuesCount = Object.keys(values).length;
      const activeConfigsCount = configs.filter(c => c.enabled).length;

      if (valuesCount === 0 && configs.length === 0) {
        // Show empty state
        elements.statsSection.style.display = 'none';
        elements.emptyState.style.display = 'block';
      } else {
        // Show stats
        elements.statsSection.style.display = 'block';
        elements.emptyState.style.display = 'none';
        elements.valuesCount.textContent = valuesCount;
        elements.configsCount.textContent = activeConfigsCount;
      }
    });
  }

  /**
   * Opens the options page
   */
  function openOptions() {
    chrome.runtime.openOptionsPage();
  }

  // Event listeners
  elements.manageBtn.addEventListener('click', openOptions);

  // Load stats on popup open
  loadStats();
})();
