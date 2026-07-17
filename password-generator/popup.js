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

  const LEN_MIN = Number(lengthSlider.min);
  const LEN_MAX = Number(lengthSlider.max);

  // Paint the slider so the gradient fills only up to the thumb
  function updateSliderFill() {
    const pct = ((Number(lengthSlider.value) - LEN_MIN) / (LEN_MAX - LEN_MIN)) * 100;
    lengthSlider.style.setProperty('--fill', pct + '%');
  }

  function clampLength(v) {
    v = Math.round(Number(v));
    if (!Number.isFinite(v)) return null;
    return Math.min(LEN_MAX, Math.max(LEN_MIN, v));
  }

  // The slider is the source of truth; the number input mirrors it and can be
  // typed into directly. Dragging updates the number; typing moves the slider.
  lengthSlider.addEventListener('input', () => {
    lengthVal.value = lengthSlider.value;
    updateSliderFill();
  });

  // While typing, sync the slider if the value is usable (don't rewrite the
  // field mid-keystroke, so the user can freely edit).
  lengthVal.addEventListener('input', () => {
    const v = clampLength(lengthVal.value);
    if (v !== null) {
      lengthSlider.value = v;
      updateSliderFill();
    }
  });

  // On commit (blur / Enter), snap the field to the clamped, valid value.
  lengthVal.addEventListener('change', () => {
    const v = clampLength(lengthVal.value);
    const finalVal = v === null ? Number(lengthSlider.value) : v;
    lengthVal.value = finalVal;
    lengthSlider.value = finalVal;
    updateSliderFill();
  });

  updateSliderFill();

  // Toggle a character-type chip. At least one type must stay selected, so
  // turning off the last active chip is blocked (with a brief shake).
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const activeCount = chips.filter((c) => c.classList.contains('active')).length;
      if (chip.classList.contains('active') && activeCount === 1) {
        chip.classList.remove('shake');
        void chip.offsetWidth; // restart the animation
        chip.classList.add('shake');
        return;
      }
      chip.classList.toggle('active');
      chip.setAttribute('aria-pressed', String(chip.classList.contains('active')));
    });
    chip.addEventListener('animationend', () => chip.classList.remove('shake'));
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

  // Strength tiers, keyed by Shannon entropy in bits. `max` is the upper bit
  // bound used both to pick the tier and to clamp the bar; BAR_CAP bits = full.
  const TIERS = [
    { name: 'Weak',   color: 'var(--weak)',   max: 36 },
    { name: 'Fair',   color: 'var(--fair)',   max: 60 },
    { name: 'Good',   color: 'var(--good)',   max: 100 },
    { name: 'Strong', color: 'var(--strong)', max: 100 },
  ];
  // Reaching the "Strong" threshold (100 bits) fills the bar. The recommended
  // 16-char all-types default (~105 bits) therefore reads as a full bar.
  const BAR_CAP = 100;

  // Rate strength from entropy (length x log2(pool)), then cap by character-set
  // variety so a single-class password can never read "Strong" however long:
  // 1 class -> max Fair, 2 -> max Good, 3+ -> up to Strong.
  function updateStrength(password) {
    const pools = { upper: 26, lower: 26, number: 10, symbol: 32 };
    let poolSize = 0;
    let classes = 0;
    if (/[A-Z]/.test(password)) { poolSize += pools.upper; classes++; }
    if (/[a-z]/.test(password)) { poolSize += pools.lower; classes++; }
    if (/[0-9]/.test(password)) { poolSize += pools.number; classes++; }
    if (/[^A-Za-z0-9]/.test(password)) { poolSize += pools.symbol; classes++; }

    const bits = password.length * Math.log2(poolSize || 1);

    // Raw tier from entropy alone
    let rawTier = TIERS.findIndex((t) => bits < t.max);
    if (rawTier === -1) rawTier = TIERS.length - 1;

    // Variety cap: 1 class -> Fair (1), 2 -> Good (2), 3+ -> Strong (3)
    const varietyCap = classes <= 1 ? 1 : classes === 2 ? 2 : 3;

    const tierIndex = Math.min(rawTier, varietyCap);
    const tier = TIERS[tierIndex];

    // Clamp the bar to the (possibly capped) tier ceiling so it stays in sync
    const shownBits = Math.min(bits, tier.max);
    const pct = Math.min(100, (shownBits / BAR_CAP) * 100);

    strengthBar.style.width = pct + '%';
    strengthBar.style.background = tier.color;
    strengthLabel.textContent = tier.name;
    strengthLabel.style.color = tier.color;
  }

  // Legacy textarea + execCommand copy. Works when the async Clipboard API is
  // unavailable or refuses (e.g. auto-copy on open, before the popup is focused).
  function legacyCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (err) {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  }

  // Copy to clipboard and confirm on the copy button. Prefer the async
  // Clipboard API, but fall back to execCommand when it rejects — notably the
  // "Document is not focused" error thrown during the copy-on-open flow.
  async function copyToClipboard(text) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      showCopied();
    } catch (err) {
      if (legacyCopy(text)) {
        showCopied();
      } else {
        console.error('Failed to copy: ', err);
      }
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
