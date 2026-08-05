/**
 * Yawp's own teaching catalog, shaped for the Lesson Planner.
 *
 * The planner should build lessons out of what the platform already has — a
 * Daily Pages prompt for the warm-up, a Quick Writing Lesson for a mechanics
 * mini-lesson, a Teacher's Lounge deck to project — rather than inventing
 * activities in a vacuum. Everything here returns a real id and a real link so
 * a plan can be acted on instead of retyped.
 *
 * Pure shaping and filtering only; the database-backed lookups live in
 * `yawp-catalog.server.ts`.
 */
import {
  getQuickWritingLessons,
  type QuickWritingLesson,
} from '~/utils/writing-lessons/static-lessons.server';
import {
  isCaptionResource,
  isTranscriptResource,
} from '~/utils/teacher-training-media-accessibility';
import type { RubricKey } from '~/domain/grading/rubric';
import dailyPagesPrompts from '~/routes/app.assignment-types.$id/prompts-library/prompts.json';
import type { LibraryPrompt } from '~/routes/app.assignment-types.$id/prompts-library/data';

/** Keeps a single tool result small enough to leave room for the lesson. */
const MAX_PROMPT_RESULTS = 12;

export type DailyPagesPromptSearch = {
  /** Free text matched against the prompt and its themes. */
  query?: string;
  /** A text or unit the class is reading, e.g. "Macbeth". */
  text?: string;
  theme?: string;
  gradeBand?: string;
  type?: string;
  cognitiveMove?: string;
  seriousness?: string;
  limit?: number;
};

const PROMPTS = dailyPagesPrompts as LibraryPrompt[];

function includesInsensitive(values: string[], needle: string): boolean {
  const lowered = needle.trim().toLowerCase();
  return values.some((value) => value.toLowerCase().includes(lowered));
}

export function searchDailyPagesPrompts(
  search: DailyPagesPromptSearch
): LibraryPrompt[] {
  const limit = Math.min(
    Math.max(1, search.limit ?? MAX_PROMPT_RESULTS),
    MAX_PROMPT_RESULTS
  );

  const matches = PROMPTS.filter((prompt) => {
    if (search.text && !includesInsensitive(prompt.textsOrUnits, search.text)) {
      return false;
    }
    if (search.theme && !includesInsensitive(prompt.themes, search.theme)) {
      return false;
    }
    if (
      search.gradeBand &&
      !prompt.gradeBands.includes(search.gradeBand as never)
    ) {
      return false;
    }
    if (search.type && prompt.type !== search.type) return false;
    if (
      search.cognitiveMove &&
      !prompt.cognitiveMoves.includes(search.cognitiveMove as never)
    ) {
      return false;
    }
    if (search.seriousness && prompt.seriousness !== search.seriousness) {
      return false;
    }
    if (
      search.query &&
      !includesInsensitive([prompt.prompt, ...prompt.themes], search.query)
    ) {
      return false;
    }
    return true;
  });

  return matches.slice(0, limit);
}

export type WritingLessonCatalogEntry = {
  slug: string;
  title: string;
  category: QuickWritingLesson['category'];
  description: string;
  /** Where the teacher (or the class, projected) can open the lesson. */
  href: string;
};

/**
 * Which lesson categories serve which rubric skill. The Quick Writing Lessons
 * are sentence-level, so they map onto the mechanics and style end of the
 * rubric; nothing here claims to teach thesis work.
 */
export const WRITING_LESSON_SKILL_HINTS: Partial<
  Record<RubricKey, QuickWritingLesson['category'][]>
> & {
  grammar_and_mechanics: QuickWritingLesson['category'][];
} = {
  grammar_and_mechanics: ['Punctuation', 'Agreement'],
  voice_and_style: ['Sentence Structure'],
  organization_and_structure: ['Flow'],
};

