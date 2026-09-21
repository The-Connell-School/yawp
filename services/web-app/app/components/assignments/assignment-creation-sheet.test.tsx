import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, it, mock } from 'bun:test';
import {
  act,
  type ReactElement,
  type ReactNode,
  type FormHTMLAttributes,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';

// Radix only renders tooltip content on hover. Flattening it puts the
// per-level hover copy in the DOM without driving a real pointer.
mock.module('~/components/ui/tooltip', () => ({
  Tooltip: ({ children, text }: { children: ReactNode; text: ReactNode }) => (
    <>
      {children}
      <span>{text}</span>
    </>
  ),
}));

const { AssignmentCreationSheetContent, assignmentCreationClassLabel } =
  await import('./assignment-creation-sheet');
const { SAVED_ASSIGNMENTS_ENABLED } =
  await import('~/domain/assignments/saved-assignments');

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

  it('falls back to period only when grade is null', () => {
    expect(
      assignmentCreationClassLabel({ id: 'c1', grade: null, period: '2' })
    ).toBe('Period 2');
  });

  it('falls back to a usable label when grade and period are both null', () => {
    expect(
      assignmentCreationClassLabel({ id: 'c1', grade: null, period: null })
    ).toBe('Untitled Class');
  });

  it('prefers the class title when grade and period are both null', () => {
    expect(
      assignmentCreationClassLabel({
        id: 'c1',
        grade: null,
        period: null,
        title: 'Honors',
      })
    ).toBe('Honors');
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
  // type-1 is in the collaborative-drafts pilot; type-2 is not.
  { id: 'type-1', title: 'Literary Analysis', collaborationSupported: true },
  { id: 'type-2', title: 'Daily Pages', collaborationSupported: false },
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
      expectedAction: '/api/assignments/create',
      expectedAssignmentTypeId: 'type-1',
    },
  ])(
    'renders the standardized create fields for the $name entry point',
    ({ props, expectedAction, expectedAssignmentTypeId }) => {
      root = renderSheet(props).root;

      expectText('New Assignment');
      expectText('Assignment type');
      expectText('Assign to');
      expectText('Post date');
      expectText('Due date');
      expectText('Title (optional)');
      expectText('Attachment');
      expectText(
        "Any documents uploaded here will be attached to the prompt and available to be viewed by students as they're working on their document."
      );
      expectText('Prompt');
      expectText('Extract from PDF');
      expectText('Submit for grade');
      expectText('Point value');
      expectText('Tutor enabled');
      expectText(
        "Turning the tutor off removes it from students' documents. Do this to test a student's ability to write a paper independently of tutor guidance."
      );
      expectText('Grading assistant strictness');
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

      // Tutor defaults to enabled, preserving today's behavior.
      expect(inputByName('tutorEnabled').value).toBe('false');
      const tutorEnabled = controlById('assignment-create-tutor-enabled');
      expect(tutorEnabled.getAttribute('role')).toBe('checkbox');
      expect(isChecked(tutorEnabled)).toBe(true);
    }
  );

  it('submits tutorEnabled=false when the tutor toggle is turned off', () => {
    root = renderSheet().root;

    act(() => {
      controlById('assignment-create-tutor-enabled').click();
    });

    expect(isChecked(controlById('assignment-create-tutor-enabled'))).toBe(
      false
    );
    expect(inputByName('tutorEnabled').value).toBe('false');
  });

  it('shows the grading assistant strictness picker to teachers', () => {
    root = renderSheet().root;

    expectText('Grading assistant strictness');
    expectText('Beginner');
    expectText('Intermediate');
    expectText('Advanced');

    // Each level explains its reading posture on hover -- never a point
    // adjustment, which is the framing Brian Connell objected to.
    expectText(
      'The assistant reads gently, expecting a writer still learning the fundamentals.'
    );
    expectText(
      'The assistant reads at the standard expected for the grade level.'
    );
    expectText(
      'The assistant reads demandingly, expecting polished and precise writing.'
    );
    expectNoText('point adjustment');

    expect(inputByName('gradingAssistantStrictnessLevel').value).toBe(
      'intermediate'
    );
  });

  it('shows the rubric default and keeps customization off by default', () => {
    root = renderSheet({ initialRubricDefaultTotalPoints: 6 }).root;

    expectText('Customize AI grading');
    expectText('Rubric default: 6 points · Step grading');
    expectNoText('Scoring behavior');
    expectNoText('Rubric total points');
    expect(inputByName('rubricTotalPoints').value).toBe('');
    expect(inputByName('gradingMode').value).toBe('step');
    expect(inputByName('pointValue').value).toBe('100');
    expect(
      isChecked(controlById('assignment-create-customize-rubric-grading'))
    ).toBe(false);
  });

  it('reveals compact AI grading controls when customization is enabled', () => {
    root = renderSheet({ initialRubricDefaultTotalPoints: 6 }).root;

    act(() => {
      controlById('assignment-create-customize-rubric-grading').click();
    });

    expectText('Scoring behavior');
    expectText('AI grading total: 100 points (same as Point value).');
    expectText('Steps');
    expectText('Bands');
    expect(inputByName('rubricTotalPoints').value).toBe('100');
    expect(inputByName('gradingMode').value).toBe('step');
  });

  it('lets a teacher opt into bands grading from the assignment creator', () => {
    root = renderSheet().root;

    act(() => {
      controlById('assignment-create-customize-rubric-grading').click();
    });
    act(() => {
      controlById('assignment-create-grading-mode-bands').click();
    });

    expect(inputByName('gradingMode').value).toBe('bands');
    expectText('Any score within the label ranges is allowed.');
  });

  it('clears the assignment override when customization is turned back off', () => {
    root = renderSheet({
      initialRubricTotalPoints: 40,
      initialGradingMode: 'bands',
    }).root;

    expect(
      isChecked(controlById('assignment-create-customize-rubric-grading'))
    ).toBe(true);
    expect(inputByName('rubricTotalPoints').value).toBe('40');

    act(() => {
      controlById('assignment-create-customize-rubric-grading').click();
    });

    expect(inputByName('rubricTotalPoints').value).toBe('');
    expect(inputByName('gradingMode').value).toBe('step');
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

  it('uses the shared creation API fields when creating from a class page', () => {
    root = renderSheet({
      entryPoint: 'class',
      fixedClassId: 'class-1',
    }).root;

    expect(inputByName('classIds').value).toBe('class-1');
    const classControl = controlById('assignment-create-class-class-1');
    expect(isChecked(classControl)).toBe(true);
    expect((classControl as HTMLButtonElement).disabled).toBe(true);
  });

  it('marks the title required and blocks submit while it is empty when titleRequired is set', () => {
    root = renderSheet({
      entryPoint: 'class',
      fixedClassId: 'class-1',
      initialPrompt: 'A prompt from the library.',
      titleRequired: true,
    }).root;

    expectText('Title');
    expectNoText('Title (optional)');
    expect(inputByName('title').required).toBe(true);

    // Everything else is satisfied (class, prompt, point value), so an empty
    // title is the only thing blocking submit.
    expect(
      document.querySelector<HTMLButtonElement>('button[type="submit"]')!
        .disabled
    ).toBe(true);
  });

  it('allows submit once a required title is present', () => {
    root = renderSheet({
      entryPoint: 'class',
      fixedClassId: 'class-1',
      initialPrompt: 'A prompt from the library.',
      initialTitle: 'Ambition in Macbeth',
      titleRequired: true,
    }).root;

    expect(inputByName('title').value).toBe('Ambition in Macbeth');
    expect(
      document.querySelector<HTMLButtonElement>('button[type="submit"]')!
        .disabled
    ).toBe(false);
  });

  it('keeps the title optional by default', () => {
    root = renderSheet({
      entryPoint: 'class',
      fixedClassId: 'class-1',
      initialPrompt: 'A prompt from the library.',
    }).root;

    expectText('Title (optional)');
    expect(inputByName('title').required).toBe(false);
    expect(
      document.querySelector<HTMLButtonElement>('button[type="submit"]')!
        .disabled
    ).toBe(false);
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
  // Both halves of the feature switch are asserted here rather than one being
  // deleted, so flipping SAVED_ASSIGNMENTS_ENABLED back on restores the
  // original expectation instead of quietly leaving it untested.
  it.skipIf(SAVED_ASSIGNMENTS_ENABLED)(
    'keeps the save-for-reuse option out of the sheet while My Saved Assignments is off',
    () => {
      root = renderSheet({ entryPoint: 'dashboard' }).root;

      expectNoText('Save to My Saved Assignments');
    }
  );

  it.skipIf(!SAVED_ASSIGNMENTS_ENABLED)(
    'offers to keep the assignment, off by default, on the bulk-create entry points',
    () => {
      root = renderSheet({ entryPoint: 'dashboard' }).root;

      expectText('Save to My Saved Assignments');
      const control = controlById('assignment-create-save-for-reuse');
      expect(isChecked(control)).toBe(false);
      // The hidden field is what the action reads when the box is left alone.
      expect(allInputsByName('saveForReuse')[0].value).toBe('false');

      act(() => {
        control.click();
      });

      expect(isChecked(controlById('assignment-create-save-for-reuse'))).toBe(
        true
      );
      expect(
        allInputsByName('saveForReuse').map((input) => input.value)
      ).toContain('true');
    }
  );

  it('hides the keep-for-reuse option on the class entry point, which cannot save', () => {
    root = renderSheet({ entryPoint: 'class', fixedClassId: 'class-1' }).root;

    expectNoText('Save to My Saved Assignments');
  });

  it('pre-fills every setting when reusing a saved assignment', () => {
    root = renderSheet({
      entryPoint: 'dashboard',
      initialAssignmentTypeId: 'type-2',
      initialTitle: 'Ambition in Macbeth',
      initialPrompt: 'A prompt kept from last term.',
      initialSubmitForGrade: false,
      initialPointValue: 50,
      initialTutorEnabled: false,
    }).root;

    expect(inputByName('assignmentTypeId').value).toBe('type-2');
    expect(inputByName('title').value).toBe('Ambition in Macbeth');
    expect(textareaByName('prompt').value).toBe(
      'A prompt kept from last term.'
    );
    expect(isChecked(controlById('assignment-create-submit-for-grade'))).toBe(
      false
    );
    expect(isChecked(controlById('assignment-create-tutor-enabled'))).toBe(
      false
    );
    expectNoText('Point value');
  });

  it('restores the saved point value when the assignment is graded', () => {
    root = renderSheet({
      entryPoint: 'dashboard',
      initialPrompt: 'A prompt kept from last term.',
      initialPointValue: 25,
    }).root;

    expect(inputByName('pointValue').value).toBe('25');
  });

  describe('collaborative drafts', () => {
    it('offers the toggle for a kind of writing in the pilot', () => {
      root = renderSheet({
        entryPoint: 'assignment-type',
        fixedAssignmentTypeId: 'type-1',
      }).root;

      expect(
        controlById('assignment-create-collaboration-enabled')
      ).not.toBeNull();
    });

    it('offers the toggle for a kind of writing outside the former pilot', () => {
      root = renderSheet({
        entryPoint: 'assignment-type',
        fixedAssignmentTypeId: 'type-2',
      }).root;

      expect(
        document.getElementById('assignment-create-collaboration-enabled')
      ).not.toBeNull();
    });

    it('offers every group mode, not just a size', () => {
      // The sheet shipped with only a size stepper, so the three modes designed
      // for this feature were unreachable and every assignment silently got the
      // parser's default.
      root = renderSheet({
        entryPoint: 'assignment-type',
        fixedAssignmentTypeId: 'type-1',
        initialCollaborationEnabled: true,
      }).root;

      const labels = Array.from(
        document.querySelectorAll('button[aria-pressed]')
      ).map((button) => button.textContent ?? '');
      for (const fragment of [
        'make the groups',
        'Group them for me',
        'whole class',
      ]) {
        expect(labels.some((label) => label.includes(fragment))).toBe(true);
      }
    });

    it('posts the chosen mode', () => {
      root = renderSheet({
        entryPoint: 'assignment-type',
        fixedAssignmentTypeId: 'type-1',
        initialCollaborationEnabled: true,
      }).root;

      expect(inputByName('collaborationGroupMode').value).toBe('teacher');
    });

    it('asks for a group size for the sized modes', () => {
      root = renderSheet({
        entryPoint: 'assignment-type',
        fixedAssignmentTypeId: 'type-1',
        initialCollaborationEnabled: true,
      }).root;

      expect(
        document.getElementById('assignment-create-collaboration-group-size')
      ).not.toBeNull();
    });

    it('sends the teacher to group setup once the assignment is created', () => {
      // Closing the sheet was the whole ending, which left a collaborative
      // assignment looking done while its groups did not exist yet.
      const went: string[] = [];
      root = renderSheet({
        entryPoint: 'assignment-type',
        fixedAssignmentTypeId: 'type-1',
        createFetcher: idleFetcher({
          success: true,
          nextStep: {
            url: '/app/class-assignments/ca-1/groups',
            classCount: 1,
          },
        }),
        navigate: (to: string) => went.push(to),
      }).root;

      expect(went).toEqual(['/app/class-assignments/ca-1/groups']);
    });

    it('does not navigate for a solo assignment', () => {
      const went: string[] = [];
      root = renderSheet({
        entryPoint: 'dashboard',
        createFetcher: idleFetcher({ success: true, nextStep: null }),
        navigate: (to: string) => went.push(to),
      }).root;

      expect(went).toEqual([]);
    });

    it('posts collaboration off by default even when the toggle is shown', () => {
      // A hidden false accompanies the checkbox, so an unchecked box still posts
      // a value and the server keeps producing solo assignments.
      root = renderSheet({
        entryPoint: 'assignment-type',
        fixedAssignmentTypeId: 'type-1',
      }).root;

      const values = allInputsByName('collaborationEnabled').map(
        (input) => input.value
      );
      expect(values).toContain('false');
      expect(
        isChecked(controlById('assignment-create-collaboration-enabled'))
      ).toBe(false);
    });
  });
});
