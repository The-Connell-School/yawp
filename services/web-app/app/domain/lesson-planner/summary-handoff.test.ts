import { describe, expect, test } from 'bun:test';
import {
  buildClassContext,
  buildSummaryHandoffSeed,
  formatSummaryHandoff,
  parseStoredDifferentiation,
  parseSummaryHandoff,
  summaryHandoffHref,
  type HandoffInput,
} from './summary-handoff';
import type { ClassInsightSummary } from '~/domain/assignment-insights/class-insight-synthesis';

const summary: ClassInsightSummary = {
  overview: 'Strong evidence, but theses mostly restate the plot.',
  categories: [
    {
      key: 'thesis_and_content',
      label: 'Thesis/Content',
      status: 'gap',
      summary: 'Most theses restate the plot instead of making a claim.',
    },
    {
      key: 'evidence_and_support',
      label: 'Evidence/Support',
      status: 'strength',
      summary: 'Quotes are well chosen and well introduced.',
    },
    {
      key: 'organization_and_structure',
      label: 'Organization/Structure',
      status: 'mixed',
      summary: 'Half the class uses topic sentences; half does not.',
    },
  ],
  nextSteps: [
    {
      title: 'Turn a topic into a claim',
      detail: 'Model moving from "this essay is about" to "this essay argues".',
      rubricCategory: 'thesis_and_content',
    },
    {
      title: 'Topic sentence sort',
      detail: 'Sort strong and weak topic sentences.',
      rubricCategory: 'organization_and_structure',
    },
  ],
};

const differentiation = {
  focusGroups: [
    {
      category: 'organization_and_structure',
      label: 'Organization/Structure',
      count: 5,
    },
  ],
  extensionCount: 3,
  supportCount: 2,
};

function input(overrides: Partial<HandoffInput> = {}): HandoffInput {
  return {
    handoff: { kind: 'summary' },
    summary,
    differentiation,
    className: 'English 10 · Period 1',
    assignmentTitle: 'Romeo and Juliet essay',
    models: null,
    ...overrides,
  };
}

describe('parseSummaryHandoff', () => {
  test('reads every kind the assignment summary sends', () => {
    expect(parseSummaryHandoff('summary')).toEqual({ kind: 'summary' });
    expect(parseSummaryHandoff('category:thesis_and_content')).toEqual({
      kind: 'category',
      category: 'thesis_and_content',
    });
    expect(parseSummaryHandoff('step:1')).toEqual({ kind: 'step', index: 1 });
    expect(parseSummaryHandoff('models:evidence_and_support')).toEqual({
      kind: 'models',
      category: 'evidence_and_support',
    });
    expect(parseSummaryHandoff('group:organization_and_structure')).toEqual({
      kind: 'group',
      category: 'organization_and_structure',
    });
    expect(parseSummaryHandoff('extension')).toEqual({ kind: 'extension' });
    expect(parseSummaryHandoff('tracks')).toEqual({ kind: 'tracks' });
  });

  test('rejects anything else rather than guessing', () => {
    for (const raw of [
      null,
      '',
      'nope',
      'category:',
      'category:Thesis Content',
      'category:thesis;drop',
      'step:-1',
      'step:one',
      'step:1.5',
      'summary:extra',
      'models',
      `category:${'a'.repeat(81)}`,
    ]) {
      expect(parseSummaryHandoff(raw)).toBeNull();
    }
  });

  test('round-trips through formatSummaryHandoff', () => {
    for (const raw of [
      'summary',
      'category:thesis_and_content',
      'step:0',
      'models:thesis_and_content',
      'group:organization_and_structure',
      'extension',
      'tracks',
    ]) {
      expect(formatSummaryHandoff(parseSummaryHandoff(raw)!)).toBe(raw);
    }
  });
});

