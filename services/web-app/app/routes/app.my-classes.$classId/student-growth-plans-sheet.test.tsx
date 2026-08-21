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
import { MemoryRouter } from 'react-router';

import {
  StudentGrowthPlansSheetContent,
  type GrowthPlanSheetStudent,
  type StudentGrowthPlan,
} from './student-growth-plans-sheet';
import type { StudentPasteAlert } from './student-paste-alerts-section';

const STUDENT: GrowthPlanSheetStudent = {
  id: 'student-1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
};

const PLAN: StudentGrowthPlan = {
  id: 'plan-1',
  focus: 'Strengthen thesis clarity',
  targetSkills: ['thesis_and_content', 'evidence_and_support'],
  body: 'Work on stating an arguable claim in the first paragraph.',
  checkInAt: '2026-08-01T00:00:00.000Z',
  status: 'active',
  createdAt: '2026-07-01T00:00:00.000Z',
};

let root: Root | null = null;

function render(element: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(<MemoryRouter>{element}</MemoryRouter>);
  });
  return container;
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  document.body.innerHTML = '';
  root = null;
});

describe('StudentGrowthPlansSheetContent', () => {
  it('shows the empty state when the student has no growth plans', () => {
    const el = render(
      <StudentGrowthPlansSheetContent
        renderSheet={false}
        student={STUDENT}
        growthPlans={[]}
        onViewDocuments={() => {}}
      />
    );
    expect(el.textContent).toMatch(/no growth plans yet/i);
  });

  it('renders a student’s growth plans read-only', () => {
    const el = render(
      <StudentGrowthPlansSheetContent
        renderSheet={false}
        student={STUDENT}
        growthPlans={[PLAN]}
        onViewDocuments={() => {}}
      />
    );
    expect(el.textContent).toContain('Ada Lovelace');
    expect(el.textContent).toContain('Strengthen thesis clarity');
    expect(el.textContent).toContain(
      'Work on stating an arguable claim in the first paragraph.'
    );
    expect(el.textContent).toMatch(/thesis and content/i);
    expect(el.textContent).toMatch(/check in by/i);
    // Read-only: no edit/create/supersede affordances.
    expect(el.textContent?.toLowerCase()).not.toContain('edit');
    expect(el.textContent?.toLowerCase()).not.toContain('supersede');
    expect(el.querySelector('input, textarea')).toBeNull();
  });

  it('routes the pill link through onViewDocuments so the caller can close the sheet and navigate', () => {
    const onViewDocuments = mock();
    const el = render(
      <StudentGrowthPlansSheetContent
        renderSheet={false}
        student={STUDENT}
        growthPlans={[PLAN]}
        onViewDocuments={onViewDocuments}
      />
    );
    const pill = Array.from(el.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Docs')
    )!;
    expect(pill).toBeDefined();
    act(() => {
      pill.dispatchEvent(new Event('click', { bubbles: true }));
    });
    expect(onViewDocuments).toHaveBeenCalledTimes(1);
  });

  it('shows paste activity alongside growth plans when the student has any', () => {
    const pasteAlerts: StudentPasteAlert[] = [
      {
        id: 'alert-1',
        documentId: 'doc-abc123',
        textLength: 312,
        createdAt: new Date().toISOString(),
      },
    ];
    const el = render(
      <StudentGrowthPlansSheetContent
        renderSheet={false}
        student={STUDENT}
        growthPlans={[]}
        onViewDocuments={() => {}}
        pasteAlerts={pasteAlerts}
        pasteAlertsExitTo="/app/my-classes/class-1"
      />
    );
    expect(el.textContent).toContain('doc-abc123');
    expect(el.textContent).toMatch(/no growth plans yet/i);
  });

  it('hides the growth plans section but still shows paste activity when showGrowthPlans is false', () => {
    const pasteAlerts: StudentPasteAlert[] = [
      {
        id: 'alert-1',
        documentId: 'doc-abc123',
        textLength: 312,
        createdAt: new Date().toISOString(),
      },
    ];
    const el = render(
      <StudentGrowthPlansSheetContent
        renderSheet={false}
        student={STUDENT}
        growthPlans={[]}
        onViewDocuments={() => {}}
        pasteAlerts={pasteAlerts}
        pasteAlertsExitTo="/app/my-classes/class-1"
        showGrowthPlans={false}
      />
    );
    expect(el.textContent).not.toMatch(/no growth plans yet/i);
    expect(el.textContent).not.toMatch(/growth plans from reporter/i);
    expect(el.textContent).toContain('doc-abc123');
  });
});
