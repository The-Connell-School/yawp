/**
 * The name is Yawp!: capital Y, lowercase "awp", the exclamation point
 * (Brian, Oct 22). All caps is the logo's alone, so text set in capitals
 * (a kicker, a running head, an eyebrow) keeps the name as it is written.
 */
export const BRAND = 'Yawp!';

const NAME = /yawp!?/gi;

/** The text in capitals, with the name left as Yawp!. */
export function upperKeepingBrand(text: string): string {
  return text
    .split(NAME)
    .map((part) => part.toUpperCase())
    .join(BRAND);
}

/** The text cut around the name, for styling capitals around it. */
export function brandParts(text: string): Array<{ text: string; brand: boolean }> {
  const parts: Array<{ text: string; brand: boolean }> = [];
  let last = 0;
  for (const match of text.matchAll(NAME)) {
    if (match.index! > last) parts.push({ text: text.slice(last, match.index), brand: false });
    parts.push({ text: BRAND, brand: true });
    last = match.index! + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), brand: false });
  return parts;
}
