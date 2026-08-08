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
const navigate = mock();
// A single fetcher stub shared by every useFetcher() call in the tree — the
// edit form, and the real ClassInsightsPanel rendered through the unmocked
// AssignmentSummarySheetContent.
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
let blockerShouldBlock: any = null;

const PARENT_DATA = {
  klass: { id: 'class-1', grade: '9', period: '2', title: 'History' },
  classInsightsEnabled: true,
  assignmentTypes: [{ id: 'type-1', title: 'DBQ' }],
  submissions: [] as any[],
  assignments: [
    {
      id: 'assignment-1',
      classAssignmentId: 'class-assignment-1',
      title: 'The Gilded Age DBQ',
      prompt: 'Analyze the effects of industrialization.',
      promptAttachmentName: null,
      submitForGrade: true,
      pointValue: 100,
      assignmentTypeId: 'type-1',
      assignmentType: { id: 'type-1', title: 'DBQ', systemKey: null },
      otherClassCount: 1,
      _count: { documents: 12 },
      insight: null,
    },
    {
      id: 'assignment-2',
      classAssignmentId: 'class-assignment-2',
      title: 'APUSH LEQ',
      prompt: 'Assess the causes of westward expansion.',
      promptAttachmentName: null,
      submitForGrade: true,
      pointValue: 100,
      assignmentTypeId: 'type-apush',
      assignmentType: {
        id: 'type-apush',
        title: 'AP History Essay',
        systemKey: 'ap_history_essay',
      },
      otherClassCount: 0,
      _count: { documents: 7 },
      insight: null,
    },
  ],
};

