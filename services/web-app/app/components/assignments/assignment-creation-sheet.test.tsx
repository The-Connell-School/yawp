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
const {
  BASIC_EXIT_TICKET_PROMPT,
  EXIT_TICKET_ASSIGNMENT_TYPE_KIND,
  EXIT_TICKET_ELABORATION_NOTE,
  EXIT_TICKET_FOCUS_OPTIONS,
} = await import('~/domain/assignment-types/exit-ticket');

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
  {
    id: 'type-1',
    title: 'Literary Analysis',
    collaborationSupported: true,
    gradesGrammar: true,
    kind: null,
  },
  {
    id: 'type-2',
    title: 'Class Starter',
    collaborationSupported: false,
    gradesGrammar: false,
    kind: 'class_starter',
  },
];

const exitTicketAssignmentTypes = [
  {
    id: 'exit-1',
    title: 'Exit Ticket',
    collaborationSupported: false,
    // An exit ticket is read for understanding, not marked for grammar, so the
    // toggle has nothing to offer here.
    gradesGrammar: false,
    kind: EXIT_TICKET_ASSIGNMENT_TYPE_KIND,
  },
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
  expect(document.body.textContent?.toLowerCase()).toContain(
    text.toLowerCase()
  );
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

// happy-dom does not deliver a synthetic input event React will treat as a
// change, so this calls the textarea's own onChange the way a keystroke would.
// Real typing is covered by the e2e spec.
function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  textarea.value = value;
  const propsKey = Object.keys(textarea).find((key) =>
    key.startsWith('__reactProps$')
  );
  const props = (textarea as unknown as Record<string, any>)[propsKey!];
  props.onChange({ target: textarea, currentTarget: textarea });
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
      expectText(
        'Graded out of 100 points, read at the intermediate level.'
      );
      expectText('Tutor enabled');
      expectText(
        "The tutor is on by default. Turning it off removes it from students' documents — the digital equivalent of an in-class essay. Assigning one now and then shows what a student can do unaided, and gives the Reporter a baseline to measure independent growth against."
      );
      expectNoText('Customize Grading');
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

  it('names a tutor-off assignment a cold write', () => {
    root = renderSheet().root;
    expectNoText('Cold write');

    act(() => {
      controlById('assignment-create-tutor-enabled').click();
    });

    expectText('Cold write');
  });

  it('shows the grading assistant strictness picker to teachers', () => {
    root = renderSheet().root;

    act(() => {
      controlById('assignment-create-change-grading').click();
    });

    expectText('Grading assistance');
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

  it('rests as a plain-language grading summary with nothing to expand past', () => {
    root = renderSheet().root;

    expectText(
      'Graded out of 100 points, read at the intermediate level.'
    );
    // The old block stated the same facts four times over three nested boxes.
    expectNoText('Grade Configuration');
    expectNoText('Default point value');
    expectNoText('Default grading type');
    expectNoText('By default: Step grading');
    expectNoText('Customize Grading');
    expectNoText('Total Point Values');
    expectNoText('Grading Total');
    expectNoText('AI');
    expect(inputByName('pointValue').value).toBe('100');
    expect(inputByName('gradingMode').value).toBe('bands');
    expect(inputByName('rubricTotalPoints').value).toBe('');
    expect(document.getElementById('assignment-create-point-value')).toBeNull();
  });

  it('opens every grading control behind one Change affordance', () => {
    root = renderSheet().root;

    act(() => {
      controlById('assignment-create-change-grading').click();
    });

    expectText('Point value');
    expectText('Grading assistance');
    expectNoText('Customize Grading');
    expect(controlById('assignment-create-point-value')).toHaveProperty(
      'readOnly',
      false
    );
    expect(inputByName('pointValue').value).toBe('100');
  });

  it('summarizes the settings actually in force, not the defaults', () => {
    root = renderSheet({
      initialPointValue: 250,
      initialGradingMode: 'bands',
      initialGradingAssistantStrictnessLevel: 'advanced',
    }).root;

    expectText(
      'Graded out of 250 points, read at the advanced level.'
    );
    expect(inputByName('pointValue').value).toBe('250');
    expect(inputByName('gradingMode').value).toBe('bands');
  });

  // Scoring behavior selector removed — always bands now

  // `rubricTotalPoints` rescales the rubric's own scale and the `max_score`
  // handed to the grading assistant. It is not the gradebook total, and
  // syncing it to `pointValue` breaks percentage math on 1-5 rubrics. This
  // sheet therefore carries an existing override through untouched and never
  // mints a new one.
  it('preserves an existing rubric scale override without exposing it', () => {
    root = renderSheet({
      initialRubricTotalPoints: 40,
      initialPointValue: 250,
      initialGradingMode: 'bands',
    }).root;

    act(() => {
      controlById('assignment-create-change-grading').click();
    });

    // The gradebook total and the rubric scale stay independent.
    expect(inputByName('rubricTotalPoints').value).toBe('40');
    expect(inputByName('pointValue').value).toBe('250');
    expectNoText('Total Point Values');
    expectNoText('40');
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

  it('shows scaled engagement tiers when the grading panel is open', () => {
    root = renderSheet({
      entryPoint: 'assignment-type',
      fixedAssignmentTypeId: 'daily-pages',
      initialPointValue: 12,
      assignmentTypes: [
        ...assignmentTypes,
        {
          id: 'daily-pages',
          title: 'Daily Pages',
          kind: 'daily_pages',
          rubricName: null,
          collaborationSupported: false,
          gradesGrammar: false,
        },
      ],
    }).root;

    act(() => {
      controlById('assignment-create-change-grading').click();
    });

    expectText('Not Present');
    expectText('Excellent');
    expect(
      document.querySelector('[data-testid="assignment-create-engagement-bands"]')
    ).not.toBeNull();
  });

  it('requires at least five points for SJP Daily Pages (null kind, engagement rubric)', () => {
    root = renderSheet({
      entryPoint: 'assignment-type',
      fixedAssignmentTypeId: 'sjp-daily-pages',
      assignmentTypes: [
        ...assignmentTypes,
        {
          id: 'sjp-daily-pages',
          title: 'SJP Daily Pages',
          kind: null,
          rubricName: 'daily-pages-engagement',
          collaborationSupported: false,
          gradesGrammar: false,
        },
      ],
    }).root;

    act(() => {
      controlById('assignment-create-change-grading').click();
    });

    expect(inputByName('pointValue').getAttribute('min')).toBe('5');
    expectText('need at least 5 points when graded');
  });

  // The original builder, kept as the flag-off path. These pin it so
  // switching the new builder off always lands on exactly what shipped.
  describe('exit tickets (quick builder)', () => {
    function renderQuickExitTicketSheet(
      props: Partial<Parameters<typeof AssignmentCreationSheetContent>[0]> = {}
    ) {
      return renderSheet({
        assignmentTypes: exitTicketAssignmentTypes,
        fixedAssignmentTypeId: 'exit-1',
        ...props,
      });
    }

    function submitButton() {
      return document.querySelector<HTMLButtonElement>(
        'button[type="submit"]'
      )!;
    }

    it('opens on an ungraded reflection that can be created straight away', () => {
      root = renderQuickExitTicketSheet({ fixedClassId: 'class-1' }).root;

      expect(
        isChecked(controlById('assignment-create-exit-ticket-kind-reflection'))
      ).toBe(true);
      expect(
        isChecked(controlById('assignment-create-exit-ticket-kind-check'))
      ).toBe(false);
      expectText(BASIC_EXIT_TICKET_PROMPT);
      // Dual-write: the kind rides beside the mode the original form posts.
      expect(inputByName('exitTicketKind').value).toBe('reflection');
      expect(inputByName('exitTicketMode').value).toBe('basic');
      expect(inputByName('prompt').value).toInclude(BASIC_EXIT_TICKET_PROMPT);
      expect(submitButton().disabled).toBe(false);
      // No prompt box and none of the original builder's wording.
      expect(document.querySelector('textarea[name="prompt"]')).toBeNull();
      expectNoText('Basic exit ticket');
    });

    it('asks what to check for once the teacher picks a check', () => {
      root = renderQuickExitTicketSheet({ fixedClassId: 'class-1' }).root;
      expectNoText('What are you checking for?');

      act(() => {
        controlById('assignment-create-exit-ticket-kind-check').click();
      });

      expectText('What are you checking for?');
      expectText('What specifically?');
      expectText('Is there a correct answer?');
      expect(inputByName('exitTicketKind').value).toBe('check');
      expect(inputByName('exitTicketMode').value).toBe('specific');
      // No topic, no answer: nothing to create yet.
      expect(submitButton().disabled).toBe(true);
    });

    it('reopens a stored check as a check', () => {
      root = renderQuickExitTicketSheet({
        fixedClassId: 'class-1',
        initialExitTicketMode: 'specific',
        initialExitTicketFocus: 'explain-concept',
        initialExitTicketTopic: 'the causes of World War I',
        initialExitTicketAnswerType: 'objective',
      }).root;

      expect(
        isChecked(controlById('assignment-create-exit-ticket-kind-check'))
      ).toBe(true);
      expect(inputByName('exitTicketTopic').value).toBe(
        'the causes of World War I'
      );
      expect(inputByName('exitTicketAnswerType').value).toBe('objective');
      expectText('the causes of World War I');
      expect(submitButton().disabled).toBe(false);
    });

    it('offers suggested reflection prompts and composes the chosen one', () => {
      root = renderQuickExitTicketSheet({ fixedClassId: 'class-1' }).root;

      expect(
        isChecked(
          controlById('assignment-create-exit-ticket-reflection-learned')
        )
      ).toBe(true);
      // The default posts nothing extra, so it stores exactly what v1 did.
      expect(
        document.querySelector('input[name="exitTicketReflectionPrompt"]')
      ).toBeNull();

      act(() => {
        controlById(
          'assignment-create-exit-ticket-reflection-wondering'
        ).click();
      });

      expect(inputByName('exitTicketReflectionPrompt').value).toBe('wondering');
      expect(inputByName('prompt').value).toInclude(
        'What is one question you still have'
      );
      expect(inputByName('prompt').value).not.toInclude(
        BASIC_EXIT_TICKET_PROMPT
      );
    });

    it('lets the teacher write their own reflection question', () => {
      root = renderQuickExitTicketSheet({ fixedClassId: 'class-1' }).root;

      act(() => {
        controlById('assignment-create-exit-ticket-reflection-custom').click();
      });

      const box = textareaByName('exitTicketReflectionPromptText');
      expect(box).not.toBeNull();
      // Nothing written yet, nothing to create.
      expect(submitButton().disabled).toBe(true);

      act(() => {
        setTextareaValue(box!, 'What surprised you today?');
      });

      expect(inputByName('exitTicketReflectionPrompt').value).toBe('custom');
      expect(inputByName('prompt').value).toInclude(
        'What surprised you today?'
      );
      expect(submitButton().disabled).toBe(false);
    });

    it('reopens a stored reflection on the prompt it was given', () => {
      root = renderQuickExitTicketSheet({
        fixedClassId: 'class-1',
        initialExitTicketReflectionPrompt: {
          id: 'custom',
          text: 'What surprised you today?',
        },
      }).root;

      expect(
        isChecked(
          controlById('assignment-create-exit-ticket-reflection-custom')
        )
      ).toBe(true);
      expect(textareaByName('exitTicketReflectionPromptText')!.value).toBe(
        'What surprised you today?'
      );
    });

    function turnGradingOn() {
      act(() => {
        controlById('assignment-create-exit-ticket-graded').click();
      });
    }

    function lastValue(name: string) {
      return allInputsByName(name).at(-1)?.value;
    }

    it('starts ungraded and asks for nothing about grading', () => {
      root = renderQuickExitTicketSheet({ fixedClassId: 'class-1' }).root;

      expect(
        isChecked(controlById('assignment-create-exit-ticket-graded'))
      ).toBe(false);
      expect(lastValue('submitForGrade')).toBe('false');
      expectNoText('How many points?');
      // The original builder's grading radio is gone from this one.
      expect(
        document.getElementById('assignment-create-exit-ticket-for-points')
      ).toBeNull();
    });

    it('grading a reflection asks for points and defaults to completion', () => {
      root = renderQuickExitTicketSheet({ fixedClassId: 'class-1' }).root;
      turnGradingOn();

      expect(lastValue('submitForGrade')).toBe('true');
      expect(
        (
          controlById(
            'assignment-create-exit-ticket-points'
          ) as HTMLInputElement
        ).value
      ).toBe('10');
      // Posted exactly once, from the builder, not also from the grading panel.
      expect(allInputsByName('pointValue')).toHaveLength(1);
      expect(
        isChecked(controlById('assignment-create-exit-ticket-basis-completion'))
      ).toBe(true);
      expect(inputByName('exitTicketGradingBasis').value).toBe('completion');
      expect(submitButton().disabled).toBe(false);
    });

    it('a quality-graded reflection needs the main points or a length', () => {
      root = renderQuickExitTicketSheet({ fixedClassId: 'class-1' }).root;
      turnGradingOn();
      act(() => {
        controlById('assignment-create-exit-ticket-basis-bands').click();
      });

      expect(submitButton().disabled).toBe(true);
      act(() => {
        setTextareaValue(
          textareaByName('exitTicketLessonMainPoints')!,
          'A theme makes a claim.'
        );
      });
      expect(submitButton().disabled).toBe(false);
    });

    it('a graded check with a right answer asks for that answer', () => {
      root = renderQuickExitTicketSheet({
        fixedClassId: 'class-1',
        initialExitTicketMode: 'specific',
        initialExitTicketFocus: 'explain-concept',
        initialExitTicketTopic: 'erosion',
        initialExitTicketAnswerType: 'objective',
      }).root;
      turnGradingOn();

      expectText('Correct answer or key points');
      expect(submitButton().disabled).toBe(true);
      act(() => {
        setTextareaValue(
          textareaByName('exitTicketLessonMustMention')!,
          'Weathering breaks rock; erosion moves it.'
        );
      });
      expect(submitButton().disabled).toBe(false);
    });

    it('a graded check without one asks what to assess', () => {
      root = renderQuickExitTicketSheet({
        fixedClassId: 'class-1',
        initialExitTicketMode: 'specific',
        initialExitTicketFocus: 'understand-text',
        initialExitTicketTopic: 'the second stanza',
        initialExitTicketAnswerType: 'subjective',
      }).root;
      turnGradingOn();

      expectText('What should be assessed?');
      expect(submitButton().disabled).toBe(true);
      act(() => {
        setTextareaValue(
          textareaByName('exitTicketAssessFor')!,
          'Points to a specific line'
        );
      });
      expect(submitButton().disabled).toBe(false);
    });

    it('is always graded with band scoring under the hood, with no steps option to pick', () => {
      root = renderQuickExitTicketSheet({
        fixedClassId: 'class-1',
        initialGradingMode: 'step',
      }).root;
      turnGradingOn();

      expect(inputByName('gradingMode').value).toBe('bands');
      expectText('Graded out of 10 points, read at the');
      act(() => {
        controlById('assignment-create-change-grading').click();
      });
      expect(
        document.getElementById('assignment-create-grading-mode-step')
      ).toBeNull();
      // Strictness is still the teacher's call.
      expectText('Grading assistance');
    });

    it('opens graded when the lesson planner planned a graded ticket', () => {
      root = renderQuickExitTicketSheet({
        fixedClassId: 'class-1',
        initialExitTicketGradebook: { submitForGrade: true, pointValue: 4 },
        initialExitTicketGrading: { basis: 'completion' },
      }).root;

      expect(
        isChecked(controlById('assignment-create-exit-ticket-graded'))
      ).toBe(true);
      expect(
        (
          controlById(
            'assignment-create-exit-ticket-points'
          ) as HTMLInputElement
        ).value
      ).toBe('4');
      expect(submitButton().disabled).toBe(false);
    });

    it('reopens a graded ticket on the criteria it was given', () => {
      root = renderQuickExitTicketSheet({
        fixedClassId: 'class-1',
        editingAssignment: { id: 'a-1' },
        initialSubmitForGrade: true,
        initialPointValue: 5,
        initialExitTicketGrading: { basis: 'bands', minSentences: 3 },
      }).root;

      expect(
        isChecked(controlById('assignment-create-exit-ticket-graded'))
      ).toBe(true);
      expect(
        isChecked(controlById('assignment-create-exit-ticket-basis-bands'))
      ).toBe(true);
      expect(inputByName('exitTicketMinSentences').value).toBe('3');
      expect(
        (
          controlById(
            'assignment-create-exit-ticket-points'
          ) as HTMLInputElement
        ).value
      ).toBe('5');
    });

    function elementWithText(text: string) {
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT
      );
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.textContent?.includes(text)) return node.parentElement!;
      }
      throw new Error(`No element with text: ${text}`);
    }

    function buttonByText(text: string) {
      const button = Array.from(document.querySelectorAll('button')).find(
        (candidate) => candidate.textContent?.trim() === text
      );
      expect(button).toBeDefined();
      return button!;
    }

    function isTuckedAway(element: Element) {
      const details = element.closest('details');
      return (
        Boolean(details && !details.open) ||
        Boolean(element.closest('[hidden]'))
      );
    }

    it('keeps tutor, groups and lesson notes under a closed "More options"', () => {
      root = renderQuickExitTicketSheet({ fixedClassId: 'class-1' }).root;

      const more = controlById('assignment-create-exit-ticket-more-options');
      expect(more.tagName).toBe('DETAILS');
      expect((more as HTMLDetailsElement).open).toBe(false);
      for (const id of [
        'assignment-create-tutor-enabled',
        'assignment-create-collaboration-enabled',
        'assignment-create-exit-ticket-lesson-notes',
      ]) {
        expect(more.contains(controlById(id))).toBe(true);
      }
      // Tucked away is not switched off: the tutor still posts its value.
      expect(allInputsByName('tutorEnabled').length).toBeGreaterThan(0);
    });

    it('opens "More options" when there are lesson notes to show', () => {
      root = renderQuickExitTicketSheet({
        fixedClassId: 'class-1',
        initialExitTicketLessonNotes: {
          mainPoints: 'Weathering breaks rock down.',
          mustMention: '',
          watchFor: '',
        },
      }).root;

      expect(
        (
          controlById(
            'assignment-create-exit-ticket-more-options'
          ) as HTMLDetailsElement
        ).open
      ).toBe(true);
    });

    it('puts the long explanations behind "Why?"', () => {
      root = renderQuickExitTicketSheet({
        fixedClassId: 'class-1',
        initialExitTicketMode: 'specific',
      }).root;

      // Present for anyone who wants them, but not on screen by default.
      expect(isTuckedAway(elementWithText('Judged on the reasoning'))).toBe(
        true
      );
      expect(
        isTuckedAway(elementWithText('a tutor in the document would answer'))
      ).toBe(true);
      expect(
        isTuckedAway(elementWithText('nothing to lose by admitting'))
      ).toBe(true);
    });

    it('can walk the teacher through it one step at a time', () => {
      root = renderQuickExitTicketSheet({ fixedClassId: 'class-1' }).root;

      act(() => {
        buttonByText('Walk me through it').click();
      });
      expectText('Step 1 of 3');
      expect(
        isTuckedAway(controlById('assignment-create-exit-ticket-graded'))
      ).toBe(true);

      act(() => {
        buttonByText('Next').click();
      });
      expectText('Step 2 of 3');
      act(() => {
        buttonByText('Next').click();
      });
      expectText('Step 3 of 3');
      expect(
        isTuckedAway(controlById('assignment-create-exit-ticket-graded'))
      ).toBe(false);

      // Same state underneath: what posts is what the full form would post.
      expect(inputByName('exitTicketKind').value).toBe('reflection');
      expect(submitButton().disabled).toBe(false);

      act(() => {
        buttonByText('Show everything').click();
      });
      expectNoText('Step 1 of 3');
      expectNoText('Step 3 of 3');
    });

    it('will not create a check until the right-answer question is answered', () => {
      root = renderQuickExitTicketSheet({
        fixedClassId: 'class-1',
        initialExitTicketMode: 'specific',
        initialExitTicketFocus: 'explain-concept',
        initialExitTicketTopic: 'the causes of World War I',
      }).root;

      expect(submitButton().disabled).toBe(true);
      act(() => {
        controlById('assignment-create-exit-ticket-answer-objective').click();
      });
      expect(submitButton().disabled).toBe(false);
    });
  });
});

