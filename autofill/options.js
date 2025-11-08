// Storage keys
const STORAGE_KEYS = {
  VALUES: 'stored_values',
  CONFIGS: 'autofill_configs',
  WELCOME_DISMISSED: 'welcome_dismissed'
};

// State
let storedValues = {};
let autofillConfigs = [];
let editingConfigId = null;
let editingValueKey = null;

// DOM Elements
const elements = {
  // Status
  status: document.getElementById('status'),

  // Welcome Banner & Quick Setup
  welcomeBanner: document.getElementById('welcomeBanner'),
  setupTauBtn: document.getElementById('setupTauBtn'),
  skipSetupBtn: document.getElementById('skipSetupBtn'),
  quickSetup: document.getElementById('quickSetup'),
  quickTauId: document.getElementById('quickTauId'),
  saveQuickSetupBtn: document.getElementById('saveQuickSetupBtn'),
  cancelQuickSetupBtn: document.getElementById('cancelQuickSetupBtn'),

  // Values
  setupTauLoginBtn: document.getElementById('setupTauLoginBtn'),
  addValueBtn: document.getElementById('addValueBtn'),
  addValueForm: document.getElementById('addValueForm'),
  valueLabel: document.getElementById('valueLabel'),
  valueContent: document.getElementById('valueContent'),
  saveValueBtn: document.getElementById('saveValueBtn'),
  cancelValueBtn: document.getElementById('cancelValueBtn'),
  valuesList: document.getElementById('valuesList'),

  // Configs
  addConfigBtn: document.getElementById('addConfigBtn'),
  addConfigForm: document.getElementById('addConfigForm'),
  configFormTitle: document.getElementById('configFormTitle'),
  editConfigId: document.getElementById('editConfigId'),
  configName: document.getElementById('configName'),
  configUrl: document.getElementById('configUrl'),
  configSelector: document.getElementById('configSelector'),
  configValue: document.getElementById('configValue'),
  configEnabled: document.getElementById('configEnabled'),
  saveConfigBtn: document.getElementById('saveConfigBtn'),
  cancelConfigBtn: document.getElementById('cancelConfigBtn'),
  configsList: document.getElementById('configsList'),

  // Import/Export
  exportBtn: document.getElementById('exportBtn'),
  importBtn: document.getElementById('importBtn'),
  importFile: document.getElementById('importFile')
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  checkFirstRun();
  loadData();
  attachEventListeners();
});

// Event Listeners
function attachEventListeners() {
  // Welcome Banner & Quick Setup
  elements.setupTauBtn.addEventListener('click', showQuickSetup);
  elements.skipSetupBtn.addEventListener('click', dismissWelcomeBanner);
  elements.saveQuickSetupBtn.addEventListener('click', saveQuickSetup);
  elements.cancelQuickSetupBtn.addEventListener('click', cancelQuickSetup);

  // Values
  elements.setupTauLoginBtn.addEventListener('click', showQuickSetup);
  elements.addValueBtn.addEventListener('click', () => toggleValueForm(true));
  elements.saveValueBtn.addEventListener('click', saveValue);
  elements.cancelValueBtn.addEventListener('click', () => toggleValueForm(false));

  // Configs
  elements.addConfigBtn.addEventListener('click', () => toggleConfigForm(true));
  elements.saveConfigBtn.addEventListener('click', saveConfig);
  elements.cancelConfigBtn.addEventListener('click', () => toggleConfigForm(false));

  // Import/Export
  elements.exportBtn.addEventListener('click', exportData);
  elements.importBtn.addEventListener('click', () => elements.importFile.click());
  elements.importFile.addEventListener('change', importData);
}

// Load data from storage
async function loadData() {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEYS.VALUES, STORAGE_KEYS.CONFIGS]);
    storedValues = result[STORAGE_KEYS.VALUES] || {};
    autofillConfigs = result[STORAGE_KEYS.CONFIGS] || [];

    renderValues();
    renderConfigs();
    updateConfigValueDropdown();
    updateTauSetupButtonVisibility();
  } catch (error) {
    showStatus('שגיאה בטעינת הנתונים: ' + error.message, 'error');
  }
}

