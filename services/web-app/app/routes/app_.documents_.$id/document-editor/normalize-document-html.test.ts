import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

import { describe, expect, it } from 'bun:test';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { LineHeight } from './extensions/line-height';
import { DocumentImage } from './extensions/document-image';
import { PastedSource } from './extensions/pasted-source';
import { EmDash } from './extensions/em-dash';
import {
  normalizeDocumentEditorHtml,
  normalizeInterBlockBreaks,
} from './normalize-document-html';

const editorExtensions = [
  StarterKit,
  LineHeight,
  EmDash,
  PastedSource,
  DocumentImage.configure({ uploader: null, onStatus: null }),
];

function createEditor(html: string) {
  return new Editor({
    extensions: editorExtensions,
    content: html,
    editorProps: {
      transformPastedHTML: normalizeInterBlockBreaks,
    },
  });
}

function pasteHtml(editor: Editor, html: string) {
  const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, 'clipboardData', {
    value: {
      getData: (type: string) => (type === 'text/html' ? html : ''),
      types: ['text/html', 'text/plain'],
    },
  });
  (editor.view.dom as HTMLElement).dispatchEvent(event);
}

describe('normalizeInterBlockBreaks', () => {
  it('turns a bare break between paragraphs into an empty paragraph', () => {
    expect(
      normalizeInterBlockBreaks('<p>paste</p><br><p>more</p>')
    ).toBe('<p>paste</p><p><br></p><p>more</p>');
  });

  it('preserves multiple blank lines between blocks', () => {
    expect(
      normalizeInterBlockBreaks('<p>one</p><br><br><p>two</p>')
    ).toBe('<p>one</p><p><br></p><p><br></p><p>two</p>');
  });
});

describe('document editor paste hardBreak Fragment regression', () => {
  it('pastes HTML with inter-block breaks without throwing', () => {
    const editor = createEditor('<p>hello</p>');
    editor.commands.focus('end');

    const problemHtml = '<p>paste</p><br><p>more</p>';
    expect(() => pasteHtml(editor, problemHtml)).not.toThrow();

    expect(editor.getText()).toContain('paste');
    expect(editor.getText()).toContain('more');

    editor.destroy();
  });

  it('normalizes stored HTML before mount', () => {
    const normalized = normalizeDocumentEditorHtml('<p>before</p><br><p>after</p>');
    const editor = createEditor(normalized);
    expect(editor.getText()).toContain('before');
    expect(editor.getText()).toContain('after');
    editor.destroy();
  });
});