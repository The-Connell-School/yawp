import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { createHash } from 'node:crypto';
import dailyPagesLibraryJson from '~/domain/rubrics/library/daily-pages-engagement.json';
import { dailyPagesEngagementV1LibrarySchema } from '~/domain/rubrics/library/daily-pages-engagement-v1.fixture';

const prisma = {
  assignment: { findUnique: mock() },
  assignmentType: {
    findUnique: mock(),
  },
};

mock.module('~/utils/db.server', () => ({ prisma }));

const { buildResolvedAssignmentTypeGradingConfig, resolveAssignmentTypeGradingConfig } =
  await import('./assignment-type-grading-config.server');

describe('resolveAssignmentTypeGradingConfig', () => {
  beforeEach(() => {
    prisma.assignmentType.findUnique.mockReset();
    prisma.assignment.findUnique.mockReset();
  });

  test('scales rubric totals and keeps only labeled scores in the default step mode', () => {
    const config = buildResolvedAssignmentTypeGradingConfig({
      assignmentTypeId: 'assignment-type-points',
      assignmentTypeKind: 'essay',
      assignmentTypeTitle: 'Points rubric',
      row: {
        id: 'assignment-type-points',
        title: 'Points rubric',
        kind: 'essay',
        scoringScaleJson: { type: 'rubric_points', minScore: 0, maxScore: 30 },
        rubricJson: {
          categories: [{
            key: 'engagement',
            label: 'Engagement',
            weight: 1,
            description: 'Shows up.',
            scoreLabels: [
              { value: 0, label: 'No-show' },
              { value: 10, label: 'Mediocre' },
              { value: 20, label: 'Good' },
              { value: 30, label: 'Excellent' },
            ],
            bands: [
              { min: 0, max: 0, label: 'No-show', description: 'Missing.' },
              { min: 7, max: 13, label: 'Mediocre', description: 'Thin.' },
              { min: 17, max: 23, label: 'Good', description: 'Solid.' },
              { min: 28, max: 30, label: 'Excellent', description: 'Strong.' },
            ],
          }],
        },
        gradingPromptConfigJson: { gradingInstructions: 'Grade it.' },
        gradingOutputSchemaJson: null,
        gradingCalibrationNotes: null,
        gradingAssistantVersion: 1,
        gradingAssistantSourceTemplateId: null,
        gradingAssistantSourceTemplateSlug: null,
      },
      rubricTotalPoints: 50,
      gradingMode: 'step',
    });

    expect(config.minScore).toBe(0);
    expect(config.maxScore).toBe(50);
    expect(config.rubricCategories[0].scoreLabels?.map((entry) => entry.value)).toEqual([0, 17, 33, 50]);
    expect(config.rubricCategories[0].allowedScores).toEqual([0, 17, 33, 50]);
    expect(config.rubricCategories[0].bands?.[1]).toMatchObject({ min: 12, max: 22 });
  });

  test('preserves bands as the opt-in mode and does not add step restrictions', () => {
    const config = buildResolvedAssignmentTypeGradingConfig({
      assignmentTypeId: 'assignment-type-points',
      assignmentTypeKind: 'essay',
      assignmentTypeTitle: 'Points rubric',
      row: {
        id: 'assignment-type-points',
        title: 'Points rubric',
        kind: 'essay',
        scoringScaleJson: { type: 'rubric_points', minScore: 0, maxScore: 30 },
        rubricJson: {
          categories: [{
            key: 'engagement', label: 'Engagement', weight: 1,
            description: 'Shows up.',
            scoreLabels: [{ value: 0, label: 'No-show' }, { value: 10, label: 'Mediocre' }, { value: 20, label: 'Good' }, { value: 30, label: 'Excellent' }],
            bands: [{ min: 0, max: 0, label: 'No-show', description: 'Missing.' }, { min: 7, max: 13, label: 'Mediocre', description: 'Thin.' }, { min: 17, max: 23, label: 'Good', description: 'Solid.' }, { min: 28, max: 30, label: 'Excellent', description: 'Strong.' }],
          }],
        },
        gradingPromptConfigJson: { gradingInstructions: 'Grade it.' },
        gradingOutputSchemaJson: null, gradingCalibrationNotes: null,
        gradingAssistantVersion: 1, gradingAssistantSourceTemplateId: null,
        gradingAssistantSourceTemplateSlug: null,
      },
      rubricTotalPoints: 50,
      gradingMode: 'bands',
    });

    expect(config.gradingMode).toBe('bands');
    expect(config.rubricCategories[0].allowedScores).toBeUndefined();
    expect(config.rubricCategories[0].bands?.[1]).toMatchObject({ min: 12, max: 22 });
  });

  test('selected library rubric drives the compiled grading invocation instead of stale inline configuration', async () => {
    const { compileGradingAssistantInvocation } = await import('~/domain/grading/grading-assistant-invocation');
    const schema = dailyPagesEngagementV1LibrarySchema;
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'selected-library', title: 'Journal', kind: null,
      rubric: { name: schema.name, schemaJson: schema },
      scoringScaleJson: { type: 'weighted_1_5', minScore: 1, maxScore: 5 },
      rubricJson: { categories: [{ key: 'obsolete', label: 'Obsolete criterion', description: 'Do not use this.', weight: 1 }] },
      gradingPromptConfigJson: { gradingInstructions: 'Obsolete instructions', gradingInstructionsOverride: 'Focus on personal reflection.' },
      gradingAssistantVersion: 2,
    });
    const config = await resolveAssignmentTypeGradingConfig({ assignmentTypeId: 'selected-library' });
    expect(config.minScore).toBe(0);
    expect(config.maxScore).toBe(30);
    expect(config.step).toBe(1);
    expect(config.rubricCategories.map(category => category.key)).toEqual(['engagement_with_prompt']);
    const invocation = compileGradingAssistantInvocation({ gradingConfig: config, studentFirstName: 'Jordan', strictnessLevel: 'intermediate', documentText: 'Synthetic reflection.' });
    const prompt = invocation.system + invocation.userMessage;
    expect(prompt).toContain('Engagement with Prompt');
    expect(prompt).toContain('Focus on personal reflection.');
    expect(prompt).not.toContain('Obsolete criterion');
    expect(prompt).not.toContain('Obsolete instructions');
  });

  test.each(['daily-pages-engagement', 'thesis-driven-essay'])('selected %s library rubric preserves promoted prompt templates', async (name) => {
    const { STARTER_RUBRICS } = await import('~/domain/rubrics/starter-rubrics');
    const { compileGradingAssistantInvocation } = await import('~/domain/grading/grading-assistant-invocation');
    const schema = STARTER_RUBRICS.find(rubric => rubric.name === name)!;
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'managed-library', title: 'Managed journal', kind: null,
      rubric: { name: schema.name, schemaJson: schema },
      rubricJson: null, scoringScaleJson: null,
      gradingPromptConfigJson: {
        systemMessageTemplate: 'Promoted system {{grading_instructions}}',
        userMessageTemplate: 'Promoted rubric {{rubric}} Document {{document}}',
        gradingInstructionsOverride: 'Preserved override.',
      },
      gradingAssistantVersion: 3,
    });
    const config = await resolveAssignmentTypeGradingConfig({ assignmentTypeId: 'managed-library' });
    expect(config.promptTemplate).toEqual({ systemMessage: 'Promoted system {{grading_instructions}}', userMessage: 'Promoted rubric {{rubric}} Document {{document}}' });
    expect(config.maxScore).toBe(name === 'daily-pages-engagement' ? 100 : 5);
    const invocation = compileGradingAssistantInvocation({ gradingConfig: config, studentFirstName: 'Jordan', strictnessLevel: 'intermediate', documentText: 'Synthetic essay.' });
    expect(invocation.system).toContain('Promoted system');
    expect(invocation.system).toContain('Preserved override.');
    expect(invocation.userMessage).toContain('Promoted rubric');
    expect(invocation.userMessage).toContain('Synthetic essay.');
  });

  test('returns assignment-type-owned rubric and prompt config when present', async () => {
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'assignment-type-act',
      title: 'ACT Writing',
      kind: 'act_writing',
      scoringScaleJson: { type: 'act_writing_2_12', minScore: 1, maxScore: 6 },
      rubricJson: {
        categories: [
          {
            key: 'ideas_and_analysis',
            label: 'Ideas and Analysis',
            description: 'Generate productive ideas and analyze perspectives.',
            weight: 0.25,
          },
          {
            key: 'language_use_and_conventions',
            label: 'Language Use and Conventions',
            description: 'Use language and conventions to support clarity.',
            weight: 0.25,
          },
        ],
      },
      gradingPromptConfigJson: {
        systemInstructions:
          'Act as a precise ACT Writing evaluator for this assignment type.',
        gradingInstructions: 'Grade this as ACT Writing.',
      },
      gradingOutputSchemaJson: { schemaVersion: 2 },
      gradingCalibrationNotes: 'Pilot notes.',
      gradingAssistantVersion: 4,
      gradingAssistantSourceTemplateId: 'template-act',
      gradingAssistantSourceTemplateSlug: 'act-writing-four-domain',
    });

    const config = await resolveAssignmentTypeGradingConfig({
      assignmentTypeId: 'assignment-type-act',
    });

    expect(config.source).toBe('assignment-type');
    expect(config.label).toBe('ACT Writing');
    expect(config.version).toBe(4);
    expect(config.scoringType).toBe('act_writing_2_12');
    expect(config.minScore).toBe(1);
    expect(config.maxScore).toBe(6);
    expect(config.rubricCategories.map((category) => category.key)).toEqual([
      'ideas_and_analysis',
      'language_use_and_conventions',
    ]);
    expect(config.instructions).toEqual({
      mode: 'unified',
      systemInstructions:
        'Act as a precise ACT Writing evaluator for this assignment type.',
      gradingInstructions: 'Grade this as ACT Writing.',
    });
    expect(config.rubricSnapshot).toEqual({
      categories: config.rubricCategories,
      minScore: 1,
      maxScore: 6,
      // Absent from the stored scale, so it falls back to every value.
      step: 1,
      scoringType: 'act_writing_2_12',
    });
    expect(config.promptConfigSnapshot).toEqual({
      systemInstructions:
        'Act as a precise ACT Writing evaluator for this assignment type.',
      gradingInstructions: 'Grade this as ACT Writing.',
    });
    expect(config.sourceTemplateSlug).toBe('act-writing-four-domain');
    expect(prisma.assignmentType.findUnique).toHaveBeenCalledWith({
      where: { id: 'assignment-type-act' },
      select: expect.objectContaining({
        rubricJson: true,
        gradingPromptConfigJson: true,
        gradingAssistantVersion: true,
      }),
    });
  });

  test('silently falls back to Thesis config when assignment type has no rubric', async () => {
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'assignment-type-unlinked',
      title: 'Unlinked Assignment',
      kind: null,
      scoringScaleJson: null,
      rubricJson: null,
      gradingPromptConfigJson: null,
      gradingOutputSchemaJson: null,
      gradingCalibrationNotes: null,
      gradingAssistantVersion: 1,
      gradingAssistantSourceTemplateId: null,
      gradingAssistantSourceTemplateSlug: null,
      rubric: null,
    });

    const config = await resolveAssignmentTypeGradingConfig({
      assignmentTypeId: 'assignment-type-unlinked',
    });

    expect(config.source).toBe('thesis-default');
    expect(config.label).toBe('Thesis-driven essay grading assistant');
    expect(config.version).toBe(1);
    expect(
      config.rubricCategories.find(
        (category) => category.key === 'grammar_and_mechanics'
      )?.weight
    ).toBe(0.1);
    expect(config.instructions.mode).toBe('preset');
  });

  test('uses the promoted prompt templates stored on the assignment type', async () => {
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'assignment-type-prompt',
      title: 'Prompt-managed essay',
      kind: 'essay',
      scoringScaleJson: { type: 'weighted_1_5', minScore: 1, maxScore: 5 },
      rubricJson: {
        categories: [
          {
            key: 'thesis',
            label: 'Thesis',
            description: 'Makes a clear claim.',
            weight: 1,
          },
        ],
      },
      gradingPromptConfigJson: {
        gradingInstructions: 'Grade the essay.',
        systemMessageTemplate: 'Production system for {{assignment_type}}',
        userMessageTemplate: 'Rubric:\n{{rubric}}\nEssay:\n{{document}}',
      },
      gradingOutputSchemaJson: { schemaVersion: 1 },
      gradingCalibrationNotes: null,
      gradingAssistantVersion: 7,
      gradingAssistantSourceTemplateId: null,
      gradingAssistantSourceTemplateSlug: null,
    });

    const config = await resolveAssignmentTypeGradingConfig({
      assignmentTypeId: 'assignment-type-prompt',
    });

    expect(config.promptTemplate).toEqual({
      systemMessage: 'Production system for {{assignment_type}}',
      userMessage: 'Rubric:\n{{rubric}}\nEssay:\n{{document}}',
    });
  });

  test('selecting the canonical Thesis library entry preserves the exact production config identity', async () => {
    const { THESIS_DRIVEN_ESSAY } =
      await import('~/domain/rubrics/thesis-driven-essay');
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'assignment-type-thesis',
      title: 'Thesis-driven Essay',
      kind: null,
      scoringScaleJson: {
        type: 'weighted_percent',
        minScore: 0,
        maxScore: 100,
      },
      rubricJson: { categories: [] },
      gradingPromptConfigJson: {
        gradingInstructions: 'Stale instructions from the retired rubric editor.',
        gradingInstructionsOverride:
          'Apply the thesis rubric with extra emphasis on source analysis.',
      },
      gradingOutputSchemaJson: null,
      gradingCalibrationNotes: 'Changed notes.',
      gradingAssistantVersion: 9,
      gradingAssistantSourceTemplateId: 'changed-template',
      gradingAssistantSourceTemplateSlug: 'changed-template',
      rubric: {
        name: 'thesis-driven-essay',
        schemaJson: THESIS_DRIVEN_ESSAY,
      },
    });

    const config = await resolveAssignmentTypeGradingConfig({
      assignmentTypeId: 'assignment-type-thesis',
    });

    expect(config.source).toBe('thesis-default');
    expect(config.label).toBe('Thesis-driven essay grading assistant');
    expect(config.version).toBe(1);
    expect(config.scoringType).toBe('weighted_1_5');
    expect(config.minScore).toBe(1);
    expect(config.maxScore).toBe(5);
    expect(config.instructions).toEqual({
      mode: 'unified',
      gradingInstructions:
        'Apply the thesis rubric with extra emphasis on source analysis.',
    });
    expect(config.promptConfigSnapshot).toEqual(
      expect.objectContaining({
        gradingInstructions:
          'Apply the thesis rubric with extra emphasis on source analysis.',
      })
    );
    expect(config.sourceTemplateId).toBeNull();
    expect(config.sourceTemplateSlug).toBeNull();
  });
});