// Save data to storage
async function saveData() {
  try {
    await chrome.storage.local.set({
      [STORAGE_KEYS.VALUES]: storedValues,
      [STORAGE_KEYS.CONFIGS]: autofillConfigs
    });
  } catch (error) {
    showStatus('שגיאה בשמירת הנתונים: ' + error.message, 'error');
    throw error;
  }
}

// ========== FIRST RUN & WELCOME BANNER ==========

/**
 * Checks if this is the first run and shows welcome banner if needed
 */
async function checkFirstRun() {
  try {
    const result = await chrome.storage.local.get([
      STORAGE_KEYS.VALUES,
      STORAGE_KEYS.CONFIGS,
      STORAGE_KEYS.WELCOME_DISMISSED
    ]);

    const values = result[STORAGE_KEYS.VALUES] || {};
    const configs = result[STORAGE_KEYS.CONFIGS] || [];
    const dismissed = result[STORAGE_KEYS.WELCOME_DISMISSED] || false;

    // Show welcome banner if no data exists and not dismissed
    if (Object.keys(values).length === 0 && configs.length === 0 && !dismissed) {
      elements.welcomeBanner.classList.remove('hidden');
      // Ensure TAU setup button is hidden when the welcome banner appears on first run
      updateTauSetupButtonVisibility();
    }
  } catch (error) {
    console.error('Error checking first run:', error);
  }
}

/**
 * Checks if TAU config exists
 * @returns {boolean} - True if TAU config exists
 */
function hasTauConfig() {
  return autofillConfigs.some(config => config.urlPattern === 'https://nidp.tau.ac.il/*');
}

/**
 * Updates TAU setup button visibility
 * Shows button only if no TAU config exists
 */
function updateTauSetupButtonVisibility() {
  // If TAU config exists, or the welcome/quick setup panels are visible,
  // hide the TAU setup button. Otherwise show it.
  const bannerVisible = elements.welcomeBanner && !elements.welcomeBanner.classList.contains('hidden');
  const quickVisible = elements.quickSetup && !elements.quickSetup.classList.contains('hidden');

  if (hasTauConfig() || bannerVisible || quickVisible) {
    elements.setupTauLoginBtn.classList.add('hidden');
  } else {
    elements.setupTauLoginBtn.classList.remove('hidden');
  }
}

/**
 * Shows the quick TAU setup form
 */
function showQuickSetup() {
  elements.welcomeBanner.classList.add('hidden');
  elements.quickSetup.classList.remove('hidden');
  elements.quickTauId.focus();
  // Ensure TAU setup button is hidden while quick setup is open
  updateTauSetupButtonVisibility();
}

/**
 * Dismisses the welcome banner permanently
 */
async function dismissWelcomeBanner() {
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.WELCOME_DISMISSED]: true });
    elements.welcomeBanner.classList.add('hidden');
    showStatus('ניתן תמיד להוסיף הגדרות חדשות מהעמוד הראשי', 'success');
    // Re-evaluate TAU button visibility after dismissing the welcome banner
    updateTauSetupButtonVisibility();
  } catch (error) {
    showStatus('שגיאה בשמירת העדפות', 'error');
  }
}

/**
 * Saves the quick TAU setup
 */
