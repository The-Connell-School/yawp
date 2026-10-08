/**
 * Database-backed half of the Yawp teaching catalog: the Teacher's Lounge
 * material a teacher can reach, and the assignment types they can actually
 * assign. Both are scoped exactly the way the corresponding pages scope them,
 * so the planner never offers a teacher something they cannot open.
 */
import { prisma } from '~/utils/db.server';
import { getAvailableAssignmentTypesForScopes } from '~/utils/assignment-type-access.server';
import {
  isClassStarterTitle,
  isDailyPagesTitle,
  isReadableMaterial,
  summarizeLoungeMaterials,
  type LoungeTrainingSummary,
} from './yawp-catalog';
import { isExitTicketAssignmentType } from '~/domain/assignment-types/exit-ticket';
import { DAILY_PAGES_ASSIGNMENT_TYPE_KIND } from '~/domain/assignment-types/daily-pages-rubric';
import { CLASS_STARTER_ASSIGNMENT_TYPE_KIND } from '~/domain/assignment-types/class-starter-rubric';
import { readDocxText } from '~/domain/office/docx';
import {
  hasSlideText,
  readPptxSlides,
  type PptxSlide,
} from '~/domain/office/pptx';

export type CatalogContext = {
  membershipId: string;
  organizationId: string;
};

export type AssignableType = {
  id: string;
  title: string;
  /**
   * `AssignmentType.kind`. What the type IS, where the title is only what this
   * org happens to call it — an exit ticket named "Ticket Out The Door" is
   * still an exit ticket, and a course essay titled "Exit Ticket" is not one.
   */
  kind: string | null;
};

export type YawpCatalogDependencies = {
  prismaClient: Pick<
    typeof prisma,
    | 'orgMembership'
    | 'teacherTraining'
    | 'teacherTrainingModuleResource'
    | 'class'
  >;
  getAvailableAssignmentTypes: typeof getAvailableAssignmentTypesForScopes;
};

const productionDependencies: YawpCatalogDependencies = {
  prismaClient: prisma,
  getAvailableAssignmentTypes: getAvailableAssignmentTypesForScopes,
};

/**
 * Which Lounge courses this teacher can see: their assigned ones once they have
 * any, and otherwise all of them — the same scoping the Lounge index does.
 *
 * Shared so that reading a file cannot reach further than listing one. A
 * resource id is a handle the model holds onto, and the read tool must not
 * become a way around the scoping the listing already applies.
 */
async function visibleTrainingsWhere(
  ctx: CatalogContext,
  dependencies: YawpCatalogDependencies
) {
  const assignmentCounts =
    await dependencies.prismaClient.orgMembership.findUnique({
      where: { id: ctx.membershipId, role: 'TEACHER' },
      select: { _count: { select: { assignedTeacherTrainings: true } } },
    });
  const hasAssignedCourses =
    (assignmentCounts?._count.assignedTeacherTrainings ?? 0) > 0;
  return hasAssignedCourses
    ? { assignedTeachers: { some: { id: ctx.membershipId } } }
    : undefined;
}

/**
 * Teaching material in the Teacher's Lounge — module decks, handouts, and the
 * course links that go with them. Names and addresses only; see
 * `readLoungeMaterial` for what is inside one.
 */
export async function listLoungeMaterials(
  ctx: CatalogContext,
  dependencies: YawpCatalogDependencies = productionDependencies
): Promise<LoungeTrainingSummary[]> {
  const trainings = await dependencies.prismaClient.teacherTraining.findMany({
    where: await visibleTrainingsWhere(ctx, dependencies),
    select: {
      id: true,
      title: true,
      description: true,
      teacherTrainingModules: {
        where: { deletedAt: null },
        orderBy: { position: 'asc' },
        select: {
          id: true,
          title: true,
          description: true,
          position: true,
          resources: { select: { id: true, name: true, contentType: true } },
        },
      },
      resources: {
        select: { id: true, title: true, description: true, url: true },
      },
    },
    orderBy: { position: 'asc' },
  });

  return summarizeLoungeMaterials(trainings);
}

/**
 * What is actually inside one Lounge file.
 *
 * Everything the planner says about Lounge material used to be invented: it was
 * handed a filename and a link and nothing else, so "project slides 4–9" was a
 * guess dressed up as a fact. This is the difference.
 */
export type LoungeMaterialContents =
  | {
      kind: 'slides';
      name: string;
      href: string;
      slides: PptxSlide[];
      truncated: boolean;
    }
  | {
      kind: 'document';
      name: string;
      href: string;
      text: string;
      truncated: boolean;
    };

/**
 * A ceiling on how much of one file comes back. A hundred-slide course deck
 * would otherwise crowd out the conversation it is supposed to inform.
 */
const MAX_CHARACTERS = 40_000;

function capSlides(slides: PptxSlide[]): {
  slides: PptxSlide[];
  truncated: boolean;
} {
  const kept: PptxSlide[] = [];
  let spent = 0;
  for (const slide of slides) {
    spent += slide.lines.join(' ').length + slide.notes.length;
    if (spent > MAX_CHARACTERS && kept.length) {
      return { slides: kept, truncated: true };
    }
    kept.push(slide);
  }
  return { slides: kept, truncated: false };
}

