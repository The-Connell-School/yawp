import { GlobalRegistrator } from '@happy-dom/global-registrator';
// Guard: register only if not already registered (multi-file bun:test runs share a process)
try {
  GlobalRegistrator.register();
} catch {
  // Already registered by another test file in this process — safe to ignore
}

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { DocumentImage, type DocumentImageStatus } from './document-image';
import { SourceTracker, USER_SOURCE_META } from './source-tracker';
import { checkPmTransaction, TOOLBAR_SOURCE } from '../use-pm-tripwire';

function makeFile(name = 'chart.png', type = 'image/png', bytes = 4) {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe('DocumentImage extension', () => {
  let editor: Editor;

  beforeEach(() => {
    editor = new Editor({
      extensions: [StarterKit, DocumentImage],
      content: '<p></p>',
    });
  });

  it('inserts a figure whose caption is the description', () => {
    editor.commands.insertDocumentImage({
      src: '/api/image/document/img-1',
      alt: 'Ten-year revenue for the global market',
    });

    const html = editor.getHTML();
    expect(html).toContain('data-document-image');
    expect(html).toContain('src="/api/image/document/img-1"');
    expect(html).toContain(
      '<figcaption>Ten-year revenue for the global market</figcaption>'
    );
  });

  it('derives the alt attribute from the caption so the two cannot drift', () => {
    editor.commands.insertDocumentImage({
      src: '/api/image/document/img-1',
      alt: 'Original caption',
    });
    expect(editor.getHTML()).toContain('alt="Original caption"');

    // Edit the caption the way a student would: select it and retype.
    editor.commands.setTextSelection({ from: 1, to: 1 + 'Original caption'.length });
    editor.commands.insertContent('Corrected caption');

    const html = editor.getHTML();
    expect(html).toContain('Corrected caption</figcaption>');
    expect(html).toContain('alt="Corrected caption"');
    expect(html).not.toContain('alt="Original caption"');
  });

  it('keeps the rendered alt in step with the caption in the live DOM', () => {
    // Regression: ProseMirror reuses the figure's DOM when only content
    // changed, so an alt derived in renderHTML alone went stale here even
    // though the serialized HTML looked right.
    editor.commands.insertDocumentImage({
      src: '/api/image/document/img-1',
      alt: 'Original caption',
    });
    const liveAlt = () =>
      (editor.view.dom.querySelector('figure.document-image img') as HTMLImageElement | null)
        ?.getAttribute('alt') ?? null;

    expect(liveAlt()).toBe('Original caption');

    editor.commands.setTextSelection({ from: 1, to: 1 + 'Original caption'.length });
    editor.commands.insertContent('Corrected caption');

    expect(liveAlt()).toBe('Corrected caption');
  });

  it('inserts with an empty caption when no description is given', () => {
    editor.commands.insertDocumentImage({ src: '/api/image/document/img-1' });
    const html = editor.getHTML();
    expect(html).toContain('<figcaption></figcaption>');
    expect(html).toContain('alt=""');
  });

  it('tags its insert as a toolbar edit so the PM tripwire stays quiet', () => {
    const tripwireEditor = new Editor({
      extensions: [StarterKit, SourceTracker, DocumentImage],
      content: '<p></p>',
    });

    const violations: string[] = [];
    let seenSource: unknown = null;
    tripwireEditor.on('transaction', ({ transaction }) => {
      const violation = checkPmTransaction(transaction);
      if (violation) violations.push(violation);
      if (transaction.docChanged) seenSource = transaction.getMeta(USER_SOURCE_META);
    });

    tripwireEditor.commands.insertDocumentImage({
      src: '/api/image/document/img-8',
      alt: 'Revenue by year',
    });

    expect(seenSource).toBe(TOOLBAR_SOURCE);
    expect(violations).toEqual([]);
    tripwireEditor.destroy();
  });

  it('never splits an existing figure when one is inserted from inside its caption', () => {
    // Regression: a figure is a block node, so inserting one while the caret
    // sat in another figure's caption split that figure in two -- the student
    // got a duplicate image with the caption stranded on the second copy.
    editor.commands.insertDocumentImage({
      src: '/api/image/document/img-a',
      alt: 'First figure',
    });
    // Caret inside the first figure's caption.
    editor.commands.setTextSelection(3);

    editor.commands.insertDocumentImage({ src: '/api/image/document/img-b' });

    const figures = editor.getJSON().content?.filter((n) => n.type === 'documentImage') ?? [];
    expect(figures).toHaveLength(2);
    expect(figures[0]?.attrs?.src).toBe('/api/image/document/img-a');
    expect(figures[0]?.content?.[0]?.text).toBe('First figure');
    expect(figures[1]?.attrs?.src).toBe('/api/image/document/img-b');
    expect(editor.getHTML().match(/img-a/g)).toHaveLength(1);
  });

  it('refuses to insert a figure that is not served from our own endpoint', () => {
    const inserted = editor.commands.insertDocumentImage({
      src: 'https://evil.example.com/tracker.png',
      alt: 'Logo',
    });

    expect(inserted).toBe(false);
    expect(editor.getHTML()).not.toContain('evil.example.com');
  });

  it('round-trips a saved figure back out of stored HTML', () => {
    const stored =
      '<figure data-document-image="" data-size="half" class="document-image">' +
      '<img src="/api/image/document/img-9" alt="Competitor share"><figcaption>Competitor share</figcaption>' +
      '</figure>';

    editor.commands.setContent(stored);

    const figure = editor.getJSON().content?.[0];
    expect(figure?.type).toBe('documentImage');
    expect(figure?.attrs).toMatchObject({ src: '/api/image/document/img-9', size: 'half' });
    expect(figure?.content?.[0]?.text).toBe('Competitor share');
  });

  it('drops a pasted external image instead of persisting a remote src', () => {
    editor.commands.setContent(
      '<p>Before</p><img src="https://evil.example.com/pixel.gif" alt="x"><p>After</p>'
    );

    const html = editor.getHTML();
    expect(html).not.toContain('evil.example.com');
    expect(html).toContain('Before');
    expect(html).toContain('After');
  });

  it('keeps a pasted figure that already points at one of our own images', () => {
    editor.commands.setContent('<img src="/api/image/document/img-2" alt="PESTEL summary">');

    const figure = editor.getJSON().content?.[0];
    expect(figure?.type).toBe('documentImage');
    expect(figure?.attrs).toMatchObject({ src: '/api/image/document/img-2' });
    expect(figure?.content?.[0]?.text).toBe('PESTEL summary');
  });

  it('falls back to full width for an unknown size', () => {
    editor.commands.setContent(
      '<figure data-document-image="" data-size="enormous"><img src="/api/image/document/img-3" alt="Logo"><figcaption>Logo</figcaption></figure>'
    );
    expect(editor.getJSON().content?.[0]?.attrs?.size).toBe('full');
  });

  it('resizes the selected figure', () => {
    editor.commands.insertDocumentImage({ src: '/api/image/document/img-4', alt: 'Logo' });
    editor.commands.setNodeSelection(0);
    editor.commands.setDocumentImageSize('half');

    expect(editor.getHTML()).toContain('data-size="half"');
  });
});

describe('DocumentImage paste and drop', () => {
  let uploader: ReturnType<typeof mock>;
  let statuses: DocumentImageStatus[];
  let editor: Editor;

  function build() {
    return new Editor({
      extensions: [
        StarterKit,
        DocumentImage.configure({
          uploader: uploader as never,
          onStatus: (status: DocumentImageStatus) => statuses.push(status),
        }),
      ],
      content: '<p>Report</p>',
    });
  }

  beforeEach(() => {
    statuses = [];
    uploader = mock(async () => ({ ok: true, src: '/api/image/document/img-p' }));
    editor = build();
  });

  function paste(files: File[]) {
    let defaultPrevented = false;
    const event = {
      // getData/types are what the other StarterKit paste handlers reach for
      // once ours declines the event.
      clipboardData: { files, types: [], getData: () => '' },
      preventDefault: () => {
        defaultPrevented = true;
      },
    };
    const handled = (editor.view.someProp as any)('handlePaste', (fn: any) =>
      fn(editor.view, event, null)
    );
    return { handled: Boolean(handled), defaultPrevented };
  }

  function drop(files: File[], moved = false) {
    let defaultPrevented = false;
    const event = {
      dataTransfer: { files },
      clientX: 10,
      clientY: 10,
      preventDefault: () => {
        defaultPrevented = true;
      },
    };
    const handled = (editor.view.someProp as any)('handleDrop', (fn: any) =>
      fn(editor.view, event, null, moved)
    );
    return { handled: Boolean(handled), defaultPrevented };
  }

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('uploads a pasted image and inserts it with an empty caption to fill in', async () => {
    const { handled, defaultPrevented } = paste([makeFile()]);
    expect(handled).toBe(true);
    expect(defaultPrevented).toBe(true);

    await settle();
    await settle();

    expect(uploader).toHaveBeenCalledTimes(1);
    const html = editor.getHTML();
    expect(html).toContain('src="/api/image/document/img-p"');
    expect(html).toContain('<figcaption></figcaption>');
  });

  it('leaves an ordinary text paste completely alone', () => {
    const { handled, defaultPrevented } = paste([]);
    expect(handled).toBe(false);
    expect(defaultPrevented).toBe(false);
    expect(uploader).not.toHaveBeenCalled();
  });

  it('uploads a dropped image file', async () => {
    const { handled } = drop([makeFile()]);
    expect(handled).toBe(true);
    await settle();
    await settle();

    expect(uploader).toHaveBeenCalledTimes(1);
    expect(editor.getHTML()).toContain('src="/api/image/document/img-p"');
  });

  it('does not hijack a figure being dragged around inside the document', () => {
    const { handled } = drop([makeFile()], true);
    expect(handled).toBe(false);
    expect(uploader).not.toHaveBeenCalled();
  });

  it('reports an unsupported dropped file instead of uploading it', async () => {
    drop([makeFile('notes.txt', 'text/plain')]);
    await settle();
    await settle();

    expect(uploader).not.toHaveBeenCalled();
    // Regression: the end-of-run idle reset used to erase the error the
    // instant it was set, so the student never saw why nothing happened.
    const final = statuses.at(-1);
    expect(final?.state).toBe('error');
    expect(final && 'message' in final && final.message).toMatch(/not supported/i);
  });

  it('clears a previous error when the next upload starts', async () => {
    drop([makeFile('notes.txt', 'text/plain')]);
    await settle();
    await settle();
    expect(statuses.at(-1)?.state).toBe('error');

    drop([makeFile()]);
    await settle();
    await settle();
    expect(statuses.at(-1)).toEqual({ state: 'idle' });
  });

  it('surfaces an upload failure without inserting a broken figure', async () => {
    uploader = mock(async () => ({ ok: false, message: 'That image is too large.' }));
    editor = build();

    drop([makeFile()]);
    await settle();
    await settle();

    expect(editor.getHTML()).not.toContain('figure');
    const final = statuses.at(-1);
    expect(final?.state).toBe('error');
    expect(final && 'message' in final && final.message).toBe('That image is too large.');
  });

  it('handles several images dropped at once, in order', async () => {
    let n = 0;
    uploader = mock(async () => ({ ok: true, src: `/api/image/document/img-${++n}` }));
    editor = build();

    drop([makeFile('a.png'), makeFile('b.png')]);
    for (let i = 0; i < 6; i++) await settle();

    expect(uploader).toHaveBeenCalledTimes(2);
    const html = editor.getHTML();
    expect(html).toContain('/api/image/document/img-1');
    expect(html).toContain('/api/image/document/img-2');
    expect(html.indexOf('img-1')).toBeLessThan(html.indexOf('img-2'));
  });

  it('does nothing on paste when uploads are not available', () => {
    editor = new Editor({
      extensions: [StarterKit, DocumentImage],
      content: '<p>Report</p>',
    });
    const { handled } = paste([makeFile()]);
    expect(handled).toBe(false);
  });
});