async function saveQuickSetup() {
  const tauId = elements.quickTauId.value.trim();

  // Validate
  if (!tauId) {
    showStatus('נא להזין מספר זהות', 'error');
    return;
  }

  if (tauId.length !== 9 || !/^\d+$/.test(tauId)) {
    showStatus('מספר זהות צריך להיות 9 ספרות', 'error');
    return;
  }

  try {
    // Create or reuse TAU value (ensure no duplicate labels)
    const tauLabel = 'תעודת זהות';
    const existingTauKey = Object.keys(storedValues).find(k => {
      const v = storedValues[k];
      return v && v.label && v.label.trim().toLowerCase() === tauLabel.trim().toLowerCase();
    });

    let tauValueKey;
    if (existingTauKey) {
      // Reuse existing value key and update value
      tauValueKey = existingTauKey;
      storedValues[tauValueKey].value = tauId;
    } else {
      tauValueKey = 'tau_id_' + Date.now();
      storedValues[tauValueKey] = {
        label: tauLabel,
        value: tauId
      };
    }

    // Create TAU configuration
    const tauConfig = {
      id: 'tau_login_' + Date.now(),
      name: 'התחברות אוניברסיטת תל אביב',
      urlPattern: 'https://nidp.tau.ac.il/*',
      fieldSelector: '#Ecom_User_Pid',
      valueKey: tauValueKey,
      enabled: true
    };
    autofillConfigs.push(tauConfig);

    // Save to storage
    await saveData();

    // Request permission for TAU
    const permissionGranted = await requestPermission('https://nidp.tau.ac.il/*');

    // Dismiss welcome
    await chrome.storage.local.set({ [STORAGE_KEYS.WELCOME_DISMISSED]: true });

    // Hide quick setup
    elements.quickSetup.classList.add('hidden');
    elements.quickTauId.value = '';

    // Update UI
    renderValues();
    renderConfigs();
    updateConfigValueDropdown();
    updateTauSetupButtonVisibility();

    showStatus(
      permissionGranted
        ? 'הגדרת אוניברסיטת תל אביב הופעלה בהצלחה! 🎉'
        : 'הגדרת אוניברסיטת תל אביב נשמרה (נדרשת הרשאה כדי שתפעל)',
      permissionGranted ? 'success' : 'warning'
    );
  } catch (error) {
    showStatus('שגיאה בשמירת ההגדרה: ' + error.message, 'error');
  }
}

/**
 * Cancels quick setup and dismisses welcome
 */
async function cancelQuickSetup() {
  elements.quickSetup.classList.add('hidden');
  elements.quickTauId.value = '';
  await dismissWelcomeBanner();
  // Re-evaluate TAU button visibility after canceling quick setup
  updateTauSetupButtonVisibility();
}

// ========== VALUES MANAGEMENT ==========

function toggleValueForm(show, valueKey = null) {
  if (show) {
    elements.addValueForm.classList.remove('hidden');

    if (valueKey) {
      // Edit mode
      editingValueKey = valueKey;
      const value = storedValues[valueKey];
      elements.addValueForm.querySelector('h3').textContent = 'ערוך ערך שמור';
      elements.valueLabel.value = value.label;
      elements.valueContent.value = value.value;
    } else {
      // Add mode
      editingValueKey = null;
      elements.addValueForm.querySelector('h3').textContent = 'הוסף ערך שמור';
      elements.valueLabel.value = '';
      elements.valueContent.value = '';
    }

    elements.valueLabel.focus();
  } else {
    elements.addValueForm.classList.add('hidden');
    editingValueKey = null;
  }
}

