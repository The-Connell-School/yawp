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
  searchShortFormPrompts,
} from './yawp-catalog';
import {
  listAssignableTypes,
  listLoungeMaterials,
  readLoungeMaterial,
} from './yawp-catalog.server';
import {
  getQuickWritingLessonBySlug,
  getQuickWritingPracticePrompts,
} from '~/utils/writing-lessons/static-lessons.server';
import { isCompositionPracticeEnabled } from '~/utils/writing-lessons/composition-flag.server';

export type LessonPlannerToolContext = {
  /** The calling teacher's OrgMembership id. */
  membershipId: string;
  /** The calling teacher's organization id. */
  organizationId: string;
  /**
   * Whether the school has Writing Practice. The Quick Writing Lesson pages and
   * practice assignments both sit behind it, so without it the planner gets no
   * lesson links to hand out and no practice to assign.
   */
  writingPracticeEnabled?: boolean;
};

export type LessonPlannerToolDependencies = {
  handleReporterTool: typeof handleReporterToolCall;
  listLounge: typeof listLoungeMaterials;
  listAssignmentTypes: typeof listAssignableTypes;
  readLounge: typeof readLoungeMaterial;
};

const productionDependencies: LessonPlannerToolDependencies = {
  handleReporterTool: handleReporterToolCall,
  listLounge: listLoungeMaterials,
  listAssignmentTypes: listAssignableTypes,
  readLounge: readLoungeMaterial,
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
      "Search Yawp's open freewrite prompt library — 200 short, open-ended prompts. This is CLASS STARTER material: the prompts invite writing without asking for the backing a graded entry is scored on, and a class starter is marked on engagement alone. Filter by the text or unit the class is reading (e.g. Macbeth), theme, grade band, prompt type, cognitive move, or seriousness. Use this for a bell-ringer, a warm-up, or a low-stakes entry point, and cite the prompt id you chose. For a graded Daily Pages reflection, call search_short_form_prompts instead.",
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
    name: 'search_short_form_prompts',
    description:
      "Search Yawp's Daily Pages prompt library — short prompts written to be GRADED. Every one asks for the backing as well as the opinion (a reason, a case, a quotation, a counterexample) and says what a finished answer looks like, because Daily Pages is scored on Depth and Development of Thought. Filter by the text or unit the class is reading, theme, grade band, the shape of thinking the prompt sets up, cognitive move, or whether it needs a source text at all. Use this whenever the lesson calls for a written response a student will be graded on — usually after the reading or before a discussion, not at the bell. Cite the prompt id you chose. For an ungraded warm-up, call search_daily_pages_prompts instead.",
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Free text matched against the prompt, its title and its themes.',
        },
        text: {
          type: 'string',
          description:
            'A text or unit the class is reading, e.g. "Macbeth" or "Of Mice and Men".',
        },
        theme: { type: 'string' },
        gradeBand: { type: 'string', enum: ['9', '10', '11', '12'] },
        kind: {
          type: 'string',
          enum: [
            'close-read',
            'claim-and-defend',
            'one-difference',
            'evaluate-a-choice',
            'define-precisely',
            'exit-synthesis',
          ],
        },
        cognitiveMove: {
          type: 'string',
          enum: [
            'analyze',
            'argue-a-position',
            'compare',
            'define-a-term',
            'evaluate',
            'interpret',
            'synthesize',
          ],
        },
        sourceNeed: {
          type: 'string',
          enum: ['none', 'optional', 'required'],
          description:
            'Whether the prompt leans on a source text. Use "none" on a day the class has read nothing.',
        },
        limit: { type: 'integer', minimum: 1, maximum: 12 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'list_writing_lessons',
    description:
      "List Yawp's Writing Fundamentals lessons — short, ready-made lessons in two strands: Grammar & Mechanics (comma splices, passive voice, parallel construction, transitions, agreement) and, where it is switched on, Composition (topic sentences, thesis statements, evidence, analysis, hooks and openings, conclusions). Filter by category or by the rubric skill the class is weak in. Use one of these instead of writing your own mini-lesson on the skill.",
    input_schema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: [
            'Punctuation',
            'Sentence Structure',
            'Agreement',
            'Flow',
            'Making Claims',
            'Supporting Claims',
            'Framing the Essay',
          ],
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
    name: 'read_lounge_material',
    description:
      "Open one Teacher's Lounge file and read what is actually in it. For a slide deck this returns every slide in presentation order with its text and speaker notes; for a document it returns the text. Call this BEFORE saying anything about what a Lounge file contains — which slides to project, what a handout asks, what a deck covers. Without it you know only the filename. Only .pptx and .docx can be opened.",
    input_schema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description:
            'The material id from list_lounge_materials. Only materials marked readable can be opened.',
        },
      },
      required: ['id'],
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
  ctx: LessonPlannerToolContext,
  dependencies: LessonPlannerToolDependencies
): Promise<unknown | undefined> {
  switch (name) {
    case 'search_daily_pages_prompts': {
      const prompts = searchDailyPagesPrompts(input);
      return {
        prompts,
        // Class Starter material since the split: the prompt is offered with a
        // button that creates the assignment, so the route matters as much as
        // the text.
        libraryHref: '/app/assignment-types',
        note: prompts.length
          ? 'Cite the prompt id and quote the prompt exactly.'
          : 'No prompt in the library matches those filters. Loosen them and search again, or write a class starter yourself and put it in a yawp-daily-pages block with kind: class-starter so the teacher can assign it. Keep it a starter — short, open, answerable without the reading — and never reach for search_short_form_prompts instead: those are written to be graded for depth. Do not tell the teacher the library came up empty.',
      };
    }
    case 'search_short_form_prompts': {
      const prompts = searchShortFormPrompts(input);
      return {
        prompts,
        // A Daily Pages assignment is created from this library, so the
        // teacher needs the route as much as the prompt text.
        libraryHref: '/app/assignment-types',
        note: prompts.length
          ? 'Cite the prompt id and quote the prompt exactly.'
          : 'No graded short-form prompt matches those filters. Loosen them and search again, or write one yourself and put it in a yawp-daily-pages block with kind: daily-pages. Never substitute a freewrite prompt from search_daily_pages_prompts: those are written to be ungraded, and Daily Pages would score one for depth it never asked for. Do not tell the teacher the library came up empty.',
      };
    }
    case 'list_writing_lessons': {
      const lessons = listWritingLessonCatalog({
        ...input,
        includeComposition: isCompositionPracticeEnabled(),
      });
      if (!ctx.writingPracticeEnabled) {
        // The lesson pages are behind Writing Practice, so a link would open
        // the dashboard instead. No address goes out, which also means the
        // link filter strips any the model makes up.
        return {
          lessons: lessons.map(({ href: _href, ...lesson }) => lesson),
          practiceAvailable: false,
          note: 'This school does not have Writing Practice, so there is no lesson page to send the teacher to and nothing to assign. Teach from the lesson: call get_writing_lesson and fold its explanation, examples and exercises into the plan as material. Name it in plain text with no link.',
        };
      }
      return {
        lessons: lessons.map((lesson) => ({
          ...lesson,
          practiceExercises: getQuickWritingPracticePrompts(lesson.slug).length,
        })),
        practiceAvailable: true,
        note: 'Teach from the lesson, then assign its practice so students work it in Yawp: put the slug in a yawp-practice block and the teacher gets a button that assigns it to their class.',
      };
    }
    case 'get_writing_lesson': {
      const slug = typeof input.slug === 'string' ? input.slug : '';
      const lesson = getQuickWritingLessonBySlug(slug);
      // A Composition lesson while that strand is still dark is one the
      // teacher could not open or assign, so it is not there to plan from.
      if (
        !lesson ||
        (lesson.section === 'Composition' && !isCompositionPracticeEnabled())
      ) {
        return { error: `No Quick Writing Lesson with slug "${slug}".` };
      }
      return {
        slug: lesson.slug,
        title: lesson.title,
        category: lesson.category,
        ...(ctx.writingPracticeEnabled
          ? {
              href: `/app/writing-lessons/${lesson.slug}`,
              practiceExercises: getQuickWritingPracticePrompts(lesson.slug)
                .length,
            }
          : {}),
        content: lesson.content,
      };
    }
    case 'list_lounge_materials': {
      const trainings = await dependencies.listLounge(ctx);
      const readable = trainings.some((training) =>
        training.modules.some((module) =>
          module.materials.some((material) => material.readable)
        )
      );
      return {
        trainings,
        note: readable
          ? 'Anything marked readable can be opened with read_lounge_material. Do that before you describe what is in it or say which part to project — a filename tells you nothing about the contents.'
          : 'None of these can be opened. Link them by name and say nothing about what is inside them.',
      };
    }
    case 'read_lounge_material': {
      const id = typeof input.id === 'string' ? input.id : '';
      return dependencies.readLounge(ctx, id);
    }
    case 'list_assignment_types':
      return { assignmentTypes: await dependencies.listAssignmentTypes(ctx) };
    default:
      return undefined;
  }
}

export async function handleLessonPlannerToolCall(
  name: string,
  input: Record<string, unknown>,
  ctx: LessonPlannerToolContext,
  dependencies: LessonPlannerToolDependencies = productionDependencies
): Promise<string> {
  if (allowedReporterTools.has(name)) {
    // Rebuild the context explicitly: the reporter handler stages writes into a
    // caller-supplied buffer, and the planner must never hand it one.
    return dependencies.handleReporterTool(name, input, {
      membershipId: ctx.membershipId,
      organizationId: ctx.organizationId,
    });
  }

  try {
    const result = await handleCatalogToolCall(name, input, ctx, dependencies);
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
