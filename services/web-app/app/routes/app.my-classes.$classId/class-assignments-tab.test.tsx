import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

let creationProps: any = null;

const actualReactRouter = await import('react-router');
mock.module('react-router', () => ({
  ...actualReactRouter,
  Form: ({ children, method: _method, ...props }: any) => (
    <form {...props}>{children}</form>
  ),
}));

mock.module('~/components/assignments/assignment-creation-sheet', () => ({
  AssignmentCreationSheet: (props: any) => {
    creationProps = props;
    return props.open ? <div data-testid="creation-sheet" /> : null;
  },
}));

const { createMemoryRouter, RouterProvider } = actualReactRouter;
const { ClassAssignmentsTab, clampAssignmentPaginationSkip } =
  await import('./class-assignments-tab');
type ClassAssignmentsTabAssignment =
  import('./class-assignments-tab').ClassAssignmentsTabAssignment;

const ASSIGNMENTS: ClassAssignmentsTabAssignment[] = [
  {
    id: 'assignment-1',
    classAssignmentId: 'class-assignment-1',
    title: 'The Gilded Age DBQ',
    prompt: 'Analyze the effects of industrialization.',
    submitForGrade: true,
    pointValue: 100,
    assignmentTypeId: 'type-1',
    assignmentType: {
      id: 'type-1',
      title: 'DBQ',
      systemKey: null,
    },
    tutorEnabled: false,
    gradedCount: 5,
    documentCount: 12,
    hasSharedWork: false,
    otherClassCount: 1,
    insight: null,
  },
  {
    id: 'assignment-2',
    classAssignmentId: 'class-assignment-2',
    title: 'APUSH LEQ',
    prompt: 'Assess the causes of westward expansion.',
    submitForGrade: true,
    pointValue: 100,
    assignmentTypeId: 'type-apush',
    assignmentType: {
      id: 'type-apush',
      title: 'AP History Essay',
      systemKey: 'ap_history_essay',
    },
    tutorEnabled: true,
    gradedCount: 2,
    documentCount: 7,
    hasSharedWork: false,
    otherClassCount: 0,
    insight: null,
  },
];

let root: Root | null = null;

function render(element: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const router = createMemoryRouter([{ path: '/', element }], {
    initialEntries: ['/'],
  });
  act(() => {
    root!.render(<RouterProvider router={router} />);
  });
  return container;
}

function renderTab(overrides: Record<string, unknown> = {}) {
  return render(
    <ClassAssignmentsTab
      classOption={{ id: 'class-1', name: 'History · Grade 9 • Period 2' }}
      assignments={ASSIGNMENTS}
      assignmentTypes={[
        {
          id: 'type-1',
          title: 'DBQ',
          collaborationSupported: false,
          gradesGrammar: false,
          kind: null,
        },
      ]}
      classInsightsEnabled
      onViewDocuments={() => {}}
      onSelectAssignment={() => {}}
      {...overrides}
    />
  );
}

function clickRow(el: HTMLElement, testId: string) {
  const cell = el.querySelector(`[data-testid="${testId}"]`) as HTMLElement;
  const row = cell.closest('tr')!;
  act(() => {
    row.dispatchEvent(new Event('click', { bubbles: true }));
  });
}

beforeEach(() => {
  creationProps = null;
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  document.body.innerHTML = '';
  root = null;
});

