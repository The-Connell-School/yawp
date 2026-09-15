import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch {}
import { describe, expect, test } from 'bun:test';
import { measurePasteProvenance, selectPasteEvent } from './provenance';

function surface(html: string) {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
}

describe('paste provenance in the displayed document', () => {
  test('counts each surviving text character once, with decoded entities and Unicode', () => {
    const root = surface('<p>ab<span data-pasted-source="external" data-paste-event-id="a">😀&amp;<strong>xy</strong></span></p>');
    expect(measurePasteProvenance(root)).toEqual({ characters: 6, pastedCharacters: 4, percentage: 66.6, byEvent: { a: 4 }, unlinkedCharacters: 0 });
  });
  test('splits preserve identity and newly typed identical text never gets attributed', () => {
    const root = surface('<p><span data-pasted-source="external" data-paste-event-id="a">same</span>same<span data-pasted-source="external" data-paste-event-id="a">word</span><span data-pasted-source="external" data-paste-event-id="b">same</span></p>');
    expect(measurePasteProvenance(root).byEvent).toEqual({ a: 8, b: 4 });
    expect(selectPasteEvent(root, 'a')).toBe(2);
    expect(root.querySelectorAll('[data-paste-selected="true"]')).toHaveLength(2);
    expect(root.querySelector('[data-paste-event-id="b"]')?.hasAttribute('data-paste-selected')).toBe(false);
    expect(selectPasteEvent(root, 'deleted')).toBe(0);
    expect(root.querySelectorAll('[data-paste-selected]')).toHaveLength(0);
  });
  test('nested provenance cannot double count characters', () => {
    const root = surface('<p><span data-pasted-source="external" data-paste-event-id="a">ab<span data-pasted-source="external" data-paste-event-id="b">cd</span></span></p>');
    expect(measurePasteProvenance(root)).toEqual({ characters: 4, pastedCharacters: 4, percentage: 100, byEvent: { a: 2, b: 2 }, unlinkedCharacters: 0 });
  });
  test('legacy marks count as unlinked, empty content has no invented percentage', () => {
    expect(measurePasteProvenance(surface('<p><span data-pasted-source="external">legacy</span></p>')).unlinkedCharacters).toBe(6);
    expect(measurePasteProvenance(surface('<p><br></p>')).percentage).toBeNull();
  });
  test('ignores script/style and hidden editor widgets, includes only document text', () => {
    expect(measurePasteProvenance(surface('<p>abc</p><script>evil()</script><style>css</style><span contenteditable="false" aria-hidden="true">tool</span>')).characters).toBe(3);
  });
});
