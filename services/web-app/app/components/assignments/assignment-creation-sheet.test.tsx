import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, it } from 'bun:test';
import { act, type ReactElement, type FormHTMLAttributes } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  AssignmentCreationSheetContent,
  assignmentCreationClassLabel,
} from './assignment-creation-sheet';

describe('assignmentCreationClassLabel', () => {
  it('shows grade and period when both are present', () => {
    expect(
      assignmentCreationClassLabel({ id: 'c1', grade: '9', period: '2' })
    ).toBe('Grade 9 - Period 2');
  });

  it('falls back to grade only when period is null', () => {
    expect(
      assignmentCreationClassLabel({ id: 'c1', grade: '9', period: null })
    ).toBe('Grade 9');
  });
});

const FetcherForm = ({
  children,
  ...props
}: FormHTMLAttributes<HTMLFormElement>) => <form {...props}>{children}</form>;

function idleFetcher(data: Record<string, unknown> | null = null) {
  return {
    state: 'idle',
    data,
    Form: FetcherForm,
    submit: () => {},
  };
}

const assignmentTypes = [
  { id: 'type-1', title: 'Literary Analysis' },
  { id: 'type-2', title: 'Daily Pages' },
];

const teacherClasses = [
  { id: 'class-1', name: 'English 9' },
  { id: 'class-2', name: 'English 10' },
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

function expectText(text: string) {
  expect(document.body.textContent).toContain(text);
}

function expectNoText(text: string) {
  expect(document.body.textContent).not.toContain(text);
}

function inputByName(name: string) {
  const input = document.querySelector<HTMLInputElement>(
    `input[name="${name}"]`
  );
  expect(input).not.toBeNull();
  return input!;
}

function textareaByName(name: string) {
  const textarea = document.querySelector<HTMLTextAreaElement>(
    `textarea[name="${name}"]`
  );
  expect(textarea).not.toBeNull();
  return textarea!;
}

function allInputsByName(name: string) {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)
  );
}

function controlById(id: string) {
  const control = document.getElementById(id);
  expect(control).not.toBeNull();
  return control as HTMLElement;
}

