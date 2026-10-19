import { readGradingInstructionsOverride } from './assignment-type-admin-writes.shared';
import type { Prisma } from '@app/prisma';
import type { ResolvedAdminRubricPickerSelection } from '~/domain/rubrics/admin-rubric-picker.server';
import {
  DEFAULT_OUTPUT_SCHEMA_JSON,
  parseRubric,
} from './assignment-type-rubric.shared';
import { isRubricFullyPopulated } from './assignment-type-rubric-config';

type Client = Pick<
  Prisma.TransactionClient,
  'assignmentType' | 'assignmentTypeImage'
>;
type GradingConfig = Pick<
  Prisma.AssignmentTypeUncheckedUpdateInput,
  | 'scoringScaleJson'
  | 'rubricJson'
  | 'gradingPromptConfigJson'
  | 'gradingOutputSchemaJson'
  | 'gradingAssistantVersion'
>;
export type AssignmentTypeWriteInput = {
  title?: string;
  description?: string | null;
  tutorInstructions?: string | null;
  allowsImageUploads?: boolean;
  collaborationSupported?: boolean;
  rubricSelection?: ResolvedAdminRubricPickerSelection;
  gradingInstructionsOverride?: string | null;
  gradingConfig?: GradingConfig;
};

export function parseJsonFormField(formData: FormData, name: string) {
  const value = formData.get(name);
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch {
    throw new Response(`${name} must be valid JSON`, { status: 400 });
  }
}

export function withGradingInstructionsOverride(
  rawPromptConfig: unknown,
  rawOverride: FormDataEntryValue | null
) {
  const promptConfig =
    rawPromptConfig &&
    typeof rawPromptConfig === 'object' &&
    !Array.isArray(rawPromptConfig)
      ? { ...(rawPromptConfig as Record<string, unknown>) }
      : {};
  const gradingInstructionsOverride =
    typeof rawOverride === 'string' ? rawOverride.trim() : '';

  if (gradingInstructionsOverride) {
    promptConfig.gradingInstructionsOverride = gradingInstructionsOverride;
  } else {
    delete promptConfig.gradingInstructionsOverride;
  }

  return promptConfig as Prisma.InputJsonObject;
}

export function parseAdminCreateGradingConfig(formData: FormData) {
  const hasGradingConfigFields =
    formData.has('scoringScale') ||
    formData.has('rubricJson') ||
    formData.has('promptConfigJson') ||
    formData.has('outputSchemaJson');
  const rubricJson = hasGradingConfigFields
    ? parseJsonFormField(formData, 'rubricJson')
    : null;
  if (
    hasGradingConfigFields &&
    !isRubricFullyPopulated(parseRubric(rubricJson))
  ) {
    throw new Response(
      'Every rubric category needs a key, label, description, and weight before you can create this assignment type. Add at least one, and finish the ones you started.',
      { status: 400 }
    );
  }

  return hasGradingConfigFields
    ? {
        scoringScaleJson: parseJsonFormField(formData, 'scoringScale'),
        rubricJson,
        gradingPromptConfigJson: parseJsonFormField(
          formData,
          'promptConfigJson'
        ),
        gradingOutputSchemaJson: (parseJsonFormField(
          formData,
          'outputSchemaJson'
        ) ?? DEFAULT_OUTPUT_SCHEMA_JSON) as Prisma.InputJsonValue,
      }
    : {};
}

function selectionData(selection: AssignmentTypeWriteInput['rubricSelection']) {
  if (selection?.kind === 'library') return { rubricId: selection.rubricId };
  if (selection?.kind === 'per-type') return selection.assignmentTypeData;
  if (selection?.kind === 'none') return { rubricId: null };
  return {};
}

function baseData(input: AssignmentTypeWriteInput) {
  const {
    rubricSelection,
    gradingInstructionsOverride,
    gradingConfig,
    ...fields
  } = input;
  return { ...fields, ...selectionData(rubricSelection) };
}

