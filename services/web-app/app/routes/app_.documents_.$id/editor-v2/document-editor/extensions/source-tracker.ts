import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { RECOVERY_SOURCE } from '../use-pm-tripwire';

export const USER_SOURCE_META = 'yawp-pm-source';

const sourceTrackerKey = new PluginKey('source-tracker');

/**
 * PM plugin that tags every transaction whose origin can be traced
 * to a user input DOM event. Uses a flag toggled by DOM event listeners;
 * the flag is reset on the next microtask so it only catches transactions
 * dispatched synchronously from a user event handler.
 */
export const SourceTracker = Extension.create({
  name: 'sourceTracker',

  addProseMirrorPlugins() {
    let userEventActive = false;
    /** TipTap/PM may normalize parsed HTML on mount without a user event. */
    let bootstrapTransactionsRemaining = 4;

    const view = this.editor.view;
    const dom = view.dom as HTMLElement;

    const userEvents = ['keydown', 'paste', 'drop', 'input', 'compositionend', 'cut'];
    const handlers: Array<[string, EventListener]> = [];

    const wrap = (eventName: string) => {
      const handler: EventListener = () => {
        userEventActive = true;
        // Reset on next tick — the resulting PM transaction will fire
        // before this microtask drains.
        queueMicrotask(() => { userEventActive = false; });
      };
      dom.addEventListener(eventName, handler, { capture: true });
      handlers.push([eventName, handler]);
    };

    userEvents.forEach(wrap);

    return [
      new Plugin({
        key: sourceTrackerKey,
        filterTransaction(tr) {
          // Tag user-originated docChanged transactions in place.
          // filterTransaction fires before the transaction is applied,
          // so setting meta here makes it visible to all downstream consumers.
          if (userEventActive && tr.docChanged) {
            tr.setMeta(USER_SOURCE_META, 'user');
          } else if (
            bootstrapTransactionsRemaining > 0 &&
            tr.docChanged &&
            !tr.getMeta(USER_SOURCE_META)
          ) {
            tr.setMeta(USER_SOURCE_META, RECOVERY_SOURCE);
            bootstrapTransactionsRemaining -= 1;
          }
          return true; // never block
        },
      }),
    ];
  },
});