function buttonByLabel(label: string) {
  const button = document.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`
  );
  expect(button).not.toBeNull();
  return button!;
}

function isChecked(control: HTMLElement) {
  return (
    control.getAttribute('data-state') === 'checked' ||
    control.getAttribute('aria-checked') === 'true' ||
    (control as HTMLInputElement).checked === true
  );
}

function renderSheet(
  props: Partial<Parameters<typeof AssignmentCreationSheetContent>[0]> = {}
) {
  return render(
    <AssignmentCreationSheetContent
      open
      onOpenChange={() => {}}
      entryPoint="dashboard"
      assignmentTypes={assignmentTypes}
      teacherClasses={teacherClasses}
      createFetcher={idleFetcher()}
      extractFetcher={idleFetcher()}
      renderSheet={false}
      {...props}
    />
  );
}

describe('AssignmentCreationSheetContent', () => {
  let root: Root | null = null;

  afterEach(() => {
    cleanup(root);
    root = null;
  });

  it.each([
    {
      name: 'dashboard',
      props: {
        entryPoint: 'dashboard' as const,
      },
      expectedAction: '/api/assignments/create',
      expectedAssignmentTypeId: 'type-1',
    },
    {
      name: 'assignment type page',
      props: {
        entryPoint: 'assignment-type' as const,
        fixedAssignmentTypeId: 'type-2',
        initialPrompt: 'A prompt from the library.',
      },
      expectedAction: '/api/assignments/create',
      expectedAssignmentTypeId: 'type-2',
    },
    {
      name: 'class page',
      props: {
        entryPoint: 'class' as const,
        fixedClassId: 'class-1',
      },
      expectedAction: null,
      expectedAssignmentTypeId: 'type-1',
    },
  ])(
    'renders the standardized create fields for the $name entry point',
    ({ props, expectedAction, expectedAssignmentTypeId }) => {
      root = renderSheet(props).root;

      expectText('New Assignment');
      expectText('Assignment type');
      expectText('Assign to');
      expectText('Title (optional)');
      expectText('Attachment');
      expectText(
        "Any documents uploaded here will be attached to the prompt and available to be viewed by students as they're working on their document."
      );
      expectText('Prompt');
      expectText('Extract from PDF');
      expectText('Submit for grade');
      expectText('Point value');
      expectText('Grading assistant strictness');
      expectText('Beginner');
      expectText('Intermediate');
      expectText('Advanced');
      expectNoText('Tutor Context');

      const form = document.querySelector('form');
      expect(form).not.toBeNull();
      expect(form!.getAttribute('method')).toBe('post');
      expect(form!.getAttribute('action')).toBe(expectedAction);
      expect(inputByName('intent').value).toBe('create-assignment');
      expect(inputByName('assignmentTypeId').value).toBe(
        expectedAssignmentTypeId
      );
      expect(inputByName('submitForGrade').value).toBe('false');

      const submitForGrade = controlById('assignment-create-submit-for-grade');
      expect(isChecked(submitForGrade)).toBe(true);
      expect(inputByName('pointValue').value).toBe('100');
      expect(inputByName('gradingAssistantStrictnessLevel').value).toBe(
        'intermediate'
      );
    }
  );

  it('shows grading assistant strictness help text', () => {
    root = renderSheet().root;

    expect(
      buttonByLabel('Grading assistant strictness help').getAttribute('title')
    ).toBe(
      'Strictness only adjusts the overall grade number after Grading Assistant suggestions. Use beginner for a slightly higher grade, advanced for a slightly lower grade, and intermediate for no adjustment.'
    );
  });

  it('preselects but does not lock assignment type from dashboard quick create', () => {
    root = renderSheet({
      entryPoint: 'dashboard',
      initialAssignmentTypeId: 'type-2',
    }).root;

    expect(inputByName('assignmentTypeId').value).toBe('type-2');

    const assignmentTypeTrigger = document.querySelector(
      'button[role="combobox"]'
    ) as HTMLButtonElement | null;
    expect(assignmentTypeTrigger).not.toBeNull();
    expect(assignmentTypeTrigger!.disabled).toBe(false);
  });

  it('submits selected class ids for bulk create entry points', () => {
    root = renderSheet({
      entryPoint: 'dashboard',
    }).root;

    expect(allInputsByName('classIds')).toHaveLength(0);

    act(() => {
      controlById('assignment-create-class-class-1').click();
    });

    const classIds = allInputsByName('classIds').map((input) => input.value);
    expect(classIds).toEqual(['class-1']);
  });

  it('keeps extracted PDF fields when route data refreshes while the sheet stays open', () => {
    const extractData = {
      success: true,
      title: 'Extracted PDF Assignment',
      prompt: 'Extracted prompt from Anthropic PDF processing.',
    };

    root = renderSheet({
      extractFetcher: idleFetcher(extractData),
    }).root;

    expect(inputByName('title').value).toBe('Extracted PDF Assignment');
    expect(textareaByName('prompt').value).toBe(
      'Extracted prompt from Anthropic PDF processing.'
    );

    act(() => {
      root!.render(
        <AssignmentCreationSheetContent
          open
          onOpenChange={() => {}}
          entryPoint="dashboard"
          assignmentTypes={assignmentTypes.map((assignmentType) => ({
            ...assignmentType,
          }))}
          teacherClasses={teacherClasses.map((klass) => ({ ...klass }))}
          createFetcher={idleFetcher()}
          extractFetcher={idleFetcher(extractData)}
          renderSheet={false}
        />
      );
    });

    expect(inputByName('title').value).toBe('Extracted PDF Assignment');
    expect(textareaByName('prompt').value).toBe(
      'Extracted prompt from Anthropic PDF processing.'
    );
  });

  it('exposes an optional PDF attachment input independent from the prompt', () => {
    root = renderSheet().root;

    const form = document.querySelector('form')!;
    expect(form.getAttribute('enctype')).toBe('multipart/form-data');
    const attachment = inputByName('promptAttachment');
    expect(attachment.getAttribute('type')).toBe('file');
    expect(attachment.getAttribute('accept')).toContain('application/pdf');
  });

  it('shows an extract-from-PDF button inside the prompt field', () => {
    root = renderSheet().root;

    const extractButton = buttonByLabel('Extract assignment text from PDF');
    expect(extractButton.textContent).toContain('Extract from PDF');
  });

  it('shows a red warning when PDF extraction was truncated at the token limit', () => {
    root = renderSheet({
      extractFetcher: idleFetcher({
        success: true,
        title: 'Extracted Title',
        prompt: 'Truncated prompt text',
        truncated: true,
      }),
    }).root;

    expectText('cut off');
    const warning = Array.from(document.querySelectorAll('p')).find((el) =>
      el.textContent?.includes('cut off')
    );
    expect(warning?.className).toContain('text-destructive');
  });

  it('does not show a truncation warning for a complete extraction', () => {
    root = renderSheet({
      extractFetcher: idleFetcher({
        success: true,
        title: 'Extracted Title',
        prompt: 'Complete prompt text',
        truncated: false,
      }),
    }).root;

    expectNoText('cut off');
  });

  it('uses the current class route fields when creating from a class page', () => {
    root = renderSheet({
      entryPoint: 'class',
      fixedClassId: 'class-1',
    }).root;

    expect(inputByName('classId').value).toBe('class-1');
    const classControl = controlById('assignment-create-class-class-1');
    expect(isChecked(classControl)).toBe(true);
    expect((classControl as HTMLButtonElement).disabled).toBe(true);
  });

  it('clears the point value when submit for grade is disabled', () => {
    root = renderSheet({
      entryPoint: 'dashboard',
    }).root;

    act(() => {
      controlById('assignment-create-submit-for-grade').click();
    });

    expectNoText('Point value');
    expect(inputByName('pointValue').value).toBe('');
  });
});
