import { describe, expect, mock, test } from 'bun:test';
import { beginCommentDraftFromEditor } from './editor-bar';

describe('beginCommentDraftFromEditor', () => {
  test('creates a draft when selection spans an existing comment mark', () => {
    const runs: string[] = [];
    let isActiveComment = true;
    const onCommentDraft = mock((draft: { id: string; excerpt: string }) => {
      runs.push(`draft:${draft.excerpt}`);
    });
    const editor = {
      get isActive() {
        return (name: string) => name === 'comment' && isActiveComment;
      },
      state: {
        selection: { from: 0, to: 20, empty: false },
        doc: {
          textBetween: () => 'Education is the foundation',
        },
      },
      chain: () => {
        const chain = {
          focus: () => chain,
          setMeta: () => chain,
          setComment: (id: string) => {
            runs.push(`setComment:${id}`);
            isActiveComment = true;
            return chain;
          },
          unsetComment: () => {
            runs.push('unsetComment');
            isActiveComment = false;
            return chain;
          },
          run: () => true,
        };
        return chain;
      },
    } as unknown as import('@tiptap/react').Editor;

    beginCommentDraftFromEditor(editor, onCommentDraft);

    expect(runs.some((r) => r.startsWith('setComment:'))).toBe(true);
    expect(runs).not.toContain('unsetComment');
    expect(onCommentDraft).toHaveBeenCalledTimes(1);
  });

  test('clears comment mark when selection is empty inside a comment', () => {
    const runs: string[] = [];
    const onCommentDraft = mock(() => {});
    const editor = {
      isActive: (name: string) => name === 'comment',
      state: {
        selection: { from: 5, to: 5, empty: true },
        doc: { textBetween: () => '' },
      },
      chain: () => {
        const chain = {
          focus: () => chain,
          setMeta: () => chain,
          unsetComment: () => {
            runs.push('unsetComment');
            return chain;
          },
          run: () => true,
        };
        return chain;
      },
    } as unknown as import('@tiptap/react').Editor;

    beginCommentDraftFromEditor(editor, onCommentDraft);

    expect(runs).toEqual(['unsetComment']);
    expect(onCommentDraft).not.toHaveBeenCalled();
  });
});