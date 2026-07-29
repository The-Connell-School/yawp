import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, it } from 'bun:test';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ClassCheckboxList } from './class-checkbox-list';

const classes = [
  { id: 'class-1', label: 'English 9 - Period 1' },
  { id: 'class-2', label: 'English 10 - Period 3' },
  { id: 'class-3', label: 'AP US History - Period 5' },
];

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

function checkboxes() {
  return Array.from(
    document.querySelectorAll('[role="checkbox"]')
  ) as HTMLElement[];
}

describe('ClassCheckboxList', () => {
  let root: Root | null = null;

  afterEach(() => {
    cleanup(root);
    root = null;
  });

  it('renders one checkbox per class, not a single-select dropdown', () => {
    ({ root } = render(
      <ClassCheckboxList
        idPrefix="test"
        classes={classes}
        selectedIds={[]}
        onToggle={() => {}}
      />
    ));

    expect(checkboxes()).toHaveLength(3);
    expect(document.querySelectorAll('select')).toHaveLength(0);
    expect(document.body.textContent).toContain('English 10 - Period 3');
  });

  it('selects nothing by default so a class is always a deliberate choice', () => {
    ({ root } = render(
      <ClassCheckboxList
        idPrefix="test"
        classes={classes}
        selectedIds={[]}
        onToggle={() => {}}
      />
    ));

    for (const box of checkboxes()) {
      expect(box.getAttribute('aria-checked')).toBe('false');
    }
  });

  it('reflects several classes checked at once', () => {
    ({ root } = render(
      <ClassCheckboxList
        idPrefix="test"
        classes={classes}
        selectedIds={['class-1', 'class-3']}
        onToggle={() => {}}
      />
    ));

    const checked = checkboxes().map(
      (box) => box.getAttribute('aria-checked') === 'true'
    );
    expect(checked).toEqual([true, false, true]);
  });

  it('reports the class that was toggled', () => {
    const toggled: string[] = [];
    ({ root } = render(
      <ClassCheckboxList
        idPrefix="test"
        classes={classes}
        selectedIds={[]}
        onToggle={(id) => toggled.push(id)}
      />
    ));

    act(() => {
      checkboxes()[1]?.click();
    });

    expect(toggled).toEqual(['class-2']);
  });

  it('emits one classIds form value per selected class', () => {
    ({ root } = render(
      <ClassCheckboxList
        idPrefix="test"
        classes={classes}
        selectedIds={['class-2', 'class-3']}
        onToggle={() => {}}
        name="classIds"
      />
    ));

    const values = Array.from(
      document.querySelectorAll('input[name="classIds"]')
    ).map((input) => (input as HTMLInputElement).value);

    expect(values).toEqual(['class-2', 'class-3']);
  });

  it('emits no form values when nothing is selected', () => {
    ({ root } = render(
      <ClassCheckboxList
        idPrefix="test"
        classes={classes}
        selectedIds={[]}
        onToggle={() => {}}
        name="classIds"
      />
    ));

    expect(document.querySelectorAll('input[name="classIds"]')).toHaveLength(0);
  });

  it('shows the empty message when the teacher has no classes', () => {
    ({ root } = render(
      <ClassCheckboxList
        idPrefix="test"
        classes={[]}
        selectedIds={[]}
        onToggle={() => {}}
        emptyMessage="No classes yet."
      />
    ));

    expect(checkboxes()).toHaveLength(0);
    expect(document.body.textContent).toContain('No classes yet.');
  });

  it('disables every checkbox while saving', () => {
    ({ root } = render(
      <ClassCheckboxList
        idPrefix="test"
        classes={classes}
        selectedIds={[]}
        onToggle={() => {}}
        disabled
      />
    ));

    for (const box of checkboxes()) {
      expect(box.hasAttribute('disabled')).toBe(true);
    }
  });
});
