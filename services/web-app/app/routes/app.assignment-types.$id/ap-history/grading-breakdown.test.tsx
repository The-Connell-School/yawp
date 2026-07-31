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

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

describe('ApHistoryGradingBreakdown', () => {
  it('lists every DBQ and LEQ rubric point with its point total', () => {
    const text = render('teacher').textContent ?? '';

    expect(text).toContain('How DBQs and LEQs are graded');
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
    const text = render('teacher').textContent ?? '';

    expect(text).toContain('all-or-nothing');
    expect(text).toContain('override before releasing grades');
  });

  it('addresses students in the second person', () => {
    const text = render('student').textContent ?? '';

    expect(text).toContain('you either earn it or you don’t');
    expect(text).toContain('after you submit');
  });
});
