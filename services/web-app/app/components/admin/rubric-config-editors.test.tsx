import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, it, mock } from 'bun:test';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const { CategoryEditSheetContent } = await import('./rubric-config-editors');

function render(element: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(element);
  });

  return { root, container };
}

function scoreLabelInputs(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll('[id^="category-edit-score-label-"]')
  ) as HTMLInputElement[];
}

const baseCategory = {
  id: 'row-1',
  key: 'thesis',
  label: 'Thesis',
  weight: 0.5,
  description: 'Clear claim',
};

describe('CategoryEditSheetContent', () => {
  let root: Root | null = null;

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    document.body.innerHTML = '';
  });

  // Requirement: the number of score-label rows always tracks the current
  // scoring scale (max - min + 1), on whatever path populated the category —
  // this component is the single editing surface every path (manual add,
  // paste-extract, PDF-extract, copy-from) renders through.
  it('shows one score-label row per value in the min..max range', () => {
    const rendered = render(
      <CategoryEditSheetContent
        category={baseCategory}
        minScore={1}
        maxScore={5}
        onSave={() => {}}
        onRemove={() => {}}
        renderSheet={false}
      />
    );
    root = rendered.root;

    expect(scoreLabelInputs(rendered.container)).toHaveLength(5);
  });

  it('re-renders the row count when the range changes (e.g. after an import)', () => {
    const rendered = render(
      <CategoryEditSheetContent
        category={baseCategory}
        minScore={1}
        maxScore={5}
        onSave={() => {}}
        onRemove={() => {}}
        renderSheet={false}
      />
    );
    root = rendered.root;
    expect(scoreLabelInputs(rendered.container)).toHaveLength(5);

    act(() => {
      rendered.root.render(
        <CategoryEditSheetContent
          category={baseCategory}
          minScore={0}
          maxScore={3}
          onSave={() => {}}
          onRemove={() => {}}
          renderSheet={false}
        />
      );
    });

    expect(scoreLabelInputs(rendered.container)).toHaveLength(4);
  });

  it('reports dirty as soon as a field diverges from the saved category', () => {
    const onDirtyChange = mock();
    const rendered = render(
      <CategoryEditSheetContent
        category={baseCategory}
        minScore={1}
        maxScore={5}
        onSave={() => {}}
        onRemove={() => {}}
        onDirtyChange={onDirtyChange}
        renderSheet={false}
      />
    );
    root = rendered.root;

    expect(onDirtyChange).toHaveBeenLastCalledWith(false);

    // Toggling the feedback switch is a click-driven change, which happy-dom
    // simulates reliably (unlike synthesizing native text-input typing).
    const feedbackSwitch = rendered.container.querySelector(
      '#category-edit-feedback-enabled'
    ) as HTMLElement;
    act(() => {
      feedbackSwitch.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true })
      );
    });

    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });

  it('does not report dirty for a score label left untouched', () => {
    const onDirtyChange = mock();
    const rendered = render(
      <CategoryEditSheetContent
        category={{ ...baseCategory, scoreLabels: [{ value: 3, label: 'Proficient' }] }}
        minScore={1}
        maxScore={5}
        onSave={() => {}}
        onRemove={() => {}}
        onDirtyChange={onDirtyChange}
        renderSheet={false}
      />
    );
    root = rendered.root;

    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it('Done saves every editable field, including score labels', () => {
    const onSave = mock();
    const rendered = render(
      <CategoryEditSheetContent
        category={{ ...baseCategory, scoreLabels: [{ value: 5, label: 'Exemplary' }] }}
        minScore={1}
        maxScore={5}
        onSave={onSave}
        onRemove={() => {}}
        renderSheet={false}
      />
    );
    root = rendered.root;

    const doneButton = Array.from(
      rendered.container.querySelectorAll('button')
    ).find((button) => button.textContent === 'Done')!;
    act(() => {
      doneButton.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true })
      );
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'Thesis',
        weight: 0.5,
        description: 'Clear claim',
        scoreLabels: [{ value: 5, label: 'Exemplary' }],
      })
    );
  });

  it('Remove category calls onRemove', () => {
    const onRemove = mock();
    const rendered = render(
      <CategoryEditSheetContent
        category={baseCategory}
        minScore={1}
        maxScore={5}
        onSave={() => {}}
        onRemove={onRemove}
        renderSheet={false}
      />
    );
    root = rendered.root;

    const removeButton = Array.from(
      rendered.container.querySelectorAll('button')
    ).find((button) => button.textContent?.includes('Remove category'))!;
    act(() => {
      removeButton.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true })
      );
    });

    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  // Requirement 4: Remove/Done sit in a footer pinned to the bottom, with a
  // border on top, and the body around it scrolls instead of the footer
  // moving — the same SHEET_STICKY_FOOTER_CLASS_NAME / SHEET_SCROLL_BODY_CLASS_NAME
  // pair the codebase already defines for this in `~/components/ui/sheet`.
  it('pins the footer to the bottom with a scrollable body above it', () => {
    const rendered = render(
      <CategoryEditSheetContent
        category={baseCategory}
        minScore={1}
        maxScore={5}
        onSave={() => {}}
        onRemove={() => {}}
        renderSheet={false}
      />
    );
    root = rendered.root;

    const footer = Array.from(rendered.container.querySelectorAll('div')).find(
      (div) => div.className.includes('mt-auto') && div.className.includes('border-t')
    );
    expect(footer).toBeTruthy();

    const scrollBody = Array.from(rendered.container.querySelectorAll('div')).find(
      (div) => div.className.includes('overflow-y-auto') && div.className.includes('flex-1')
    );
    expect(scrollBody).toBeTruthy();
  });
});
