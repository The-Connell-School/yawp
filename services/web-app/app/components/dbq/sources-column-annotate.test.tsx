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
import { SourcesColumn } from './sources-column';
import { sampleDbq } from './sample-data';
import { useDbqState } from './use-dbq-state';

// The production side rail passes allowSourceTools={false}; annotation tools
// must still be available there, so exercise that configuration.
function Harness() {
  const state = useDbqState(sampleDbq, 'untimed');
  return <SourcesColumn state={state} allowSourceTools={false} />;
}

let container: HTMLDivElement;
let root: Root;
let restoreSelection: (() => void) | null = null;

afterEach(() => {
  restoreSelection?.();
  restoreSelection = null;
  act(() => root.unmount());
  container.remove();
});

function render(element: Parameters<Root['render']>[0]) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(element));
}

function bodyRoot() {
  return container.querySelector<HTMLParagraphElement>('[data-source-body]')!;
}

function fakeSelect(start: number, end: number) {
  const node = bodyRoot().querySelector<HTMLElement>('[data-seg-start="0"]')!
    .firstChild!;
  const fake = {
    rangeCount: 1,
    isCollapsed: false,
    anchorNode: node,
    anchorOffset: start,
    focusNode: node,
    focusOffset: end,
  };
  const original = window.getSelection;
  (window as any).getSelection = () => fake;
  restoreSelection = () => {
    (window as any).getSelection = original;
  };
  act(() => {
    bodyRoot().dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
}

function toolbarButton(label: string) {
  return container.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`
  );
}

describe('SourcesColumn annotation tools', () => {
  it('shows the annotation toolbar only after selecting document text', () => {
    render(<Harness />);
    expect(toolbarButton('Highlight selection')).toBeNull();
    fakeSelect(4, 14);
    expect(toolbarButton('Highlight selection')).not.toBeNull();
    expect(toolbarButton('Underline selection')).not.toBeNull();
    expect(toolbarButton('Comment on selection')).not.toBeNull();
  });

  it('highlights the selected text and dismisses the toolbar', () => {
    render(<Harness />);
    const body = bodyRoot().textContent ?? '';
    fakeSelect(4, 14);
    act(() => toolbarButton('Highlight selection')!.click());

    const highlighted = container.querySelector(
      '[data-mark-kind~="highlight"]'
    );
    expect(highlighted).not.toBeNull();
    expect(highlighted?.textContent).toBe(body.slice(4, 14));
    expect(toolbarButton('Highlight selection')).toBeNull();
  });

  it('underlines the selected text', () => {
    render(<Harness />);
    const body = bodyRoot().textContent ?? '';
    fakeSelect(4, 14);
    act(() => toolbarButton('Underline selection')!.click());

    const underlined = container.querySelector(
      '[data-mark-kind~="underline"]'
    );
    expect(underlined?.textContent).toBe(body.slice(4, 14));
  });

  it('attaches a comment to a selection and lists it', () => {
    render(<Harness />);
    fakeSelect(4, 20);
    act(() => toolbarButton('Comment on selection')!.click());

    const textarea = container.querySelector('textarea')!;
    expect(textarea).not.toBeNull();
    // The comment editor is uncontrolled and read on save, so setting the DOM
    // value directly is sufficient here.
    act(() => {
      textarea.value = 'Point of view: former enslaver.';
    });
    act(() => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Save comment"]')!
        .click();
    });

    expect(container.textContent).toContain(
      'Point of view: former enslaver.'
    );
    // A commented range is also highlighted for visibility.
    expect(
      container.querySelector('[data-mark-kind~="highlight"]')
    ).not.toBeNull();
  });

  it('removes a mark from the annotations list', () => {
    render(<Harness />);
    fakeSelect(4, 14);
    act(() => toolbarButton('Highlight selection')!.click());
    expect(
      container.querySelector('[data-mark-kind~="highlight"]')
    ).not.toBeNull();

    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Remove annotation"]'
        )!
        .click();
    });
    expect(
      container.querySelector('[data-mark-kind~="highlight"]')
    ).toBeNull();
  });
});