describe('September 14 Daily Pages library revision', () => {
  test('preserves the authored deployment text exactly and represents every allowed integer band', async () => {
    const { isScoreInCategoryBands } = await import('./rubric-category-options');
    const { parseRubricSchema } = await import('~/domain/rubrics/rubric-schema');
    const schema = dailyPagesEngagementV1LibrarySchema;
    expect(createHash('sha256').update(schema.promptConfig.gradingInstructions!.trim() + '\n').digest('hex'))
      .toBe('e0529c37ba362ac810a13129d547ee1654b92382ffbcf87b249d2391f15a4a86');
    expect(schema.scoringScale).toMatchObject({ minScore: 0, maxScore: 30, step: 1 });
    const category = schema.rubric.categories[0];
    expect(category.feedbackEnabled).toBe(false);
    expect(category.grammarHighlighting).toBe(false);
    const allowed = Array.from({ length: 31 }, (_, score) => score).filter(score => isScoreInCategoryBands(category, score));
    expect(allowed).toEqual([0, 7, 8, 9, 10, 11, 12, 13, 17, 18, 19, 20, 21, 22, 23, 28, 29, 30]);
    expect(dailyPagesLibraryJson.scoringScale.maxScore).toBe(100);
  });

  test('sends actual tier bands, overall-only feedback and the assignment prompt to the model', async () => {
    const { compileGradingAssistantInvocation } = await import('~/domain/grading/grading-assistant-invocation');
    const schema = dailyPagesEngagementV1LibrarySchema;
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'daily-pages-linked', title: 'Daily Pages', kind: 'daily_pages',
      rubric: { name: schema.name, schemaJson: schema },
      gradingAssistantVersion: 6,
    });
    const config = await resolveAssignmentTypeGradingConfig({ assignmentTypeId: 'daily-pages-linked' });
    const invocation = compileGradingAssistantInvocation({
      gradingConfig: config, studentFirstName: 'Jordan', strictnessLevel: 'intermediate',
      assignmentPrompt: 'Describe a place that matters to you.', documentText: 'My grandmother’s kitchen.',
    });
    expect(invocation.system).toContain('first decide which band');
    expect(invocation.system).not.toContain('"comment": string');
    expect(invocation.userMessage).toContain('28-30 ALL IN');
    expect(invocation.userMessage).toContain('17-23 SHOWED UP');
    expect(invocation.userMessage).toContain('7-13 HARDLY THERE');
    expect(invocation.userMessage).toContain('Assignment prompt: Describe a place that matters to you.');
    expect(invocation.userMessage).toContain('My grandmother’s kitchen.');
  });

  test('keeps an existing assignment pinned to its prior library revision', async () => {
    const current = dailyPagesEngagementV1LibrarySchema;
    const prior = structuredClone(current);
    prior.scoringScale.step = 10;
    delete prior.rubric.categories[0].bands;
    prior.promptConfig.gradingInstructions = 'Prior teacher-approved instructions.';
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'daily-pages-pinned', title: 'Daily Pages', kind: 'daily_pages',
      rubric: { name: current.name, schemaJson: current, currentRevision: { version: 6, rubricName: current.name, schemaJson: current } },
      gradingAssistantVersion: 6,
    });
    prisma.assignment.findUnique.mockResolvedValue({ assignmentTypeId: 'daily-pages-pinned', rubricRevision: { version: 5, rubricName: prior.name, schemaJson: prior } });
    const config = await resolveAssignmentTypeGradingConfig({ assignmentTypeId: 'daily-pages-pinned', assignmentId: 'historical-assignment' });
    expect(config.version).toBe(5);
    expect(config.step).toBe(10);
    expect(config.rubricCategories[0].bands).toBeUndefined();
    expect(config.instructions).toMatchObject({ gradingInstructions: 'Prior teacher-approved instructions.' });
  });

  test('honors library outputSchema.teacherNotesEnabled on thesis-driven essay rubrics', async () => {
    const { THESIS_DRIVEN_ESSAY_RUBRIC_NAME } = await import(
      '~/domain/rubrics/thesis-driven-essay'
    );
    const schema = {
      name: THESIS_DRIVEN_ESSAY_RUBRIC_NAME,
      title: 'Thesis-driven essay',
      scoringScale: { type: 'weighted_1_5', minScore: 1, maxScore: 5, step: 1 },
      rubric: {
        categories: [
          {
            key: 'thesis_and_content',
            label: 'Thesis/Content',
            weight: 0.6,
            description: 'Original thesis.',
          },
        ],
      },
      promptConfig: { instructionsPreset: 'legacy_thesis_driven_essay' },
      outputSchema: { schemaVersion: 1, teacherNotesEnabled: true },
    };
    const config = buildResolvedAssignmentTypeGradingConfig({
      assignmentTypeId: 'thesis-type',
      assignmentTypeKind: 'essay',
      assignmentTypeTitle: 'Essay',
      row: {
        id: 'thesis-type',
        title: 'Essay',
        kind: 'essay',
        scoringScaleJson: schema.scoringScale,
        rubricJson: schema.rubric,
        gradingPromptConfigJson: schema.promptConfig,
        gradingOutputSchemaJson: schema.outputSchema,
        gradingCalibrationNotes: null,
        gradingAssistantVersion: 1,
        gradingAssistantSourceTemplateId: null,
        gradingAssistantSourceTemplateSlug: null,
        selectedRubricName: THESIS_DRIVEN_ESSAY_RUBRIC_NAME,
      },
    });
    expect(
      (config.outputSchemaSnapshot as { teacherNotesEnabled?: boolean })
        .teacherNotesEnabled
    ).toBe(true);
  });

  test('preserves whole-number score resolution on a configured 90-point engagement rubric', async () => {
    const { rubricScaleGradeFieldsFromScores } = await import('~/domain/grading/recorded-grade');
    const { isScoreInCategoryBands } = await import('./rubric-category-options');
    const schema = structuredClone(dailyPagesEngagementV1LibrarySchema);
    schema.scoringScale.maxScore = 90;
    schema.scoringScale.compositeMax = 90;
    schema.rubric.categories[0].bands = schema.rubric.categories[0].bands!.map(band => ({ ...band, min: band.min * 3, max: band.max * 3 }));
    prisma.assignmentType.findUnique.mockResolvedValue({ id: 'daily-pages-90', title: 'Daily Pages', kind: 'daily_pages', rubric: { name: schema.name, schemaJson: schema } });
    const config = await resolveAssignmentTypeGradingConfig({ assignmentTypeId: 'daily-pages-90' });
    expect(config.step).toBe(1);
    expect(isScoreInCategoryBands(config.rubricCategories[0], 55)).toBe(true);
    const result = rubricScaleGradeFieldsFromScores({ rubricScores: { engagement_with_prompt: { score: 55 } }, categories: config.rubricCategories, minScore: config.minScore, maxScore: config.maxScore, scoringType: config.scoringType });
    expect(result).toEqual({ overallScore: 55, score: '55/90', numericPercentage: null, letterGrade: null });
  });

  test('existing recorded scores remain unchanged when assignment is pinned to a prior revision', async () => {
    const { rubricScaleGradeFieldsFromScores } = await import('~/domain/grading/recorded-grade');
    // Current library (e.g., post-Sep 14/16) is 90-point variant in this scenario.
    const current = structuredClone(dailyPagesEngagementV1LibrarySchema);
    current.scoringScale.maxScore = 90;
    current.scoringScale.compositeMax = 90;
    current.rubric.categories[0].bands = current.rubric.categories[0].bands!.map(b => ({ ...b, min: b.min * 3, max: b.max * 3 }));
    // Prior revision (e.g., pre-Sep 14/16) is 30-point with original bands.
    const prior = structuredClone(dailyPagesEngagementV1LibrarySchema);
    // Mock: assignment type points at current library revision…
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'daily-pages-pinned-grade',
      title: 'Daily Pages',
      kind: 'daily_pages',
      rubric: { name: current.name, schemaJson: current, currentRevision: { version: 6, rubricName: current.name, schemaJson: current } },
      gradingAssistantVersion: 6,
    });
    // …but the specific assignment is pinned to the prior revision.
    prisma.assignment.findUnique.mockResolvedValue({
      assignmentTypeId: 'daily-pages-pinned-grade',
      rubricRevision: { version: 5, rubricName: prior.name, schemaJson: prior },
    });
    const resolved = await resolveAssignmentTypeGradingConfig({
      assignmentTypeId: 'daily-pages-pinned-grade',
      assignmentId: 'historical-assignment',
    });
    // Teacher's recorded score (e.g., 18/30) should compute identically after the pin.
    const grade = rubricScaleGradeFieldsFromScores({
      categories: resolved.rubricCategories,
      minScore: resolved.minScore,
      maxScore: resolved.maxScore,
      scoringType: resolved.scoringType,
      rubricScores: { engagement_with_prompt: { score: 18 } },
    });
    expect(grade).toEqual({ overallScore: 18, score: '18/30', numericPercentage: null, letterGrade: null });
  });

});

