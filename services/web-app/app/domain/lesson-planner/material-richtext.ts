/**
 * The one-way trip back from the WYSIWYG editor to plain Markdown.
 *
 * A teacher editing a handout should never see `**` or `>` — they see bold
 * text and an indented quote, the way any document editor works. But the
 * content this app stores, prints, and exports as slides is Markdown, read by
 * three different renderers (the packet page, the PDF, the pptx builder), and
 * none of them are worth teaching a fourth format. So the editor's own
 * document — what TipTap calls its JSON — gets walked here and turned back
 * into the Markdown string those renderers already know, on save. The
 * teacher never sees this string; only the renderers do.
 *
 * Loading the other direction needs no code of its own: the existing
 * Markdown → HTML renderer (`markdownToSafeHtml`) hands TipTap a string it
 * already knows how to parse into its own document.
 */

type EditorMark = { type: string };

type EditorNode = {
  // Optional because it mirrors TipTap's own `JSONContent`, whose `type` is
  // optional at the type level even though a real document always sets it.
  type?: string;
  attrs?: Record<string, unknown>;
  content?: EditorNode[];
  text?: string;
  marks?: EditorMark[];
};

const MARK_WRAP: Record<string, (text: string) => string> = {
  bold: (text) => `**${text}**`,
  italic: (text) => `*${text}*`,
  code: (text) => `\`${text}\``,
  strike: (text) => `~~${text}~~`,
};

function serializeMarks(text: string, marks: EditorMark[] = []): string {
  return marks.reduce(
    (wrapped, mark) => MARK_WRAP[mark.type]?.(wrapped) ?? wrapped,
    text
  );
}

function serializeInline(nodes: EditorNode[] = []): string {
  return nodes
    .map((node) => {
      if (node.type === 'text') return serializeMarks(node.text ?? '', node.marks);
      if (node.type === 'hardBreak') return '  \n';
      return '';
    })
    .join('');
}

const HEADING_MAX_LEVEL = 6;

function serializeListItem(item: EditorNode): string {
  // A list item that is just one paragraph — the overwhelming case for a
  // handout — reads as that paragraph's text. Anything more inside an item is
  // rare enough here to fall back to a plain join rather than earn its own
  // indentation scheme.
  return (item.content ?? []).map(serializeBlock).join(' ');
}

/** One block-level node, as a self-contained chunk of Markdown. */
function serializeBlock(node: EditorNode): string {
  switch (node.type) {
    case 'paragraph': {
      const text = serializeInline(node.content);
      // A paragraph with nothing in it is a blank line the teacher put there
      // on purpose, not nothing — collapsing it would silently eat the gap.
      return text.length ? text : ' ';
    }
    case 'heading': {
      const level = Math.min(
        Math.max(Number(node.attrs?.level ?? 2), 1),
        HEADING_MAX_LEVEL
      );
      return `${'#'.repeat(level)} ${serializeInline(node.content)}`;
    }
    case 'blockquote': {
      const inner = (node.content ?? []).map(serializeBlock).join('\n\n');
      return inner
        .split('\n')
        .map((line) => (line.length ? `> ${line}` : '>'))
        .join('\n');
    }
    case 'bulletList':
      return (node.content ?? [])
        .map((item) => `- ${serializeListItem(item)}`)
        .join('\n');
    case 'orderedList': {
      let n = Number(node.attrs?.start ?? 1);
      return (node.content ?? [])
        .map((item) => `${n++}. ${serializeListItem(item)}`)
        .join('\n');
    }
    case 'horizontalRule':
      return '---';
    default:
      // An unrecognized node still has its text worth keeping — read it
      // inline rather than dropping the teacher's words.
      return serializeInline(node.content);
  }
}

/**
 * A TipTap/ProseMirror document, as the Markdown string every other renderer
 * in this feature already reads. Blocks separate with a blank line, matching
 * what a teacher would have typed by hand; the whole thing ends in exactly
 * one trailing newline, and an empty document saves as an empty string
 * rather than a stray one.
 */
export function editorDocToMarkdown(doc: EditorNode): string {
  const blocks = (doc.content ?? []).map(serializeBlock);
  return blocks.length ? `${blocks.join('\n\n')}\n` : '';
}
