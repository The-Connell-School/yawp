import { Extension, Mark } from '@tiptap/core';
import { Plugin, PluginKey } from 'prosemirror-state';

export interface CommentOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    comment: {
      setComment: (id: string) => ReturnType;
      unsetComment: () => ReturnType;
    };
  }
}

export const Comment = Mark.create<CommentOptions>({
  name: 'comment',

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-comment-id'),
        renderHTML: (attributes) => {
          if (!attributes.id) return {};
          return { 'data-comment-id': attributes.id };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-comment-id]',
        getAttrs: (dom) => ({
          id: (dom as HTMLElement).getAttribute('data-comment-id'),
        }),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', { ...HTMLAttributes, class: 'comment-mark' }, 0];
  },

  addCommands() {
    return {
      setComment:
        (id) =>
        ({ commands }) => {
          return commands.setMark(this.name, { id });
        },
      unsetComment:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },
    };
  },
});

export const CommentExtension = Extension.create({
  name: 'commentExtension',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('commentExtension'),
        props: {
          handleDOMEvents: {
            mouseover: (_view, event) => {
              const target = event.target as HTMLElement | null;
              const mark = target?.closest(
                '[data-comment-id]'
              ) as HTMLElement | null;
              if (!mark) return false;
              const id = mark.getAttribute('data-comment-id');
              if (!id) return false;
              window.dispatchEvent(
                new CustomEvent('document-comment-hover', { detail: { id } })
              );
              return false;
            },
            mouseout: (_view, event) => {
              const target = event.target as HTMLElement | null;
              const mark = target?.closest(
                '[data-comment-id]'
              ) as HTMLElement | null;
              if (!mark) return false;
              const id = mark.getAttribute('data-comment-id');
              if (!id) return false;
              window.dispatchEvent(
                new CustomEvent('document-comment-unhover', { detail: { id } })
              );
              return false;
            },
          },
          handleClick(view, pos) {
            const { schema, doc } = view.state;
            const range = doc
              .resolve(pos)
              .marks()
              .find((mark) => mark.type === schema.marks.comment);
            if (range) {
              const id = range.attrs.id as string;
              window.dispatchEvent(
                new CustomEvent('document-comment-active', { detail: { id } })
              );
            }
            return false;
          },
          handleTextInput(view) {
            // Prevent newly typed text from inheriting the comment mark when cursor is inside
            const { state } = view;
            const { schema, selection } = state;
            const hasComment = selection.$from
              .marks()
              .some((m) => m.type === schema.marks.comment);
            if (hasComment) {
              const tr = state.tr.removeStoredMark(schema.marks.comment);
              view.dispatch(tr);
            }
            return false;
          },
        },
      }),
    ];
  },
});
