/**
 * Text folding shared by the data generator and every runtime lookup.
 * Both sides must fold the same way, otherwise index keys never match.
 *
 * Ported from the city-name normaliser of an earlier timezone
 * prototype, with the same behaviour.
 */

/** Letters that Unicode NFKD does not split into a base letter plus accent. */
const SPECIAL_LETTER_REPLACEMENTS: Readonly<Record<string, string>> = {
  'ß': 'ss',
  'ł': 'l',
  'đ': 'd',
  'ð': 'd',
  'ø': 'o',
  'æ': 'ae',
  'œ': 'oe',
  'þ': 'th',
  'ı': 'i',
};

/** Whole-word abbreviations, so "Saint Louis" and "St. Louis" produce the same key. */
const WORD_REPLACEMENTS: Readonly<Record<string, string>> = {
  saint: 'st',
  sainte: 'ste',
};

/** Accents left over after NFKD (e.g. the "~" of "ã"), in any Unicode block. */
const COMBINING_MARKS = /\p{M}/gu;
/**
 * Apostrophe variants are dropped, not turned into spaces, so "Kane'ohe",
 * "Kaneʻohe" and "Kaneohe" all become "kaneohe". Written as escapes: ASCII ',
 * right single quote, modifier letters ʻ and ʼ, backtick, acute accent.
 */
const APOSTROPHES = /['’ʻʼ`´]/g;
const NON_ALPHANUMERIC_RUNS = /[^\p{L}\p{N}]+/gu;

/**
 * Turns a name into a lookup key: lowercase, no accents, no apostrophes, no
 * punctuation, single spaces, "saint" → "st". Returns an empty string when
 * nothing usable is left.
 *
 * @example fold('São Paulo')  // 'sao paulo'
 * @example fold('St. Louis')  // 'st louis'
 * @example fold('München')    // 'munchen'
 */
export function fold(text: string): string {
  // Apostrophes go first: NFKD turns the acute accent (U+00B4) into a space
  // plus a combining mark, which would leave "kane ohe" instead of "kaneohe".
  const withoutAccents = text
    .replace(APOSTROPHES, '')
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase();

  let withPlainLetters = '';
  for (const character of withoutAccents) {
    withPlainLetters += SPECIAL_LETTER_REPLACEMENTS[character] ?? character;
  }

  return withPlainLetters
    .replace(NON_ALPHANUMERIC_RUNS, ' ')
    .trim()
    .split(' ')
    .filter((word) => word.length > 0)
    .map((word) => WORD_REPLACEMENTS[word] ?? word)
    .join(' ');
}
