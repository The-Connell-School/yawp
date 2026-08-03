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
const load = mock();
// A single fetcher stub shared by every useFetcher() call in the tree —
// the edit form, and the real ClassInsightsPanel/CategoryCard rendered
// through the unmocked AssignmentSummarySheetContent.
const fetcher: {
  state: string;
  data: unknown;
  submit: typeof submit;
  load: typeof load;
} = {
  state: 'idle',
  data: null,
  submit,
  load,
};
let creationProps: any = null;
let editFormProps: any = null;

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
  AssignmentEditForm: (props: any) => {
    editFormProps = props;
    return <div data-testid="edit-form">Editing {props.editingAssignment.id}</div>;
  },
}));

// The real Sheet/SheetContent wrap Radix's Dialog.Title/Description, which
// need a live Dialog context to avoid warnings. Swap in plain markup — this
// also flows through to assignment-summary-sheet.tsx's unmocked import of
// the same module, so its header renders as ordinary elements too.
mock.module('~/components/ui/sheet', () => ({
  Sheet: ({ children, open }: any) => (open ? <>{children}</> : null),
  SheetContent: ({ children, className }: any) => (
    <div data-testid="assignment-sheet" className={className}>
      {children}
    </div>
  ),
  SheetHeader: ({ children }: any) => <div>{children}</div>,
  SheetTitle: ({ children }: any) => <h2>{children}</h2>,
  SheetDescription: ({ children }: any) => <p>{children}</p>,
  SheetFooter: ({ children, className, ...props }: any) => (
    <div data-testid="assignment-sheet-footer" className={className} {...props}>
      {children}
    </div>
  ),
  SHEET_SCROLL_BODY_CLASS_NAME: 'sheet-scroll-body',
  SHEET_STICKY_FOOTER_CLASS_NAME: 'border-t bg-background',
}));

