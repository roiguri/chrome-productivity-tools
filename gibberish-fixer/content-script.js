(function() {
  const ENG_KEY_MAP = {
    'q': '/', 'w': "'", 'e': 'ק', 'r': 'ר', 't': 'א', 'y': 'ט', 'u': 'ו', 'i': 'ן', 'o': 'ם', 'p': 'פ', '[': ']', ']': '[',
    'a': 'ש', 's': 'ד', 'd': 'ג', 'f': 'כ', 'g': 'ע', 'h': 'י', 'j': 'ח', 'k': 'ל', 'l': 'ך', ';': 'ף', "'": ',',
    'z': 'ז', 'x': 'ס', 'c': 'ב', 'v': 'ה', 'b': 'נ', 'n': 'מ', 'm': 'צ', ',': 'ת', '.': 'ץ', '/': '.'
  };

  // Build reverse map
  const HEB_KEY_MAP = {};
  Object.entries(ENG_KEY_MAP).forEach(([eng, heb]) => {
    HEB_KEY_MAP[heb] = eng;
  });

  function swapString(str) {
    let engCount = 0;
    let hebCount = 0;

    // 1. Detect dominant language
    for (let char of str) {
      if (ENG_KEY_MAP[char.toLowerCase()]) engCount++;
      if (HEB_KEY_MAP[char]) hebCount++;
    }

    // 2. Decide direction
    const toHebrew = engCount >= hebCount;
    const map = toHebrew ? ENG_KEY_MAP : HEB_KEY_MAP;

    // 3. Convert
    return str.split('').map(char => {
      const lower = char.toLowerCase();
      // If conversion exists, use it. Preserve Case if converting to English (optional, usually gibberish is lowercase)
      if (map[lower]) {
        return map[lower]; 
      }
      // Handle special punctuation mappings that don't depend on case
      if (map[char]) return map[char];
      
      return char;
    }).join('');
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'swapText') {
      const activeElement = document.activeElement;
      const selection = window.getSelection();
      const text = selection.toString();

      if (text) {
        const swapped = swapString(text);
        
        // Use insertText command to preserve Undo history and handle different input types
        document.execCommand('insertText', false, swapped);
      }
    }
  });
})();