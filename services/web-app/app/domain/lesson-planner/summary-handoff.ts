/**
 * Every part of the assignment summary as a way into the Lesson Planner.
 *
 * The summary already knows a lot about the class: how it did on each rubric
 * skill, the teaching moves it suggests, which papers make good models, and
 * which students cluster into a small group. A hand-off names one part of it
 * ("category:thesis_and_content", "group:organization_and_structure", …) and
 * this module turns that part — plus everything else the summary says about
 * the same skill — into the planner's opening ask and into a class context
 * block the planner keeps on every turn.
 *
 * Like the original next-step seed, the URL carries ids only; every word
 * here is rebuilt from the stored summary. Student names never appear: groups
 * travel as counts, and model excerpts arrive already scrubbed.
 */
import { skillName } from '~/domain/assignment-insights/select-class-models';
import type {
  CategoryInsight,
  CategoryInsightStatus,
  ClassInsightSummary,
  TeachingNextStep,
} from '~/domain/assignment-insights/class-insight-synthesis';
import { buildLessonSeed } from './lesson-seed';

export const SUMMARY_HANDOFF_PARAM = 'seed';

export type SummaryHandoff =
  | { kind: 'summary' }
  | { kind: 'category'; category: string }
  | { kind: 'step'; index: number }
  | { kind: 'models'; category: string }
  | { kind: 'group'; category: string }
  | { kind: 'extension' }
  | { kind: 'tracks' };

/** Differentiation as the planner may see it: sizes, never students. */
export type HandoffDifferentiation = {
  focusGroups: Array<{ category: string; label: string; count: number }>;
  extensionCount: number;
  supportCount: number;
};

/** Models for one skill, with every student name already removed. */
export type HandoffModels = {
  category: string;
  label: string;
  skill: string;
  /** Strong excerpts, used word for word. */
  exemplars: string[];
  /** What the weaker papers had in common, from the grading feedback. */
  nearMissNotes: string[];
};

export type HandoffInput = {
  handoff: SummaryHandoff;
  summary: ClassInsightSummary;
  differentiation: HandoffDifferentiation | null;
  className: string | null;
  assignmentTitle: string | null;
  models: HandoffModels | null;
};

export type SummaryHandoffSeed = {
  /** The pre-filled opening message for the composer. */
  prompt: string;
  /** One line of provenance for the banner. */
  context: string;
  /** What came over from the summary, shown as chips above the composer. */
  chips: string[];
};

const CATEGORY_KEY = /^[a-z0-9_]{1,80}$/;
const BARE_KINDS = ['summary', 'extension', 'tracks'] as const;
const CATEGORY_KINDS = ['category', 'models', 'group'] as const;

export function parseSummaryHandoff(raw: string | null): SummaryHandoff | null {
  if (!raw) return null;
  if ((BARE_KINDS as readonly string[]).includes(raw)) {
    return { kind: raw as (typeof BARE_KINDS)[number] };
  }
  const separator = raw.indexOf(':');
  if (separator < 0) return null;
  const kind = raw.slice(0, separator);
  const value = raw.slice(separator + 1);
  if (kind === 'step') {
    if (!/^\d{1,2}$/.test(value)) return null;
    return { kind: 'step', index: Number(value) };
  }
  if ((CATEGORY_KINDS as readonly string[]).includes(kind)) {
    if (!CATEGORY_KEY.test(value)) return null;
    return {
      kind: kind as (typeof CATEGORY_KINDS)[number],
      category: value,
    };
  }
  return null;
}

export function formatSummaryHandoff(handoff: SummaryHandoff): string {
  switch (handoff.kind) {
    case 'step':
      return `step:${handoff.index}`;
    case 'category':
    case 'models':
    case 'group':
      return `${handoff.kind}:${handoff.category}`;
    default:
      return handoff.kind;
  }
}

