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

mock.module('react-router', () => ({
  Link: (props: { children?: unknown }) => props.children,
  useNavigate: () => () => {},
}));

const { TeacherDocumentWorkPanel } = await import(
  './teacher-document-work-panel'
);

function render(element: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('document work toolbar buttons', () => {
  it('uses one letterpress outline style for Filter and List, and primary for Actions', () => {
    const { container, root } = render(
      <TeacherDocumentWorkPanel
        tableLabel="Documents"
        documents={[]}
        statusCounts={{
          'in-progress': 0,
          'needs-grading': 0,
          graded: 0,
          released: 0,
        }}
        students={[]}
        assignments={[]}
        exitTo="/app"
        filters={{
          studentIds: [],
          classIds: [],
          assignmentIds: [],
          status: 'all',
          group: 'none',
          query: '',
        }}
        onFiltersChange={() => {}}
        onClearFilters={() => {}}
        collapsedGroups={new Set()}
        onCollapsedGroupsChange={() => {}}
        actions={[{ id: 'release', label: 'Release grades', onSelect: () => {} }]}
      />
    );

    const filter = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Filter')
    );
    const actions = container.querySelector(
      '[data-testid="teacher-document-work-actions"]'
    );
    const group = container.querySelector(
      '[data-testid="teacher-document-work-group-select"]'
    );

    expect(filter?.classList.contains('btn')).toBe(true);
    expect(filter?.classList.contains('btn--secondary')).toBe(true);
    expect(filter?.classList.contains('btn--sm')).toBe(false);
    expect(filter?.className.includes('h-9')).toBe(false);
    expect(filter?.className.includes('rounded-full')).toBe(false);

    expect(group?.classList.contains('btn')).toBe(true);
    expect(group?.classList.contains('btn--secondary')).toBe(true);
    expect(group?.classList.contains('btn--sm')).toBe(false);
    expect(group?.className.includes('h-9')).toBe(false);
    expect(group?.className.includes('h-10')).toBe(false);
    expect(group?.className.includes('rounded-md')).toBe(false);
    expect(group?.className.includes('border-input')).toBe(false);

    expect(actions?.classList.contains('btn')).toBe(true);
    expect(actions?.classList.contains('btn--primary')).toBe(true);
    expect(actions?.classList.contains('btn--sm')).toBe(false);
    expect(actions?.className.includes('h-9')).toBe(false);
    expect(actions?.className.includes('rounded-full')).toBe(false);

    act(() => {
      root.unmount();
    });
  });
});