export function listWritingLessonCatalog({
  category,
  rubricCategory,
}: {
  category?: string;
  rubricCategory?: string;
}): WritingLessonCatalogEntry[] {
  const allowedCategories = rubricCategory
    ? WRITING_LESSON_SKILL_HINTS[rubricCategory as RubricKey]
    : undefined;

  return getQuickWritingLessons()
    .filter((lesson) => {
      if (category && lesson.category !== category) return false;
      if (allowedCategories && !allowedCategories.includes(lesson.category)) {
        return false;
      }
      return true;
    })
    .map((lesson) => ({
      slug: lesson.slug,
      title: lesson.title,
      category: lesson.category,
      description: lesson.description,
      href: `/app/writing-lessons/${lesson.slug}`,
    }));
}

/**
 * Daily Pages is identified by its title rather than a system key, the same way
 * the assignment type page decides whether to show the prompt library.
 */
export const DAILY_PAGES_TITLE = 'daily pages';

export function isDailyPagesTitle(title: string): boolean {
  return title.trim().toLowerCase() === DAILY_PAGES_TITLE;
}

export type LoungeMaterialKind = 'slides' | 'document' | 'other';

export type LoungeMaterial = {
  name: string;
  kind: LoungeMaterialKind;
  href: string;
};

export type LoungeModuleSummary = {
  title: string;
  description: string | null;
  href: string;
  materials: LoungeMaterial[];
};

export type LoungeTrainingSummary = {
  title: string;
  description: string | null;
  href: string;
  modules: LoungeModuleSummary[];
  links: Array<{ title: string; description: string | null; url: string }>;
};

type LoungeTrainingRow = {
  id: string;
  title: string;
  description?: string | null;
  teacherTrainingModules: Array<{
    id: string;
    title: string;
    description?: string | null;
    position?: number;
    resources: Array<{ id: string; name: string; contentType: string }>;
  }>;
  resources: Array<{
    id: string;
    title: string;
    description?: string | null;
    url?: string | null;
  }>;
};

const SLIDE_EXTENSIONS = ['.pptx', '.ppt', '.key', '.odp'];
const SLIDE_CONTENT_TYPE_HINTS = ['presentation', 'powerpoint', 'slide'];

function classifyMaterial(resource: {
  name: string;
  contentType: string;
}): LoungeMaterialKind {
  const name = resource.name.trim().toLowerCase();
  const contentType = resource.contentType.trim().toLowerCase();

  if (
    SLIDE_EXTENSIONS.some((extension) => name.endsWith(extension)) ||
    SLIDE_CONTENT_TYPE_HINTS.some((hint) => contentType.includes(hint)) ||
    // A Google Slides deck attached as a link-shaped PDF still reads as slides
    // when it says so in the name; teachers name these plainly.
    name.includes('slide') ||
    name.includes('deck')
  ) {
    return 'slides';
  }
  if (contentType === 'application/pdf' || name.endsWith('.pdf')) {
    return 'document';
  }
  if (contentType.includes('word') || name.endsWith('.docx')) {
    return 'document';
  }
  return 'other';
}

/**
 * Shape Teacher's Lounge trainings into linkable teaching material. Caption and
 * transcript files back the module video's accessibility and are not material a
 * teacher would put in front of a class, so they are dropped.
 */
export function summarizeLoungeMaterials(
  trainings: LoungeTrainingRow[]
): LoungeTrainingSummary[] {
  return trainings
    .map((training) => {
      const modules = training.teacherTrainingModules
        .map((module) => ({
          title: module.title,
          description: module.description ?? null,
          href: `/app/teacher-trainings/${training.id}/modules/${module.id}`,
          materials: module.resources
            .filter(
              (resource) =>
                !isCaptionResource(resource) && !isTranscriptResource(resource)
            )
            .map((resource) => ({
              name: resource.name,
              kind: classifyMaterial(resource),
              href: `/api/teacher-training-module-resource/${resource.id}`,
            })),
        }))
        .filter((module) => module.materials.length > 0);

      const links = training.resources
        .filter((resource) => Boolean(resource.url))
        .map((resource) => ({
          title: resource.title,
          description: resource.description ?? null,
          url: resource.url!,
        }));

      return {
        title: training.title,
        description: training.description ?? null,
        href: `/app/teacher-trainings/${training.id}`,
        modules,
        links,
      };
    })
    .filter(
      (training) => training.modules.length > 0 || training.links.length > 0
    );
}