/**
 * Daily Pages "Paragraph type" and "Time students have to write" were removed
 * (never released). The form offers neither, on create or on edit, for any
 * type; values already stored on old assignments are kept but not shown.
 */
describe('AssignmentCreationSheetContent without writing conditions', () => {
  let root: Root | null = null;

  afterEach(() => {
    cleanup(root);
    root = null;
  });

  const types = [
    {
      id: 'daily-pages',
      title: 'Daily Pages',
      kind: 'daily_pages',
      collaborationSupported: true,
      gradesGrammar: true,
    },
  ];

  function expectNeitherField() {
    expect(document.querySelector('[name="writingTimeMinutes"]')).toBeNull();
    expect(document.querySelector('#assignment-create-writing-time')).toBeNull();
    expect(document.querySelector('[name="paragraphMode"]')).toBeNull();
    expect(document.querySelector('#assignment-create-paragraph-mode')).toBeNull();
    expectNoText('Time students have to write');
    expectNoText('Paragraph type');
    expectNoText('Any kind of paragraph');
  }

  it('offers neither setting when creating a Daily Pages assignment', () => {
    ({ root } = renderSheet({
      assignmentTypes: types,
      fixedAssignmentTypeId: 'daily-pages',
    }));

    expectNeitherField();
  });

  it('offers neither setting when editing a Daily Pages assignment', () => {
    ({ root } = renderSheet({
      assignmentTypes: types,
      fixedAssignmentTypeId: 'daily-pages',
      editingAssignment: { id: 'assignment-1' },
    }));

    expectNeitherField();
  });
});
