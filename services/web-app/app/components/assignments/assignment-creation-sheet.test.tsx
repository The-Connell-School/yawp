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
  {
    id: 'type-1',
    title: 'Literary Analysis',
    collaborationSupported: true,
    gradesGrammar: true,
  },
  {
    id: 'type-2',
    title: 'Class Starter',
    collaborationSupported: false,
    gradesGrammar: false,
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
      expectText(
        'Graded out of 100 points in steps, read at the intermediate level.'
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
      'Graded out of 100 points in steps, read at the intermediate level.'
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
    expect(inputByName('gradingMode').value).toBe('step');
    expect(inputByName('rubricTotalPoints').value).toBe('');
    expect(document.getElementById('assignment-create-point-value')).toBeNull();
  });

  it('opens every grading control behind one Change affordance', () => {
    root = renderSheet().root;

    act(() => {
      controlById('assignment-create-change-grading').click();
    });

    expectText('Point value');
    expectText('Scoring behavior');
    expectText('Grading assistance');
    expectText('Steps');
    expectText('Bands');
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
      'Graded out of 250 points in bands, read at the advanced level.'
    );
    expect(inputByName('pointValue').value).toBe('250');
    expect(inputByName('gradingMode').value).toBe('bands');
  });

  it('marks the chosen scoring behavior as the selected one', () => {
    root = renderSheet({ initialGradingMode: 'bands' }).root;

    act(() => {
      controlById('assignment-create-change-grading').click();
    });

    const step = controlById('assignment-create-grading-mode-step');
    const bands = controlById('assignment-create-grading-mode-bands');
    expect(bands.getAttribute('aria-pressed')).toBe('true');
    expect(step.getAttribute('aria-pressed')).toBe('false');
    // The chosen segment is the one lifted out of the recessed track.
    expect(bands.className).toContain('bg-popover');
    expect(step.className).not.toContain('bg-popover');
  });

  it('lets a teacher opt into bands grading without a customize gate', () => {
    root = renderSheet().root;

    act(() => {
      controlById('assignment-create-change-grading').click();
    });
    act(() => {
      controlById('assignment-create-grading-mode-bands').click();
    });

    expect(inputByName('gradingMode').value).toBe('bands');
    expectText(
      'Graded out of 100 points in bands, read at the intermediate level.'
    );
  });

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
});

describe('AssignmentCreationSheetContent writing time', () => {
  let root: Root | null = null;

  afterEach(() => {
    cleanup(root);
    root = null;
  });

  const timedTypes = [
    {
      id: 'daily-pages',
      title: 'Daily Pages',
      collaborationSupported: true,
      gradesGrammar: true,
      defaultWritingTimeMinutes: 15,
    },
    {
      id: 'essay',
      title: 'Thesis Essay',
      collaborationSupported: true,
      gradesGrammar: true,
      defaultWritingTimeMinutes: null,
    },
  ];

  it("prefills the assignment type's suggested writing time", () => {
    ({ root } = renderSheet({
      assignmentTypes: timedTypes,
      fixedAssignmentTypeId: 'daily-pages',
    }));

    expect(inputByName('writingTimeMinutes').value).toBe('15');
    expectText('Time students have to write');
  });

  it('is blank for a type with no suggested time', () => {
    ({ root } = renderSheet({
      assignmentTypes: timedTypes,
      fixedAssignmentTypeId: 'essay',
    }));

    expect(inputByName('writingTimeMinutes').value).toBe('');
  });

  it('shows the saved time when editing, and stays editable', () => {
    ({ root } = renderSheet({
      assignmentTypes: timedTypes,
      fixedAssignmentTypeId: 'daily-pages',
      editingAssignment: { id: 'assignment-1' },
      initialWritingTimeMinutes: 20,
    }));

    const input = inputByName('writingTimeMinutes');
    expect(input.value).toBe('20');
    expect(input.disabled).toBe(false);
  });

  it('never invents a time for an existing assignment that had none', () => {
    ({ root } = renderSheet({
      assignmentTypes: timedTypes,
      fixedAssignmentTypeId: 'daily-pages',
      editingAssignment: { id: 'assignment-1' },
      initialWritingTimeMinutes: null,
    }));

    expect(inputByName('writingTimeMinutes').value).toBe('');
  });
});

