/**
 * Tool layer for the YAWP! Lesson Planner.
 *
 * Two families of tools:
 *
 * - Class context, borrowed from the reporter. It already exposes
 *   teacher-scoped, read-only class reports anchored to the caller's membership
 *   and organization, so the planner reuses those definitions through a strict
 *   allowlist — enough to ground a lesson in how the class actually performed,
 *   with no way to write anything or reach a single student's essay.
 * - Yawp's own teaching catalog, so a lesson is built out of the Daily Pages
 *   prompts, Quick Writing Lessons, and Teacher's Lounge material the platform
 *   already has, and every reference comes back with a link the teacher can act
 *   on rather than a description they have to go find.
 */
import {
  handleReporterToolCall,
  REPORTER_TOOLS,
  type ReporterTool,
} from '~/domain/reporter/reporter-tools.server';
import {
  listWritingLessonCatalog,
  searchDailyPagesPrompts,
} from './yawp-catalog';
import {
  listAssignableTypes,
  listLoungeMaterials,
} from './yawp-catalog.server';
import { getQuickWritingLessonBySlug } from '~/utils/writing-lessons/static-lessons.server';

export type LessonPlannerToolContext = {
  /** The calling teacher's OrgMembership id. */
  membershipId: string;
  /** The calling teacher's organization id. */
  organizationId: string;
};

/**
 * Reporter tools the planner may call. Read-only and class-level: which classes
 * exist, how each did against the rubric, and who is struggling enough to need
 * a differentiated path through the lesson.
 */
export const LESSON_PLANNER_REPORTER_TOOL_NAMES = [
  'list_classes',
  'get_class_grade_report',
  'find_students_needing_attention',
] as const;

