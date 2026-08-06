/**
 * Database-backed half of the Yawp teaching catalog: the Teacher's Lounge
 * material a teacher can reach, and the assignment types they can actually
 * assign. Both are scoped exactly the way the corresponding pages scope them,
 * so the planner never offers a teacher something they cannot open.
 */
import { prisma } from '~/utils/db.server';
import { getAvailableAssignmentTypesForScopes } from '~/utils/assignment-type-access.server';
import {
  isDailyPagesTitle,
  isReadableMaterial,
  summarizeLoungeMaterials,
  type LoungeTrainingSummary,
} from './yawp-catalog';
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

export type AssignableType = { id: string; title: string };

/**
 * Which Lounge courses this teacher can see: their assigned ones once they have
 * any, and otherwise all of them — the same scoping the Lounge index does.
 *
 * Shared so that reading a file cannot reach further than listing one. A
 * resource id is a handle the model holds onto, and the read tool must not
 * become a way around the scoping the listing already applies.
 */
async function visibleTrainingsWhere(ctx: CatalogContext) {
  const assignmentCounts = await prisma.orgMembership.findUnique({
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
  ctx: CatalogContext
): Promise<LoungeTrainingSummary[]> {
  const trainings = await prisma.teacherTraining.findMany({
    where: await visibleTrainingsWhere(ctx),
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
  resourceId: string
): Promise<LoungeMaterialContents | { error: string }> {
  const resource = await prisma.teacherTrainingModuleResource.findFirst({
    // Scoped through the module's course, so this can only open a file the
    // same teacher's list_lounge_materials would already have shown them.
    where: {
      id: resourceId,
      teacherTrainingModule: {
        deletedAt: null,
        teacherTraining: await visibleTrainingsWhere(ctx),
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
  ctx: CatalogContext
): Promise<AssignableType[]> {
  const classes = await prisma.class.findMany({
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

  const types = await getAvailableAssignmentTypesForScopes<{
    id: string;
    title: string;
    systemKey: string | null;
  }>({
    scopes,
    select: { id: true, title: true, systemKey: true },
    orderBy: { position: 'asc' },
  });

  return types.map((type) => ({ id: type.id, title: type.title }));
}

/**
 * The teacher's own Daily Pages assignment type, if their org has it enabled.
 *
 * The planner needs the id to offer "create this Daily Pages exercise" on a
 * warm-up it wrote. A teacher whose org does not have Daily Pages gets no
 * button rather than a link into a page they cannot open.
 */
export async function findDailyPagesTypeId(
  ctx: CatalogContext
): Promise<string | null> {
  const types = await listAssignableTypes(ctx);
  return types.find((type) => isDailyPagesTitle(type.title))?.id ?? null;
}
