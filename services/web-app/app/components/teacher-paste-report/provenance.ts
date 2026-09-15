/** Count displayed text nodes once, never historical paste lengths or text matches.
 * Unicode code points (including whitespace) are characters; markup, block
 * separators, images and editor widgets are excluded. Missing tracking is unknown.
 */
export type PasteMeasurement = {
  characters: number;
  pastedCharacters: number;
  percentage: number | null;
  byEvent: Record<string, number>;
  unlinkedCharacters: number;
};
export function measurePasteProvenance(root: HTMLElement): PasteMeasurement {
  const result: PasteMeasurement = { characters: 0, pastedCharacters: 0, percentage: null, byEvent: {}, unlinkedCharacters: 0 };
  const walker = root.ownerDocument.createTreeWalker(root, 4 /* SHOW_TEXT */);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (!parent || parent.closest('script, style, [aria-hidden="true"]')) continue;
    const length = Array.from(node.textContent ?? '').length;
    result.characters += length;
    const mark = parent.closest('[data-pasted-source="external"]');
    if (!mark || !root.contains(mark)) continue;
    result.pastedCharacters += length;
    const id = mark.getAttribute('data-paste-event-id');
    if (id) result.byEvent[id] = (Object.prototype.hasOwnProperty.call(result.byEvent, id) ? result.byEvent[id] : 0) + length;
    else result.unlinkedCharacters += length;
  }
  // Round down: the displayed lower bound must never overstate the observation.
  result.percentage = result.characters === 0 ? null : Math.floor(result.pastedCharacters * 1000 / result.characters) / 10;
  return result;
}

export function selectPasteEvent(root: HTMLElement, eventId: string | null): number {
  let count = 0;
  for (const mark of root.querySelectorAll<HTMLElement>('[data-pasted-source="external"]')) {
    // Compare attribute values, never interpolate an event ID into a CSS selector.
    if (eventId && mark.getAttribute('data-paste-event-id') === eventId) {
      mark.setAttribute('data-paste-selected', 'true'); count += 1;
    } else mark.removeAttribute('data-paste-selected');
  }
  return count;
}
