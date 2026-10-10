import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { compileRubricGradingPrompt } from './compile-rubric-grading-prompt';
import { compileGradingAssistantInvocation } from './grading-assistant-invocation';
import {
  getThesisDefaultRubricConfig,
  parseAssignmentTypeRubricConfig,
} from '~/domain/assignment-types/assignment-type-rubric-config';
import { parseRubricSchema } from '~/domain/rubrics/rubric-schema';
import { STARTER_RUBRICS } from '~/domain/rubrics/starter-rubrics';
import { dailyPagesEngagementV1LibrarySchema } from '~/domain/rubrics/library/daily-pages-engagement-v1.fixture';
import { perTypeContent } from '~/domain/rubrics/rubric-catalog.server';
import catalog from '~/domain/rubrics/__fixtures__/prod-rubric-catalog.json';
import golden from './__fixtures__/grading-prompt-golden-main.json';

function digest(text: string) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

type CatalogFixture = {
  libraryRubrics: Array<{ name: string; schemaJson: unknown }>;
  perTypeRubrics: Array<{ id: string; title: string | null } & Record<string, unknown>>;
};

const catalogFixture = catalog as CatalogFixture;

describe('grading prompt backcompat (main)', () => {
  test('starter rubrics match the main-branch golden digests', () => {
    for (const schema of STARTER_RUBRICS) {
      const key = `starter:${schema.name}`;
      const { combined } = compileRubricGradingPrompt(schema);
      expect(digest(combined)).toBe(golden[key as keyof typeof golden]);
    }
  });

  test('seeded Daily Pages v1 revision matches main', () => {
    const key = 'seeded:daily-pages-engagement-v1';
    const { combined } = compileRubricGradingPrompt(
      dailyPagesEngagementV1LibrarySchema
    );
    expect(digest(combined)).toBe(golden[key as keyof typeof golden]);
  });

  test('library JSON rubrics match main', () => {
    const libraryDir = join(import.meta.dir, '../rubrics/library');
    for (const file of readdirSync(libraryDir).filter((name) =>
      name.endsWith('.json')
    )) {
      const key = `library:${file.replace(/\.json$/, '')}`;
      const raw = JSON.parse(
        readFileSync(join(libraryDir, file), 'utf8')
      ) as unknown;
      const parsed = parseRubricSchema(raw);
      if (!parsed.ok) throw new Error(`${file}: ${parsed.error}`);
      const { combined } = compileRubricGradingPrompt(parsed.schema);
      expect(digest(combined)).toBe(golden[key as keyof typeof golden]);
    }
  });

  test('production catalog fixtures match main', () => {
    for (const rubric of catalogFixture.libraryRubrics) {
      const key = `catalog:library:${rubric.name}`;
      const parsed = parseRubricSchema(rubric.schemaJson);
      if (!parsed.ok) throw new Error(`${rubric.name}: ${parsed.error}`);
      const { combined } = compileRubricGradingPrompt(parsed.schema);
      expect(digest(combined)).toBe(golden[key as keyof typeof golden]);
    }

    for (const type of catalogFixture.perTypeRubrics) {
      const key = `catalog:per-type:${type.id}`;
      const content = perTypeContent(type as never);
      let parsed = parseRubricSchema(content);
      if (!parsed.ok && parsed.error.includes('at least one category')) {
        const builtIn = parseAssignmentTypeRubricConfig({
          rubricJson: (type as { rubricJson?: unknown }).rubricJson,
          scoringScaleJson: (type as { scoringScaleJson?: unknown }).scoringScaleJson,
          gradingPromptConfigJson: (type as { gradingPromptConfigJson?: unknown })
            .gradingPromptConfigJson,
          gradingOutputSchemaJson: (type as { gradingOutputSchemaJson?: unknown })
            .gradingOutputSchemaJson,
          gradingCalibrationNotes: (type as { gradingCalibrationNotes?: string | null })
            .gradingCalibrationNotes,
          assignmentTypeKind: null,
        });
        parsed = parseRubricSchema({
          name: `assignment-type:${type.id}`,
          title: (type as { title?: string | null }).title ?? type.id,
          scoringScale: builtIn.scoringScale,
          rubric: builtIn.rubric,
          promptConfig: builtIn.promptConfig,
          outputSchema: builtIn.outputSchema,
          calibrationNotes: builtIn.calibrationNotes,
        });
      }
      if (!parsed.ok) throw new Error(`${type.id}: ${parsed.error}`);
      const { combined } = compileRubricGradingPrompt(parsed.schema);
      expect(digest(combined)).toBe(golden[key as keyof typeof golden]);
    }
  });

  test('grade-essay-ai invocation assembly matches golden digests', () => {
    const thesis = getThesisDefaultRubricConfig();
    const thesisInvocation = compileGradingAssistantInvocation({
      gradingConfig: {
        label: thesis.defaultLabel ?? 'Thesis-driven essay grading assistant',
        minScore: thesis.scoringScale.minScore,
        maxScore: thesis.scoringScale.maxScore,
        rubricCategories: thesis.rubric.categories,
        instructions: {
          mode: 'preset',
          rubricInstructions: 'rubric',
          scoreInstructions: 'score',
        },
        outputSchemaSnapshot: thesis.outputSchema,
      },
      studentFirstName: 'Jordan',
      strictnessLevel: 'intermediate',
      documentText: 'Essay body for golden digest.',
    });
    const thesisPayload = `${thesisInvocation.system}\n---\n${thesisInvocation.userMessage}`;
    expect(thesisPayload).toContain('grammar_and_mechanics:');
    expect(digest(thesisPayload)).toBe(
      golden['assembly:thesis-default-grammar-off' as keyof typeof golden]
    );

    const managedInvocation = compileGradingAssistantInvocation({
      gradingConfig: {
        label: 'Managed template rubric',
        minScore: 1,
        maxScore: 5,
        rubricCategories: thesis.rubric.categories,
        instructions: {
          mode: 'unified',
          gradingInstructions: 'Grade with care.',
        },
        outputSchemaSnapshot: { teacherNotesEnabled: true },
        promptTemplate: {
          systemMessage: 'Managed grading system.',
          userMessage: '{{rubric}}\n{{grading_instructions}}\n{{document}}',
        },
      },
      studentFirstName: 'Jordan',
      strictnessLevel: 'intermediate',
      documentText: 'Essay body for golden digest.',
    });
    const managedPayload = `${managedInvocation.system}\n---\n${managedInvocation.userMessage}`;
    expect(digest(managedPayload)).toBe(
      golden['assembly:managed-template' as keyof typeof golden]
    );
  });
});