describe('thesis-driven essay revisions authored in Yawp Internal', () => {
  beforeEach(() => {
    prisma.assignmentType.findUnique.mockReset();
    prisma.assignment.findUnique.mockReset();
  });

  async function thesisSetup(pinned: { sourceContentId: string | null }) {
    const { THESIS_DRIVEN_ESSAY } = await import('~/domain/rubrics/thesis-driven-essay');
    const authored = structuredClone(THESIS_DRIVEN_ESSAY) as any;
    authored.scoringScale = { type: 'rubric_points', minScore: 0, maxScore: 40 };
    authored.rubric = { categories: [{ key: 'claim', label: 'Claim (internal)', weight: 1, description: 'Authored in Yawp Internal.' }] };
    authored.calibrationNotes = 'Internal calibration notes';
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'assignment-type-thesis', title: 'Thesis-driven Essay', kind: null,
      scoringScaleJson: null, rubricJson: null, gradingPromptConfigJson: null, gradingOutputSchemaJson: null,
      gradingCalibrationNotes: null, gradingAssistantVersion: 1,
      gradingAssistantSourceTemplateId: null, gradingAssistantSourceTemplateSlug: null,
      rubric: { name: 'thesis-driven-essay', schemaJson: THESIS_DRIVEN_ESSAY, currentRevision: { id: 'rev-current', version: 1, rubricName: 'thesis-driven-essay', schemaJson: THESIS_DRIVEN_ESSAY, sourceContentId: null } },
    });
    prisma.assignment.findUnique.mockResolvedValue({
      assignmentTypeId: 'assignment-type-thesis', rubricTotalPoints: null, gradingMode: 'bands',
      rubricRevision: { id: 'rev-pinned', version: 2, rubricName: 'thesis-driven-essay', schemaJson: authored, sourceContentId: pinned.sourceContentId },
    });
    return resolveAssignmentTypeGradingConfig({ assignmentTypeId: 'assignment-type-thesis', assignmentId: 'assignment-1' });
  }

  test('a pinned revision staged from Yawp Internal grades with its own content', async () => {
    const config = await thesisSetup({ sourceContentId: '6f1f5b5e-7a39-4d4f-9a52-6a1b9d3b2c11' });
    expect(config.source).toBe('assignment-type');
    expect(config.rubricName).toBe('thesis-driven-essay');
    expect(config.maxScore).toBe(40);
    expect(config.rubricCategories.map((category) => category.label)).toEqual(['Claim (internal)']);
    expect(config.calibrationNotes).toBe('Internal calibration notes');
  });

  test('a pinned revision without Internal source keeps the production code default', async () => {
    const config = await thesisSetup({ sourceContentId: null });
    expect(config.source).toBe('thesis-default');
    expect(config.scoringType).toBe('weighted_1_5');
    expect(config.rubricCategories.map((category) => category.label)).not.toContain('Claim (internal)');
  });
});
