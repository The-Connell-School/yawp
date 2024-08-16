import { Extension, Mark } from '@tiptap/core'
import { Plugin, PluginKey } from 'prosemirror-state'

export interface CommentOptions {
  HTMLAttributes: Record<string, any>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    comment: {
      setComment: (id: string) => ReturnType
      unsetComment: () => ReturnType
    }
  }
}

export const Comment = Mark.create<CommentOptions>({
  name: 'comment',

  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: element => element.getAttribute('data-comment-id'),
        renderHTML: attributes => {
          if (!attributes.id) return {}
          return { 'data-comment-id': attributes.id }
        },
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-comment-id]',
        getAttrs: dom => ({
          id: (dom as HTMLElement).getAttribute('data-comment-id'),
        }),
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', { ...HTMLAttributes, class: 'comment-mark' }, 0]
  },

  addCommands() {
    return {
      setComment:
        id =>
        ({ commands }) => {
          return commands.setMark(this.name, { id })
        },
      unsetComment:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name)
        },
    }
  },
})

export const CommentExtension = Extension.create({
  name: 'commentExtension',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('commentExtension'),
        props: {
          handleClick(view, pos, event) {
            const { schema, doc } = view.state
            const range = doc.resolve(pos).marks().find(mark => mark.type === schema.marks.comment)
            if (range) {
              const id = range.attrs.id
              const comment = document.getElementById(`comment-${id}`)
              if (comment) {
                comment.scrollIntoView({ behavior: 'smooth' })
                comment.classList.add('bg-primary/20', 'shadow-lg')
              }
              if (event.target instanceof HTMLElement) {
                event.target.classList.add('focused');
              }
            }
            return false
          },
        },
      }),
    ]
  },
})
