import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, it } from 'bun:test';
import { act, useState, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import {
  PracticeSkillPicker,
  type PracticeSkillOption,
} from './practice-skill-picker';

const SKILLS: PracticeSkillOption[] = [
  {
    slug: 'fixing-comma-splices',
    title: 'Fixing Comma Splices',
    section: 'Grammar & Mechanics',
    category: 'Punctuation',
  },
  {
    slug: 'passive-voice',
    title: 'Passive Voice',
    section: 'Grammar & Mechanics',
    category: 'Sentence Structure',
  },
  {
    slug: 'thesis-statements',
    title: 'Thesis Statements',
    section: 'Composition',
    category: 'Making Claims',
  },
];

let root: Root | null = null;

function render(element: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(element);
  });
}

afterEach(() => {
  if (root) {
    act(() => {
      root!.unmount();
    });
    root = null;
  }
  document.body.innerHTML = '';
});

function checkboxFor(slug: string) {
  const input = document.querySelector<HTMLElement>(
    `[data-testid="practice-skill-${slug}"]`
  );
  expect(input).not.toBeNull();
  return input!;
}

function Harness({ skills = SKILLS }: { skills?: PracticeSkillOption[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <>
      <PracticeSkillPicker
        skills={skills}
        selected={selected}
        onSelectedChange={setSelected}
      />
      <p data-testid="selection">{selected.join(',')}</p>
    </>
  );
}

function selection() {
  return document.querySelector('[data-testid="selection"]')?.textContent ?? '';
}

describe('PracticeSkillPicker', () => {
  it('lists every skill grouped under its section and category', () => {
    render(<Harness />);

    expect(document.body.textContent).toContain('Grammar & Mechanics');
    expect(document.body.textContent).toContain('Punctuation');
    expect(document.body.textContent).toContain('Fixing Comma Splices');
    expect(document.body.textContent).toContain('Composition');
    expect(document.body.textContent).toContain('Thesis Statements');
  });

  it('mixes several skills into one selection', () => {
    render(<Harness />);

    act(() => {
      checkboxFor('fixing-comma-splices').click();
    });
    act(() => {
      checkboxFor('passive-voice').click();
    });

    expect(selection()).toBe('fixing-comma-splices,passive-voice');
  });

  it('drops a skill when it is unchecked', () => {
    render(<Harness />);

    act(() => {
      checkboxFor('passive-voice').click();
    });
    act(() => {
      checkboxFor('passive-voice').click();
    });

    expect(selection()).toBe('');
  });

  it('omits the section heading when only one section is offered', () => {
    render(
      <Harness skills={SKILLS.filter((s) => s.section !== 'Composition')} />
    );

    // With Composition dark there is only one section, so its name is noise —
    // the categories are what tell the skills apart.
    expect(document.body.textContent).not.toContain('Grammar & Mechanics');
    expect(document.body.textContent).toContain('Punctuation');
    expect(document.body.textContent).toContain('Passive Voice');
  });
});
