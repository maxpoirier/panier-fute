// @ts-check

/**
 * Lowercase, no accents, words separated by single spaces: "Œufs Bruns-Bio" → "oeufs bruns bio".
 * @param {unknown} text
 */
export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Whole-word match on normalized text, each word tolerating a plural s/x.
 * @param {string} phrase
 */
export function phraseRegex(phrase) {
  const pattern = normalize(phrase)
    .split(' ')
    .map((word) => `${word}(?:s|x)?`)
    .join(' ');
  return new RegExp(`(?:^| )${pattern}(?= |$)`);
}