/**
 * The kinds of paragraph a Daily Pages entry practices. Most prompts ask for
 * more than one move, so the types are checkboxes: offered only for types
 * that take them, only the ones switched on, and none ticked by default —
 * which grades and tutors exactly as before.
 */
describe('AssignmentCreationSheetContent paragraph types', () => {
  let root: Root | null = null;

  afterEach(() => {
    cleanup(root);
    root = null;
  });

  const types = [
    {
      id: 'daily-pages',
      title: 'Daily Pages',
      collaborationSupported: true,
      gradesGrammar: true,
      offersParagraphModes: true,
    },
    {
      id: 'essay',
      title: 'Thesis Essay',
      collaborationSupported: true,
      gradesGrammar: true,
    },
  ];

  function boxes() {
    return Array.from(
      document.querySelectorAll<HTMLInputElement>(
        'input[type="checkbox"][name="paragraphMode"]'
      )
    );
  }

  function tick(value: string) {
    act(() => {
      boxes()
        .find((box) => box.value === value)!
        .click();
    });
  }

  it('offers a checkbox per switched-on type, none ticked', () => {
    ({ root } = renderSheet({
      assignmentTypes: types,
      fixedAssignmentTypeId: 'daily-pages',
    }));

    expectText('Paragraph types');
    expect(boxes().map((box) => box.value)).toEqual(['analyze', 'argue']);
    expect(boxes().every((box) => !box.checked)).toBe(true);
    expectText('any kind of paragraph');
  });

  it('describes each ticked type', () => {
    ({ root } = renderSheet({
      assignmentTypes: types,
      fixedAssignmentTypeId: 'daily-pages',
    }));

    tick('analyze');
    expectText('Claim-Evidence-Analysis');
    expectNoText('Position-Reason-Test');

    tick('argue');
    expect(boxes().filter((box) => box.checked).map((box) => box.value)).toEqual([
      'analyze',
      'argue',
    ]);
    expectText('Claim-Evidence-Analysis');
    expectText('Position-Reason-Test');
  });

  /** Picking a library prompt ticks the types it is tagged with. */
  it('starts with the types a library prompt was tagged with', () => {
    ({ root } = renderSheet({
      assignmentTypes: types,
      fixedAssignmentTypeId: 'daily-pages',
      initialParagraphModes: ['argue'],
    }));

    expect(boxes().filter((box) => box.checked).map((box) => box.value)).toEqual([
      'argue',
    ]);
  });

  it('is absent for a type that takes no paragraph type', () => {
    ({ root } = renderSheet({
      assignmentTypes: types,
      fixedAssignmentTypeId: 'essay',
    }));

    expect(boxes()).toHaveLength(0);
    expectNoText('Paragraph types');
  });

  it('is shown read-only when editing, and not submitted', () => {
    ({ root } = renderSheet({
      assignmentTypes: types,
      fixedAssignmentTypeId: 'daily-pages',
      editingAssignment: { id: 'assignment-1' },
      initialParagraphModes: ['analyze', 'argue'],
    }));

    expect(boxes()).toHaveLength(0);
    const shown = Array.from(
      document.querySelectorAll<HTMLInputElement>(
        '[data-testid="assignment-create-paragraph-modes"] input[type="checkbox"]'
      )
    );
    expect(shown.filter((box) => box.checked).map((box) => box.value)).toEqual([
      'analyze',
      'argue',
    ]);
    expect(shown.every((box) => box.disabled)).toBe(true);
  });
});
