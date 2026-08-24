import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, type ReactElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type { PracticeSkillOption } from './practice-skill-picker';

const navigate = mock();
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

mock.module('react-router', () => ({
  useNavigate: () => navigate,
}));

const { StudentPracticeBuilderContent, isValidProblemCount } =
  await import('./student-practice-builder');

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

beforeEach(() => {
  navigate.mockReset();
});

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

function startButton() {
  const button = document.querySelector<HTMLButtonElement>(
    '[data-testid="start-practice"]'
  );
  expect(button).not.toBeNull();
  return button!;
}

describe('StudentPracticeBuilderContent', () => {
  it('cannot start a set before a skill is chosen', () => {
    render(
      <StudentPracticeBuilderContent skills={SKILLS} onOpenChange={() => {}} />
    );

    expect(startButton().disabled).toBe(true);
  });

  it('starts a mixed set from every skill the student picked', () => {
    render(
      <StudentPracticeBuilderContent skills={SKILLS} onOpenChange={() => {}} />
    );

    click('[data-testid="practice-skill-fixing-comma-splices"]');
    click('[data-testid="practice-skill-passive-voice"]');
    click('[data-testid="practice-count-10"]');
    click('[data-testid="start-practice"]');

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate.mock.calls[0][0]).toBe(
      '/app/writing-lessons/practice?skills=fixing-comma-splices%2Cpassive-voice&count=10'
    );
  });

  it('defaults to five problems when the student leaves the count alone', () => {
    render(
      <StudentPracticeBuilderContent skills={SKILLS} onOpenChange={() => {}} />
    );

    click('[data-testid="practice-skill-passive-voice"]');
    click('[data-testid="start-practice"]');

    expect(navigate.mock.calls[0][0]).toBe(
      '/app/writing-lessons/practice?skills=passive-voice&count=5'
    );
  });

  it('keeps a chosen count out of the set when it is outside the session window', () => {
    // Typing cannot be simulated here, so the rule the input feeds is tested
    // where it lives.
    expect(isValidProblemCount('99')).toBe(false);
    expect(isValidProblemCount('0')).toBe(false);
    expect(isValidProblemCount('2.5')).toBe(false);
    expect(isValidProblemCount('')).toBe(false);
    expect(isValidProblemCount('20')).toBe(true);
    expect(isValidProblemCount('1')).toBe(true);
  });
});
