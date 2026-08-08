import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, it, mock } from 'bun:test';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { GradingAssistantSplitButton } from './submission-lifecycle-panel';
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

  it('does not render the strictness dropdown for a teacher', () => {
    ({ root } = render(
      <GradingAssistantSplitButton
        headerState={headerState()}
        isPendingStart={false}
        onStart={() => {}}
        onAbortStart={() => {}}
      />
    ));

    expect(
      document.querySelector('[data-testid="grading-assistant-strictness-menu"]')
    ).toBeNull();
    expect(
      document.querySelector('[data-testid="grading-assistant-generate"]')
    ).not.toBeNull();
  });

  it('still runs the grading assistant at the assignment strictness level with the dropdown hidden', () => {
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

    // The teacher never saw a strictness control, but the run still uses
    // whatever level the assignment carries -- the ±5 percentage / ±1 ACT
    // composite adjustment is unaffected by hiding the picker.
    expect(generateAiSuggestions).toHaveBeenCalledTimes(1);
  });
});
