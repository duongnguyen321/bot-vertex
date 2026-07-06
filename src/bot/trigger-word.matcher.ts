function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds a single case-insensitive, Unicode-aware regex that matches any of
 * the given trigger words/phrases as a whole token — not as a substring
 * buried inside a longer word.
 *
 * Plain `\b` word-boundary assertions don't work correctly here: `\b` only
 * recognizes ASCII word characters ([A-Za-z0-9_]). Vietnamese diacritic
 * letters (ố, ủ, ề, ...) fall outside that entirely, so `\b` would treat
 * almost every accented letter boundary as a match boundary and produce
 * false positives/negatives inside longer Vietnamese words. Unicode
 * property lookaround (`\p{L}`, `\p{N}`) fixes that, at the cost of
 * requiring the `u` regex flag.
 *
 * Words are regex-escaped before being joined — they come from /add, i.e.
 * user input, and must not be interpreted as regex syntax.
 */
export function buildTriggerRegex(words: string[]): RegExp | undefined {
  const escaped = words
    .map((word) => word.trim())
    .filter(Boolean)
    .map(escapeRegExp);

  if (escaped.length === 0) return undefined;

  const pattern = escaped.join('|');
  return new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${pattern})(?![\\p{L}\\p{N}])`,
    'iu',
  );
}

export function matchesTrigger(text: string, words: string[]): boolean {
  const regex = buildTriggerRegex(words);
  return regex ? regex.test(text) : false;
}

/**
 * Replaces every occurrence of a trigger word/phrase in the text with
 * '****', so the violation warning doesn't reprint the banned word itself.
 * Same boundary logic as buildTriggerRegex, but with the 'g' flag added so
 * all matches are replaced, not just the first.
 */
export function maskTriggerWords(text: string, words: string[]): string {
  const escaped = words
    .map((word) => word.trim())
    .filter(Boolean)
    .map(escapeRegExp);

  if (escaped.length === 0) return text;

  const pattern = escaped.join('|');
  const regex = new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${pattern})(?![\\p{L}\\p{N}])`,
    'giu',
  );
  return text.replace(regex, '****');
}
