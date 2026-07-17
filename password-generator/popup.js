document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const passwordDisplay = document.getElementById('password-display');
  const copyBtn = document.getElementById('copy-btn');
  const regenerateBtn = document.getElementById('regenerate-btn');
  const toggleSettingsBtn = document.getElementById('toggle-settings-btn');
  const advancedSettings = document.getElementById('advanced-settings');

  // Settings Elements
  const lengthSlider = document.getElementById('length-slider');
  const lengthVal = document.getElementById('length-val');
  const chips = Array.from(document.querySelectorAll('.chip'));

  // Strength meter
  const strengthBar = document.getElementById('strength-bar');
  const strengthLabel = document.getElementById('strength-label');

  // Character sets, keyed by chip data-set
  const CHAR_SETS = {
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    lower: 'abcdefghijklmnopqrstuvwxyz',
    number: '0123456789',
    symbol: '!@#$%^&*()_+~`|}{[]:;?><,./-=',
  };

  let copyResetTimer = null;

  // Toggle advanced settings
  toggleSettingsBtn.addEventListener('click', () => {
    const isHidden = advancedSettings.classList.toggle('hidden');
    toggleSettingsBtn.textContent = isHidden ? 'Advanced Settings ▾' : 'Hide Settings ▴';
    toggleSettingsBtn.setAttribute('aria-expanded', String(!isHidden));
  });

  // Update length display when slider moves
  lengthSlider.addEventListener('input', (e) => {
    lengthVal.textContent = e.target.value;
  });

  // Toggle a character-type chip
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('active');
      chip.setAttribute('aria-pressed', String(chip.classList.contains('active')));
    });
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

    // Active chips, or lowercase as a fallback if the user disabled everything.
    let activeChips = chips.filter((c) => c.classList.contains('active'));
    if (activeChips.length === 0) {
      const lowerChip = chips.find((c) => c.dataset.set === 'lower');
      lowerChip.classList.add('active');
      lowerChip.setAttribute('aria-pressed', 'true');
      activeChips = [lowerChip];
    }

    let charset = '';
    const requiredChars = [];

    // Ensure at least one character from each selected set is included
    activeChips.forEach((chip) => {
      const set = CHAR_SETS[chip.dataset.set];
      charset += set;
      requiredChars.push(set[getSecureRandomIndex(set.length)]);
    });

    // Fill the rest of the password
    const remainingLength = length - requiredChars.length;
    let passwordArray = [];
    for (let i = 0; i < remainingLength; i++) {
      passwordArray.push(charset[getSecureRandomIndex(charset.length)]);
    }

    // Add required characters and securely shuffle
    passwordArray = passwordArray.concat(requiredChars);
    passwordArray = secureShuffle(passwordArray);

    return passwordArray.join('');
  }

  // Estimate password strength from length and character-set variety, then
  // paint the meter. Uses log2(poolSize) * length as an entropy proxy (bits).
  function updateStrength(password) {
    const pools = { upper: 26, lower: 26, number: 10, symbol: 32 };
    let poolSize = 0;
    if (/[A-Z]/.test(password)) poolSize += pools.upper;
    if (/[a-z]/.test(password)) poolSize += pools.lower;
    if (/[0-9]/.test(password)) poolSize += pools.number;
    if (/[^A-Za-z0-9]/.test(password)) poolSize += pools.symbol;

    const bits = password.length * Math.log2(poolSize || 1);

    let label, color, pct;
    if (bits < 40) { label = 'Weak'; color = 'var(--weak)'; pct = 25; }
    else if (bits < 60) { label = 'Fair'; color = 'var(--fair)'; pct = 55; }
    else if (bits < 80) { label = 'Good'; color = 'var(--good)'; pct = 80; }
    else { label = 'Strong'; color = 'var(--strong)'; pct = 100; }

    strengthBar.style.width = pct + '%';
    strengthBar.style.background = color;
    strengthLabel.textContent = label;
    strengthLabel.style.color = color;
  }

  // Copy to clipboard and confirm on the copy button
  async function copyToClipboard(text) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      showCopied();
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  }

  function showCopied() {
    copyBtn.classList.add('copied');
    clearTimeout(copyResetTimer);
    copyResetTimer = setTimeout(() => copyBtn.classList.remove('copied'), 1500);
  }

  // Main flow: Generate, Display, Score, and Copy
  function handleGenerateAndCopy() {
    const newPassword = generatePassword();
    passwordDisplay.textContent = newPassword;
    updateStrength(newPassword);
    copyToClipboard(newPassword);
  }

  // Event Listeners
  regenerateBtn.addEventListener('click', handleGenerateAndCopy);
  copyBtn.addEventListener('click', () => copyToClipboard(passwordDisplay.textContent));
  passwordDisplay.addEventListener('click', () => copyToClipboard(passwordDisplay.textContent));

  // Generate and copy immediately on load
  handleGenerateAndCopy();
});
