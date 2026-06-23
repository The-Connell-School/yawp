import { requireAdmin, requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import {
  DEFAULT_OUTPUT_SCHEMA_JSON,
  NO_DEFAULT_ASSIGNMENT_TYPE,
} from '~/utils/grading-assistant-template.shared';

export const ALLOWED_TEMPLATE_STATUSES = new Set(['draft', 'active', 'archived']);

export {
  DEFAULT_OUTPUT_SCHEMA_JSON,
  DEFAULT_PROMPT_CONFIG,
  DEFAULT_RUBRIC,
  DEFAULT_SCORING_SCALE,
  NO_DEFAULT_ASSIGNMENT_TYPE,
  parsePromptConfig,
  parseRubric,
  parseScoringScale,
  type PromptConfigData,
  type RubricCategory,
  type RubricData,
  type ScoringScaleData,
} from '~/utils/grading-assistant-template.shared';

function parseJsonField(formData: FormData, name: string) {
  const raw = formData.get(name)?.toString().trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Response(`${name} must be valid JSON.`, { status: 400 });
  }
}

function requireString(formData: FormData, name: string) {
  const value = formData.get(name)?.toString().trim();
  if (!value) {
    throw new Response(`${name} is required.`, { status: 400 });
  }
  return value;
}

export async function createGradingAssistantTemplate(request: Request) {
  await requireAdmin(request);
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  const formData = await request.formData();

  const name = requireString(formData, 'name');
  const slug =
    formData.get('slug')?.toString().trim() ||
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const assignmentTypeKind =
    formData.get('assignmentTypeKind')?.toString().trim() || null;
  const defaultAssignmentTypeIdRaw =
    formData.get('defaultAssignmentTypeId')?.toString().trim() || null;
  const defaultAssignmentTypeId =
    defaultAssignmentTypeIdRaw &&
    defaultAssignmentTypeIdRaw !== NO_DEFAULT_ASSIGNMENT_TYPE
      ? defaultAssignmentTypeIdRaw
      : null;

  const templateId = await prisma.$transaction(async (tx) => {
    const template = await tx.gradingAssistantTemplate.create({
      data: {
        name,
        slug,
        status: 'draft',
        version: 1,
        assignmentTypeKind,
        scoringScale: parseJsonField(formData, 'scoringScale'),
        rubricJson: parseJsonField(formData, 'rubricJson'),
        promptConfigJson: parseJsonField(formData, 'promptConfigJson'),
        outputSchemaJson: DEFAULT_OUTPUT_SCHEMA_JSON,
        calibrationNotes: null,
        createdByMembershipId: profile.id,
        updatedByMembershipId: profile.id,
      },
    });

    if (defaultAssignmentTypeId) {
      await tx.assignmentTypeGradingAssistant.create({
        data: {
          assignmentTypeId: defaultAssignmentTypeId,
          gradingAssistantTemplateId: template.id,
          isDefault: true,
          activeFrom: new Date(),
        },
      });
    }

    return template.id;
  });

  return templateId;
}

export async function updateGradingAssistantTemplate(
  request: Request,
  templateId: string
) {
  await requireAdmin(request);
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  const formData = await request.formData();

  const name = requireString(formData, 'name');
  const slug =
    formData.get('slug')?.toString().trim() ||
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const assignmentTypeKind =
    formData.get('assignmentTypeKind')?.toString().trim() || null;

  await prisma.gradingAssistantTemplate.update({
    where: { id: templateId },
    data: {
      name,
      slug,
      assignmentTypeKind,
      scoringScale: parseJsonField(formData, 'scoringScale'),
      rubricJson: parseJsonField(formData, 'rubricJson'),
      promptConfigJson: parseJsonField(formData, 'promptConfigJson'),
      version: { increment: 1 },
      updatedByMembershipId: profile.id,
    },
  });
}

export async function setGradingAssistantTemplateStatus(
  request: Request,
  templateId: string,
  status: string
) {
  await requireAdmin(request);
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);

  if (!ALLOWED_TEMPLATE_STATUSES.has(status)) {
    throw new Response('Invalid status.', { status: 400 });
  }

  await prisma.gradingAssistantTemplate.update({
    where: { id: templateId },
    data: { status, updatedByMembershipId: profile.id },
  });
}