describe('summaryHandoffHref', () => {
  test('carries ids only', () => {
    expect(
      summaryHandoffHref('ca-1', {
        kind: 'category',
        category: 'thesis_and_content',
      })
    ).toBe('/app/lesson-planner?from=ca-1&seed=category%3Athesis_and_content');
  });
});

describe('parseStoredDifferentiation', () => {
  test('keeps counts and drops student names', () => {
    const parsed = parseStoredDifferentiation({
      focusGroups: [
        {
          category: 'thesis_and_content',
          label: 'Thesis/Content',
          students: [
            { name: 'Ada Lovelace', href: '/a' },
            { name: 'Grace Hopper', href: null },
          ],
        },
      ],
      individuals: [
        {
          kind: 'extension',
          student: { name: 'Alan Turing', href: null },
          categoryLabels: [],
        },
        {
          kind: 'support',
          student: { name: 'Edsger Dijkstra', href: null },
          categoryLabels: ['Thesis/Content'],
        },
      ],
    });
    expect(parsed).toEqual({
      focusGroups: [
        { category: 'thesis_and_content', label: 'Thesis/Content', count: 2 },
      ],
      extensionCount: 1,
      supportCount: 1,
    });
    expect(JSON.stringify(parsed)).not.toContain('Ada');
  });

  test('null for a summary written before differentiation existed', () => {
    expect(parseStoredDifferentiation(undefined)).toBeNull();
    expect(parseStoredDifferentiation('garbage')).toBeNull();
  });
});

