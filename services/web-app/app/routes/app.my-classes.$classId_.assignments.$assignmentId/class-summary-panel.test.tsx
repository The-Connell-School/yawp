import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, test } from 'bun:test';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ClassSummaryPanel } from './class-summary-panel';

const existingSummary = {
  id: 'summary-1',
  generatedAt: new Date().toISOString(),
  gradedAtGeneration: 4,
  totalAtGeneration: 6,
  summaryJson: {
    version: 1,
    strengths: ['Students used specific textual evidence.'],
    weaknesses: ['Topic sentences need sharper claims.'],
    focusAreas: ['Practice claim-first paragraph revision.'],
  },
  lastMilestone: 50,
};

function render(element: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(element);
  });

  return { root };
}

function cleanup(root: Root | null) {
  if (root) {
    act(() => {
      root.unmount();
    });
  }
  document.body.innerHTML = '';
}

describe('ClassSummaryPanel', () => {
  let root: Root | null = null;

  afterEach(() => {
    cleanup(root);
    root = null;
  });

  test('renders class summary actions through shared RQI menu/dialog primitives', async () => {
    root = render(
      <ClassSummaryPanel
        assignmentId="assignment-1"
        existingSummary={existingSummary}
        gradedCount={4}
        totalStudents={6}
      />
    ).root;

    const menuTrigger = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Class summary actions"]'
    );
    expect(menuTrigger).not.toBeNull();
    expect(menuTrigger!.getAttribute('data-slot')).toBe(
      'class-summary-actions-trigger'
    );

    await act(async () => {
      menuTrigger!.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          button: 0,
          ctrlKey: false,
        })
      );
      await Promise.resolve();
    });

    expect(document.querySelector('[role="menu"]')).not.toBeNull();
    expect(document.body.textContent).toContain('Collapse summary');
    expect(document.body.textContent).toContain('Regenerate summary');

    const regenerateItem = Array.from(
      document.querySelectorAll<HTMLElement>('[role="menuitem"]')
    ).find((item) => item.textContent?.includes('Regenerate summary'));
    expect(regenerateItem).not.toBeNull();

    await act(async () => {
      regenerateItem!.click();
      await Promise.resolve();
    });

    const dialog = document.querySelector('[role="alertdialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog!.textContent).toContain('Regenerate class summary?');
  });
});
