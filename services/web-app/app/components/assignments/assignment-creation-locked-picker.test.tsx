import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, it, mock } from 'bun:test';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  buildFreeAccountUsage,
  type FreeAccountUsage,
} from '~/domain/free-tier/inapp-usage';

const usage: FreeAccountUsage = {
  ...buildFreeAccountUsage({
    seatCap: 35,
    lessonPlanCap: 5,
    assignmentCaps: {
      class_starter: 12,
      prewriting: 3,
      thesis_statement: 3,
    },
    students: 0,
    pendingInvites: 0,
    lessonPlans: 0,
    assignmentCounts: {},
  }),
  classId: 'class-1',
  checklist: {
    classReady: true,
    assignmentCreated: false,
    writingSubmitted: false,
    graded: false,
  },
  gradingPause: null,
};

mock.module('~/components/free-account-usage', () => ({
  useFreeAccountUsage: () => usage,
}));

mock.module('react-router', () => ({
  useFetcher: () => ({ state: 'idle', data: undefined, Form: ({ children }: { children: ReactNode }) => <form>{children}</form> }),
  useNavigate: () => () => {},
}));

const { AssignmentCreationSheet } = await import('./assignment-creation-sheet');

describe('AssignmentCreationSheet teaching locked preview', () => {
  let root: Root | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = '';
  });

  it('does not render the creation sheet while teaching is locked', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root!.render(
        <AssignmentCreationSheet
          open
          onOpenChange={() => {}}
          entryPoint="dashboard"
          teachingLocked
          initialAssignmentTypeId="type-class-starter"
          assignmentTypes={[
            {
              id: 'type-class-starter',
              title: 'Class Starter',
              kind: 'class_starter',
              collaborationSupported: false,
              gradesGrammar: false,
            },
          ]}
          teacherClasses={[{ id: 'c1', grade: '10', period: '1' }]}
          siteLicenseLockedAssignmentTiles={[]}
        />
      );
    });
    expect(document.body.textContent).not.toContain('Choose a type.');
    expect(document.body.textContent).not.toContain('New Assignment');
  });
});
