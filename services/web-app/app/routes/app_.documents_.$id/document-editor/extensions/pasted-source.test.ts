import { GlobalRegistrator } from '@happy-dom/global-registrator';
try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { PastedSource, insertedRangeFromTransaction } from './pasted-source';

let editor: Editor | null = null;

function makeEditor(content: string) {
  return new Editor({
    extensions: [StarterKit, PastedSource],
    content,
  });
}

/**
 * Drives a real ProseMirror paste through the editor's DOM, exactly as the
 * browser does: PM inserts the clipboard content synchronously, and only
 * then does the paste-alert listener get to classify it.
 */
function paste(target: Editor, text: string) {
  const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, 'clipboardData', {
    value: {
      getData: (type: string) => (type === 'text/plain' ? text : ''),
      types: ['text/plain'],
    },
  });
  (target.view.dom as HTMLElement).dispatchEvent(event);
}

afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe('insertedRangeFromTransaction', () => {
  beforeEach(() => {
    editor = makeEditor('<p>one two three</p>');
  });

  it('returns the range of content a replacement inserted', () => {
    const tr = editor!.state.tr.insertText('ABCD', 5, 5);
    expect(insertedRangeFromTransaction(tr)).toEqual({ from: 5, to: 9 });
  });

  it('returns null for a transaction that only deletes', () => {
    const tr = editor!.state.tr.delete(2, 6);
    expect(insertedRangeFromTransaction(tr)).toBeNull();
  });

  it('returns null for a transaction that does not touch the document', () => {
    const tr = editor!.state.tr.setMeta('noop', true);
    expect(insertedRangeFromTransaction(tr)).toBeNull();
  });
});

describe('PastedSource range tracking', () => {
  beforeEach(() => {
    editor = makeEditor('<p>Student wrote this. </p>');
    editor.commands.focus('end');
  });

  it('marks the range the last paste inserted, and nothing else', () => {
    paste(editor!, 'borrowed passage');

    expect(editor!.commands.markLastPasteAsExternal()).toBe(true);

    const html = editor!.getHTML();
    expect(html).toContain('data-pasted-source="external"');
    expect(html).toContain('>borrowed passage<');
    expect(html).toContain('Student wrote this.<span');
  });

  it('records when the paste happened, so a teacher sees the same order as the alert list', () => {
    paste(editor!, 'borrowed passage');
    editor!.commands.markLastPasteAsExternal();

    const at = editor!.getHTML().match(/data-pasted-at="([^"]+)"/)?.[1];
    expect(at).toBeTruthy();
    expect(Number.isNaN(Date.parse(at!))).toBe(false);
  });

  it('does nothing when no paste has happened', () => {
    expect(editor!.commands.markLastPasteAsExternal()).toBe(false);
    expect(editor!.getHTML()).not.toContain('data-pasted-source');
  });

  it('does nothing when the paste was already followed by another edit', () => {
    paste(editor!, 'borrowed passage');
    editor!.commands.insertContentAt(1, 'x');

    expect(editor!.commands.markLastPasteAsExternal()).toBe(false);
    expect(editor!.getHTML()).not.toContain('data-pasted-source');
  });

  it('marks only the newest paste when a second paste follows a marked one', () => {
    paste(editor!, 'first passage');
    editor!.commands.markLastPasteAsExternal();
    paste(editor!, ' second passage');
    editor!.commands.markLastPasteAsExternal();

    const marked = editor!
      .getHTML()
      .match(/data-pasted-source="external"[^>]*>([^<]*)</g)
      ?.map((m) => m.slice(m.indexOf('>') + 1, -1));

    expect(marked).toEqual(['first passage', ' second passage']);
  });
});

describe('PastedSource under later editing', () => {
  beforeEach(() => {
    editor = makeEditor('<p>Student wrote this. </p>');
    editor.commands.focus('end');
    paste(editor, 'borrowed passage');
    editor.commands.markLastPasteAsExternal();
  });

  function markedText() {
    return (
      editor!
        .getHTML()
        .match(/data-pasted-source="external"[^>]*>([^<]*)</g)
        ?.map((m) => m.slice(m.indexOf('>') + 1, -1)) ?? []
    );
  }

  it('does not drift onto text typed before it', () => {
    editor!.commands.insertContentAt(1, 'NEW ');
    expect(markedText()).toEqual(['borrowed passage']);
  });

  it('does not drift onto text typed after it', () => {
    editor!.commands.focus('end');
    editor!.commands.insertContent(' and then the student kept going');
    expect(markedText()).toEqual(['borrowed passage']);
  });

  it('shrinks to what is left when the student deletes part of the pasted text', () => {
    const html = editor!.getHTML();
    const start = html.indexOf('borrowed');
    expect(start).toBeGreaterThan(-1);

    // Delete the final word of the pasted run ("&nbsp;passage").
    const end = editor!.state.doc.content.size - 1;
    editor!.commands.deleteRange({ from: end - 8, to: end });

    expect(markedText()).toEqual(['borrowed']);
  });

  it('keeps the mark on the surviving halves when the student types in the middle', () => {
    const doc = editor!.state.doc;
    const middle = doc.content.size - 1 - 'passage'.length;
    editor!.commands.insertContentAt(middle, 'OWN');

    const runs = markedText();
    expect(runs.join('')).toBe('borrowed passage');
    expect(runs.some((run) => run.includes('OWN'))).toBe(false);
    expect(editor!.getText()).toContain('borrowed OWNpassage');
  });
});

describe('PastedSource persistence', () => {
  it('round-trips through saved HTML, so a teacher opening the document later still sees it', () => {
    editor = makeEditor('<p>Student wrote this. </p>');
    editor.commands.focus('end');
    paste(editor, 'borrowed passage');
    editor.commands.markLastPasteAsExternal();
    const savedHtml = editor.getHTML();
    editor.destroy();

    editor = makeEditor(savedHtml);
    expect(editor.getHTML()).toContain('data-pasted-source="external"');
    expect(editor.getHTML()).toContain('>borrowed passage<');
  });
});
