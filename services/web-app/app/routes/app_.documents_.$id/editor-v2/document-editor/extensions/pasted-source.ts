import { Mark } from '@tiptap/core';
import { Plugin, PluginKey, type Transaction } from 'prosemirror-state';

export const PASTED_SOURCE_CLASS = 'pasted-source-mark';

const pastedSourceKey = new PluginKey<PastedSourceState>('pastedSource');

/** Flags the plugin's own clean-up transaction so it is not re-processed. */
const SCRUB_META = 'yawp-pasted-source-scrub';

/**
 * prosemirror-history's plugin-key string. Undo and redo re-insert content
 * that was already marked, so their transactions are left alone rather than
 * scrubbed. If the key ever stops matching, undoing a deletion of pasted
 * text loses that passage's highlight — quiet under-reporting, never a
 * highlight on text the student wrote.
 */
const HISTORY_META = 'history$';

type PastedSourceState = {
  /** Range the most recent paste inserted, or null once anything else happens. */
  lastPaste: { from: number; to: number } | null;
};

export type PastedSourceOptions = {
  /**
   * Instant stamped on each mark, as an ISO string. Injectable because the
   * timestamp is the only thing distinguishing one paste's mark from the
   * next: two marks stamped with the same instant are attribute-identical,
   * and ProseMirror merges adjacent identical marks into a single run — so
   * two pastes a millisecond apart would read as one. Tests pass a clock
   * that always advances; production reads the wall clock.
   */
  now: () => string;
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pastedSource: {
      /**
       * Marks the range the last paste inserted as having come from
       * outside the app. Returns false when the last change was not a
       * paste, so a mis-timed call can never mark the student's own text.
       */
      markLastPasteAsExternal: (eventId?: string) => ReturnType;
    };
  }
}

/**
 * The range of document content a transaction inserted, in the coordinates
 * of the document the transaction produced. Null when the transaction only
 * deleted content or left the document alone.
 *
 * A paste is normally one ReplaceStep, but a step's ranges still have to be
 * mapped through every later step so the returned range is valid against
 * tr.doc rather than an intermediate state.
 */
export function insertedRangeFromTransaction(
  tr: Transaction
): { from: number; to: number } | null {
  let from: number | null = null;
  let to: number | null = null;

  tr.steps.forEach((step, index) => {
    const rest = tr.mapping.slice(index + 1);

    step.getMap().forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      if (newEnd <= newStart) return; // pure deletion — nothing was inserted

      const mappedFrom = rest.map(newStart, 1);
      const mappedTo = rest.map(newEnd, -1);
      if (mappedTo <= mappedFrom) return;

      from = from === null ? mappedFrom : Math.min(from, mappedFrom);
      to = to === null ? mappedTo : Math.max(to, mappedTo);
    });
  });

  if (from === null || to === null) return null;
  return { from, to };
}

/**
 * Records where content pasted from outside YAWP landed, as a mark on the
 * pasted text itself.
 *
 * A mark rather than a decoration or a stored offset: marks live on the
 * text nodes, so ProseMirror carries them through every later edit for
 * free, they serialize into the document HTML the server already persists,
 * and they cannot drift onto neighbouring text the way a saved character
 * offset would once the student edits above it.
 *
 * The mark is `inclusive: false` and typing inside a marked run clears the
 * stored mark (see handleTextInput), so text the student writes at either
 * edge of — or in the middle of — a pasted passage is never marked. The
 * pasted text on both sides keeps its mark; deleting pasted text shrinks
 * the run.
 *
 * Nothing here decides *whether* a paste came from outside. That rule lives
 * in use-paste-alert.ts / utils/internal-copy.ts, which calls
 * markLastPasteAsExternal() once it has decided, in the same synchronous
 * paste event.
 */
/**
 * The wall clock, never handing out the same instant twice. Two pastes inside
 * one millisecond are ordinary — a student pasting twice in a row, or a test
 * driving both in the same tick — and identical timestamps would silently
 * merge the two marked runs into one.
 */
