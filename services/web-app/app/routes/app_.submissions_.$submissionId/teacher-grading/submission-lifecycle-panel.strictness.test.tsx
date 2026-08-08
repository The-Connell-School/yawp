import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, it, mock } from 'bun:test';
import { act, type ReactElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// Radix renders the dropdown content only once it is open and the tooltip
// content only on hover. Both are flattened here so the strictness levels and
// their hover copy land in the DOM without driving a real pointer.
mock.module('~/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuLabel: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

mock.module('~/components/ui/tooltip', () => ({
  Tooltip: ({ children, text }: { children: ReactNode; text: ReactNode }) => (
    <>
      {children}
      <span>{text}</span>
    </>
  ),
}));

const { GradingAssistantSplitButton } = await import(
  './submission-lifecycle-panel'
);
import {
  type SavedGradeSnapshot,
  type TeacherGradingPanelHeaderState,
} from './teacher-grading-panel';

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

function headerState(
  overrides: Partial<TeacherGradingPanelHeaderState> = {}
): TeacherGradingPanelHeaderState {
  return {
    gradeDisplay: '77%',
    gradeBadgeClassName: '',
    hasUnsavedChanges: false,
    hasDraftToReplace: false,
    hasNumericPercentage: true,
    isGenerating: false,
    isAiRetrying: false,
    isBusy: false,
    isSavingDraft: false,
    gradingAssistantStrictnessLevel: 'advanced',
    gradingAssistantStrictnessLabel: 'Advanced',
    setGradingAssistantStrictnessLevel: () => {},
    generateAiSuggestions: () => {},
    generateAiSuggestionsAtLevel: () => {},
    saveDraft: async () => {},
    discardDraft: () => {},
    getSavedGradeSnapshot: () => ({}) as SavedGradeSnapshot,
    ...overrides,
  };
}

describe('GradingAssistantSplitButton', () => {
  let root: Root | null = null;

  afterEach(() => {
    cleanup(root);
    root = null;
  });

  it('renders the strictness dropdown alongside the primary button', () => {
    ({ root } = render(
      <GradingAssistantSplitButton
        headerState={headerState()}
        isPendingStart={false}
        onStart={() => {}}
        onAbortStart={() => {}}
      />
    ));

    const generate = document.querySelector<HTMLButtonElement>(
      '[data-testid="grading-assistant-generate"]'
    );
    expect(generate).not.toBeNull();
    expect(
      document.querySelector('[data-testid="grading-assistant-strictness-menu"]')
    ).not.toBeNull();

    // The split-button seam: the primary button drops its right edge only
    // because the dropdown trigger sits flush against it.
    expect(generate?.className).toContain('rounded-r-none');
    expect(generate?.className).toContain('border-r-0');
  });

  it('explains each level as a reading posture on hover, never as a point adjustment', () => {
    ({ root } = render(
      <GradingAssistantSplitButton
        headerState={headerState()}
        isPendingStart={false}
        onStart={() => {}}
        onAbortStart={() => {}}
      />
    ));

    for (const level of ['beginner', 'intermediate', 'advanced']) {
      expect(
        document.querySelector(
          `[data-testid="grading-assistant-strictness-${level}"]`
        )
      ).not.toBeNull();
    }

    expect(document.body.textContent).toContain(
      'The assistant reads gently, expecting a writer still learning the fundamentals.'
    );
    expect(document.body.textContent).toContain(
      'The assistant reads at the standard expected for the grade level.'
    );
    expect(document.body.textContent).toContain(
      'The assistant reads demandingly, expecting polished and precise writing.'
    );
    expect(document.body.textContent).not.toContain('points');
  });

  it('runs the grading assistant at the assignment strictness level', () => {
    const generateAiSuggestions = mock();
    ({ root } = render(
      <GradingAssistantSplitButton
        headerState={headerState({
          hasDraftToReplace: false,
          gradingAssistantStrictnessLevel: 'advanced',
          generateAiSuggestions,
        })}
        isPendingStart={false}
        onStart={() => {}}
        onAbortStart={() => {}}
      />
    ));

    const generate = document.querySelector<HTMLButtonElement>(
      '[data-testid="grading-assistant-generate"]'
    );

    act(() => {
      generate?.click();
    });

    // The primary button runs at whatever level the assignment carries; only
    // the dropdown switches levels. Restoring the picker changed neither.
    expect(generateAiSuggestions).toHaveBeenCalledTimes(1);
  });

  it('runs the grading assistant at a level picked from the dropdown', () => {
    const generateAiSuggestionsAtLevel = mock();
    ({ root } = render(
      <GradingAssistantSplitButton
        headerState={headerState({ generateAiSuggestionsAtLevel })}
        isPendingStart={false}
        onStart={() => {}}
        onAbortStart={() => {}}
      />
    ));

    const beginner = document.querySelector<HTMLButtonElement>(
      '[data-testid="grading-assistant-strictness-beginner"]'
    );

    act(() => {
      beginner?.click();
    });

    expect(generateAiSuggestionsAtLevel).toHaveBeenCalledTimes(1);
    expect(generateAiSuggestionsAtLevel.mock.calls[0][0]).toBe('beginner');
  });
});
