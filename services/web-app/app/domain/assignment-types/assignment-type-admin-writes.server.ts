import { readGradingInstructionsOverride } from './assignment-type-admin-writes.shared';
import {
  type LastAdminEditSource,
  withLastAdminEdit,
} from './assignment-type-admin-provenance.server';
import type { Prisma } from '@app/prisma';
import type { ResolvedAdminRubricPickerSelection } from '~/domain/rubrics/admin-rubric-picker.server';
import {
  DEFAULT_OUTPUT_SCHEMA_JSON,
  parseRubric,
  parseScoringScale,
  prepareRubricForSave,
  type RubricData,
} from './assignment-type-rubric.shared';
import { normalizeScoreStep } from './score-scale-steps';
import {
  classifyAssignmentTypeRubric,
  isRubricFullyPopulated,
  parseAssignmentTypeRubricConfig,
} from './assignment-type-rubric-config';

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
  | 'gradingCalibrationNotes'
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
  /** When set, stamps `_lastAdminEdit` on gradingPromptConfigJson for cross-UI last-write visibility. */
  adminEditProvenance?: {
    source: LastAdminEditSource;
    updatedBy?: string | null;
  };
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
    adminEditProvenance: _adminEditProvenance,
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
  const selected = baseData(input);
  const promptConfig = {
    ...selected,
    ...gradingConfig,
  }.gradingPromptConfigJson;
  let gradingPromptConfigJson = input.gradingInstructionsOverride !== undefined
    ? withGradingInstructionsOverride(
        promptConfig,
        input.gradingInstructionsOverride
      )
    : promptConfig;
  const writesPromptConfig =
    input.gradingInstructionsOverride !== undefined ||
    gradingConfig.gradingPromptConfigJson !== undefined;
  if (input.adminEditProvenance != null && writesPromptConfig) {
    gradingPromptConfigJson = withLastAdminEdit(
      gradingPromptConfigJson ?? {},
      input.adminEditProvenance
    ) as Prisma.InputJsonValue;
  }
  return client.assignmentType.create({
    data: {
      ...selected,
      title: input.title,
      kind: null,
      position: count,
      ...gradingConfig,
      ...(writesPromptConfig
        ? {
            gradingPromptConfigJson:
              gradingPromptConfigJson as Prisma.InputJsonValue,
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
  const selected = baseData(input);
  // The form's raw-config path retains its established precedence and versioning.
  const effectivePromptConfig =
    input.rubricSelection?.kind === 'per-type'
      ? input.rubricSelection.assignmentTypeData.gradingPromptConfigJson
      : before.gradingPromptConfigJson;
  const finalPromptConfig =
    input.gradingInstructionsOverride !== undefined
      ? withGradingInstructionsOverride(
          effectivePromptConfig,
          input.gradingInstructionsOverride
        )
      : effectivePromptConfig;
  const changed =
    readGradingInstructionsOverride(finalPromptConfig) !==
    readGradingInstructionsOverride(before.gradingPromptConfigJson);
  const promptConfigWithProvenance =
    input.adminEditProvenance != null
      ? withLastAdminEdit(finalPromptConfig, input.adminEditProvenance)
      : finalPromptConfig;
  const shouldWritePromptConfig =
    input.gradingInstructionsOverride !== undefined ||
    input.rubricSelection?.kind === 'per-type' ||
    input.adminEditProvenance != null;
  const gradingConfig = input.gradingConfig
    ? {
        ...input.gradingConfig,
        ...(input.adminEditProvenance != null
          ? {
              gradingPromptConfigJson: withLastAdminEdit(
                input.gradingConfig.gradingPromptConfigJson ??
                  finalPromptConfig,
                input.adminEditProvenance
              ) as Prisma.InputJsonValue,
            }
          : {}),
      }
    : {
        ...(shouldWritePromptConfig
          ? {
              gradingPromptConfigJson:
                promptConfigWithProvenance as Prisma.InputJsonValue,
            }
          : {}),
        ...(changed ? { gradingAssistantVersion: { increment: 1 } } : {}),
      };
  return client.assignmentType.update({
    where: { id },
    data: {
      ...selected,
      ...gradingConfig,
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

function stableRubricJson(raw: unknown) {
  return JSON.stringify(prepareRubricForSave(parseRubric(raw)));
}

/** Only what every rubric form has always posted: key, label, weight, text. */
function strippedRubricJson(raw: unknown) {
  return JSON.stringify(
    prepareRubricForSave(parseRubric(raw)).categories.map(
      ({ key, label, weight, description }) => ({
        key,
        label,
        weight,
        description,
      })
    )
  );
}

const CATEGORY_OPTION_KEYS = [
  'scoreLabels',
  'bands',
  'feedbackEnabled',
  'grammarHighlighting',
] as const;

/**
 * True when no category in the posted rubric carries any option. Edit pages
 * served before options were kept posted rubrics like this whether or not the
 * admin touched anything, so such a post cannot be read as changing them.
 */
function carriesNoCategoryOptions(rubric: RubricData) {
  return rubric.categories.every((category) =>
    CATEGORY_OPTION_KEYS.every((key) => category[key] === undefined)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

/**
 * Whether a posted rubric differs from the one this type grades with today:
 * its own stored rubric, or, when it has none, the built-in rubric for its
 * kind that the edit page shows in its place.
 */
function rubricDiffersFromEffective(
  submitted: unknown,
  effective: RubricData
) {
  const posted = parseRubric(submitted);
  if (stableRubricJson(posted) === stableRubricJson(effective)) return false;
  return !(
    carriesNoCategoryOptions(posted) &&
    strippedRubricJson(posted) === strippedRubricJson(effective)
  );
}

function scoringScaleSemanticallyEqual(a: unknown, b: unknown) {
  const left = parseScoringScale(a);
  const right = parseScoringScale(b);
  return (
    left.type === right.type &&
    left.minScore === right.minScore &&
    left.maxScore === right.maxScore &&
    normalizeScoreStep(left.step) === normalizeScoreStep(right.step) &&
    left.compositeMin === right.compositeMin &&
    left.compositeMax === right.compositeMax
  );
}

/** Preserve the legacy form's raw config editing and grandfather incomplete rubrics. */
export function parseAdminUpdateGradingConfig(
  formData: FormData,
  existing: {
    /** The type's kind, which picks its built-in rubric when it has none. */
    kind?: string | null;
    rubricJson?: unknown;
    scoringScaleJson?: unknown;
    gradingPromptConfigJson?: unknown;
    gradingOutputSchemaJson?: unknown;
    gradingCalibrationNotes?: string | null;
  }
): GradingConfig | undefined {
  const hasConfig = [
    'scoringScale',
    'rubricJson',
    'promptConfigJson',
    'outputSchemaJson',
  ].some((key) => formData.has(key));
  if (!hasConfig) return undefined;

  const submittedRubricJson = formData.has('rubricJson')
    ? parseJsonFormField(formData, 'rubricJson')
    : null;
  if (
    submittedRubricJson != null &&
    !isRubricFullyPopulated(parseRubric(submittedRubricJson)) &&
    isRubricFullyPopulated(parseRubric(existing.rubricJson))
  ) {
    throw new Response(
      'Every rubric category needs a key, label, description, and weight before saving. Finish the categories you started, or remove them.',
      { status: 400 }
    );
  }

  const submittedScoringScale = formData.has('scoringScale')
    ? parseJsonFormField(formData, 'scoringScale')
    : null;

  // A type with no rubric of its own grades from the built-in rubric for its
  // kind, and that is what the edit page shows and posts back. Comparing the
  // post against the stored column (empty) would save the built-in rubric
  // onto the type on every save, so compare against what it grades with.
  const ownsRubric =
    classifyAssignmentTypeRubric(parseRubric(existing.rubricJson)) !== 'none';
  const builtIn = ownsRubric
    ? null
    : parseAssignmentTypeRubricConfig({
        assignmentTypeKind: existing.kind ?? null,
      });
  const effectiveRubric = builtIn
    ? builtIn.rubric
    : parseRubric(existing.rubricJson);
  const postsBuiltInPlaceholder =
    builtIn != null &&
    submittedRubricJson != null &&
    classifyAssignmentTypeRubric(parseRubric(submittedRubricJson)) === 'none';
  const rubricChanged =
    submittedRubricJson != null &&
    !postsBuiltInPlaceholder &&
    rubricDiffersFromEffective(submittedRubricJson, effectiveRubric);
  // Changing a built-in rubric makes it the type's own. The scale, the
  // instructions and the output shape come with it, or the type would start
  // grading its new rubric on the generic 1-5 scale with no instructions.
  const materializesBuiltIn = rubricChanged && builtIn != null;
  const scoringChanged =
    submittedScoringScale != null &&
    !scoringScaleSemanticallyEqual(
      submittedScoringScale,
      existing.scoringScaleJson
    );
  const basePromptConfig =
    materializesBuiltIn && builtIn
      ? {
          ...(builtIn.promptConfig as Record<string, unknown>),
          ...(isRecord(existing.gradingPromptConfigJson)
            ? existing.gradingPromptConfigJson
            : {}),
        }
      : existing.gradingPromptConfigJson;

  let gradingPromptConfigJson: Prisma.InputJsonValue | undefined;
  if (formData.has('gradingInstructionsOverride')) {
    gradingPromptConfigJson = withGradingInstructionsOverride(
      formData.has('promptConfigJson')
        ? parseJsonFormField(formData, 'promptConfigJson')
        : basePromptConfig,
      formData.get('gradingInstructionsOverride')
    ) as Prisma.InputJsonValue;
  } else if (formData.has('promptConfigJson')) {
    gradingPromptConfigJson = parseJsonFormField(
      formData,
      'promptConfigJson'
    ) as Prisma.InputJsonValue;
  } else if (materializesBuiltIn) {
    gradingPromptConfigJson = basePromptConfig as Prisma.InputJsonValue;
  }
  // No prompt config and an empty one say the same thing; only a real
  // difference may bump the version or overwrite the column.
  const promptChanged =
    gradingPromptConfigJson !== undefined &&
    JSON.stringify(gradingPromptConfigJson) !==
      JSON.stringify(existing.gradingPromptConfigJson ?? {});

  let gradingOutputSchemaJson: Prisma.InputJsonValue | undefined;
  if (formData.has('outputSchemaJson')) {
    gradingOutputSchemaJson = (parseJsonFormField(
      formData,
      'outputSchemaJson'
    ) ?? DEFAULT_OUTPUT_SCHEMA_JSON) as Prisma.InputJsonValue;
  } else if (materializesBuiltIn && builtIn) {
    gradingOutputSchemaJson = (existing.gradingOutputSchemaJson ??
      builtIn.outputSchema) as Prisma.InputJsonValue;
  }
  const outputChanged =
    gradingOutputSchemaJson !== undefined &&
    JSON.stringify(gradingOutputSchemaJson) !==
      JSON.stringify(existing.gradingOutputSchemaJson ?? null);

  if (!rubricChanged && !scoringChanged && !promptChanged && !outputChanged) {
    return undefined;
  }

  const materializedScale =
    materializesBuiltIn && builtIn && !scoringChanged
      ? existing.scoringScaleJson == null
        ? { scoringScaleJson: builtIn.scoringScale as Prisma.InputJsonValue }
        : {}
      : {};
  const materializedCalibration =
    materializesBuiltIn &&
    builtIn &&
    existing.gradingCalibrationNotes == null &&
    builtIn.calibrationNotes != null
      ? { gradingCalibrationNotes: builtIn.calibrationNotes }
      : {};

  return {
    ...materializedScale,
    ...materializedCalibration,
    ...(scoringChanged
      ? {
          scoringScaleJson: scoringScaleSemanticallyEqual(
            submittedScoringScale,
            existing.scoringScaleJson
          )
            ? (existing.scoringScaleJson ?? submittedScoringScale)
            : submittedScoringScale,
        }
      : {}),
    ...(rubricChanged ? { rubricJson: submittedRubricJson } : {}),
    ...(promptChanged && gradingPromptConfigJson !== undefined
      ? { gradingPromptConfigJson }
      : {}),
    ...(outputChanged && gradingOutputSchemaJson !== undefined
      ? { gradingOutputSchemaJson }
      : {}),
    gradingAssistantVersion: { increment: 1 },
  };
}
