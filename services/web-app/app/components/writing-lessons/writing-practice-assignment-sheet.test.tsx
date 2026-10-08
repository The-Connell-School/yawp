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
  type FormHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type { PracticeSkillOption } from './practice-skill-picker';

const FetcherForm = ({
  children,
  ...props
}: FormHTMLAttributes<HTMLFormElement>) => <form {...props}>{children}</form>;

mock.module('react-router', () => ({
  useFetcher: () => ({ state: 'idle', data: null, Form: FetcherForm }),
}));

// Radix dialog primitives need a Dialog ancestor; the sheet shell is not what
// these tests are about, so it is flattened to plain elements.
mock.module('~/components/ui/sheet', () => ({
  Sheet: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SheetHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  SheetDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
}));

const {
  WritingPracticeAssignmentSheetContent,
  canSubmitWritingPracticeAssignment,
  suggestWritingPracticeTitle,
} = await import('./writing-practice-assignment-sheet');

const TEACHER_CLASSES = [
  { id: 'class-1', title: 'English 9', grade: '9', period: '2' },
];

const SKILLS: PracticeSkillOption[] = [
  {
    slug: 'fixing-comma-splices',
    title: 'Fixing Comma Splices',
    section: 'Grammar & Mechanics',
    category: 'Punctuation',
  },
  {
    slug: 'passive-voice',
    title: 'Passive Voice',
    section: 'Grammar & Mechanics',
    category: 'Sentence Structure',
  },
];

let root: Root | null = null;

function render(element: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(element);
  });
}

afterEach(() => {
  if (root) {
    act(() => {
      root!.unmount();
    });
    root = null;
  }
  document.body.innerHTML = '';
});

function click(selector: string) {
  const element = document.querySelector<HTMLElement>(selector);
  expect(element).not.toBeNull();
  act(() => {
    element!.click();
  });
}

function submittedSlugs() {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>('input[name="lessonSlugs"]')
  ).map((input) => input.value);
}

function submitButton() {
  return document.querySelector<HTMLButtonElement>('button[type="submit"]')!;
}

describe('WritingPracticeAssignmentSheetContent — one lesson', () => {
  it('assigns the lesson it was opened from', () => {
    render(
      <WritingPracticeAssignmentSheetContent
        lesson={{ slug: 'passive-voice', title: 'Passive Voice' }}
        teacherClasses={TEACHER_CLASSES}
        onOpenChange={() => {}}
      />
    );

    // Unchanged behavior: the lesson is fixed, so there is nothing to pick.
    expect(document.body.textContent).toContain('Assign Passive Voice');
    expect(submittedSlugs()).toEqual(['passive-voice']);
    expect(
      document.querySelector('[data-testid="practice-skill-passive-voice"]')
    ).toBeNull();
    expect(
      document.querySelector<HTMLInputElement>('input[name="title"]')!.value
    ).toBe('Passive Voice practice');
  });
});

describe('WritingPracticeAssignmentSheetContent — mixed practice', () => {
  function renderMixed() {
    render(
      <WritingPracticeAssignmentSheetContent
        skillOptions={SKILLS}
        teacherClasses={TEACHER_CLASSES}
        onOpenChange={() => {}}
      />
    );
  }

  it('carries every chosen skill into one assignment', () => {
    renderMixed();

    click('[data-testid="practice-skill-fixing-comma-splices"]');
    click('[data-testid="practice-skill-passive-voice"]');

    expect(submittedSlugs()).toEqual(['fixing-comma-splices', 'passive-voice']);
  });

  it('will not submit before a skill is picked', () => {
    renderMixed();

    expect(submitButton().disabled).toBe(true);

    click('[data-testid="practice-skill-passive-voice"]');
    click('[data-testid="writing-practice-class-class-1"]');

    // A due date is still missing, so the form stays closed.
    expect(submitButton().disabled).toBe(true);
  });

  it('names the set after the skill while only one is picked', () => {
    renderMixed();

    click('[data-testid="practice-skill-passive-voice"]');
    expect(
      document.querySelector<HTMLInputElement>('input[name="title"]')!.value
    ).toBe('Passive Voice practice');

    click('[data-testid="practice-skill-fixing-comma-splices"]');
    expect(
      document.querySelector<HTMLInputElement>('input[name="title"]')!.value
    ).toBe('Mixed writing practice');
  });
});

