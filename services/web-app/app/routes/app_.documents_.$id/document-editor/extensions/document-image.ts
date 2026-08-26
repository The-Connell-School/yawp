import { Node, mergeAttributes } from '@tiptap/core';
import {
  isDocumentImageSrc,
  normalizeAltText,
} from '~/domain/document-images/document-images';

export const DOCUMENT_IMAGE_SIZES = ['full', 'half'] as const;
export type DocumentImageSize = (typeof DOCUMENT_IMAGE_SIZES)[number];

export type DocumentImageAttributes = {
  src: string;
  alt: string;
  size: DocumentImageSize;
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    documentImage: {
      insertDocumentImage: (attrs: {
        src: string;
        alt: string;
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
 * The node is an atom: it has no editable content, so the alt text doubles as
 * the visible caption and there is exactly one place a description can live.
 */
export const DocumentImage = Node.create({
  name: 'documentImage',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: '' },
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
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) return false;
          const img = element.querySelector('img');
          const src = img?.getAttribute('src') ?? null;
          if (!isDocumentImageSrc(src)) return false;
          return {
            src,
            alt: normalizeAltText(img?.getAttribute('alt') ?? ''),
            size: coerceSize(element.getAttribute('data-size')),
          };
        },
      },
      {
        // A bare <img> that already points at one of our own figures -- a
        // student copying a paragraph from one of their documents into
        // another. Anything else is dropped.
        tag: 'img[src]',
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) return false;
          const src = element.getAttribute('src');
          if (!isDocumentImageSrc(src)) return false;
          return { src, alt: normalizeAltText(element.getAttribute('alt') ?? '') };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const { src, alt, size } = HTMLAttributes as Record<string, unknown>;
    const caption = typeof alt === 'string' ? alt : '';
    return [
      'figure',
      mergeAttributes({
        'data-document-image': '',
        'data-size': coerceSize(size),
        class: 'document-image',
      }),
      ['img', { src: String(src ?? ''), alt: caption, draggable: 'false' }],
      ['figcaption', {}, caption],
    ];
  },

  addCommands() {
    return {
      insertDocumentImage:
        ({ src, alt, size }) =>
        ({ commands }) => {
          if (!isDocumentImageSrc(src)) return false;
          return commands.insertContent({
            type: this.name,
            attrs: { src, alt: normalizeAltText(alt ?? ''), size: coerceSize(size) },
          });
        },
      setDocumentImageSize:
        (size) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, { size: coerceSize(size) }),
    };
  },
});
