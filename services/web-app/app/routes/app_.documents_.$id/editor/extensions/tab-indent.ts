import { Extension } from '@tiptap/core';

const INDENT = '\u00A0\u00A0\u00A0\u00A0';

export const TabIndent = Extension.create({
  name: 'tabIndent',

  addKeyboardShortcuts() {
    return {
      Tab: () => {
        if (this.editor.can().sinkListItem('listItem')) {
          return this.editor.chain().focus().sinkListItem('listItem').run();
        }

        return this.editor.chain().focus().insertContent(INDENT).run();
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
