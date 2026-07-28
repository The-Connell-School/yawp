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

const submit = mock();
const fetcher = {
  state: 'idle',
  data: null,
  submit,
};
let creationProps: any = null;
let editProps: any = null;

const actualReactRouter = await import('react-router');
mock.module('react-router', () => ({
  ...actualReactRouter,
  Form: ({ children, method: _method, ...props }: any) => (
    <form {...props}>{children}</form>
  ),
  useFetcher: () => fetcher,
}));

mock.module('~/components/assignments/assignment-creation-sheet', () => ({
  AssignmentCreationSheet: (props: any) => {
    creationProps = props;
    return props.open ? <div data-testid="creation-sheet" /> : null;
  },
}));

mock.module('~/components/assignments/assignment-edit-sheet', () => ({
  AssignmentEditSheet: (props: any) => {
    editProps = props;
    return props.open ? <div data-testid="edit-sheet" /> : null;
  },
}));

const { MemoryRouter } = actualReactRouter;
const { ClassAssignmentsTab } = await import('./class-assignments-tab');
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
    gradedCount: 5,
    documentCount: 12,
    otherClasses: [
      {
        id: 'class-2',
        grade: '10',
        period: '3',
        title: 'US History',
      },
    ],
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
    gradedCount: 2,
    documentCount: 7,
    otherClasses: [],
  },
];

let root: Root | null = null;

function render(element: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(<MemoryRouter>{element}</MemoryRouter>);
  });
  return container;
}

function renderTab(overrides: Record<string, unknown> = {}) {
  return render(
    <ClassAssignmentsTab
      classOption={{ id: 'class-1', name: 'Grade 9 • Period 2 — History' }}
      assignments={ASSIGNMENTS}
      assignmentTypes={[{ id: 'type-1', title: 'DBQ' }]}
      classInsightsEnabled
      onViewDocuments={() => {}}
      onViewSummary={() => {}}
      {...overrides}
    />
  );
}

beforeEach(() => {
  submit.mockReset();
  creationProps = null;
  editProps = null;
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  document.body.innerHTML = '';
  root = null;
});

describe('ClassAssignmentsTab', () => {
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
      teacherClasses: [
        { id: 'class-1', name: 'Grade 9 • Period 2 — History' },
      ],
    });
  });

  it('opens editable titles while leaving AP History rows read-only', () => {
    const el = renderTab();
    const editableTitle = el.querySelector(
      '[data-testid="assignment-open-assignment-1"]'
    ) as HTMLButtonElement;
    const apHistoryTitle = el.querySelector(
      '[data-testid="assignment-open-assignment-2"]'
    ) as HTMLButtonElement;

    expect(editableTitle.disabled).toBe(false);
    expect(apHistoryTitle.disabled).toBe(true);
    act(() => editableTitle.click());

    expect(el.querySelector('[data-testid="edit-sheet"]')).toBeTruthy();
    expect(editProps.editingAssignment.id).toBe('assignment-1');
    expect(editProps.pdfClassId).toBe('class-1');
  });

  it('prefills class-scoped creation when duplicating an editable assignment', () => {
    const el = renderTab();
    const duplicateButton = el.querySelector(
      '[aria-label="Duplicate The Gilded Age DBQ"]'
    ) as HTMLButtonElement;
    act(() => duplicateButton.click());

    expect(creationProps).toMatchObject({
      entryPoint: 'class',
      fixedClassId: 'class-1',
      fixedAssignmentTypeId: 'type-1',
      initialTitle: 'Copy of The Gilded Age DBQ',
      initialPrompt: 'Analyze the effects of industrialization.',
    });
  });

  it('uses a dedicated summary action and disables row actions during selection', () => {
    const onViewSummary = mock();
    const el = renderTab({ onViewSummary });
    const summaryButton = el.querySelector(
      '[aria-label="Open class performance summary for The Gilded Age DBQ"]'
    ) as HTMLButtonElement;

    act(() => summaryButton.click());
    expect(onViewSummary).toHaveBeenCalledWith('class-assignment-1');

    const checkbox = el.querySelector(
      '[aria-label="Select assignment The Gilded Age DBQ"]'
    ) as HTMLButtonElement;
    act(() => checkbox.click());

    expect(summaryButton.disabled).toBe(true);
    expect(
      (
        el.querySelector(
          '[data-testid="assignment-open-assignment-1"]'
        ) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    expect(
      el.querySelector('[aria-label="Delete 1 assignment(s)"]')
    ).toBeTruthy();
  });

  it('shows a compact indicator when an assignment is deployed elsewhere', () => {
    const el = renderTab();
    expect(el.textContent).toContain('Also in 1 other class');
    expect(el.textContent).not.toContain('Grade 10 • Period 3 — US History');
  });

  it('keeps search alongside the new management controls', () => {
    const el = renderTab();
    const search = el.querySelector(
      '[aria-label="Search assignments"]'
    ) as HTMLInputElement;

    expect(search.placeholder).toBe('Search assignments');
    expect(el.textContent).toContain('New Assignment');
  });
});
