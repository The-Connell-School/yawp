import { Extension } from '@tiptap/core';

type Options = '1' | '1.15' | '1.5' | '2';

const LINE_HEIGHT_OPTIONS: Options[] = ['1', '1.15', '1.5', '2'];
const LEGACY_STYLE_TO_CANONICAL: Array<{ style: number; canonical: Options }> =
  [
    { style: 1.4, canonical: '1' },
    { style: 1.58, canonical: '1.15' },
    { style: 2, canonical: '1.5' },
    { style: 2.6, canonical: '2' },
  ];
const NORMALIZATION_EPSILON = 0.03;

function isOption(value: unknown): value is Options {
  return (
    typeof value === 'string' &&
    LINE_HEIGHT_OPTIONS.includes(value as Options)
  );
}

function normalizeNumericLegacyStyle(value: number): Options | null {
  for (const candidate of LEGACY_STYLE_TO_CANONICAL) {
    if (Math.abs(value - candidate.style) <= NORMALIZATION_EPSILON) {
      return candidate.canonical;
    }
  }
  return null;
}

export function normalizeLineHeightFromHtml(args: {
  dataLineHeight?: unknown;
  styleLineHeight?: unknown;
  defaultHeight?: Options;
}): Options {
  const defaultHeight = args.defaultHeight ?? '1.15';

  if (isOption(args.dataLineHeight)) {
    return args.dataLineHeight;
  }

  if (typeof args.styleLineHeight === 'string') {
    const raw = args.styleLineHeight.trim();
    if (!raw) return defaultHeight;

    const parsed = Number.parseFloat(raw);
    if (Number.isFinite(parsed)) {
      const legacy = normalizeNumericLegacyStyle(parsed);
      if (legacy) return legacy;

      if (Math.abs(parsed - 1) <= NORMALIZATION_EPSILON) return '1';
      if (Math.abs(parsed - 1.15) <= NORMALIZATION_EPSILON) return '1.15';
      if (Math.abs(parsed - 1.5) <= NORMALIZATION_EPSILON) return '1.5';
      if (Math.abs(parsed - 2) <= NORMALIZATION_EPSILON) return '2';
    }
  }

  return defaultHeight;
}

export function normalizeLineHeightForRender(value: unknown): Options {
  if (isOption(value)) return value;
  return '1.15';
}

export interface LineHeightOptions {
  types: string[];
  heights: Options[];
  defaultHeight: '1.15';
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    lineHeight: {
      /**
       * Set the line height attribute
       */
      setLineHeight: (height: Options) => ReturnType;
      /**
       * Unset the line height attribute
       */
      unsetLineHeight: () => ReturnType;
    };
  }
}

export const LineHeight = Extension.create<LineHeightOptions>({
  name: 'lineHeight',

  addOptions() {
    return {
      types: [
        'paragraph',
        'heading',
        'blockquote',
        'codeBlock',
        'bulletList',
        'orderedList',
        'listItem',
        'tableCell',
        'tableHeaderCell',
        'caption',
        'table',
      ],
      heights: LINE_HEIGHT_OPTIONS,
      defaultHeight: '1.15',
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          lineHeight: {
            default: this.options.defaultHeight,
            parseHTML: (element) =>
              normalizeLineHeightFromHtml({
                dataLineHeight: element.getAttribute('data-line-height'),
                styleLineHeight: element.style.lineHeight,
                defaultHeight: this.options.defaultHeight,
              }),
            renderHTML: ({ lineHeight }) => {
              const normalized = normalizeLineHeightForRender(lineHeight);

              if (normalized === this.options.defaultHeight) {
                return {};
              }

              return {
                'data-line-height': normalized,
                style: `line-height: ${normalized}`,
              };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setLineHeight:
        (height: Options) =>
        ({ commands }) => {
          if (!this.options.heights.includes(height)) {
            return false;
          }

          return this.options.types.every((type) =>
            commands.updateAttributes(type, { lineHeight: height })
          );
        },

      unsetLineHeight:
        () =>
        ({ commands }) => {
          return this.options.types.every((type) =>
            commands.resetAttributes(type, 'lineHeight')
          );
        },
    };
  },
});
