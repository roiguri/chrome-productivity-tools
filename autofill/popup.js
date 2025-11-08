(function() {
  'use strict';

  const STORAGE_KEY = 'tau_id_number';

  const elements = {
    idNumber: document.getElementById('idNumber'),
    currentValue: document.getElementById('currentValue'),
    saveBtn: document.getElementById('saveBtn'),
    clearBtn: document.getElementById('clearBtn'),
    status: document.getElementById('status')
  };

  /**
   * Displays a status message to the user
   * @param {string} message - The message to display
   * @param {string} type - 'success' or 'error'
   */
  function showStatus(message, type = 'success') {
    elements.status.textContent = message;
    elements.status.className = `status ${type}`;
    elements.status.style.display = 'block';

    setTimeout(() => {
      elements.status.style.display = 'none';
    }, 3000);
  }

  /**
   * Masks the ID number for privacy display
   * @param {string} id - The ID number to mask
   * @returns {string} - Masked ID (e.g., "123****89")
   */
  function maskId(id) {
    if (!id || id.length < 3) return id;
    const visibleChars = 2;
    const start = id.substring(0, visibleChars);
    const end = id.substring(id.length - visibleChars);
    const masked = '*'.repeat(id.length - (visibleChars * 2));
    return `${start}${masked}${end}`;
  }

  /**
   * Loads the saved ID from storage and displays it (masked)
   */
  function loadSavedId() {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      if (result[STORAGE_KEY]) {
        elements.currentValue.textContent = maskId(result[STORAGE_KEY]);
        elements.currentValue.style.color = '#333';
      } else {
        elements.currentValue.textContent = 'לא הוגדר';
        elements.currentValue.style.color = '#999';
      }
    });
  }

  /**
   * Validates the ID number format
   * @param {string} id - The ID to validate
   * @returns {boolean} - True if valid
   */
  function validateId(id) {
    // Israeli ID is 9 digits, but we'll be flexible for other use cases
    return id && id.trim().length > 0;
  }

  /**
   * Saves the ID number to local storage
   */
  function saveId() {
    const id = elements.idNumber.value.trim();

    if (!validateId(id)) {
      showStatus('נא להזין מספר זהות תקין', 'error');
      return;
    }

    chrome.storage.local.set({ [STORAGE_KEY]: id }, () => {
      showStatus('מספר הזהות נשמר בהצלחה!', 'success');
      elements.idNumber.value = '';
      loadSavedId();
    });
  }

  /**
   * Clears the saved ID from storage
   */
  function clearId() {
    if (!confirm('האם למחוק את מספר הזהות השמור?')) {
      return;
    }

    chrome.storage.local.remove([STORAGE_KEY], () => {
      showStatus('מספר הזהות נמחק בהצלחה', 'success');
      loadSavedId();
    });
  }

  // Event listeners
  elements.saveBtn.addEventListener('click', saveId);
  elements.clearBtn.addEventListener('click', clearId);

  // Allow Enter key to save
  elements.idNumber.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      saveId();
    }
  });

  // Load saved ID on popup open
  loadSavedId();
})();