const actualReactRouter = await import('react-router');
mock.module('react-router', () => ({
  ...actualReactRouter,
  Form: ({ children, method: _method, ...props }: any) => (
    <form {...props}>{children}</form>
  ),
  Link: ({ children, to, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useFetcher: () => fetcher,
  useNavigate: () => navigate,
  useParams: () => ({ classId: 'class-1', assignmentId: 'assignment-1' }),
  useRouteLoaderData: () => PARENT_DATA,
  useBlocker: (shouldBlock: any) => {
    blockerShouldBlock = shouldBlock;
    return { state: 'unblocked', proceed: mock(), reset: mock() };
  },
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

const { MemoryRouter } = actualReactRouter;
const { default: AssignmentDetailRoute } = await import('./route');

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

beforeEach(() => {
  submit.mockReset();
  load.mockReset();
  navigate.mockReset();
  fetcher.state = 'idle';
  fetcher.data = null;
  creationProps = null;
  editFormProps = null;
  blockerShouldBlock = null;
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  document.body.innerHTML = '';
  root = null;
});

describe('AssignmentDetailRoute', () => {
  it('renders the assignment detail as a full page, in view mode by default', () => {
    const el = render(<AssignmentDetailRoute />);

    expect(el.querySelector('[data-testid="assignment-detail-page"]')).toBeTruthy();
    // No sheet/dialog wrapper — this is embedded page content.
    expect(el.querySelector('[role="dialog"]')).toBeFalsy();
    expect(el.querySelector('[data-testid="edit-form"]')).toBeFalsy();
    expect(el.textContent).toContain('The Gilded Age DBQ');
    expect(el.textContent).toContain('Class performance summary');
    expect(el.textContent).toContain('Back to assignments');
  });

  it('a Back to assignments link points at the assignments tab', () => {
    const el = render(<AssignmentDetailRoute />);
    const backLink = Array.from(el.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('Back to assignments')
    )!;
    expect(backLink.getAttribute('href')).toBe(
      '/app/my-classes/class-1?tab=assignments'
    );
  });

  it('pins Duplicate and Edit in an action row when viewing an editable assignment', () => {
    const el = render(<AssignmentDetailRoute />);
    const actions = el.querySelector('[data-testid="assignment-detail-actions"]');
    expect(actions).toBeTruthy();
    expect(actions?.textContent).toContain('Duplicate');
    expect(actions?.textContent).toContain('Edit');
  });

  it('the Edit button transitions view mode to edit mode', () => {
    const el = render(<AssignmentDetailRoute />);
    const editButton = Array.from(el.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Edit'
    )!;
    act(() => editButton.click());

    expect(el.querySelector('[data-testid="edit-form"]')).toBeTruthy();
    expect(editFormProps.editingAssignment.id).toBe('assignment-1');
    expect(editFormProps.pdfClassId).toBe('class-1');
    expect(editFormProps.action).toBe('/app/my-classes/class-1');
    expect(editFormProps.renderSheet).toBe(false);
  });

  it('prefills class-scoped creation when duplicating from view mode', () => {
    const el = render(<AssignmentDetailRoute />);
    const duplicateButton = Array.from(el.querySelectorAll('button')).find(
      (button) => button.textContent?.trim().includes('Duplicate')
    )!;
    act(() => duplicateButton.click());

    expect(el.querySelector('[data-testid="creation-sheet"]')).toBeTruthy();
    expect(creationProps).toMatchObject({
      entryPoint: 'class',
      fixedClassId: 'class-1',
      fixedAssignmentTypeId: 'type-1',
      initialTitle: 'Copy of The Gilded Age DBQ',
      initialPrompt: 'Analyze the effects of industrialization.',
    });
  });

  it('the dirty-edit blocker only fires when leaving mid-edit with unsaved changes', () => {
    const el = render(<AssignmentDetailRoute />);
    const editButton = Array.from(el.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Edit'
    )!;
    act(() => editButton.click());

    expect(blockerShouldBlock).toBeTruthy();
    // Not dirty yet — navigating away is not blocked.
    expect(
      blockerShouldBlock({
        currentLocation: { pathname: '/app/my-classes/class-1/assignment/assignment-1' },
        nextLocation: { pathname: '/app/my-classes/class-1' },
      })
    ).toBe(false);

    act(() => editFormProps.onDirtyChange(true));

    expect(
      blockerShouldBlock({
        currentLocation: { pathname: '/app/my-classes/class-1/assignment/assignment-1' },
        nextLocation: { pathname: '/app/my-classes/class-1' },
      })
    ).toBe(true);
    // A same-location navigation (e.g. search param change) is not blocked.
    expect(
      blockerShouldBlock({
        currentLocation: { pathname: '/app/my-classes/class-1/assignment/assignment-1' },
        nextLocation: { pathname: '/app/my-classes/class-1/assignment/assignment-1' },
      })
    ).toBe(false);
  });

  it('does not show an Edit or Duplicate action for AP History assignments', () => {
    mock.module('react-router', () => ({
      ...actualReactRouter,
      Form: ({ children, method: _method, ...props }: any) => (
        <form {...props}>{children}</form>
      ),
      Link: ({ children, to, ...props }: any) => (
        <a href={to} {...props}>
          {children}
        </a>
      ),
      useFetcher: () => fetcher,
      useNavigate: () => navigate,
      useParams: () => ({ classId: 'class-1', assignmentId: 'assignment-2' }),
      useRouteLoaderData: () => PARENT_DATA,
      useBlocker: (shouldBlock: any) => {
        blockerShouldBlock = shouldBlock;
        return { state: 'unblocked', proceed: mock(), reset: mock() };
      },
    }));
    const el = render(<AssignmentDetailRoute />);
    expect(
      el.querySelector('[data-testid="assignment-detail-actions"]')
    ).toBeFalsy();
  });

  it('shows a not-found state for an assignment id absent from the class', () => {
    mock.module('react-router', () => ({
      ...actualReactRouter,
      Form: ({ children, method: _method, ...props }: any) => (
        <form {...props}>{children}</form>
      ),
      Link: ({ children, to, ...props }: any) => (
        <a href={to} {...props}>
          {children}
        </a>
      ),
      useFetcher: () => fetcher,
      useNavigate: () => navigate,
      useParams: () => ({ classId: 'class-1', assignmentId: 'missing' }),
      useRouteLoaderData: () => PARENT_DATA,
      useBlocker: () => ({ state: 'unblocked', proceed: mock(), reset: mock() }),
    }));
    const el = render(<AssignmentDetailRoute />);
    expect(el.textContent).toContain('Assignment not found');
  });
});
