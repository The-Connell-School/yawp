import { describe, expect, test } from 'bun:test';
import {
  clearDevPanelState,
  parseDevPanelState,
  readDevPanelState,
  writeDevPanelState,
} from './dev-panel-storage';
import { DEV_PANEL_STORAGE_KEY } from './dev-panel-types';

describe('dev panel storage', () => {
  test('corrupt storage yields closed default', () => {
    const storage = {
      getItem: () => '{not json',
      setItem: () => {},
      removeItem: () => {},
    } as unknown as Storage;
    expect(readDevPanelState(storage).open).toBe(false);
  });

  test('persists and restores nested form draft', () => {
    const bag = new Map<string, string>();
    const storage = {
      getItem: (key: string) => bag.get(key) ?? null,
      setItem: (key: string, value: string) => {
        bag.set(key, value);
      },
      removeItem: (key: string) => {
        bag.delete(key);
      },
    } as unknown as Storage;
    writeDevPanelState(storage, {
      open: true,
      openSections: ['sign-in', 'free-tier-states'],
      org: 'org-1',
      subSheet: 'give-feedback',
      scroll: { main: 12, sub: 34 },
      forms: {
        feedbackNote: 'Partly typed note',
        throwawaySwitch: false,
        selectedStateId: 'approved.usage-a-few-left',
      },
    });
    const restored = readDevPanelState(storage);
    expect(restored.open).toBe(true);
    expect(restored.subSheet).toBe(null);
    expect(restored.openSections).toContain('give-feedback');
    expect(restored.forms.feedbackNote).toBe('Partly typed note');
    expect(restored.forms.selectedStateId).toBe('approved.usage-a-few-left');
    clearDevPanelState(storage);
    expect(bag.has(DEV_PANEL_STORAGE_KEY)).toBe(false);
  });

  test('parse rejects invalid subSheet', () => {
    expect(
      parseDevPanelState({
        open: true,
        openSections: [],
        org: null,
        subSheet: 'unknown',
        scroll: {},
        forms: {},
      })?.subSheet
    ).toBe(null);
  });
});
