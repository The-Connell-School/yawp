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

import { AttributedDraft, DraftColourKey } from './contribution-panel';
import {
  authorColor,
  buildAuthorColorScale,
} from '~/domain/collaboration/author-colors';
import type { ContributionMember } from '~/domain/collaboration/contribution.server';
import type { AttributedRun } from '~/domain/collaboration/contribution';

/**
 * The colour key, which is the only thing on the page that says what a colour
 * means. Without it the tinted draft is a puzzle: the teacher has a paragraph in
 * one shade and no way to turn that shade into a person short of matching it
 * against the avatars in the table above.
 */

let root: Root | null = null;

/**
 * No router and no fetcher, because the key needs neither. Rendering the whole
 * panel would drag in the grade cards, whose `useFetcher` another test file
 * replaces process-wide with a stub that has no `Form` — `mock.module` is
 * global and never unwinds, so these tests would pass alone and fail in the
 * full suite for a reason that has nothing to do with the key.
 */
function render(element: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(element);
  });
  return container;
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  document.body.innerHTML = '';
  root = null;
});

function member(
  overrides: Partial<ContributionMember> = {}
): ContributionMember {
  return {
    membershipId: 'member-1',
    name: 'Ada Okonkwo',
    survivingChars: 100,
    survivingShare: 100,
    charsInserted: 100,
    charsDeleted: 0,
    sessionCount: 1,
    updateCount: 1,
    firstSeenAt: '2026-08-17T09:00:00.000Z',
    lastSeenAt: '2026-08-17T09:20:00.000Z',
    hasWritten: true,
    ...overrides,
  };
}

/** The scale the panel builds: current members first, then anyone who left. */
function scaleFor(
  members: ContributionMember[],
  paragraphs: AttributedRun[][]
) {
  return buildAuthorColorScale([
    ...members.map((m) => m.membershipId),
    ...paragraphs.flatMap((runs) =>
      runs
        .map((run) => run.membershipId)
        .filter((id): id is string => id !== null)
    ),
  ]);
}

function panel({
  members = [member()],
  paragraphs = [[{ membershipId: 'member-1', text: 'Ada wrote this.' }]],
}: {
  members?: ContributionMember[];
  paragraphs?: AttributedRun[][];
} = {}) {
  return (
    <DraftColourKey
      members={members}
      paragraphs={paragraphs}
      colorScale={scaleFor(members, paragraphs)}
    />
  );
}

function key(container: HTMLElement) {
  return container.querySelector('[data-testid="contribution-draft-key"]');
}

