import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, it, mock } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const actualDialog = await import('~/components/ui/dialog');
mock.module('~/components/ui/dialog', () => ({
  ...actualDialog,
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div role="dialog">{children}</div>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
}));

const { AssignmentPromptAttachment } =
  await import('./assignment-prompt-attachment');

let root: Root | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  document.body.innerHTML = '';
  root = null;
});

describe('AssignmentPromptAttachment', () => {
  it('wires the attachment button to the authenticated modal PDF viewer', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root!.render(
        <AssignmentPromptAttachment
          assignmentId="assignment-1"
          fileName="Essay directions.pdf"
        />
      );
    });

    const trigger = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Essay directions.pdf')
    )!;
    expect(trigger).toBeDefined();
    expect(trigger.getAttribute('aria-label')).toBe(
      'View prompt attachment: Essay directions.pdf'
    );

    const frame = document.querySelector('iframe');
    expect(frame?.getAttribute('src')).toBe(
      '/api/domain/assignment-prompt-attachment/assignment-1'
    );
    expect(frame?.getAttribute('title')).toBe('Essay directions.pdf');
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });
});
