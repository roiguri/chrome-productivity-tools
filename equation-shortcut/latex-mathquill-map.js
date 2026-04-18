/**
 * LaTeX to MathQuill command mapping for Google Docs equation editor.
 *
 * MathQuill is an interactive editor — it does not parse LaTeX source.
 * Commands are triggered by typing \cmdname followed by a Space keydown+keypress.
 * Braced arguments {…} are entered interactively, not as literal characters.
 *
 * Add new commands here when you encounter rendering issues.
 */

// BOX commands with ONE argument: \cmd{arg}
// These create a structural slot in MathQuill (a box the cursor is inside).
// Key sequence: type \cmd → Space (trigger) → type arg content → ArrowRight (exit box)
const MATHQUILL_BOX_COMMANDS = new Set([
  // Accents / decorators
  'hat', 'vec', 'bar', 'tilde', 'dot', 'ddot', 'widehat', 'widetilde', 'overrightarrow',
  // Roots
  'sqrt',
  // Over/under decorators
  'overline', 'underline', 'overbrace', 'underbrace',
  // Text mode
  'text',
]);

// FONT commands with ONE argument: \cmd{arg}
// These change the font/style for the content but do NOT create a box to exit.
// After \cmd + Space trigger + content, the cursor is already past the symbol — no ArrowRight.
// Note: MathQuill font commands take the FULL content as typed; no exit needed.
const MATHQUILL_FONT_COMMANDS = new Set([
  'mathbf', 'mathit', 'mathrm', 'mathcal', 'mathfrak', 'mathsf', 'mathtt',
  'not',
]);

// Commands with TWO arguments: \cmd{arg1}{arg2}
// Key sequence: type \cmd → Space (trigger) → type arg1 → ArrowRight → type arg2 → ArrowRight
const MATHQUILL_TWO_ARG_COMMANDS = new Set([
  'frac', 'dfrac', 'tfrac', 'binom',
]);

// Commands to strip entirely — MathQuill handles delimiter sizing automatically.
// e.g. \left( becomes (, \right) becomes )
const MATHQUILL_STRIP_COMMANDS = new Set([
  'left', 'right',
]);

// Aliases: LaTeX command names that Google Docs equation editor doesn't recognise,
// mapped to the equivalent command it DOES support.
// These are typed as the target command through MathQuill's normal command pipeline.
// Add entries here when a command works manually in Google Docs under a different name.
const MATHQUILL_COMMAND_ALIASES = {
  le: 'leq',
  ge: 'geq',
  ne: 'neq',
};

// No-argument commands mapped directly to Unicode.
// Use this only for commands that Google Docs equation editor does NOT support at all
// (i.e. typing the command + space doesn't produce the right symbol).
// Add entries here when a \command renders as literal text and has no known alias.
const MATHQUILL_SYMBOL_MAP = {
  // Set relations (add native alias above if Google Docs supports them)
  notin: '∉', ni: '∋',
  subset: '⊂', supset: '⊃', subseteq: '⊆', supseteq: '⊇',
  // Operators
  mp: '∓', circ: '∘', oplus: '⊕', otimes: '⊗', setminus: '∖',
  // Logic
  nexists: '∄', land: '∧', lor: '∨',
  // Misc
  ldots: '…', cdots: '⋯', vdots: '⋮', ddots: '⋱',
  simeq: '≃', cong: '≅', propto: '∝',
};

// Commands not supported by Google Docs equation editor — type Unicode directly instead.
// Structure: { commandName: { argument: unicodeChar } }
// Add entries here when you encounter a command that renders as literal text.
const MATHQUILL_UNICODE_SUBSTITUTIONS = {
  mathbb: {
    'R': 'ℝ', 'N': 'ℕ', 'Z': 'ℤ', 'Q': 'ℚ', 'C': 'ℂ', 'H': 'ℍ', 'P': 'ℙ',
    'A': '𝔸', 'B': '𝔹', 'D': '𝔻', 'E': '𝔼', 'F': '𝔽', 'G': '𝔾', 'I': '𝕀',
    'J': '𝕁', 'K': '𝕂', 'L': '𝕃', 'M': '𝕄', 'O': '𝕆', 'S': '𝕊', 'T': '𝕋',
    'U': '𝕌', 'V': '𝕍', 'W': '𝕎', 'X': '𝕏', 'Y': '𝕐',
  },
};