describe('the draft colour key', () => {
  test('names every member of the group', () => {
    const container = render(
      panel({
        members: [
          member({ membershipId: 'member-1', name: 'Ada Okonkwo' }),
          member({ membershipId: 'member-2', name: 'Ben Alvarez' }),
        ],
      })
    );

    const text = key(container)?.textContent ?? '';
    expect(text).toContain('Ada Okonkwo');
    expect(text).toContain('Ben Alvarez');
  });

  test('lists a member who has written nothing', () => {
    // Their colour never appears in the draft, but leaving them out of the key
    // would read as "this person is not in the group" rather than "this person
    // has not written", which the table above is careful to distinguish.
    const container = render(
      panel({
        members: [
          member({ membershipId: 'member-1', name: 'Ada Okonkwo' }),
          member({
            membershipId: 'member-2',
            name: 'Ben Alvarez',
            survivingChars: 0,
            survivingShare: 0,
            charsInserted: 0,
            sessionCount: 0,
            hasWritten: false,
          }),
        ],
      })
    );

    expect(key(container)?.textContent).toContain('Ben Alvarez');
  });

  test('gives each member the colour their text is tinted with', () => {
    // The whole point. A key whose swatch disagrees with the paragraph is worse
    // than no key, because it is confidently wrong — so this compares against
    // the same function the draft runs through, not a hardcoded colour.
    const container = render(
      panel({
        members: [
          member({ membershipId: 'member-1', name: 'Ada Okonkwo' }),
          member({ membershipId: 'member-2', name: 'Ben Alvarez' }),
        ],
      })
    );

    const swatches = [
      ...container.querySelectorAll(
        '[data-testid="contribution-draft-key"] span[style]'
      ),
    ] as HTMLElement[];

    expect(swatches).toHaveLength(2);
    const scale = buildAuthorColorScale(['member-1', 'member-2']);
    expect(swatches[0].style.backgroundColor).toBe(
      authorColor(scale, 'member-1')
    );
    expect(swatches[1].style.backgroundColor).toBe(
      authorColor(scale, 'member-2')
    );
  });

  test('gives two members different colours', () => {
    // A key is useless if everyone is the same shade.
    const container = render(
      panel({
        members: [
          member({ membershipId: 'member-1', name: 'Ada Okonkwo' }),
          member({ membershipId: 'member-2', name: 'Ben Alvarez' }),
        ],
      })
    );

    const swatches = [
      ...container.querySelectorAll(
        '[data-testid="contribution-draft-key"] span[style]'
      ),
    ] as HTMLElement[];
    const colours = new Set(swatches.map((s) => s.style.backgroundColor));

    expect(colours.size).toBe(2);
  });

  test('names a former student whose writing is still in the draft', () => {
    // Someone moved out of the group keeps their colour in the paragraphs, so
    // the key has to account for it or that colour is the one shade on the page
    // with no explanation at all.
    const container = render(
      panel({
        members: [member({ membershipId: 'member-1', name: 'Ada Okonkwo' })],
        paragraphs: [
          [
            { membershipId: 'gone-1', text: 'A former member opened this. ' },
            { membershipId: 'member-1', text: 'Ada continued it.' },
          ],
        ],
      })
    );

    expect(key(container)?.textContent).toContain('Former student');
  });

  test('names a former student only once, however many runs they wrote', () => {
    const container = render(
      panel({
        members: [member({ membershipId: 'member-1', name: 'Ada Okonkwo' })],
        paragraphs: [
          [{ membershipId: 'gone-1', text: 'First run. ' }],
          [{ membershipId: 'gone-1', text: 'Second run.' }],
        ],
      })
    );

    const matches = (key(container)?.textContent ?? '').match(
      /Former student/g
    );
    expect(matches).toHaveLength(1);
  });

  test('says nothing about a former student when there is none', () => {
    const container = render(panel());

    expect(key(container)?.textContent).not.toContain('Former student');
  });

  test('is absent entirely when nothing has been written', () => {
    // There is no colour on the page to explain, and a key listing three
    // students beside "Nothing written yet" would imply otherwise.
    const container = render(panel({ paragraphs: [] }));

    expect(key(container)).toBeNull();
  });

  test('does not claim unattributed text belongs to anyone', () => {
    // Text with no recorded author is deliberately grey and dashed rather than
    // tinted; it has its own note, and inventing a key entry for it would
    // undo that care.
    const container = render(
      panel({
        members: [member({ membershipId: 'member-1', name: 'Ada Okonkwo' })],
        paragraphs: [
          [
            { membershipId: null, text: 'Older text. ' },
            { membershipId: 'member-1', text: 'Ada wrote this.' },
          ],
        ],
      })
    );

    const text = key(container)?.textContent ?? '';
    expect(text).not.toContain('No recorded author');
    expect(text).toContain('Ada Okonkwo');
  });
});

describe('the tinted draft', () => {
  function draft(paragraphs: AttributedRun[][], members = ['member-1', 'member-2']) {
    const scale = buildAuthorColorScale(members);
    return render(
      <AttributedDraft
        paragraphs={paragraphs}
        colorScale={scale}
        nameFor={new Map(members.map((id, i) => [id, `Student ${i + 1}`]))}
      />
    );
  }

  function runs(container: HTMLElement) {
    return [
      ...container.querySelectorAll(
        '[data-testid="contribution-draft-body"] span[style]'
      ),
    ] as HTMLElement[];
  }

  test('underlines each run in the writer’s colour at full strength', () => {
    // The tint alone cannot carry this. A wash light enough to read black text
    // through has almost no chroma left, so two writers in a group sit ~10 ΔE
    // apart tinted and ~4 with colour blindness simulated — which is what "two
    // colours were almost identical" was. The underline is the full colour.
    const scale = buildAuthorColorScale(['member-1', 'member-2']);
    const container = draft([
      [
        { membershipId: 'member-1', text: 'Lisbon is cheapest. ' },
        { membershipId: 'member-2', text: 'Hiring is the risk.' },
      ],
    ]);

    const [first, second] = runs(container);
    expect(first!.style.borderBottom).toBe(
      `2px solid ${authorColor(scale, 'member-1')}`
    );
    expect(second!.style.borderBottom).toBe(
      `2px solid ${authorColor(scale, 'member-2')}`
    );
  });

  test('keeps the tint light enough to read the draft through', () => {
    // It is the glance, not the answer: a tint dark enough to be unambiguous on
    // its own would make the paragraph hard to read.
    const container = draft([
      [{ membershipId: 'member-1', text: 'Lisbon is cheapest.' }],
    ]);

    expect(runs(container)[0]!.style.backgroundColor).toMatch(/2E$/);
  });

  test('marks unattributed text grey and dashed, never as a person', () => {
    const container = draft([
      [{ membershipId: null, text: 'Pasted from the old brief.' }],
    ]);

    const [only] = runs(container);
    expect(only!.style.backgroundColor).toBe('transparent');
    expect(only!.style.borderBottom).toContain('dashed');
  });

  test('says so plainly when there is nothing written', () => {
    const container = draft([]);

    expect(container.textContent).toContain('Nothing written yet');
  });
});
