const ENG_KEY_MAP = {
  'q': '/', 'w': "'", 'e': 'ק', 'r': 'ר', 't': 'א', 'y': 'ט', 'u': 'ו', 'i': 'ן', 'o': 'ם', 'p': 'פ', '[': ']', ']': '[',
  'a': 'ש', 's': 'ד', 'd': 'ג', 'f': 'כ', 'g': 'ע', 'h': 'י', 'j': 'ח', 'k': 'ל', 'l': 'ך', ';': 'ף', "'": ',',
  'z': 'ז', 'x': 'ס', 'c': 'ב', 'v': 'ה', 'b': 'נ', 'n': 'מ', 'm': 'צ', ',': 'ת', '.': 'ץ', '/': '.'
};

const HEB_KEY_MAP = {};
Object.entries(ENG_KEY_MAP).forEach(([eng, heb]) => {
  HEB_KEY_MAP[heb] = eng;
});

function swapString(str) {
  let engCount = 0;
  let hebCount = 0;
  for (let char of str) {
    if (ENG_KEY_MAP[char.toLowerCase()]) engCount++;
    if (HEB_KEY_MAP[char]) hebCount++;
  }
  const toHebrew = engCount >= hebCount;
  const map = toHebrew ? ENG_KEY_MAP : HEB_KEY_MAP;
  
  return str.split('').map(char => map[char.toLowerCase()] || map[char] || char).join('');
}

document.getElementById('convertBtn').addEventListener('click', () => {
  const input = document.getElementById('inputText');
  input.value = swapString(input.value);
  input.select(); // Select text so user can easily copy it back
});