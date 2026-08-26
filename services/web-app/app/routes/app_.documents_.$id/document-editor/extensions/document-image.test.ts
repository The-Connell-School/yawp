import { GlobalRegistrator } from '@happy-dom/global-registrator';
// Guard: register only if not already registered (multi-file bun:test runs share a process)
try {
  GlobalRegistrator.register();
} catch {
  // Already registered by another test file in this process — safe to ignore
}

import { describe, it, expect, beforeEach } from 'bun:test';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { DocumentImage } from './document-image';

describe('DocumentImage extension', () => {
  let editor: Editor;

  beforeEach(() => {
    editor = new Editor({
      extensions: [StarterKit, DocumentImage],
      content: '<p></p>',
    });
  });

  it('inserts a figure whose caption is its alt text', () => {
    editor.commands.insertDocumentImage({
      src: '/api/image/document/img-1',
      alt: 'Ten-year revenue for the global market',
    });

    const html = editor.getHTML();
    expect(html).toContain('data-document-image');
    expect(html).toContain('src="/api/image/document/img-1"');
    expect(html).toContain('alt="Ten-year revenue for the global market"');
    expect(html).toContain(
      '<figcaption>Ten-year revenue for the global market</figcaption>'
    );
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

    const json = editor.getJSON();
    const figure = json.content?.[0];
    expect(figure?.type).toBe('documentImage');
    expect(figure?.attrs).toMatchObject({
      src: '/api/image/document/img-9',
      alt: 'Competitor share',
      size: 'half',
    });
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

    const json = editor.getJSON();
    expect(json.content?.[0]?.type).toBe('documentImage');
    expect(json.content?.[0]?.attrs).toMatchObject({
      src: '/api/image/document/img-2',
      alt: 'PESTEL summary',
    });
  });

  it('falls back to full width for an unknown size', () => {
    editor.commands.setContent(
      '<figure data-document-image="" data-size="enormous"><img src="/api/image/document/img-3" alt="Logo"></figure>'
    );
    expect(editor.getJSON().content?.[0]?.attrs?.size).toBe('full');
  });

  it('resizes the selected figure', () => {
    editor.commands.insertDocumentImage({
      src: '/api/image/document/img-4',
      alt: 'Logo',
    });
    editor.commands.setNodeSelection(0);
    editor.commands.setDocumentImageSize('half');

    expect(editor.getHTML()).toContain('data-size="half"');
  });
});
