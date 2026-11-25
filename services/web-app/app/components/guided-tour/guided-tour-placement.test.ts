import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Shared Bun test process.
}

import { describe, expect, mock, test } from 'bun:test';
import { tourForPage } from '~/domain/guided-tours/tours';

const { resolveSteps } = await import('./guided-tour');

describe('guided tour step resolution', () => {
  test('does not scroll every target while resolving document tour steps', () => {
    const scrollIntoView = mock((_options?: ScrollIntoViewOptions) => undefined);
    const original = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    const tour = tourForPage('/app/documents/doc-1', null, {
      waitingForApproval: false,
    });
    expect(tour).toBeTruthy();

    for (const step of tour!.steps) {
      const el = document.createElement('section');
      el.dataset.tour = step.target;
      el.getBoundingClientRect = () =>
        ({
          top: 40,
          left: 80,
          width: 200,
          height: 120,
          right: 280,
          bottom: 160,
          x: 80,
          y: 40,
          toJSON: () => ({}),
        }) as DOMRect;
      document.body.appendChild(el);
    }

    try {
      const steps = resolveSteps(tour!);
      expect(steps.length).toBeGreaterThanOrEqual(4);
      expect(scrollIntoView.mock.calls.length).toBe(0);
    } finally {
      HTMLElement.prototype.scrollIntoView = original;
      for (const step of tour!.steps) {
        document
          .querySelectorAll(`[data-tour="${step.target}"]`)
          .forEach((node) => node.remove());
      }
    }
  });
});