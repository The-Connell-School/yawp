import { Node, mergeAttributes } from '@tiptap/core';
import { Fragment } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import {
  carriesFiles,
  filesFromDataTransfer,
  isDocumentImageSrc,
  normalizeAltText,
  validateDocumentImageUpload,
} from '~/domain/document-images/document-images';
import { USER_SOURCE_META } from './source-tracker';
import { TOOLBAR_SOURCE } from '../use-pm-tripwire';

export const DOCUMENT_IMAGE_SIZES = ['full', 'half'] as const;
export type DocumentImageSize = (typeof DOCUMENT_IMAGE_SIZES)[number];

/** Result of uploading one file, as the extension needs to see it. */
export type DocumentImageUploadOutcome =
  | { ok: true; src: string }
  | { ok: false; message: string };

export type DocumentImageStatus =
  | { state: 'idle' }
  | { state: 'uploading'; count: number }
  | { state: 'error'; message: string };

export type DocumentImageOptions = {
  /** Uploads one file and resolves with its served src. Null disables paste/drop. */
  uploader: ((file: File) => Promise<DocumentImageUploadOutcome>) | null;
  /** Progress and failure reporting for the surrounding editor chrome. */
  onStatus: ((status: DocumentImageStatus) => void) | null;
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    documentImage: {
      insertDocumentImage: (attrs: {
        src: string;
        alt?: string;
        size?: DocumentImageSize;
      }) => ReturnType;
      setDocumentImageSize: (size: DocumentImageSize) => ReturnType;
    };
  }
}

function coerceSize(value: unknown): DocumentImageSize {
  return (DOCUMENT_IMAGE_SIZES as readonly string[]).includes(String(value))
    ? (value as DocumentImageSize)
    : 'full';
}

const documentImagePasteKey = new PluginKey('document-image-paste');

/**
 * A figure a student uploaded: a chart or graph they built elsewhere, a photo,
 * or their invented company's logo.
 *
 * Hand-rolled rather than @tiptap/extension-image because the src allowlist is
 * the point. Only `/api/image/document/<id>` survives a parse, so a student who
 * pastes a block of HTML out of a browser tab cannot smuggle a remote image --
 * a tracking pixel, or an asset that 404s the week their teacher grades the
 * report -- into a document we then persist and render for a teacher.
 *
 * The caption is the node's own editable content rather than an attribute, so
 * a student fixes a typo by clicking into it like any other text. The rendered
 * `alt` is derived from that caption at render time, which means the
 * description a sighted reader sees and the one a screen reader announces
 * cannot drift apart -- there is only one string.
 */