async function saveValue() {
  const label = elements.valueLabel.value.trim();
  const content = elements.valueContent.value.trim();

  if (!label || !content) {
    showStatus('יש למלא את כל השדות', 'error');
    return;
  }

  // Check for existing value with same label (case-insensitive)
  const labelLower = label.trim().toLowerCase();
  const existingKey = Object.keys(storedValues).find(k => {
    const v = storedValues[k];
    return v && v.label && v.label.trim().toLowerCase() === labelLower;
  });

  if (editingValueKey) {
    // Editing an existing value
    if (existingKey && existingKey !== editingValueKey) {
      // Another value already has this label
      if (!confirm(`ערך בשם "${label}" כבר קיים במפתח אחר. האם לעדכן את הערך הקיים במקום?`)) {
        return;
      }

      // Overwrite existing and remove the one being edited
      storedValues[existingKey] = { label, value: content };
      delete storedValues[editingValueKey];
      editingValueKey = null;
    } else {
      // Safe to update current
      storedValues[editingValueKey] = { label, value: content };
    }
  } else {
    // Creating a new value
    if (existingKey) {
      // A value with this label already exists — offer to update it
      if (!confirm(`ערך בשם "${label}" כבר קיים. האם לעדכן אותו?`)) {
        return;
      }

      storedValues[existingKey] = { label, value: content };
    } else {
      // Generate unique key for new value
      const key = generateKey(label);
      storedValues[key] = { label, value: content };
    }
  }

  try {
    await saveData();
    showStatus(editingValueKey ? 'הערך עודכן בהצלחה' : 'הערך נשמר בהצלחה', 'success');
    toggleValueForm(false);
    renderValues();
    renderConfigs(); // Re-render configs to show updated value labels
    updateConfigValueDropdown();
  } catch (error) {
    showStatus('שגיאה בשמירת הערך', 'error');
  }
}

async function deleteValue(key) {
  const value = storedValues[key];

  // Check if value is used in any config
  const usageCount = autofillConfigs.filter(c => c.valueKey === key).length;

  if (usageCount > 0) {
    if (!confirm(`הערך "${value.label}" בשימוש ב-${usageCount} הגדרות. האם למחוק בכל זאת? ההגדרות יישארו אך לא יעבדו.`)) {
      return;
    }
  }

  delete storedValues[key];

  try {
    await saveData();
    showStatus('הערך נמחק בהצלחה', 'success');
    renderValues();
    renderConfigs(); // Re-render configs to show "(ערך לא קיים)" for deleted values
    updateConfigValueDropdown();
  } catch (error) {
    showStatus('שגיאה במחיקת הערך', 'error');
  }
}

function renderValues() {
  const keys = Object.keys(storedValues);

  if (keys.length === 0) {
    elements.valuesList.innerHTML = '<p class="empty-state">אין ערכים שמורים. הוסף ערך ראשון כדי להתחיל.</p>';
    return;
  }

  elements.valuesList.innerHTML = keys.map(key => {
    const value = storedValues[key];
    const usageCount = autofillConfigs.filter(c => c.valueKey === key).length;
    const maskedValue = maskValue(value.value);

    return `
      <div class="value-item">
        <div class="value-info">
          <div class="value-label">${escapeHtml(value.label)}</div>
          <div class="value-content ltr" dir="ltr">${escapeHtml(maskedValue)}</div>
          ${usageCount > 0 ? `<div class="value-usage">בשימוש ב-${usageCount} הגדרות</div>` : ''}
        </div>
        <div class="value-actions">
          <button class="btn btn-secondary btn-small" data-action="edit-value" data-key="${key}">ערוך</button>
          <button class="btn btn-danger btn-small" data-action="delete-value" data-key="${key}">מחק</button>
        </div>
      </div>
    `;
  }).join('');
}

function editValue(key) {
  toggleValueForm(true, key);
}

// ========== CONFIGS MANAGEMENT ==========

function toggleConfigForm(show, configId = null) {
  if (show) {
    elements.addConfigForm.classList.remove('hidden');

    if (configId) {
      // Edit mode
      editingConfigId = configId;
      const config = autofillConfigs.find(c => c.id === configId);

      elements.configFormTitle.textContent = 'ערוך הגדרה';
      elements.configName.value = config.name;
      elements.configUrl.value = config.urlPattern;
      elements.configSelector.value = config.fieldSelector;
      elements.configValue.value = config.valueKey;
      elements.configEnabled.checked = config.enabled;
    } else {
      // Add mode
      editingConfigId = null;
      elements.configFormTitle.textContent = 'הוסף הגדרה חדשה';
      elements.configName.value = '';
      elements.configUrl.value = '';
      elements.configSelector.value = '';
      elements.configValue.value = '';
      elements.configEnabled.checked = true;
    }

    elements.configName.focus();
  } else {
    elements.addConfigForm.classList.add('hidden');
    editingConfigId = null;
  }
}

