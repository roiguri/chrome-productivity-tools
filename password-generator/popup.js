document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const passwordDisplay = document.getElementById('password-display');
  const copyFeedback = document.getElementById('copy-feedback');
  const regenerateBtn = document.getElementById('regenerate-btn');
  const toggleSettingsBtn = document.getElementById('toggle-settings-btn');
  const advancedSettings = document.getElementById('advanced-settings');

  // Settings Elements
  const lengthSlider = document.getElementById('length-slider');
  const lengthVal = document.getElementById('length-val');
  const uppercaseCb = document.getElementById('uppercase-cb');
  const lowercaseCb = document.getElementById('lowercase-cb');
  const numbersCb = document.getElementById('numbers-cb');
  const symbolsCb = document.getElementById('symbols-cb');

  // Character sets
  const UPPERCASE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const LOWERCASE_CHARS = 'abcdefghijklmnopqrstuvwxyz';
  const NUMBER_CHARS = '0123456789';
  const SYMBOL_CHARS = '!@#$%^&*()_+~`|}{[]:;?><,./-=';

  // Toggle advanced settings
  toggleSettingsBtn.addEventListener('click', () => {
    const isHidden = advancedSettings.classList.toggle('hidden');
    toggleSettingsBtn.textContent = isHidden ? 'Advanced Settings ▼' : 'Hide Settings ▲';
  });

  // Update length display when slider moves
  lengthSlider.addEventListener('input', (e) => {
    lengthVal.textContent = e.target.value;
  });

  // Cryptographically secure random number between 0 and max-1.
  // Rejection sampling avoids the modulo bias of a plain array[0] % max.
  function getSecureRandomIndex(max) {
    const limit = Math.floor(0xFFFFFFFF / max) * max;
    const array = new Uint32Array(1);
    do {
      window.crypto.getRandomValues(array);
    } while (array[0] >= limit);
    return array[0] % max;
  }

  // Fisher-Yates shuffle using secure random
  function secureShuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = getSecureRandomIndex(i + 1);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  // Generate password function
  function generatePassword() {
    const length = parseInt(lengthSlider.value);
    const useUpper = uppercaseCb.checked;
    const useLower = lowercaseCb.checked;
    const useNumbers = numbersCb.checked;
    const useSymbols = symbolsCb.checked;

    let charset = '';

    // Ensure at least one character from each selected set is included
    const requiredChars = [];

    if (useUpper) {
      charset += UPPERCASE_CHARS;
      requiredChars.push(UPPERCASE_CHARS[getSecureRandomIndex(UPPERCASE_CHARS.length)]);
    }
    if (useLower) {
      charset += LOWERCASE_CHARS;
      requiredChars.push(LOWERCASE_CHARS[getSecureRandomIndex(LOWERCASE_CHARS.length)]);
    }
    if (useNumbers) {
      charset += NUMBER_CHARS;
      requiredChars.push(NUMBER_CHARS[getSecureRandomIndex(NUMBER_CHARS.length)]);
    }
    if (useSymbols) {
      charset += SYMBOL_CHARS;
      requiredChars.push(SYMBOL_CHARS[getSecureRandomIndex(SYMBOL_CHARS.length)]);
    }

    // Fallback if user unchecks everything
    if (charset === '') {
      charset = LOWERCASE_CHARS;
      requiredChars.push(LOWERCASE_CHARS[getSecureRandomIndex(LOWERCASE_CHARS.length)]);
      lowercaseCb.checked = true;
    }

    // Fill the rest of the password
    const remainingLength = length - requiredChars.length;
    let passwordArray = [];
    for (let i = 0; i < remainingLength; i++) {
      const randomIndex = getSecureRandomIndex(charset.length);
      passwordArray.push(charset[randomIndex]);
    }

    // Add required characters and securely shuffle
    passwordArray = passwordArray.concat(requiredChars);
    passwordArray = secureShuffle(passwordArray);

    return passwordArray.join('');
  }

  // Copy to clipboard function
  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      showFeedback();
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  }

  // Show "Copied!" feedback
  function showFeedback() {
    copyFeedback.classList.remove('hidden');
    setTimeout(() => {
      copyFeedback.classList.add('hidden');
    }, 1500);
  }

  // Main flow: Generate, Display, and Copy
  function handleGenerateAndCopy() {
    const newPassword = generatePassword();
    passwordDisplay.textContent = newPassword;
    copyToClipboard(newPassword);
  }

  // Event Listeners
  regenerateBtn.addEventListener('click', handleGenerateAndCopy);
  passwordDisplay.addEventListener('click', () => {
    copyToClipboard(passwordDisplay.textContent);
  });

  // Generate and copy immediately on load
  handleGenerateAndCopy();
});
