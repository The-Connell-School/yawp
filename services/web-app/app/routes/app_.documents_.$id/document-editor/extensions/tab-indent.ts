import { Extension } from '@tiptap/core';

export const TabIndent = Extension.create({
  name: 'tabIndent',

  addKeyboardShortcuts() {
    return {
      Tab: () => {
        if (this.editor.can().sinkListItem('listItem')) {
          return this.editor.chain().focus().sinkListItem('listItem').run();
        }

        // Let browser focus traversal handle Tab outside lists. Inserting
        // spaces here traps keyboard-only users inside the editor.
        return false;
      },
      'Shift-Tab': () => {
        if (this.editor.can().liftListItem('listItem')) {
          return this.editor.chain().focus().liftListItem('listItem').run();
        }

        return false;
      },
    };
  },
});
