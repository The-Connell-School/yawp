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

const { AssignmentClasses } = await import('./assignment-classes');

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render(element: ReactElement) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(element);
  });
  return container;
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

const classes = [
  { id: 'class-1', label: 'Grade 9th • Period 1st' },
  { id: 'class-2', label: 'Grade 9th • Period 2nd' },
  { id: 'class-3', label: 'Honors · Grade 10th • Period 2nd' },
];

describe('AssignmentClasses', () => {
  test('gives each class its own chip rather than one comma-joined string', () => {
    const el = render(<AssignmentClasses classes={classes.slice(0, 2)} />);

    const chips = [...el.querySelectorAll('span')].map((node) =>
      node.textContent?.trim()
    );
    expect(chips).toContain('Grade 9th • Period 1st');
    expect(chips).toContain('Grade 9th • Period 2nd');
    expect(el.textContent).not.toContain('Period 1st, Grade');
  });

  test('collapses the classes past the first two into a +N control', () => {
    const el = render(<AssignmentClasses classes={classes} />);

    const more = el.querySelector('button');
    expect(more?.textContent).toBe('+1');
    // Screen readers never see the tooltip, so the collapsed classes have to
    // ride on the control itself.
    expect(more?.getAttribute('aria-label')).toBe(
      'Also assigned to Honors · Grade 10th • Period 2nd'
    );
  });

  test('shows no +N control when every class already has a chip', () => {
    const el = render(<AssignmentClasses classes={classes.slice(0, 2)} />);

    expect(el.querySelector('button')).toBeNull();
  });

  test('renders a single class as one chip', () => {
    const el = render(<AssignmentClasses classes={classes.slice(0, 1)} />);

    expect(el.textContent).toBe('Grade 9th • Period 1st');
    expect(el.querySelector('button')).toBeNull();
  });
});