export async function readLoungeMaterial(
  ctx: CatalogContext,
  resourceId: string,
  dependencies: YawpCatalogDependencies = productionDependencies
): Promise<LoungeMaterialContents | { error: string }> {
  const resource =
    await dependencies.prismaClient.teacherTrainingModuleResource.findFirst({
      // Scoped through the module's course, so this can only open a file the
      // same teacher's list_lounge_materials would already have shown them.
      where: {
        id: resourceId,
        teacherTrainingModule: {
          deletedAt: null,
          teacherTraining: await visibleTrainingsWhere(ctx, dependencies),
        },
      },
      select: { name: true, contentType: true, blob: true },
    });

  if (!resource) {
    return {
      error:
        "No such material in this teacher's Teacher's Lounge. Call list_lounge_materials and use an id from it.",
    };
  }

  const href = `/api/teacher-training-module-resource/${resourceId}`;
  if (!isReadableMaterial(resource)) {
    return {
      error: `"${resource.name}" is not a format Yawp can open — only .pptx and .docx can be read. Link it by name and say nothing about what is inside it.`,
    };
  }

  const bytes = Uint8Array.from(resource.blob);
  const isSlides = /\.pptx$/i.test(resource.name.trim())
    ? true
    : /\.docx$/i.test(resource.name.trim())
      ? false
      : resource.contentType.includes('presentationml.presentation');

  try {
    if (isSlides) {
      const all = readPptxSlides(bytes);
      if (!hasSlideText(all)) {
        return {
          error: `"${resource.name}" has no readable text — the slides are images. Link it by name and say nothing about what is on them.`,
        };
      }
      const { slides, truncated } = capSlides(all);
      return { kind: 'slides', name: resource.name, href, slides, truncated };
    }

    const text = readDocxText(bytes);
    if (!text.trim()) {
      return {
        error: `"${resource.name}" has no readable text. Link it by name and say nothing about what is inside it.`,
      };
    }
    return {
      kind: 'document',
      name: resource.name,
      href,
      text: text.slice(0, MAX_CHARACTERS),
      truncated: text.length > MAX_CHARACTERS,
    };
  } catch {
    return {
      error: `"${resource.name}" could not be opened. Link it by name and say nothing about what is inside it.`,
    };
  }
}

/**
 * The assignment types this teacher can put in front of a class — Daily Pages,
 * the course essays their org or school has enabled — resolved through the same
 * org/school/teacher inheritance the dashboard uses.
 */
export async function listAssignableTypes(
  ctx: CatalogContext,
  dependencies: YawpCatalogDependencies = productionDependencies
): Promise<AssignableType[]> {
  const classes = await dependencies.prismaClient.class.findMany({
    where: {
      teachers: { some: { id: ctx.membershipId } },
      isArchived: false,
    },
    select: {
      id: true,
      school: { select: { id: true, organizationId: true } },
    },
  });
  if (classes.length === 0) return [];

  const scopes = classes.map((klass) => ({
    organizationId: klass.school?.organizationId ?? ctx.organizationId,
    schoolId: klass.school?.id ?? null,
    teacherProfileId: ctx.membershipId,
  }));

  const types = await dependencies.getAvailableAssignmentTypes<{
    id: string;
    title: string;
    systemKey: string | null;
    kind: string | null;
  }>({
    scopes,
    select: { id: true, title: true, systemKey: true, kind: true },
    orderBy: { position: 'asc' },
  });

  return types.map((type) => ({
    id: type.id,
    title: type.title,
    kind: type.kind ?? null,
  }));
}

/**
 * The teacher's own Daily Pages assignment type, if their org has it enabled.
 *
 * The planner needs the id to offer "create this Daily Pages exercise" on a
 * warm-up it wrote. A teacher whose org does not have Daily Pages gets no
 * button rather than a link into a page they cannot open.
 */
export async function findDailyPagesTypeId(
  ctx: CatalogContext,
  dependencies: YawpCatalogDependencies = productionDependencies
): Promise<string | null> {
  const types = await listAssignableTypes(ctx, dependencies);
  return types.find((type) => isDailyPagesTitle(type.title))?.id ?? null;
}

/** Where each assignment the planner can offer off a lesson gets created. */
export type WritingExerciseTypeIds = {
  dailyPages: string | null;
  classStarter: string | null;
  exitTicket: string | null;
};

/**
 * Every type the planner can hand a lesson to, in one pass over what this
 * teacher can assign.
 *
 * Three offers come out of a planned lesson — a class starter or a Daily Pages
 * entry at the front of the period, an exit ticket at the end — and they are
 * graded by three different assistants. Each has to reach its own sheet rather
 * than all landing on whichever type the org happens to have: a three-minute
 * starter filed as Daily Pages is marked for depth nobody asked for, and a
 * check for understanding filed as either is marked for writing when it was
 * meant to report what a student knows.
 *
 * `kind` is the key, because `kind` is what actually selects the grading
 * assistant. A school that calls its starter "Bell Ringer" gets the right
 * button; a type merely titled "Exit Ticket" does not, because its sheet has
 * no exit ticket form to open and its responses would grade as an essay.
 *
 * The two short-writing types keep their title fallback. They predate `kind`
 * being set on every row, and a customer's Daily Pages type may still carry
 * none — those rows resolved by title before this and still do. An exit ticket
 * has no such history: the type has never existed without its kind.
 *
 * A type the org does not have comes back null, and that offer simply arrives
 * without a button.
 */
export async function findWritingExerciseTypeIds(
  ctx: CatalogContext,
  dependencies: YawpCatalogDependencies = productionDependencies
): Promise<WritingExerciseTypeIds> {
  const types = await listAssignableTypes(ctx, dependencies);
  const byKind = (kind: string) =>
    types.find((type) => type.kind === kind)?.id ?? null;

  return {
    dailyPages:
      byKind(DAILY_PAGES_ASSIGNMENT_TYPE_KIND) ??
      types.find((type) => isDailyPagesTitle(type.title))?.id ??
      null,
    classStarter:
      byKind(CLASS_STARTER_ASSIGNMENT_TYPE_KIND) ??
      types.find((type) => isClassStarterTitle(type.title))?.id ??
      null,
    exitTicket: types.find((type) => isExitTicketAssignmentType(type))?.id ?? null,
  };
}