/** Catalog tools, served locally rather than through the reporter. */
export const LESSON_PLANNER_CATALOG_TOOLS: ReporterTool[] = [
  {
    name: 'search_daily_pages_prompts',
    description:
      "Search Yawp's Daily Pages prompt library — 200 short writing prompts teachers use as warm-ups. Filter by the text or unit the class is reading (e.g. Macbeth), theme, grade band, prompt type, cognitive move, or seriousness. Use this whenever a lesson needs a bell-ringer, a warm-up, or a low-stakes entry point, and cite the prompt id you chose.",
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Free text matched against the prompt and its themes.',
        },
        text: {
          type: 'string',
          description:
            'A text or unit the class is reading, e.g. "Macbeth" or "Of Mice and Men".',
        },
        theme: { type: 'string' },
        gradeBand: { type: 'string', enum: ['9', '10', '11', '12'] },
        type: {
          type: 'string',
          enum: [
            'agree-disagree',
            'open-reflection',
            'narrative-anchor',
            'hypothetical',
            'provocation',
            'definitional',
          ],
        },
        cognitiveMove: {
          type: 'string',
          enum: [
            'compare',
            'complicate',
            'define-a-term',
            'imagine',
            'introspect',
            'take-a-stance',
            'tell-a-story',
          ],
        },
        seriousness: {
          type: 'string',
          enum: ['playful', 'light', 'moderate', 'serious', 'heavy'],
        },
        limit: { type: 'integer', minimum: 1, maximum: 12 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'list_writing_lessons',
    description:
      "List Yawp's Quick Writing Lessons — short, ready-made sentence-level lessons (comma splices, passive voice, parallel construction, transitions, agreement). Filter by category or by the rubric skill the class is weak in. Use one of these instead of writing your own grammar mini-lesson.",
    input_schema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['Punctuation', 'Sentence Structure', 'Agreement', 'Flow'],
        },
        rubricCategory: {
          type: 'string',
          description:
            'A rubric key, to get the lessons that serve that skill (e.g. grammar_and_mechanics).',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_writing_lesson',
    description:
      'Get the full text of one Quick Writing Lesson by slug, including its examples and practice exercises, so you can fold the actual lesson into the plan and tell the teacher which part to project or hand out.',
    input_schema: {
      type: 'object',
      properties: { slug: { type: 'string' } },
      required: ['slug'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_lounge_materials',
    description:
      "List the teaching material in this teacher's Teacher's Lounge — course modules and their downloadable resources, including slide decks meant to be shown in class. Use this before building a deck from scratch: if Yawp already has one for the topic, point the teacher at it and plan around it.",
    input_schema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'list_assignment_types',
    description:
      'List the assignment types this teacher can actually assign to a class (Daily Pages, the course essays their school has enabled). Use it to end a lesson on the real Yawp assignment the students will write.',
    input_schema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
];

export const LESSON_PLANNER_TOOL_NAMES = [
  ...LESSON_PLANNER_REPORTER_TOOL_NAMES,
  ...LESSON_PLANNER_CATALOG_TOOLS.map((tool) => tool.name),
] as const;

const allowedReporterTools = new Set<string>(
  LESSON_PLANNER_REPORTER_TOOL_NAMES
);

/** Allowlist order is preserved so the model always sees list_classes first. */
export const LESSON_PLANNER_TOOLS: ReporterTool[] = [
  ...LESSON_PLANNER_REPORTER_TOOL_NAMES.map((name) =>
    REPORTER_TOOLS.find((tool) => tool.name === name)
  ).filter((tool): tool is ReporterTool => Boolean(tool)),
  ...LESSON_PLANNER_CATALOG_TOOLS,
];

async function handleCatalogToolCall(
  name: string,
  input: Record<string, unknown>,
  ctx: LessonPlannerToolContext
): Promise<unknown | undefined> {
  switch (name) {
    case 'search_daily_pages_prompts': {
      const prompts = searchDailyPagesPrompts(input);
      return {
        prompts,
        // Every Daily Pages assignment is created from this library, so the
        // teacher needs the route as much as the prompt text.
        libraryHref: '/app/assignment-types',
        note: prompts.length
          ? 'Cite the prompt id and quote the prompt exactly.'
          : 'No prompt in the library matches those filters. Loosen them and search again, or write a warm-up yourself and put it in a yawp-daily-pages block so the teacher can assign it. Do not tell the teacher the library came up empty.',
      };
    }
    case 'list_writing_lessons':
      return { lessons: listWritingLessonCatalog(input) };
    case 'get_writing_lesson': {
      const slug = typeof input.slug === 'string' ? input.slug : '';
      const lesson = getQuickWritingLessonBySlug(slug);
      if (!lesson) {
        return { error: `No Quick Writing Lesson with slug "${slug}".` };
      }
      return {
        slug: lesson.slug,
        title: lesson.title,
        category: lesson.category,
        href: `/app/writing-lessons/${lesson.slug}`,
        content: lesson.content,
      };
    }
    case 'list_lounge_materials':
      return { trainings: await listLoungeMaterials(ctx) };
    case 'list_assignment_types':
      return { assignmentTypes: await listAssignableTypes(ctx) };
    default:
      return undefined;
  }
}

export async function handleLessonPlannerToolCall(
  name: string,
  input: Record<string, unknown>,
  ctx: LessonPlannerToolContext
): Promise<string> {
  if (allowedReporterTools.has(name)) {
    // Rebuild the context explicitly: the reporter handler stages writes into a
    // caller-supplied buffer, and the planner must never hand it one.
    return handleReporterToolCall(name, input, {
      membershipId: ctx.membershipId,
      organizationId: ctx.organizationId,
    });
  }

  try {
    const result = await handleCatalogToolCall(name, input, ctx);
    if (result === undefined) {
      return JSON.stringify({
        error: `Unknown tool: ${name}. The lesson planner can only read class reports and the Yawp teaching catalog.`,
      });
    }
    return JSON.stringify(result);
  } catch {
    return JSON.stringify({
      error: `The ${name} lookup failed. Plan without it and say so rather than inventing Yawp material.`,
    });
  }
}