function monotonicClock(): () => string {
  let last = 0;
  return () => {
    const next = Math.max(Date.now(), last + 1);
    last = next;
    return new Date(next).toISOString();
  };
}

export const PastedSource = Mark.create<PastedSourceOptions>({
  name: 'pastedSource',

  inclusive: false,

  addOptions() {
    return { now: monotonicClock() };
  },

  // Coexists with bold/italic/comment rather than replacing them.
  excludes: '',

  addAttributes() {
    return {
      eventId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-paste-event-id'),
        renderHTML: (attributes) => attributes.eventId ? { 'data-paste-event-id': attributes.eventId } : {},
      },
      at: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-pasted-at'),
        renderHTML: (attributes) => {
          if (!attributes.at) return {};
          return { 'data-pasted-at': attributes.at };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-pasted-source]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      {
        ...HTMLAttributes,
        'data-pasted-source': 'external',
        class: PASTED_SOURCE_CLASS,
      },
      0,
    ];
  },

  addCommands() {
    const { now } = this.options;

    return {
      markLastPasteAsExternal:
        (eventId) =>
        ({ state, tr, dispatch }) => {
          const range = pastedSourceKey.getState(state)?.lastPaste;
          if (!range) return false;

          if (dispatch) {
            tr.addMark(
              range.from,
              range.to,
              state.schema.marks.pastedSource.create({ at: now(), eventId: eventId ?? null })
            );
            dispatch(tr);
          }

          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<PastedSourceState>({
        key: pastedSourceKey,

        state: {
          init: () => ({ lastPaste: null }),

          // Only the transaction ProseMirror flags as a paste leaves a
          // range behind, and any later document change clears it. The
          // paste-alert listener runs synchronously inside the same paste
          // event, so it always sees a fresh range or none at all.
          apply(tr, value) {
            if (tr.getMeta('paste')) {
              return { lastPaste: insertedRangeFromTransaction(tr) };
            }
            if (tr.getMeta(SCRUB_META)) return value;
            if (tr.docChanged) return { lastPaste: null };
            return value;
          },
        },

        // Content inserted into the middle of a pasted run would otherwise
        // inherit the mark, which would read as "the student pasted this"
        // about text they typed themselves. Strip the mark from anything
        // any transaction inserts; the paste path re-applies it to the
        // pasted range immediately afterwards, and only when the paste came
        // from outside the app.
        appendTransaction(transactions, _oldState, newState) {
          const markType = newState.schema.marks.pastedSource;
          let cleanup: Transaction | null = null;

          transactions.forEach((transaction, index) => {
            if (!transaction.docChanged) return;
            if (transaction.getMeta(SCRUB_META)) return;
            if (transaction.getMeta(HISTORY_META)) return;

            const range = insertedRangeFromTransaction(transaction);
            if (!range) return;

            // Later transactions in the same batch can move the range.
            let from = range.from;
            let to = range.to;
            for (const later of transactions.slice(index + 1)) {
              from = later.mapping.map(from, 1);
              to = later.mapping.map(to, -1);
            }
            if (to <= from) return;
            if (!newState.doc.rangeHasMark(from, to, markType)) return;

            cleanup ??= newState.tr.setMeta(SCRUB_META, true);
            cleanup.removeMark(from, to, markType);
          });

          return cleanup;
        },

        props: {
          handleTextInput(view) {
            // Belt and braces with appendTransaction: clearing the stored
            // mark keeps the mark off the text as it is typed, so it never
            // flashes highlighted for a frame.
            const { state } = view;
            const markType = state.schema.marks.pastedSource;
            const isInside = state.selection.$from
              .marks()
              .some((mark) => mark.type === markType);

            if (isInside) {
              view.dispatch(state.tr.removeStoredMark(markType));
            }

            return false;
          },
        },
      }),
    ];
  },
});