describe('buildSummaryHandoffSeed', () => {
  test('whole summary: every category read, and asks for directions first', () => {
    const seed = buildSummaryHandoffSeed(input())!;
    expect(seed.prompt).toContain('English 10 · Period 1');
    expect(seed.prompt).toContain('"Romeo and Juliet essay"');
    expect(seed.prompt).toContain(summary.overview);
    expect(seed.prompt).toContain('Thesis/Content (area to grow)');
    expect(seed.prompt).toContain('Evidence/Support (strength)');
    expect(seed.prompt).toContain('Turn a topic into a claim');
    expect(seed.prompt).toMatch(/two or three directions/i);
    expect(seed.context).toBe('English 10 · Period 1: the whole summary');
    expect(seed.chips).toContain('1 area to grow');
  });

  test('a gap category brings its next step and small group, and asks for a mini-lesson', () => {
    const seed = buildSummaryHandoffSeed(
      input({
        handoff: { kind: 'category', category: 'organization_and_structure' },
      })
    )!;
    expect(seed.prompt).toContain(
      'Half the class uses topic sentences; half does not.'
    );
    expect(seed.prompt).toContain('Topic sentence sort');
    expect(seed.prompt).toContain('5 students');
    expect(seed.prompt).toMatch(/stations or tiered practice/i);
    expect(seed.chips).toEqual([
      'Organization/Structure · mixed',
      'Next step: Topic sentence sort',
      '5-student small group',
    ]);
  });

  test('a gap asks to teach it; a strength asks to raise the bar', () => {
    const gap = buildSummaryHandoffSeed(
      input({ handoff: { kind: 'category', category: 'thesis_and_content' } })
    )!;
    expect(gap.prompt).toMatch(/whole-class mini-lesson that teaches thesis/i);
    const strength = buildSummaryHandoffSeed(
      input({ handoff: { kind: 'category', category: 'evidence_and_support' } })
    )!;
    expect(strength.prompt).toMatch(/raises the bar/i);
  });

  test('a next step keeps its original wording and adds what the summary says about its skill', () => {
    const seed = buildSummaryHandoffSeed(
      input({ handoff: { kind: 'step', index: 0 } })
    )!;
    expect(seed.prompt).toContain(
      'recommended this next teaching move: "Turn a topic into a claim"'
    );
    expect(seed.prompt).toContain(
      'Most theses restate the plot instead of making a claim.'
    );
    expect(seed.context).toContain('“Turn a topic into a claim”');
  });

  test('models: real strong excerpts word for word, near misses only as a pattern', () => {
    const seed = buildSummaryHandoffSeed(
      input({
        handoff: { kind: 'models', category: 'thesis_and_content' },
        models: {
          category: 'thesis_and_content',
          label: 'Thesis/Content',
          skill: 'thesis',
          exemplars: [
            'Romeo and Juliet argues that haste, not fate, destroys the lovers.',
            'Shakespeare shows that the feud is a choice the adults keep making.',
          ],
          nearMissNotes: ['Restates the plot; no claim to argue.'],
        },
      })
    )!;
    expect(seed.prompt).toContain(
      'Student A: "Romeo and Juliet argues that haste, not fate, destroys the lovers."'
    );
    expect(seed.prompt).toContain('Student B:');
    expect(seed.prompt).toContain('Restates the plot; no claim to argue.');
    expect(seed.prompt).toMatch(/student-inspired weaker versions/i);
    expect(seed.prompt).toMatch(/do not copy any student's words/i);
    expect(seed.chips).toContain('2 strong examples (names removed)');
  });

  test('models without any strong example is not a hand-off', () => {
    expect(
      buildSummaryHandoffSeed(
        input({
          handoff: { kind: 'models', category: 'thesis_and_content' },
          models: {
            category: 'thesis_and_content',
            label: 'Thesis/Content',
            skill: 'thesis',
            exemplars: [],
            nearMissNotes: [],
          },
        })
      )
    ).toBeNull();
  });

  test('small group: a pull-aside, by size and never by name', () => {
    const seed = buildSummaryHandoffSeed(
      input({
        handoff: { kind: 'group', category: 'organization_and_structure' },
      })
    )!;
    expect(seed.prompt).toContain('5 students');
    expect(seed.prompt).toMatch(/10–15 minute pull-aside/);
    expect(seed.prompt).toMatch(/rest of the class/i);
  });

  test('extension and three tracks use counts', () => {
    const extension = buildSummaryHandoffSeed(
      input({ handoff: { kind: 'extension' } })
    )!;
    expect(extension.prompt).toContain('3 students');
    expect(extension.prompt).toMatch(/extension task/i);

    const tracks = buildSummaryHandoffSeed(
      input({ handoff: { kind: 'tracks' } })
    )!;
    expect(tracks.prompt).toContain('Support:');
    expect(tracks.prompt).toContain('5 students on Organization/Structure');
    expect(tracks.prompt).toContain('Core:');
    expect(tracks.prompt).toContain('Extension: 3 students');
  });

  test('null when the part asked for is not in the summary', () => {
    for (const handoff of [
      { kind: 'category', category: 'grammar' },
      { kind: 'step', index: 7 },
      { kind: 'group', category: 'thesis_and_content' },
    ] as const) {
      expect(buildSummaryHandoffSeed(input({ handoff }))).toBeNull();
    }
    expect(
      buildSummaryHandoffSeed(
        input({ handoff: { kind: 'extension' }, differentiation: null })
      )
    ).toBeNull();
    expect(
      buildSummaryHandoffSeed(
        input({ handoff: { kind: 'tracks' }, differentiation: null })
      )
    ).toBeNull();
  });
});

describe('buildClassContext', () => {
  test('restates the class context for every turn, with no names', () => {
    const block = buildClassContext(
      input({ handoff: { kind: 'category', category: 'thesis_and_content' } })
    )!;
    expect(block).toContain('assignment summary');
    expect(block).toContain('English 10 · Period 1');
    expect(block).toContain(
      'Most theses restate the plot instead of making a claim.'
    );
    expect(block).toMatch(/student names are not shared/i);
    expect(block).not.toMatch(/Build me/);
  });

  test('null when the hand-off no longer matches the summary', () => {
    expect(
      buildClassContext(
        input({ handoff: { kind: 'category', category: 'grammar' } })
      )
    ).toBeNull();
  });
});
