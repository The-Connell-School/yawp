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
import { FilterPills } from './filter-pills';

void mock.module('lucide-react', () => ({
  ChevronLeft: () => <span data-icon="left" />,
  ChevronRight: () => <span data-icon="right" />,
}));

function render(element: ReactElement) {
  const container = document.createElement('div');
  container.style.width = '260px';
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('FilterPills overflow affordances', () => {
  it('exposes scroll data attributes when pills overflow the track', async () => {
    const options = [
      { value: 'all' as const, label: 'All', count: 12 },
      { value: 'in-progress' as const, label: 'In Progress', count: 3 },
      {
        value: 'needs-grading' as const,
        label: 'Needs Grading',
        count: 2,
        dotClassName: 'bg-amber-500',
      },
      {
        value: 'graded' as const,
        label: 'Needs Releasing',
        count: 1,
        dotClassName: 'bg-blue-600',
      },
      {
        value: 'released' as const,
        label: 'Released',
        count: 6,
        dotClassName: 'bg-emerald-600',
      },
    ];

    const { container, root } = render(
      <FilterPills
        ariaLabel="Filter by status"
        testId="overflow-status-chips"
        value="all"
        onChange={() => {}}
        options={options}
      />
    );

    const list = container.querySelector<HTMLElement>(
      '[data-testid="overflow-status-chips"]'
    );
    expect(list).toBeTruthy();

    const track = list?.querySelector<HTMLElement>(
      '.overflow-x-auto'
    );
    expect(track).toBeTruthy();

    Object.defineProperty(track!, 'clientWidth', {
      configurable: true,
      value: 200,
    });
    Object.defineProperty(track!, 'scrollWidth', {
      configurable: true,
      value: 520,
    });
    track!.scrollLeft = 0;

    await act(async () => {
      track?.dispatchEvent(new Event('scroll'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(list?.getAttribute('data-has-overflow')).toBe('true');
    expect(list?.getAttribute('data-can-scroll-right')).toBe('true');
    expect(list?.getAttribute('data-can-scroll-left')).toBe('false');
    expect(
      container.querySelector('[data-testid="overflow-status-chips-scroll-right"]')
    ).toBeTruthy();

    track!.scrollLeft = 320;
    await act(async () => {
      track?.dispatchEvent(new Event('scroll'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(list?.getAttribute('data-can-scroll-left')).toBe('true');
    expect(list?.getAttribute('data-can-scroll-right')).toBe('false');

    act(() => {
      root.unmount();
    });
  });
});