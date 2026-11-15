import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, mock, test } from 'bun:test';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CollapsibleGroupSection } from './collapsible-group-section';

let root: Root | null = null;

function render(element: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(element));
  return container;
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  document.body.innerHTML = '';
  root = null;
});

function Controlled({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <CollapsibleGroupSection
      label="Exit Ticket"
      count={3}
      open={open}
      onOpenChange={(next) => {
        onOpenChange?.(next);
        setOpen(next);
      }}
      data-testid="section"
    >
      <p>rows</p>
    </CollapsibleGroupSection>
  );
}

describe('CollapsibleGroupSection', () => {
  test('is the Documents page group: bordered card, muted heading button with label and count', () => {
    const el = render(<Controlled />);
    const section = el.querySelector('[data-testid="section"]') as HTMLElement;
    expect(section.className).toBe(
      'overflow-hidden rounded-lg border bg-background shadow-sm'
    );
    const heading = section.querySelector('button')!;
    expect(heading.className).toContain('bg-muted/70');
    expect(heading.getAttribute('aria-expanded')).toBe('true');
    expect(heading.textContent).toBe('Exit Ticket3');
    expect(section.textContent).toContain('rows');
  });

  test('the heading toggles the section', () => {
    const onOpenChange = mock();
    const el = render(<Controlled onOpenChange={onOpenChange} />);
    const heading = el.querySelector('button')!;

    act(() => heading.click());
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(heading.getAttribute('aria-expanded')).toBe('false');
    const content = document.getElementById(heading.getAttribute("aria-controls")!);
    // Radix unmounts closed content once its exit animation ends; until then
    // it is marked closed.
    expect(content === null || content.getAttribute('data-state') === 'closed').toBe(true);

    act(() => heading.click());
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    expect(el.textContent).toContain('rows');
  });

  test('takes custom label content, as the status grouping renders a badge', () => {
    const el = render(
      <CollapsibleGroupSection
        label="Graded"
        labelContent={<span data-testid="custom">Graded!</span>}
        count={1}
        open
        onOpenChange={() => {}}
      >
        <p>rows</p>
      </CollapsibleGroupSection>
    );
    expect(el.querySelector('[data-testid="custom"]')?.textContent).toBe('Graded!');
  });
});