describe('ClassAssignmentsTab', () => {
  it('offers the AP History prompt library when the class can use that assignment type', () => {
    const el = renderTab({ apHistoryAssignmentTypeId: 'type-apush' });
    const link = el.querySelector('a[href="/app/assignment-types/type-apush?classId=class-1"]');

    expect(link?.textContent).toContain('AP History Essay');
  });

  it('opens class-scoped creation and keeps the class-detail columns', () => {
    const el = renderTab();

    expect(el.textContent).toContain('Assignment');
    expect(el.textContent).toContain('Type');
    expect(el.textContent).toContain('Graded');
    expect(el.textContent).toContain('Documents');

    const createButton = Array.from(el.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('New Assignment')
    )!;
    act(() => createButton.click());

    expect(el.querySelector('[data-testid="creation-sheet"]')).toBeTruthy();
    expect(creationProps).toMatchObject({
      entryPoint: 'class',
      fixedClassId: 'class-1',
      teacherClasses: [{ id: 'class-1', name: 'History · Grade 9 • Period 2' }],
    });
  });

  it('marks the tutor-off rows and leaves the ordinary ones unmarked', () => {
    const el = renderTab();

    const coldRow = el
      .querySelector('[data-testid="assignment-open-assignment-1"]')!
      .closest('tr')!;
    const warmRow = el
      .querySelector('[data-testid="assignment-open-assignment-2"]')!
      .closest('tr')!;

    expect(
      coldRow.querySelector('[data-testid="tutor-off-badge"]')?.textContent
    ).toBe('Tutor off');
    expect(warmRow.querySelector('[data-testid="tutor-off-badge"]')).toBeNull();
  });

  it('clicking a row calls onSelectAssignment with the assignment id — the detail is a full page now, not a sheet in place', () => {
    const onSelectAssignment = mock();
    const el = renderTab({ onSelectAssignment });
    clickRow(el, 'assignment-open-assignment-1');

    expect(onSelectAssignment).toHaveBeenCalledWith('assignment-1');
    // No sheet/dialog opens in place — the row click is a plain navigation.
    expect(el.querySelector('[role="dialog"]')).toBeFalsy();
  });

  it('clicking any row (including AP History rows) calls onSelectAssignment — edit-eligibility is decided on the detail page', () => {
    const onSelectAssignment = mock();
    const el = renderTab({ onSelectAssignment });
    clickRow(el, 'assignment-open-assignment-2');

    expect(onSelectAssignment).toHaveBeenCalledWith('assignment-2');
  });

  it('the row is entirely clickable — checkbox and Docs pill stop propagation and do not select the row', () => {
    const onViewDocuments = mock();
    const onSelectAssignment = mock();
    const el = renderTab({ onViewDocuments, onSelectAssignment });

    const checkbox = el.querySelector(
      '[aria-label="Select assignment The Gilded Age DBQ"]'
    ) as HTMLButtonElement;
    act(() => checkbox.click());
    expect(onSelectAssignment).not.toHaveBeenCalled();

    const docsPill = el.querySelector(
      '[aria-label="View documents for The Gilded Age DBQ"]'
    ) as HTMLButtonElement;
    act(() => docsPill.click());
    expect(onViewDocuments).toHaveBeenCalledWith('assignment-1');
    expect(onSelectAssignment).not.toHaveBeenCalled();
  });

  it('matches the Students table row hover/selected classes exactly', () => {
    const el = renderTab();
    const row = el
      .querySelector('[data-testid="assignment-open-assignment-1"]')!
      .closest('tr')!;
    // Same shape as the Students row: TableRow's shared base classes plus a
    // bare `cursor-pointer`, nothing else. No bespoke hover color — the
    // amber-on-hover regression came from a title-only button with its own
    // `hover:text-primary`, which is gone now that the whole row is the
    // click target.
    expect(row.className).toBe(
      'border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted cursor-pointer'
    );
    expect(row.className).not.toContain('hover:text-primary');
    expect(row.className).not.toContain('amber');

    const checkbox = el.querySelector(
      '[aria-label="Select assignment The Gilded Age DBQ"]'
    ) as HTMLButtonElement;
    act(() => checkbox.click());
    expect(row.getAttribute('data-state')).toBe('selected');
  });

  it('shows only the assignment title in the row — no subtitle or "also in" note', () => {
    const el = renderTab();
    expect(el.textContent).not.toContain('Analyze the effects');
    expect(el.textContent).not.toContain('Also in');
  });

  it('keeps search alongside the new management controls', () => {
    const el = renderTab();
    const search = el.querySelector(
      '[aria-label="Search assignments"]'
    ) as HTMLInputElement;

    expect(search.placeholder).toBe('Search assignments');
    // Matches the Students tab search bar exactly.
    expect(search.parentElement?.className).toContain('max-w-sm');
    expect(search.className).toContain('ring-black/5');
    expect(el.textContent).toContain('New Assignment');
  });

  it('sets an explicit themed foreground for inherited table and action text', () => {
    const el = renderTab();
    expect(el.firstElementChild?.className).toContain('text-foreground');
  });

  it('disables deletion when the selected assignment has shared group work', () => {
    const assignments = [
      { ...ASSIGNMENTS[0], hasSharedWork: true },
      ASSIGNMENTS[1],
    ];
    const el = renderTab({ assignments });
    const checkbox = el.querySelector(
      '[aria-label="Select assignment The Gilded Age DBQ"]'
    ) as HTMLButtonElement;

    act(() => checkbox.click());

    const deleteButton = el.querySelector(
      '[aria-label="Delete 1 assignment(s)"]'
    ) as HTMLButtonElement;
    expect(deleteButton.disabled).toBe(true);
  });

  it('keeps the creation close handler stable across tab rerenders', () => {
    const el = renderTab();
    const initialOnOpenChange = creationProps.onOpenChange;
    const createButton = Array.from(el.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('New Assignment')
    )!;

    act(() => createButton.click());

    expect(creationProps.onOpenChange).toBe(initialOnOpenChange);
  });

  describe('ap-history-in-new-assignment', () => {
    it('drops the AP History Essay toolbar link: the type is not a property of the class', () => {
      const el = renderTab({
        apHistoryAssignmentTypeId: 'type-apush',
        apHistoryInNewAssignment: true,
      });

      expect(el.querySelector('a[href^="/app/assignment-types/"]')).toBeNull();
      const toolbarLabels = Array.from(el.querySelectorAll('a,button')).map(
        (node) => node.textContent?.trim()
      );
      expect(toolbarLabels).not.toContain('AP History Essay');
    });

    it('hands the New Assignment sheet AP History as a library type that opens the library for this class', () => {
      renderTab({
        apHistoryAssignmentTypeId: 'type-apush',
        apHistoryInNewAssignment: true,
      });

      expect(creationProps.libraryAssignmentTypes).toEqual([
        {
          id: 'type-apush',
          title: 'AP History Essay',
          description: 'Opens the AP prompt library',
          href: '/app/assignment-types/type-apush?classId=class-1',
        },
      ]);
    });

    it('offers nothing extra when AP History is not available to the class', () => {
      renderTab({ apHistoryInNewAssignment: true });
      expect(creationProps.libraryAssignmentTypes ?? []).toEqual([]);
    });

    it('flag off keeps the legacy toolbar link and adds nothing to the sheet', () => {
      const el = renderTab({ apHistoryAssignmentTypeId: 'type-apush' });
      expect(
        el.querySelector(
          'a[href="/app/assignment-types/type-apush?classId=class-1"]'
        )
      ).toBeTruthy();
      expect(creationProps.libraryAssignmentTypes ?? []).toEqual([]);
    });
  });

  describe('assignments-grouped-by-type', () => {
    const EXIT_TICKETS: ClassAssignmentsTabAssignment[] = [
      {
        ...ASSIGNMENTS[0],
        id: 'exit-1',
        classAssignmentId: 'ca-exit-1',
        title: 'Exit ticket: Thursday',
        assignmentTypeId: 'type-exit',
        assignmentType: { id: 'type-exit', title: 'Exit Ticket', systemKey: null },
      },
      {
        ...ASSIGNMENTS[0],
        id: 'exit-2',
        classAssignmentId: 'ca-exit-2',
        title: 'Exit ticket: Friday',
        assignmentTypeId: 'type-exit',
        assignmentType: { id: 'type-exit', title: 'Exit Ticket', systemKey: null },
      },
    ];
    const GROUPED = [...ASSIGNMENTS, ...EXIT_TICKETS];

    function sections(el: HTMLElement) {
      return Array.from(
        el.querySelectorAll<HTMLElement>('[data-testid^="assignment-type-section-"]')
      );
    }

    it('renders one section per assignment type, in alphabetical order, each headed with its title and count', () => {
      const el = renderTab({ assignments: GROUPED, groupedByType: true });
      const found = sections(el);

      expect(found.map((node) => node.dataset.assignmentTypeTitle)).toEqual([
        'AP History Essay',
        'DBQ',
        'Exit Ticket',
      ]);
      const exit = el.querySelector(
        '[data-testid="assignment-type-section-type-exit"]'
      )!;
      const heading = exit.querySelector('button[aria-expanded]')!;
      expect(heading.textContent).toBe('Exit Ticket2');
      expect(heading.getAttribute('aria-expanded')).toBe('true');
      expect(exit.textContent).toContain('Exit ticket: Thursday');
      expect(exit.textContent).toContain('Exit ticket: Friday');
      expect(exit.textContent).not.toContain('The Gilded Age DBQ');
    });

    it('drops the Type column inside sections — the heading already says it', () => {
      const el = renderTab({ assignments: GROUPED, groupedByType: true });
      const heads = Array.from(
        sections(el)[0].querySelectorAll('th')
      ).map((th) => th.textContent?.trim());
      expect(heads).not.toContain('Type');
      expect(heads).toContain('Documents');
    });

    it('collapses a section from its heading', () => {
      const el = renderTab({ assignments: GROUPED, groupedByType: true });
      const exit = el.querySelector(
        '[data-testid="assignment-type-section-type-exit"]'
      )!;
      const heading = exit.querySelector(
        'button[aria-expanded]'
      ) as HTMLButtonElement;

      act(() => heading.click());

      expect(heading.getAttribute('aria-expanded')).toBe('false');
      const content = document.getElementById(
        heading.getAttribute('aria-controls')!
      );
      expect(
        content === null || content.getAttribute('data-state') === 'closed'
      ).toBe(true);
    });

    it("a section's select-all checkbox selects just that section", () => {
      const el = renderTab({ assignments: GROUPED, groupedByType: true });
      const exit = el.querySelector(
        '[data-testid="assignment-type-section-type-exit"]'
      )!;
      const selectAll = exit.querySelector(
        '[aria-label="Select all Exit Ticket assignments"]'
      ) as HTMLButtonElement;

      act(() => selectAll.click());

      expect(el.querySelector('[aria-label="Delete 2 assignment(s)"]')).toBeTruthy();
    });

    it('still opens an assignment from a row inside a section', () => {
      const onSelectAssignment = mock();
      const el = renderTab({
        assignments: GROUPED,
        groupedByType: true,
        onSelectAssignment,
      });
      clickRow(el, 'assignment-open-exit-2');
      expect(onSelectAssignment).toHaveBeenCalledWith('exit-2');
    });

    it('flag off renders the single flat table', () => {
      const el = renderTab({ assignments: GROUPED });
      expect(sections(el)).toHaveLength(0);
      expect(el.querySelectorAll('table')).toHaveLength(1);
    });
  });

  it('clamps pagination to the last populated page after rows are removed', () => {
    expect(clampAssignmentPaginationSkip(40, 20, 21)).toBe(20);
    expect(clampAssignmentPaginationSkip(20, 20, 20)).toBe(0);
    expect(clampAssignmentPaginationSkip(20, 20, 0)).toBe(0);
  });
});