describe('WritingPracticeAssignmentSheetContent — opened from a lesson plan', () => {
  function renderPlanned() {
    render(
      <WritingPracticeAssignmentSheetContent
        skillOptions={SKILLS}
        initial={{
          slugs: ['fixing-comma-splices', 'passive-voice'],
          title: 'Sentence repair',
          problemCount: 8,
          instructions: 'Fix each one two ways.',
        }}
        teacherClasses={TEACHER_CLASSES}
        onOpenChange={() => {}}
      />
    );
  }

  it('opens on what the planner chose, still editable', () => {
    renderPlanned();

    expect(submittedSlugs()).toEqual(['fixing-comma-splices', 'passive-voice']);
    expect(
      document.querySelector<HTMLInputElement>('input[name="title"]')!.value
    ).toBe('Sentence repair');
    expect(
      document.querySelector<HTMLInputElement>('input[name="problemCount"]')!
        .value
    ).toBe('8');
    expect(
      document.querySelector<HTMLTextAreaElement>('textarea[name="instructions"]')!
        .value
    ).toBe('Fix each one two ways.');
    // The skills stay a choice: the teacher can still drop one.
    expect(
      document.querySelector('[data-testid="practice-skill-passive-voice"]')
    ).not.toBeNull();
  });

  it('keeps the planner’s title when the skills change', () => {
    renderPlanned();

    click('[data-testid="practice-skill-passive-voice"]');

    expect(submittedSlugs()).toEqual(['fixing-comma-splices']);
    expect(
      document.querySelector<HTMLInputElement>('input[name="title"]')!.value
    ).toBe('Sentence repair');
  });
});

describe('suggestWritingPracticeTitle', () => {
  it('names a single-skill set after its skill', () => {
    expect(suggestWritingPracticeTitle(['Passive Voice'])).toBe(
      'Passive Voice practice'
    );
  });

  it('names a set covering several skills for the mix, not the first skill', () => {
    expect(
      suggestWritingPracticeTitle(['Passive Voice', 'Fixing Comma Splices'])
    ).toBe('Mixed writing practice');
  });

  it('has a name ready before anything is picked', () => {
    expect(suggestWritingPracticeTitle([])).toBe('Writing practice');
  });
});

describe('canSubmitWritingPracticeAssignment', () => {
  const complete = {
    title: 'Friday warm-up',
    dueAt: '2026-12-01',
    lessonSlugs: ['passive-voice'],
    classIds: ['class-1'],
    problemCount: '5',
    isSubmitting: false,
  };

  it('accepts a complete assignment', () => {
    expect(canSubmitWritingPracticeAssignment(complete)).toBe(true);
  });

  it('accepts a mixed set covering several skills', () => {
    expect(
      canSubmitWritingPracticeAssignment({
        ...complete,
        lessonSlugs: ['passive-voice', 'fixing-comma-splices'],
      })
    ).toBe(true);
  });

  it('refuses an assignment that is missing a piece the action requires', () => {
    expect(
      canSubmitWritingPracticeAssignment({ ...complete, title: '   ' })
    ).toBe(false);
    expect(canSubmitWritingPracticeAssignment({ ...complete, dueAt: '' })).toBe(
      false
    );
    expect(
      canSubmitWritingPracticeAssignment({ ...complete, lessonSlugs: [] })
    ).toBe(false);
    expect(
      canSubmitWritingPracticeAssignment({ ...complete, classIds: [] })
    ).toBe(false);
  });

  it('refuses a problem count the assign action would reject', () => {
    expect(
      canSubmitWritingPracticeAssignment({ ...complete, problemCount: '0' })
    ).toBe(false);
    expect(
      canSubmitWritingPracticeAssignment({ ...complete, problemCount: '21' })
    ).toBe(false);
    expect(
      canSubmitWritingPracticeAssignment({ ...complete, problemCount: '20' })
    ).toBe(true);
  });

  it('refuses a second submit while the first is in flight', () => {
    expect(
      canSubmitWritingPracticeAssignment({ ...complete, isSubmitting: true })
    ).toBe(false);
  });
});
