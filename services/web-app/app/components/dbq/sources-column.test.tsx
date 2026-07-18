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

function Harness() {
  const state = useDbqState(sampleDbq, 'untimed');
  return <SourcesColumn state={state} allowSourceTools={false} />;
}

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(element: Parameters<Root['render']>[0]) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(element));
}

function fullscreenButton() {
  return container.querySelector<HTMLButtonElement>(
    'button[aria-label="Full screen (expand documents)"]'
  );
}

function exitFullscreenButton() {
  return container.querySelector<HTMLButtonElement>(
    'button[aria-label="Exit full screen"]'
  );
}

describe('SourcesColumn full screen mode', () => {
  it('offers a full screen button in the Documents header', () => {
    render(<Harness />);
    const button = fullscreenButton();
    expect(button).not.toBeNull();
    expect(button?.getAttribute('aria-pressed')).toBe('false');
    expect(exitFullscreenButton()).toBeNull();
  });

  it('expands into a fixed dialog overlay and restores on exit', () => {
    render(<Harness />);
    const section = container.querySelector('section')!;
    expect(section.className).not.toContain('fixed');
    expect(section.getAttribute('role')).toBeNull();

    act(() => fullscreenButton()!.click());

    expect(section.className).toContain('fixed');
    expect(section.className).toContain('inset-0');
    expect(section.getAttribute('role')).toBe('dialog');
    expect(section.getAttribute('aria-modal')).toBe('true');
    expect(section.getAttribute('aria-label')).toBe('Documents full screen');
    const exit = exitFullscreenButton();
    expect(exit).not.toBeNull();
    expect(exit?.getAttribute('aria-pressed')).toBe('true');

    act(() => exit!.click());

    expect(section.className).not.toContain('fixed');
    expect(section.getAttribute('role')).toBeNull();
    expect(fullscreenButton()).not.toBeNull();
  });

  it('keeps the selected document when entering full screen', () => {
    render(<Harness />);
    const secondSource = sampleDbq.sources[1]!;
    const thumb = Array.from(container.querySelectorAll('button')).find(
      (b) => b.getAttribute('title') === secondSource.title
    )!;
    act(() => thumb.click());
    expect(
      Array.from(container.querySelectorAll('h3')).some(
        (h) => h.textContent === secondSource.title
      )
    ).toBe(true);

    act(() => fullscreenButton()!.click());

    expect(
      Array.from(container.querySelectorAll('h3')).some(
        (h) => h.textContent === secondSource.title
      )
    ).toBe(true);
  });

  it('exits full screen when Escape is pressed', () => {
    render(<Harness />);
    act(() => fullscreenButton()!.click());
    const section = container.querySelector('section')!;
    expect(section.className).toContain('fixed');

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      );
    });

    expect(section.className).not.toContain('fixed');
    expect(fullscreenButton()).not.toBeNull();
  });
});