export function summaryHandoffHref(
  classAssignmentId: string,
  handoff: SummaryHandoff
): string {
  const params = new URLSearchParams({
    from: classAssignmentId,
    [SUMMARY_HANDOFF_PARAM]: formatSummaryHandoff(handoff),
  });
  return `/app/lesson-planner?${params.toString()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Read the differentiation stored beside a summary down to sizes. Names are
 * dropped here, at the edge, so nothing downstream can leak one.
 */
export function parseStoredDifferentiation(
  raw: unknown
): HandoffDifferentiation | null {
  if (!isRecord(raw)) return null;
  const groups = Array.isArray(raw.focusGroups) ? raw.focusGroups : [];
  const individuals = Array.isArray(raw.individuals) ? raw.individuals : [];
  const focusGroups = groups.flatMap((group) =>
    isRecord(group) &&
    typeof group.category === 'string' &&
    typeof group.label === 'string' &&
    Array.isArray(group.students) &&
    group.students.length > 0
      ? [
          {
            category: group.category,
            label: group.label,
            count: group.students.length,
          },
        ]
      : []
  );
  const countKind = (kind: string) =>
    individuals.filter((flag) => isRecord(flag) && flag.kind === kind).length;
  return {
    focusGroups,
    extensionCount: countKind('extension'),
    supportCount: countKind('support'),
  };
}

const STATUS_LABEL: Record<CategoryInsightStatus, string> = {
  gap: 'area to grow',
  strength: 'strength',
  mixed: 'mixed',
};

function statusLabel(category: CategoryInsight): string {
  return STATUS_LABEL[category.status] ?? STATUS_LABEL.mixed;
}

function students(count: number): string {
  return `${count} ${count === 1 ? 'student' : 'students'}`;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

const ASK_FIRST = 'Ask me anything you need to know about this class first.';

type Described = {
  /** What the summary says, in the teacher's voice. */
  facts: string[];
  /** What the teacher wants built. Only in the opening message. */
  ask: string;
  context: string;
  chips: string[];
};

function describeHandoff(input: HandoffInput): Described | null {
  const { handoff, summary, differentiation, className, assignmentTitle } =
    input;
  const forClass = className ? ` for ${className}` : '';
  const onAssignment = assignmentTitle ? ` on "${assignmentTitle}"` : '';
  const source = `From my assignment summary${forClass}${onAssignment}`;
  const contextFor = (what: string) =>
    className ? `${className}: ${what}` : what;

  const categoryOf = (key: string) =>
    summary.categories.find((category) => category.key === key) ?? null;
  const stepFor = (key: string): TeachingNextStep | null =>
    summary.nextSteps.find((step) => step.rubricCategory === key) ?? null;
  const groupFor = (key: string) =>
    differentiation?.focusGroups.find((group) => group.category === key) ??
    null;

  /** Everything else the summary says about one skill. */
  const skillBrief = (
    key: string,
    { includeStep = true, includeGroup = true } = {}
  ) => {
    const facts: string[] = [];
    const chips: string[] = [];
    const step = includeStep ? stepFor(key) : null;
    if (step) {
      facts.push(`It suggested: "${step.title}" — ${step.detail}`);
      chips.push(`Next step: ${step.title}`);
    }
    const group = includeGroup ? groupFor(key) : null;
    if (group) {
      facts.push(
        `${students(group.count)} scored low enough on it to work with in a small group.`
      );
      chips.push(`${group.count}-student small group`);
    }
    return { facts, chips };
  };

  switch (handoff.kind) {
    case 'summary': {
      const gaps = summary.categories.filter((c) => c.status === 'gap').length;
      const strengths = summary.categories.filter(
        (c) => c.status === 'strength'
      ).length;
      const facts = [
        `${source}:`,
        summary.overview,
        '',
        'How the class did:',
        ...summary.categories.map(
          (category) =>
            `- ${category.label} (${statusLabel(category)}): ${category.summary}`
        ),
      ];
      if (summary.nextSteps.length) {
        facts.push(
          '',
          'Next steps it suggested:',
          ...summary.nextSteps.map(
            (step, index) => `${index + 1}. ${step.title} — ${step.detail}`
          )
        );
      }
      if (differentiation?.focusGroups.length) {
        facts.push(
          '',
          `Small groups: ${differentiation.focusGroups
            .map((group) => `${students(group.count)} low on ${group.label}`)
            .join('; ')}.`
        );
      }
      return {
        facts,
        ask: 'Give me two or three directions for the next lesson, built on this, and ask me which one I want before you build anything.',
        context: contextFor('the whole summary'),
        chips: [
          ...(gaps ? [plural(gaps, 'area to grow', 'areas to grow')] : []),
          ...(strengths ? [plural(strengths, 'strength', 'strengths')] : []),
          ...(summary.nextSteps.length
            ? [plural(summary.nextSteps.length, 'next step', 'next steps')]
            : []),
        ],
      };
    }

    case 'category': {
      const category = categoryOf(handoff.category);
      if (!category) return null;
      const skill = skillName(category);
      const brief = skillBrief(category.key);
      const asks: Record<CategoryInsightStatus, string> = {
        gap: `Build me a whole-class mini-lesson that teaches ${skill}. ${ASK_FIRST}`,
        strength: `The class is already strong at ${skill}. Build me a lesson that raises the bar — a harder version of the skill, or students teaching it to each other. ${ASK_FIRST}`,
        mixed: `The class is split on ${skill}. Build me a lesson that meets the spread — stations or tiered practice that keeps one objective for everyone. ${ASK_FIRST}`,
      };
      return {
        facts: [
          `${source}: ${category.label} came out as ${
            category.status === 'gap'
              ? 'an area to grow'
              : category.status === 'strength'
                ? 'a strength'
                : 'mixed'
          }. ${category.summary}`,
          ...brief.facts,
        ],
        ask: asks[category.status] ?? asks.mixed,
        context: contextFor(`${category.label} · ${statusLabel(category)}`),
        chips: [`${category.label} · ${statusLabel(category)}`, ...brief.chips],
      };
    }

    case 'step': {
      const step = summary.nextSteps[handoff.index];
      if (!step) return null;
      // The original next-step ask, word for word, so a teacher who used it
      // before sees the same opening — plus what the summary says about it.
      const legacy = buildLessonSeed({ step, className, assignmentTitle });
      const [said, ask] = legacy.prompt.split('\n\n');
      const category = categoryOf(step.rubricCategory);
      const brief = skillBrief(step.rubricCategory, { includeStep: false });
      return {
        facts: [
          said,
          ...(category
            ? [
                `What the summary says about ${skillName(category)}: ${category.summary}`,
              ]
            : []),
          ...brief.facts,
        ],
        ask,
        context: legacy.context,
        chips: [
          `Next step: ${step.title}`,
          ...(category
            ? [`${category.label} · ${statusLabel(category)}`]
            : []),
          ...brief.chips,
        ],
      };
    }

    case 'models': {
      const models = input.models;
      if (!models || models.category !== handoff.category) return null;
      if (models.exemplars.length === 0) return null;
      const category = categoryOf(handoff.category);
      const letters = 'ABCDEFGH';
      const facts = [
        `${source}: ${models.label} is one of the skills the class most needs.${
          category ? ` ${category.summary}` : ''
        }`,
        '',
        `Here are ${plural(models.exemplars.length, `strong ${models.skill} example`, `strong ${models.skill} examples`)} from my students' papers (names removed):`,
        ...models.exemplars.map(
          (excerpt, index) => `Student ${letters[index]}: "${excerpt}"`
        ),
      ];
      if (models.nearMissNotes.length) {
        facts.push(
          '',
          `What the weaker papers had in common, from the grading feedback:`,
          ...models.nearMissNotes.map((note) => `- ${note}`)
        );
      }
      return {
        facts,
        ask: [
          `Use my students' strong examples word for word in a sample block, labeled Student A, Student B, and so on.`,
          `Then write ${models.exemplars.length > 1 ? models.exemplars.length : 2} student-inspired weaker versions that show ${
            models.nearMissNotes.length
              ? 'that same problem'
              : `the most common way ${models.skill} goes wrong at this level`
          } — do not copy any student's words.`,
          `Build me a lesson where students compare the strong and weak versions and name the move that makes the difference. ${ASK_FIRST}`,
        ].join(' '),
        context: contextFor(`models for ${models.skill}`),
        chips: [
          `${models.label}`,
          `${plural(models.exemplars.length, 'strong example', 'strong examples')} (names removed)`,
          ...(models.nearMissNotes.length
            ? ['Near-miss pattern from your feedback']
            : []),
        ],
      };
    }

    case 'group': {
      const group = groupFor(handoff.category);
      if (!group) return null;
      const category = categoryOf(handoff.category);
      const brief = skillBrief(handoff.category, { includeGroup: false });
      return {
        facts: [
          `${source}: ${students(group.count)} scored low on ${group.label}, while most of the class did fine.`,
          ...(category
            ? [
                `What the summary says about ${skillName(category)}: ${category.summary}`,
              ]
            : []),
          ...brief.facts,
        ],
        ask: `Build me a 10–15 minute pull-aside lesson for that small group, plus meaningful work the rest of the class does on their own at the same time. Refer to the group by size; I'll fill in names. ${ASK_FIRST}`,
        context: contextFor(`small group · ${group.label}`),
        chips: [`${group.count}-student small group`, group.label, ...brief.chips],
      };
    }

    case 'extension': {
      const count = differentiation?.extensionCount ?? 0;
      if (count === 0) return null;
      const strengths = summary.categories
        .filter((category) => category.status === 'strength')
        .map((category) => category.label);
      return {
        facts: [
          `${source}: ${students(count)} scored strong across the whole rubric.`,
          ...(strengths.length
            ? [`The class as a whole is strongest at ${strengths.join(', ')}.`]
            : []),
        ],
        ask: `Build me an extension task for them that goes deeper, not just longer — something they can work on while I teach the rest of the class. ${ASK_FIRST}`,
        context: contextFor('ready for more'),
        chips: [`${students(count)} ready for more`],
      };
    }

    case 'tracks': {
      const groups = differentiation?.focusGroups ?? [];
      if (groups.length === 0) return null;
      const gaps = summary.categories
        .filter((category) => category.status === 'gap')
        .map((category) => category.label);
      const extension = differentiation?.extensionCount ?? 0;
      return {
        facts: [
          `${source}, I want one lesson with three tracks:`,
          `- Support: ${groups
            .map((group) => `${students(group.count)} on ${group.label}`)
            .join('; ')}`,
          `- Core: the rest of the class${
            gaps.length ? `, where the whole-class need is ${gaps.join(', ')}` : ''
          }`,
          ...(extension
            ? [`- Extension: ${students(extension)} strong across the rubric`]
            : []),
        ],
        ask: `Build one lesson with a single objective and these tracks — what each group does, what materials each needs, and where I spend my time. Refer to groups by size; I'll fill in names. ${ASK_FIRST}`,
        context: contextFor('one lesson, three tracks'),
        chips: [
          plural(groups.length, 'support group', 'support groups'),
          ...(extension ? [`${students(extension)} ready for more`] : []),
        ],
      };
    }
  }
}

export function buildSummaryHandoffSeed(
  input: HandoffInput
): SummaryHandoffSeed | null {
  const described = describeHandoff(input);
  if (!described) return null;
  return {
    prompt: [...described.facts, '', described.ask].join('\n'),
    context: described.context,
    chips: described.chips,
  };
}

/**
 * The class context the planner keeps on every turn of a session opened from
 * the summary. Without it the summary lives only in the first message, which
 * long sessions trim away.
 */
export function buildClassContext(input: HandoffInput): string | null {
  const described = describeHandoff(input);
  if (!described) return null;
  return [
    'This lesson was opened from the teacher’s YAWP! assignment summary. Keep planning from what it says unless the teacher steers elsewhere:',
    ...described.facts,
    '',
    'Student names are not shared with you; refer to students by group and size, and never invent names.',
  ].join('\n');
}
