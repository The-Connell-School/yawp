import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, useEffect, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { TeacherGradingPanelHeaderState } from './teacher-grading-panel';

const toastError = mock();

mock.module('sonner', () => ({
  toast: { error: toastError, success: mock() },
}));

let currentHeaderState: TeacherGradingPanelHeaderState;

mock.module('./teacher-grading-panel', () => ({
  TeacherGradingPanel: ({
    onHeaderStateChange,
  }: {
    onHeaderStateChange?: (state: TeacherGradingPanelHeaderState) => void;
  }) => {
    useEffect(() => {
      onHeaderStateChange?.(currentHeaderState);
    }, [onHeaderStateChange]);
    return null;
  },
}));

const { SubmissionLifecyclePanel } = await import('./submission-lifecycle-panel');

const UNSUBMITTED_MESSAGE =
  'This submission was unsubmitted before you could grade it. Please refresh the page.';

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
    gradeDisplay: '90%',
    gradeBadgeClassName: '',
    hasUnsavedChanges: true,
    hasDraftToReplace: false,
    hasNumericPercentage: true,
    isGenerating: false,
    isAiRetrying: false,
    isBusy: false,
    isSavingDraft: false,
    gradingAssistantStrictnessLevel: 'intermediate',
    gradingAssistantStrictnessLabel: 'Intermediate',
    setGradingAssistantStrictnessLevel: () => {},
    generateAiSuggestions: () => {},
    generateAiSuggestionsAtLevel: () => {},
    saveDraft: async () => {},
    discardDraft: () => {},
    getSavedGradeSnapshot: () => ({}) as any,
    ...overrides,
  };
}

describe('SubmissionLifecyclePanel save error handling', () => {
  let root: Root | null = null;

  beforeEach(() => {
    toastError.mockReset();
  });

  afterEach(() => {
    cleanup(root);
    root = null;
  });

  it('shows the server withdrawal message and exits edit mode instead of silently succeeding', async () => {
    currentHeaderState = headerState({
      saveDraft: async () => {
        throw new Error(UNSUBMITTED_MESSAGE);
      },
    });

    const onEditingGradeChange = mock();
    const onMarkGraded = mock(async () => {});
    const onGradeSaved = mock();

    ({ root } = render(
      <SubmissionLifecyclePanel
        lifecycleState="needs_grading"
        isEditingGrade
        onEditingGradeChange={onEditingGradeChange}
        onMarkGraded={onMarkGraded}
        onGradeSaved={onGradeSaved}
        isSavingGrade={false}
        onRelease={() => {}}
        isReleasing={false}
        submissionForView={{} as any}
        documentId="doc-1"
        submissionId="sub-1"
        existingGrade={{ id: 'sub-1' } as any}
        grammarIssues={[]}
        hiddenGrammarIssueIds={[]}
        onToggleGrammarIssue={() => {}}
        onRemoveGrammarIssue={() => {}}
        onGrammarIssuesChange={() => {}}
      />
    ));

    const saveButton = document.querySelector<HTMLButtonElement>(
      '[data-testid="submission-lifecycle-save"]'
    );
    expect(saveButton).not.toBeNull();

    await act(async () => {
      saveButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(toastError).toHaveBeenCalledWith(UNSUBMITTED_MESSAGE);
    // Kicked out of the edit form rather than left on a save that will
    // never succeed.
    expect(onEditingGradeChange).toHaveBeenCalledWith(false);
    // Never proceeded to mark-as-graded or apply the optimistic snapshot
    // once the save itself was refused.
    expect(onMarkGraded).not.toHaveBeenCalled();
    expect(onGradeSaved).not.toHaveBeenCalled();
  });

  it('surfaces the same withdrawal error when mark-as-graded is refused after a successful field save', async () => {
    currentHeaderState = headerState({
      saveDraft: async () => {},
    });

    const onEditingGradeChange = mock();
    const onMarkGraded = mock(async () => {
      throw new Error(UNSUBMITTED_MESSAGE);
    });
    const onGradeSaved = mock();

    ({ root } = render(
      <SubmissionLifecyclePanel
        lifecycleState="needs_grading"
        isEditingGrade
        onEditingGradeChange={onEditingGradeChange}
        onMarkGraded={onMarkGraded}
        onGradeSaved={onGradeSaved}
        isSavingGrade={false}
        onRelease={() => {}}
        isReleasing={false}
        submissionForView={{} as any}
        documentId="doc-1"
        submissionId="sub-1"
        existingGrade={{ id: 'sub-1' } as any}
        grammarIssues={[]}
        hiddenGrammarIssueIds={[]}
        onToggleGrammarIssue={() => {}}
        onRemoveGrammarIssue={() => {}}
        onGrammarIssuesChange={() => {}}
      />
    ));

    const saveButton = document.querySelector<HTMLButtonElement>(
      '[data-testid="submission-lifecycle-save"]'
    );

    await act(async () => {
      saveButton?.click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onMarkGraded).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalledWith(UNSUBMITTED_MESSAGE);
    expect(onEditingGradeChange).toHaveBeenCalledWith(false);
  });
});
