import { useEffect } from 'react';
import type { Editor } from '@tiptap/core';
import { USER_SOURCE_META } from './extensions/source-tracker';

export const RECOVERY_SOURCE = 'recovery-on-mount';
const ALLOWED_SOURCES = new Set(['user', RECOVERY_SOURCE]);

declare global {
  interface Window {
    __yawpUnauthorizedPmWrites?: number;
  }
}

/**
 * Pure predicate: returns null if the transaction is authorized,
 * or an error message string if it represents an unauthorized PM mutation.
 *
 * A transaction is unauthorized if it changes the document content but
 * lacks a recognized source meta (set by SourceTracker for user input,
 * or 'recovery-on-mount' for the IDB hydration write).
 */
export function checkPmTransaction(transaction: any): string | null {
  if (!transaction.docChanged) return null;
  const source = transaction.getMeta(USER_SOURCE_META);
  if (ALLOWED_SOURCES.has(source)) return null;
  const stepCount = transaction.steps?.length ?? 0;
  return `Unauthorized PM mutation. steps=${stepCount}, source=${source ?? 'null'}`;
}

/**
 * Non-React subscriber. Wires checkPmTransaction into the editor's
 * transaction stream. Returns an unsubscribe function.
 *
 * In dev mode: throws on violation (catches regressions immediately during development).
 * In prod mode: logs to console.error + increments window.__yawpUnauthorizedPmWrites
 * (which E2E tests can read to verify zero unauthorized writes occurred).
 */
export function installPmTripwire(
  editor: Editor,
  options: { dev?: boolean } = {}
): () => void {
  const isDev = options.dev ?? (process.env.NODE_ENV !== 'production');

  const handler = ({ transaction }: { transaction: any }) => {
    const violation = checkPmTransaction(transaction);
    if (!violation) return;

    if (isDev) {
      throw new Error(violation);
    }
    console.error(violation);
    window.__yawpUnauthorizedPmWrites = (window.__yawpUnauthorizedPmWrites ?? 0) + 1;
  };

  editor.on('transaction', handler);
  return () => {
    editor.off('transaction', handler);
  };
}

/**
 * React hook wrapper. Installs the tripwire on the editor's transaction
 * stream and removes it when the editor changes or unmounts.
 */
export function usePmTripwire(editor: Editor | null) {
  useEffect(() => {
    if (!editor) return;
    return installPmTripwire(editor, {
      dev: process.env.NODE_ENV !== 'production',
    });
  }, [editor]);
}
