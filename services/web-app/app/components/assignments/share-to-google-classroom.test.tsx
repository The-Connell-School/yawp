import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, test } from 'bun:test';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const { ShareToGoogleClassroomButton, SHARE_TO_CLASSROOM_ACTION } =
  await import('./share-to-google-classroom');

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render(element: ReactElement) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(element);
  });
  return container;
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe('ShareToGoogleClassroomButton', () => {
  test('posts the class assignment to the share endpoint', () => {
    const el = render(
      <ShareToGoogleClassroomButton classAssignmentId="ca-1" />
    );

    const form = el.querySelector('form')!;
    expect(form.getAttribute('method')).toBe('post');
    expect(form.getAttribute('action')).toBe(SHARE_TO_CLASSROOM_ACTION);
    expect(
      el.querySelector<HTMLInputElement>('input[name="classAssignmentId"]')!
        .value
    ).toBe('ca-1');
  });

  test('submits natively so the browser can follow the cross-origin redirect', () => {
    // react-router's <Form> would resolve the redirect itself and be stopped at
    // classroom.google.com. If this ever becomes a data-router form, the flow
    // silently stops working — hence the assertion on the plain element.
    const el = render(
      <ShareToGoogleClassroomButton classAssignmentId="ca-1" />
    );

    const form = el.querySelector('form')!;
    expect(form.tagName).toBe('FORM');
    expect(form.getAttribute('target')).toBe('_blank');
  });

  test('submits with a real submit button, not a click handler', () => {
    const el = render(
      <ShareToGoogleClassroomButton classAssignmentId="ca-1" />
    );

    const button = el.querySelector('button')!;
    expect(button.getAttribute('type')).toBe('submit');
    expect(button.textContent).toContain('Share to Google Classroom');
  });
});
