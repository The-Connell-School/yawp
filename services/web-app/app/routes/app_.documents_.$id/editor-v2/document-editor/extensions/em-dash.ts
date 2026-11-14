import { Extension, InputRule } from '@tiptap/core';
import { closeHistory } from 'prosemirror-history';

// Client request (Brian Connell): typing two hyphens in the student essay
// editor should auto-connect and elongate into an em dash ("--" -> "—").
//
// Built on TipTap's native input-rule mechanism (the same one
// @tiptap/extension-typography uses for its emDash rule) rather than a
// hand-rolled keydown listener, so it gets TipTap's existing guardrails for
// free: input rules never fire inside a code block or an inline code mark
// (see `run$1` in @tiptap/core, which checks `$from.parent.type.spec.code`
// and code-marked neighboring nodes before matching).
//
// We don't use the `textInputRule` convenience helper because its plain
// transaction merges into the same undo group as the "--" keystrokes that
// triggered it (ProseMirror's history groups adjacent transactions typed in
// quick succession). Calling `closeHistory()` on our replace transaction
// forces it into its own undo step, so a single Ctrl/Cmd+Z right after the
// conversion reverts only the em dash, leaving the two hyphens behind.
export const EmDash = Extension.create({
  name: 'emDash',

  addInputRules() {
    return [
      new InputRule({
        find: /--$/,
        handler: ({ state, range }) => {
          state.tr.insertText('—', range.from, range.to);
          closeHistory(state.tr);
        },
      }),
    ];
  },
});