const { MemoryRouter } = actualReactRouter;
const {
  ClassAssignmentsTab,
  clampAssignmentPaginationSkip,
} = await import('./class-assignments-tab');
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
    gradedCount: 2,
    documentCount: 7,
    otherClassCount: 0,
    insight: null,
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
  submit.mockReset();
  load.mockReset();
  fetcher.state = 'idle';
  fetcher.data = null;
  creationProps = null;
  editFormProps = null;
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

  it('clicking a row opens the sheet in view mode, not edit', () => {
    const el = renderTab();
    clickRow(el, 'assignment-open-assignment-1');

    expect(el.querySelector('[data-testid="assignment-sheet"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="edit-form"]')).toBeFalsy();
    // View mode identity content, from the real AssignmentSummarySheetContent.
    expect(el.textContent).toContain('The Gilded Age DBQ');
    expect(el.textContent).toContain('Class performance summary');
  });

  it('pins Duplicate and Edit in a bordered footer when viewing an assignment', () => {
    const el = renderTab();
    clickRow(el, 'assignment-open-assignment-1');

    const footer = el.querySelector('[data-testid="assignment-sheet-footer"]');
    expect(footer).toBeTruthy();
    expect(footer?.className).toContain('border-t');
    expect(footer?.textContent).toContain('Duplicate');
    expect(footer?.textContent).toContain('Edit');
  });

  it('the Edit button transitions view mode to edit mode', () => {
    const el = renderTab();
    clickRow(el, 'assignment-open-assignment-1');

    const editButton = Array.from(el.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Edit'
    )!;
    expect(editButton).toBeDefined();
    act(() => editButton.click());

    expect(el.querySelector('[data-testid="edit-form"]')).toBeTruthy();
    expect(editFormProps.editingAssignment.id).toBe('assignment-1');
    expect(editFormProps.pdfClassId).toBe('class-1');
  });

  it('does not show an Edit button for AP History rows, only view mode', () => {
    const el = renderTab();
    clickRow(el, 'assignment-open-assignment-2');

    expect(el.querySelector('[data-testid="assignment-sheet"]')).toBeTruthy();
    const editButton = Array.from(el.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Edit'
    );
    expect(editButton).toBeUndefined();
    const duplicateButton = Array.from(el.querySelectorAll('button')).find(
      (button) => button.textContent?.trim().includes('Duplicate')
    );
    expect(duplicateButton).toBeUndefined();
  });

  it('the class performance summary is reachable and generatable from view mode', () => {
    const el = renderTab();
    clickRow(el, 'assignment-open-assignment-1');

    const generateButton = Array.from(el.querySelectorAll('button')).find(
      (button) => /summarize class performance/i.test(button.textContent ?? '')
    )!;
    expect(generateButton).toBeDefined();

    act(() => generateButton.click());

    // Same generation path as the full-page assignment route: POST to
    // /api/domain/assignment-insights with the classAssignmentId.
    expect(submit).toHaveBeenCalledWith(
      { classAssignmentId: 'class-assignment-1' },
      { method: 'post', action: '/api/domain/assignment-insights' }
    );
  });

  it('prefills class-scoped creation when duplicating from view mode', () => {
    const el = renderTab();
    clickRow(el, 'assignment-open-assignment-1');

    const duplicateButton = Array.from(el.querySelectorAll('button')).find(
      (button) => button.textContent?.trim().includes('Duplicate')
    )!;
    act(() => duplicateButton.click());

    // Duplicating closes the sheet and opens creation prefilled.
    expect(el.querySelector('[data-testid="assignment-sheet"]')).toBeFalsy();
    expect(el.querySelector('[data-testid="creation-sheet"]')).toBeTruthy();
    expect(creationProps).toMatchObject({
      entryPoint: 'class',
      fixedClassId: 'class-1',
      fixedAssignmentTypeId: 'type-1',
      initialTitle: 'Copy of The Gilded Age DBQ',
      initialPrompt: 'Analyze the effects of industrialization.',
    });
  });

  it('clicking a different row while mid-edit confirms before discarding', () => {
    const confirmSpy = mock(() => false);
    window.confirm = confirmSpy;

    const el = renderTab();
    clickRow(el, 'assignment-open-assignment-1');
    const editButton = Array.from(el.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Edit'
    )!;
    act(() => editButton.click());
    // Simulate the form reporting unsaved changes.
    act(() => editFormProps.onDirtyChange(true));

    clickRow(el, 'assignment-open-assignment-2');

    expect(confirmSpy).toHaveBeenCalled();
    // User declined to discard — still editing assignment-1.
    expect(el.querySelector('[data-testid="edit-form"]')).toBeTruthy();
    expect(editFormProps.editingAssignment.id).toBe('assignment-1');
  });

  it('the row is entirely clickable — checkbox and Docs pill stop propagation', () => {
    const onViewDocuments = mock();
    const el = renderTab({ onViewDocuments });

    const checkbox = el.querySelector(
      '[aria-label="Select assignment The Gilded Age DBQ"]'
    ) as HTMLButtonElement;
    act(() => checkbox.click());
    expect(el.querySelector('[data-testid="assignment-sheet"]')).toBeFalsy();

    const docsPill = el.querySelector(
      '[aria-label="View documents for The Gilded Age DBQ"]'
    ) as HTMLButtonElement;
    act(() => docsPill.click());
    expect(onViewDocuments).toHaveBeenCalledWith('assignment-1');
    expect(el.querySelector('[data-testid="assignment-sheet"]')).toBeFalsy();
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

  it('keeps the creation close handler stable across tab rerenders', () => {
    const el = renderTab();
    const initialOnOpenChange = creationProps.onOpenChange;
    const createButton = Array.from(el.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('New Assignment')
    )!;

    act(() => createButton.click());

    expect(creationProps.onOpenChange).toBe(initialOnOpenChange);
  });

  it('clamps pagination to the last populated page after rows are removed', () => {
    expect(clampAssignmentPaginationSkip(40, 20, 21)).toBe(20);
    expect(clampAssignmentPaginationSkip(20, 20, 20)).toBe(0);
    expect(clampAssignmentPaginationSkip(20, 20, 0)).toBe(0);
  });
});