export const DocumentImage = Node.create<DocumentImageOptions>({
  name: 'documentImage',
  group: 'block',
  content: 'inline*',
  draggable: true,
  selectable: true,
  // Keeps edits inside the caption from merging into surrounding paragraphs.
  isolating: true,

  addOptions() {
    return { uploader: null, onStatus: null };
  },

  addAttributes() {
    return {
      src: { default: null },
      size: {
        default: 'full' as DocumentImageSize,
        parseHTML: (element) => coerceSize(element.getAttribute('data-size')),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'figure[data-document-image]',
        // The caption is node content, so parse it out of the figcaption.
        contentElement: 'figcaption',
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) return false;
          const img = element.querySelector('img');
          const src = img?.getAttribute('src') ?? null;
          if (!isDocumentImageSrc(src)) return false;
          return { src, size: coerceSize(element.getAttribute('data-size')) };
        },
      },
      {
        // A bare <img> that already points at one of our own figures -- a
        // student copying a paragraph from one of their documents into
        // another. Its alt becomes the caption. Anything else is dropped.
        tag: 'img[src]',
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) return false;
          const src = element.getAttribute('src');
          if (!isDocumentImageSrc(src)) return false;
          return { src };
        },
        getContent: (element, schema) => {
          const alt = normalizeAltText(
            (element as HTMLElement).getAttribute('alt') ?? ''
          );
          return alt ? Fragment.from(schema.text(alt)) : Fragment.empty;
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { src, size } = HTMLAttributes as Record<string, unknown>;
    return [
      'figure',
      mergeAttributes({
        'data-document-image': '',
        'data-size': coerceSize(size),
        class: 'document-image',
      }),
      [
        'img',
        {
          src: String(src ?? ''),
          // Derived, never stored: the caption is the single description.
          alt: normalizeAltText(node.textContent ?? ''),
          draggable: 'false',
        },
      ],
      ['figcaption', {}, 0],
    ];
  },

  /**
   * ProseMirror reuses a node's outer DOM when only its content changed
   * (`sameMarkup` compares type and attrs, not content), so an `alt` derived
   * inside renderHTML is computed once and then goes stale the moment a
   * student edits the caption. Serialized HTML stays correct because getHTML
   * re-renders from scratch -- but the live editor, which is what a screen
   * reader actually reads, would keep announcing the original text. This node
   * view re-derives the alt on every update.
   */
  addNodeView() {
    return ({ node }) => {
      const figure = document.createElement('figure');
      figure.setAttribute('data-document-image', '');
      figure.className = 'document-image';

      const img = document.createElement('img');
      img.draggable = false;

      const caption = document.createElement('figcaption');
      figure.append(img, caption);

      const apply = (current: typeof node) => {
        figure.setAttribute('data-size', coerceSize(current.attrs.size));
        img.setAttribute('src', String(current.attrs.src ?? ''));
        img.setAttribute('alt', normalizeAltText(current.textContent ?? ''));
      };

      apply(node);

      return {
        dom: figure,
        contentDOM: caption,
        update: (updated) => {
          if (updated.type.name !== node.type.name) return false;
          apply(updated);
          return true;
        },
        // Our own writes to the img live outside contentDOM; PM must not read
        // them back as document edits.
        ignoreMutation: (mutation: MutationRecord | { type: 'selection' }) =>
          mutation.type !== 'selection' &&
          !caption.contains((mutation as MutationRecord).target),
      };
    };
  },

  addCommands() {
    return {
      insertDocumentImage:
        ({ src, alt, size }) =>
        ({ commands, state, tr }) => {
          if (!isDocumentImageSrc(src)) return false;
          // The toolbar and the paste/drop handler both live outside the
          // editor DOM, so SourceTracker never sees the event that caused
          // this. Say who we are, or the PM tripwire logs every inserted
          // figure as an unauthorized write.
          tr.setMeta(USER_SOURCE_META, TOOLBAR_SOURCE);
          const caption = normalizeAltText(alt ?? '');
          const content = {
            type: this.name,
            attrs: { src, size: coerceSize(size) },
            content: caption ? [{ type: 'text', text: caption }] : [],
          };

          // A figure is a block node, and dropping one while the caret sits in
          // another figure's caption splits that figure in two -- the student
          // ends up with a duplicate of the image they already placed, its
          // caption stranded on the second copy. Land after the enclosing
          // figure instead.
          const { $from } = state.selection;
          for (let depth = $from.depth; depth > 0; depth -= 1) {
            if ($from.node(depth).type.name === this.name) {
              return commands.insertContentAt($from.after(depth), content);
            }
          }

          return commands.insertContent(content);
        },
      setDocumentImageSize:
        (size) =>
        ({ commands, tr }) => {
          tr.setMeta(USER_SOURCE_META, TOOLBAR_SOURCE);
          return commands.updateAttributes(this.name, { size: coerceSize(size) });
        },
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    const getOptions = () => this.options;

    /**
     * Upload the dropped/pasted files one at a time and place each figure as
     * it lands, with an empty caption for the student to fill in.
     */
    async function ingest(files: File[]) {
      const { uploader, onStatus } = getOptions();
      if (!uploader) return;

      let remaining = files.length;
      let lastError: string | null = null;
      onStatus?.({ state: 'uploading', count: remaining });

      for (const file of files) {
        const validation = validateDocumentImageUpload({
          contentType: file.type,
          byteSize: file.size,
          // The caption is filled in the document; only the file matters here.
          altText: 'placeholder',
        });

        if (!validation.ok) {
          lastError = validation.message;
          remaining -= 1;
          continue;
        }

        const result = await uploader(file);
        remaining -= 1;

        if (!result.ok) {
          lastError = result.message;
          continue;
        }

        editor.chain().focus().insertDocumentImage({ src: result.src }).run();
        if (remaining > 0) onStatus?.({ state: 'uploading', count: remaining });
      }

      // A failure has to survive the end of the run. Clearing to idle here
      // would erase the only explanation the student ever gets; the message
      // stays up until the next paste or drop replaces it.
      const { onStatus: latest } = getOptions();
      latest?.(lastError ? { state: 'error', message: lastError } : { state: 'idle' });
    }

    return [
      new Plugin({
        key: documentImagePasteKey,
        props: {
          handlePaste: (_view, event) => {
            if (!getOptions().uploader) return false;
            const clipboard = (event as ClipboardEvent).clipboardData;
            // No files means ordinary text or HTML: leave it alone.
            if (!carriesFiles(clipboard)) return false;
            event.preventDefault();
            void ingest(filesFromDataTransfer(clipboard));
            return true;
          },

          handleDrop: (view, event, _slice, moved) => {
            // `moved` is a figure being dragged around inside the document.
            // That is a move, not an upload.
            if (moved) return false;
            if (!getOptions().uploader) return false;

            const transfer = (event as DragEvent).dataTransfer;
            if (!carriesFiles(transfer)) return false;
            event.preventDefault();

            // Park the caret where the file landed before the upload starts,
            // so the figure appears where the student aimed it.
            const dropped = view.posAtCoords({
              left: (event as DragEvent).clientX,
              top: (event as DragEvent).clientY,
            });
            if (dropped) editor.commands.setTextSelection(dropped.pos);

            void ingest(filesFromDataTransfer(transfer));
            return true;
          },
        },
      }),
    ];
  },
});
