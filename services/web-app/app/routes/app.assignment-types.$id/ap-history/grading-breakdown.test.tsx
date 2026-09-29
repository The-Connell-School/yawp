import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, it } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  AP_HISTORY_DBQ_RUBRIC_POINTS,
  AP_HISTORY_LEQ_RUBRIC_POINTS,
} from '~/domain/ap-history/rubric';
import { ApHistoryGradingBreakdown } from './grading-breakdown';

let container: HTMLElement | null = null;
let root: Root | null = null;

function render(audience: 'teacher' | 'student') {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(<ApHistoryGradingBreakdown audience={audience} />);
  });
  return container;
}

function trigger(): HTMLButtonElement {
  const button = container!.querySelector('button');
  if (!button) throw new Error('grading breakdown trigger not found');
  return button as HTMLButtonElement;
}

function expand() {
  act(() => {
    trigger().click();
  });
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

describe('ApHistoryGradingBreakdown', () => {
  it('starts collapsed, showing only the trigger', () => {
    const text = render('teacher').textContent ?? '';

    expect(text).toContain('How DBQs and LEQs are graded');
    expect(trigger().getAttribute('data-state')).toBe('closed');
    expect(text).not.toContain('all-or-nothing');
  });

  it('lists every DBQ and LEQ rubric point once expanded', () => {
    render('teacher');
    expand();
    const text = container!.textContent ?? '';

    expect(trigger().getAttribute('data-state')).toBe('open');
    expect(text).toContain('DBQ — 7 points');
    expect(text).toContain('LEQ — 6 points');
    for (const point of [
      ...AP_HISTORY_DBQ_RUBRIC_POINTS,
      ...AP_HISTORY_LEQ_RUBRIC_POINTS,
    ]) {
      expect(text).toContain(point.label);
      expect(text).toContain(point.summary);
    }
  });

  it('addresses teachers in terms of their review and override', () => {
    render('teacher');
    expand();
    const text = container!.textContent ?? '';

    expect(text).toContain('all-or-nothing');
    expect(text).toContain('override before releasing grades');
  });

  it('addresses students in the second person', () => {
    render('student');
    expand();
    const text = container!.textContent ?? '';

    expect(text).toContain('you either earn it or you don’t');
    expect(text).toContain('after you submit');
  });
});
