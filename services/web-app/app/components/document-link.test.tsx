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

const submit = mock(() => {});

mock.module('./ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children?: unknown }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children?: unknown }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children?: unknown }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onSelect,
    onClick,
  }: {
    children?: unknown;
    onSelect?: () => void;
    onClick?: (event: MouseEvent) => void;
  }) => (
    <button
      type="button"
      role="menuitem"
      onClick={(event) => {
        onClick?.(event as unknown as MouseEvent);
        onSelect?.();
      }}
    >
      {children}
    </button>
  ),
}));

mock.module('react-router', () => ({
  Link: ({
    children,
    to,
    ...props
  }: {
    children?: unknown;
    to: string;
    className?: string;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useFetcher: () => ({
    submit,
    Form: ({
      children,
      ...props
    }: {
      children?: unknown;
      method?: string;
      action?: string;
    }) => <form {...props}>{children}</form>,
    state: 'idle',
  }),
}));

const { DocumentLink } = await import('./document-link');

function render(element: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

afterEach(() => {
  submit.mockClear();
  document.body.innerHTML = '';
});

function documentCard(overrides?: { isArchived?: boolean; id?: string }) {
  return (
    <DocumentLink
      exitTo="/app/assignment-types/type-1"
      isArchived={overrides?.isArchived}
      isStudentView
      doc={
        {
          id: overrides?.id ?? 'doc-try-it',
          title: 'Try it out essay',
          html: '',
          text: '',
          updatedAt: new Date('2026-11-24T12:00:00.000Z'),
          assignmentModuleSessions: [{ assignmentModule: { title: 'Draft' } }],
          submissions: [],
          assignment: { title: 'Sample document' },
          group: null,
        } as any
      }
    />
  );
}

describe('DocumentLink archive action', () => {
  it('archives a Try-it document through the model document route', async () => {
    const { container, root } = render(documentCard());

    const trigger = container.querySelector('button');
    expect(trigger).toBeTruthy();
    await act(async () => {
      trigger!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const archiveItem = [
      ...document.body.querySelectorAll('[role="menuitem"]'),
    ].find((item) => item.textContent?.trim() === 'Archive');
    expect(archiveItem).toBeTruthy();

    await act(async () => {
      archiveItem!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith(
      { action: 'archive' },
      { method: 'POST', action: '/api/model/document/doc-try-it' }
    );

    act(() => {
      root.unmount();
    });
  });

  it('unarchives from the archived list through the same route', async () => {
    const { container, root } = render(
      documentCard({ isArchived: true, id: 'doc-archived' })
    );

    const trigger = container.querySelector('button');
    await act(async () => {
      trigger!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const unarchiveItem = [
      ...document.body.querySelectorAll('[role="menuitem"]'),
    ].find((item) => item.textContent?.trim() === 'Unarchive');
    expect(unarchiveItem).toBeTruthy();

    await act(async () => {
      unarchiveItem!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(submit).toHaveBeenCalledWith(
      { action: 'unarchive' },
      { method: 'POST', action: '/api/model/document/doc-archived' }
    );

    act(() => {
      root.unmount();
    });
  });
});
