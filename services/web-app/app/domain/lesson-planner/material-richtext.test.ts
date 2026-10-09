import { describe, expect, test } from 'bun:test';
import { editorDocToMarkdown } from './material-richtext';

/**
 * What a teacher's WYSIWYG edit becomes on disk. They never see this string —
 * they see bold text and a bulleted list — but everything else in the app
 * (the PDF, the pptx export, the read view) still reads plain Markdown, so
 * the editor has to hand back something those renderers recognize.
 */
describe('editorDocToMarkdown', () => {
  test('a plain paragraph round-trips with no added syntax', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Read each excerpt.' }],
        },
      ],
    };
    expect(editorDocToMarkdown(doc)).toBe('Read each excerpt.\n');
  });

  test('bold and italic marks become the asterisks the renderers expect', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'The move: ', marks: [] },
            { type: 'text', text: 'Introduce', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' then ' },
            { type: 'text', text: 'explain', marks: [{ type: 'italic' }] },
            { type: 'text', text: '.' },
          ],
        },
      ],
    };
    expect(editorDocToMarkdown(doc)).toBe(
      'The move: **Introduce** then *explain*.\n'
    );
  });

  test('a mark that spans a run of words wraps the whole run once, not per word', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Introduce, Quote, Explain',
              marks: [{ type: 'bold' }],
            },
          ],
        },
      ],
    };
    expect(editorDocToMarkdown(doc)).toBe(
      '**Introduce, Quote, Explain**\n'
    );
  });

  test('a heading becomes a heading line, capped at the levels the packet reads', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Diagnose & Repair' }],
        },
      ],
    };
    expect(editorDocToMarkdown(doc)).toBe('## Diagnose & Repair\n');
  });

  test('a blockquote prefixes every line with >', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'blockquote',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'She had never felt so alone.' },
              ],
            },
          ],
        },
      ],
    };
    expect(editorDocToMarkdown(doc)).toBe(
      '> She had never felt so alone.\n'
    );
  });

  test('a bullet list numbers nothing and marks every item with a dash', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Underline the claim.' }],
                },
              ],
            },
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Name the evidence.' }],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(editorDocToMarkdown(doc)).toBe(
      '- Underline the claim.\n- Name the evidence.\n'
    );
  });

  test('an ordered list counts up from its start attribute', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'orderedList',
          attrs: { start: 1 },
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Read the excerpt.' }],
                },
              ],
            },
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Write what is missing.' }],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(editorDocToMarkdown(doc)).toBe(
      '1. Read the excerpt.\n2. Write what is missing.\n'
    );
  });

  test('separate paragraphs get the blank line between them the renderers need', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'First paragraph.' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Second paragraph.' }],
        },
      ],
    };
    expect(editorDocToMarkdown(doc)).toBe(
      'First paragraph.\n\nSecond paragraph.\n'
    );
  });

  test('a horizontal rule becomes the dashes the packet already knows', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Above.' }] },
        { type: 'horizontalRule' },
        { type: 'paragraph', content: [{ type: 'text', text: 'Below.' }] },
      ],
    };
    expect(editorDocToMarkdown(doc)).toBe('Above.\n\n---\n\nBelow.\n');
  });

  test('an empty paragraph does not collapse — a teacher put a blank line there on purpose', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'One.' }] },
        { type: 'paragraph' },
        { type: 'paragraph', content: [{ type: 'text', text: 'Two.' }] },
      ],
    };
    expect(editorDocToMarkdown(doc)).toBe('One.\n\n \n\nTwo.\n');
  });

  test('a document with nothing in it saves as an empty string, not a stray newline', () => {
    expect(editorDocToMarkdown({ type: 'doc', content: [] })).toBe('');
  });
});