async function saveConfig() {
  const name = elements.configName.value.trim();
  const urlPattern = elements.configUrl.value.trim();
  const fieldSelector = elements.configSelector.value.trim();
  const valueKey = elements.configValue.value;
  const enabled = elements.configEnabled.checked;

  if (!name || !urlPattern || !fieldSelector || !valueKey) {
    showStatus('יש למלא את כל השדות', 'error');
    return;
  }

  // Validate CSS selector
  try {
    document.querySelector(fieldSelector);
  } catch (e) {
    showStatus('בורר CSS לא תקין: ' + e.message, 'error');
    return;
  }

  // Request permission for the URL pattern
  const permissionGranted = await requestPermission(urlPattern);
  if (!permissionGranted) {
    showStatus('לא ניתנה הרשאה לאתר זה. ההגדרה לא תפעל.', 'warning');
    // Continue anyway - user might grant permission later
  }

  if (editingConfigId) {
    // Update existing config
    const index = autofillConfigs.findIndex(c => c.id === editingConfigId);
    autofillConfigs[index] = {
      ...autofillConfigs[index],
      name,
      urlPattern,
      fieldSelector,
      valueKey,
      enabled
    };
  } else {
    // Add new config
    const newConfig = {
      id: generateId(),
      name,
      urlPattern,
      fieldSelector,
      valueKey,
      enabled
    };
    autofillConfigs.push(newConfig);
  }

  try {
    await saveData();
    showStatus('ההגדרה נשמרה בהצלחה', 'success');
    toggleConfigForm(false);
    renderConfigs();
  } catch (error) {
    showStatus('שגיאה בשמירת ההגדרה', 'error');
  }
}

async function deleteConfig(configId) {
  const config = autofillConfigs.find(c => c.id === configId);

  if (!confirm(`האם למחוק את ההגדרה "${config.name}"?`)) {
    return;
  }

  autofillConfigs = autofillConfigs.filter(c => c.id !== configId);

  try {
    await saveData();
    showStatus('ההגדרה נמחקה בהצלחה', 'success');
    renderConfigs();
    updateTauSetupButtonVisibility();
  } catch (error) {
    showStatus('שגיאה במחיקת ההגדרה', 'error');
  }
}

async function toggleConfigEnabled(configId) {
  const config = autofillConfigs.find(c => c.id === configId);
  config.enabled = !config.enabled;

  try {
    await saveData();
    renderConfigs();
  } catch (error) {
    showStatus('שגיאה בעדכון ההגדרה', 'error');
  }
}

function renderConfigs() {
  if (autofillConfigs.length === 0) {
    elements.configsList.innerHTML = '<p class="empty-state">אין הגדרות. הוסף הגדרה ראשונה כדי להתחיל.</p>';
    return;
  }

  elements.configsList.innerHTML = autofillConfigs.map(config => {
    const value = storedValues[config.valueKey];
    const valueName = value ? value.label : '(ערך לא קיים)';

    return `
      <div class="config-item ${config.enabled ? '' : 'disabled'}">
        <div class="config-header">
          <div class="config-name">${escapeHtml(config.name)}</div>
          <div class="config-actions">
            <button class="btn btn-secondary btn-small" data-action="toggle-config" data-id="${config.id}">
              ${config.enabled ? 'השבת' : 'הפעל'}
            </button>
            <button class="btn btn-secondary btn-small" data-action="edit-config" data-id="${config.id}">ערוך</button>
            <button class="btn btn-danger btn-small" data-action="delete-config" data-id="${config.id}">מחק</button>
          </div>
        </div>
        <div class="config-details">
          <div class="config-detail">
            <span class="config-detail-label">URL:</span>
            <span class="config-detail-value ltr" dir="ltr">${escapeHtml(config.urlPattern)}</span>
          </div>
          <div class="config-detail">
            <span class="config-detail-label">בורר:</span>
            <span class="config-detail-value ltr" dir="ltr">${escapeHtml(config.fieldSelector)}</span>
          </div>
          <div class="config-detail">
            <span class="config-detail-label">ערך:</span>
            <span class="config-detail-value">${escapeHtml(valueName)}</span>
          </div>
        </div>
        <span class="config-status ${config.enabled ? 'enabled' : 'disabled'}">
          ${config.enabled ? '✓ פעיל' : '✗ מושבת'}
        </span>
      </div>
    `;
  }).join('');
}

