import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TutorStepProgress } from './tutor-step-progress';

describe('TutorStepProgress', () => {
  test('renders one segment per step', () => {
    const html = renderToStaticMarkup(
      createElement(TutorStepProgress, {
        instructionsCompleted: 5,
        totalSteps: 8,
      })
    );
    expect(html.match(/doc-editor-tutor-progress-seg/g)?.length).toBe(8);
    expect(html).toContain('is-current');
    expect(html).toContain('is-done');
    expect(html).toContain('is-upcoming');
  });
});