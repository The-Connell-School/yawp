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
import { SourceBody, pointToOffset } from './source-body';
import type { TextMark } from './types';

const body = 'The Thirteenth Amendment abolished slavery.';

function mark(overrides: Partial<TextMark>): TextMark {
  return {
    id: 'm1',
    sourceId: 'src-a',
    kind: 'highlight',
    start: 0,
    end: 3,
    quote: '',
    note: '',
    createdAt: 0,
    ...overrides,
  };
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

describe('SourceBody rendering', () => {
  it('renders the full body text across segments', () => {
    render(<SourceBody body={body} marks={[]} onSelect={() => {}} />);
    expect(container.textContent).toBe(body);
    // No marks → a single segment, nothing styled as a mark.
    expect(container.querySelectorAll('[data-mark-kind]').length).toBe(0);
  });

  it('marks a highlighted range with highlight styling', () => {
    render(
      <SourceBody
        body={body}
        marks={[mark({ start: 4, end: 24 })]}
        onSelect={() => {}}
      />
    );
    expect(container.textContent).toBe(body);
    const highlighted = container.querySelector('[data-mark-kind~="highlight"]');
    expect(highlighted).not.toBeNull();
    expect(highlighted?.textContent).toBe('Thirteenth Amendment');
  });

  it('renders underline and highlight kinds independently', () => {
    render(
      <SourceBody
        body={body}
        marks={[
          mark({ id: 'a', kind: 'underline', start: 0, end: 3 }),
          mark({ id: 'b', kind: 'highlight', start: 25, end: 34 }),
        ]}
        onSelect={() => {}}
      />
    );
    expect(
      container.querySelector('[data-mark-kind~="underline"]')?.textContent
    ).toBe('The');
    expect(
      container.querySelector('[data-mark-kind~="highlight"]')?.textContent
    ).toBe('abolished');
  });

  it('exposes segment offsets so selections can be resolved', () => {
    render(
      <SourceBody
        body={body}
        marks={[mark({ start: 4, end: 24 })]}
        onSelect={() => {}}
      />
    );
    const segs = Array.from(
      container.querySelectorAll<HTMLElement>('[data-seg-start]')
    );
    expect(segs.length).toBeGreaterThan(1);
    expect(segs[0].dataset.segStart).toBe('0');
  });
});

describe('pointToOffset', () => {
  it('maps a text node + local offset to an absolute body offset', () => {
    render(
      <SourceBody
        body={body}
        marks={[mark({ start: 4, end: 24 })]}
        onSelect={() => {}}
      />
    );
    const seg = container.querySelector<HTMLElement>(
      '[data-seg-start="4"]'
    )!;
    const textNode = seg.firstChild!;
    // Offset 5 within the "Thirteenth Amendment" segment → absolute 9.
    expect(pointToOffset(container, textNode, 5)).toBe(9);
  });

  it('returns null when the point is outside any segment', () => {
    render(
      <SourceBody body={body} marks={[]} onSelect={() => {}} />
    );
    const stray = document.createElement('div');
    expect(pointToOffset(container, stray, 0)).toBeNull();
  });
});