export async function createAssignmentType(
  client: Client,
  input: AssignmentTypeWriteInput & { title: string }
) {
  if (!input.title.trim())
    throw new Response('Title is required', { status: 400 });
  const count = await client.assignmentType.count();
  const gradingConfig = input.gradingConfig ?? {};
  const override = input.gradingInstructionsOverride?.trim();
  return client.assignmentType.create({
    data: {
      ...baseData(input),
      title: input.title,
      kind: null,
      position: count,
      ...gradingConfig,
      ...(override
        ? {
            gradingPromptConfigJson: withGradingInstructionsOverride(
              gradingConfig.gradingPromptConfigJson,
              override
            ),
          }
        : {}),
    } as Prisma.AssignmentTypeUncheckedCreateInput,
  });
}

export async function updateAssignmentType(
  client: Client,
  id: string,
  before: { gradingPromptConfigJson: unknown },
  input: AssignmentTypeWriteInput
) {
  if (input.title !== undefined && !input.title.trim())
    throw new Response('Title is required', { status: 400 });
  const changed =
    input.gradingInstructionsOverride !== undefined &&
    (input.gradingInstructionsOverride?.trim() ?? '') !==
      readGradingInstructionsOverride(before.gradingPromptConfigJson);
  return client.assignmentType.update({
    where: { id },
    data: {
      ...baseData(input),
      ...(input.gradingConfig ??
        (changed
          ? {
              gradingPromptConfigJson: withGradingInstructionsOverride(
                before.gradingPromptConfigJson,
                input.gradingInstructionsOverride ?? null
              ),
              gradingAssistantVersion: { increment: 1 },
            }
          : {})),
    },
  });
}

export async function archiveAssignmentType(
  client: Client,
  id: string,
  archivedAt: Date | null = new Date()
) {
  return client.assignmentType.update({ where: { id }, data: { archivedAt } });
}
export async function restoreAssignmentType(client: Client, id: string) {
  return archiveAssignmentType(client, id, null);
}
export async function removeAssignmentTypeImage(client: Client, id: string) {
  return client.assignmentTypeImage.deleteMany({
    where: { assignmentTypeId: id },
  });
}
export async function replaceAssignmentTypeImage(
  client: Client,
  id: string,
  image: {
    contentType: string;
    blob: Uint8Array<ArrayBuffer>;
    altText?: string;
  }
) {
  await removeAssignmentTypeImage(client, id);
  return client.assignmentTypeImage.create({
    data: { ...image, assignmentTypeId: id },
  });
}

/** Preserve the legacy form's raw config editing and grandfather incomplete rubrics. */
export function parseAdminUpdateGradingConfig(
  formData: FormData,
  existing: { rubricJson?: unknown }
): GradingConfig | undefined {
  const hasConfig = [
    'scoringScale',
    'rubricJson',
    'promptConfigJson',
    'outputSchemaJson',
  ].some((key) => formData.has(key));
  if (!hasConfig) return undefined;
  const rubricJson = parseJsonFormField(formData, 'rubricJson');
  if (
    !isRubricFullyPopulated(parseRubric(rubricJson)) &&
    isRubricFullyPopulated(parseRubric(existing.rubricJson))
  ) {
    throw new Response(
      'Every rubric category needs a key, label, description, and weight before saving. Finish the categories you started, or remove them.',
      { status: 400 }
    );
  }
  return {
    scoringScaleJson: parseJsonFormField(formData, 'scoringScale'),
    rubricJson,
    gradingPromptConfigJson: formData.has('gradingInstructionsOverride')
      ? withGradingInstructionsOverride(
          parseJsonFormField(formData, 'promptConfigJson'),
          formData.get('gradingInstructionsOverride')
        )
      : parseJsonFormField(formData, 'promptConfigJson'),
    ...(formData.has('outputSchemaJson')
      ? {
          gradingOutputSchemaJson:
            parseJsonFormField(formData, 'outputSchemaJson') ??
            DEFAULT_OUTPUT_SCHEMA_JSON,
        }
      : {}),
    gradingAssistantVersion: { increment: 1 },
  };
}
