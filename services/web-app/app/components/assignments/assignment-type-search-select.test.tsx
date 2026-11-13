import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { describe, expect, it } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const types = [
  {
    id: 'class-starter',
    title: 'Class Starter',
    collaborationSupported: false,
    gradesGrammar: true,
    kind: 'class_starter',
  },
  {
    id: 'prewriting',
    title: 'Prewriting',
    collaborationSupported: false,
    gradesGrammar: true,
    kind: 'prewriting',
  },
];

describe('AssignmentTypeSearchSelect', () => {
  it('exposes a searchable combobox trigger', async () => {
    const { AssignmentTypeSearchSelect } = await import(
      './assignment-type-search-select'
    );
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    act(() => {
      root.render(
        <AssignmentTypeSearchSelect
          assignmentTypes={types}
          value="class-starter"
          onValueChange={() => {}}
        />
      );
    });

    const trigger = container.querySelector('[role="combobox"]');
    expect(trigger).not.toBeNull();
    expect(trigger?.textContent).toContain('Class Starter');

    act(() => root.unmount());
    container.remove();
  });
});