function updateConfigValueDropdown() {
  const currentValue = elements.configValue.value;
  const keys = Object.keys(storedValues);

  elements.configValue.innerHTML = '<option value="">-- בחר ערך שמור --</option>' +
    keys.map(key => {
      const value = storedValues[key];
      return `<option value="${key}" ${key === currentValue ? 'selected' : ''}>${escapeHtml(value.label)}</option>`;
    }).join('');
}

// ========== PERMISSIONS ==========

async function requestPermission(urlPattern) {
  try {
    // Extract origin from URL pattern
    const origin = extractOrigin(urlPattern);
    if (!origin) {
      return true; // If we can't extract origin, proceed anyway
    }

    // Check if we already have permission
    const hasPermission = await chrome.permissions.contains({
      origins: [origin]
    });

    if (hasPermission) {
      return true;
    }

    // Request permission
    const granted = await chrome.permissions.request({
      origins: [origin]
    });

    return granted;
  } catch (error) {
    console.error('Permission request failed:', error);
    return false;
  }
}

function extractOrigin(urlPattern) {
  try {
    // Remove wildcards for permission request
    const url = urlPattern.replace(/\*/g, '');
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.hostname}/*`;
  } catch (error) {
    return null;
  }
}

// ========== IMPORT/EXPORT ==========

function exportData() {
  const data = {
    version: 1,
    exportDate: new Date().toISOString(),
    storedValues,
    autofillConfigs
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `autofill-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);

  showStatus('הנתונים יוצאו בהצלחה', 'success');
}

async function importData(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!data.storedValues || !data.autofillConfigs) {
      throw new Error('קובץ לא תקין');
    }

    if (!confirm('הייבוא ימחק את כל ההגדרות הנוכחיות. האם להמשיך?')) {
      elements.importFile.value = '';
      return;
    }

    storedValues = data.storedValues;
    autofillConfigs = data.autofillConfigs;

    await saveData();
    renderValues();
    renderConfigs();
    updateConfigValueDropdown();

    showStatus('הנתונים יובאו בהצלחה', 'success');
  } catch (error) {
    showStatus('שגיאה בייבוא הנתונים: ' + error.message, 'error');
  }

  elements.importFile.value = '';
}

// ========== UTILITIES ==========

function generateId() {
  return 'config_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function generateKey(label) {
  return label.toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\w\u0590-\u05FF]/g, '')
    .substring(0, 50) + '_' + Date.now();
}

function maskValue(value) {
  if (value.length <= 4) {
    return '*'.repeat(value.length);
  }
  return value.substring(0, 2) + '*'.repeat(value.length - 4) + value.substring(value.length - 2);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showStatus(message, type = 'success') {
  elements.status.textContent = message;
  elements.status.className = `status ${type}`;
  elements.status.classList.remove('hidden');

  setTimeout(() => {
    elements.status.classList.add('hidden');
  }, 3000);
}

// Event delegation for dynamically created buttons
document.addEventListener('click', (e) => {
  const button = e.target.closest('[data-action]');
  if (!button) return;

  const action = button.dataset.action;
  const key = button.dataset.key;
  const id = button.dataset.id;

  switch (action) {
    case 'edit-value':
      editValue(key);
      break;
    case 'delete-value':
      deleteValue(key);
      break;
    case 'toggle-config':
      toggleConfigEnabled(id);
      break;
    case 'edit-config':
      toggleConfigForm(true, id);
      break;
    case 'delete-config':
      deleteConfig(id);
      break;
  }
});
