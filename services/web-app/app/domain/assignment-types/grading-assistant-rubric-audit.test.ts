import { describe, expect, test } from 'bun:test';

import {
  auditGradingAssistantRubric,
  GRADING_ASSISTANT_AUDIT_TYPES,
} from './grading-assistant-rubric-audit';
import { parseAssignmentTypeRubricConfig } from './assignment-type-rubric-config';
import { CLASS_STARTER_THREE_BAND_SCHEMA } from './class-starter-three-band-rubric';

function resolvedFrom(
  config: ReturnType<typeof parseAssignmentTypeRubricConfig>,
  label = 'Built-in'
) {
  return {
    source: config.source,
    label,
    scoringType: config.scoringScale.type,
    minScore: config.scoringScale.minScore,
    maxScore: config.scoringScale.maxScore,
    step: config.scoringScale.step ?? 1,
    rubricCategories: config.rubric.categories,
    rubricIncomplete: config.rubricIncomplete,
  };
}

const typeFor = (name: string) =>
  GRADING_ASSISTANT_AUDIT_TYPES.find((type) => type.name === name)!;

const healthyLibrary = {
  libraryRubricTitle: null,
  libraryRubricHasCurrentRevision: null,
};

describe('auditGradingAssistantRubric', () => {
  test('covers exactly the five types the Grading Assistant leans on', () => {
    expect(GRADING_ASSISTANT_AUDIT_TYPES.map((type) => type.name)).toEqual([
      'Thesis-Driven Essay',
      'Pre-Writing',
      'Thesis Statement',
      'Class Starter',
      'Exit Ticket',
    ]);
  });

  test('passes the built-in Exit Ticket rubric', () => {
    const findings = auditGradingAssistantRubric(
      typeFor('Exit Ticket'),
      resolvedFrom(
        parseAssignmentTypeRubricConfig({ assignmentTypeKind: 'exit_ticket' })
      ),
      healthyLibrary
    );
    expect(findings).toEqual([]);
  });

  test('flags an Exit Ticket that lost its bands', () => {
    const builtIn = parseAssignmentTypeRubricConfig({
      assignmentTypeKind: 'exit_ticket',
    });
    const findings = auditGradingAssistantRubric(
      typeFor('Exit Ticket'),
      {
        ...resolvedFrom(builtIn),
        source: 'assignment-type',
        scoringType: 'weighted_1_5',
        minScore: 1,
        maxScore: 5,
        rubricCategories: builtIn.rubric.categories.map(
          ({ bands: _bands, ...category }) => category
        ),
      },
      healthyLibrary
    );
    expect(findings.map((finding) => finding.code)).toContain(
      'exit-ticket-bands'
    );
  });

  test('flags a Class Starter still on the four-word rubric', () => {
    const findings = auditGradingAssistantRubric(
      typeFor('Class Starter'),
      resolvedFrom(
        parseAssignmentTypeRubricConfig({ assignmentTypeKind: 'class_starter' })
      ),
      healthyLibrary
    );
    expect(findings).toEqual([
      expect.objectContaining({
        code: 'class-starter-bands',
        level: 'action',
      }),
    ]);
    expect(findings[0]?.message).toContain('Absent, Hardly there, Showed up, All in');
  });

  test('passes a Class Starter on the three-band library rubric', () => {
    const config = parseAssignmentTypeRubricConfig({
      assignmentTypeKind: 'class_starter',
      rubricJson: CLASS_STARTER_THREE_BAND_SCHEMA.rubric,
      scoringScaleJson: CLASS_STARTER_THREE_BAND_SCHEMA.scoringScale,
    });
    expect(
      auditGradingAssistantRubric(typeFor('Class Starter'), resolvedFrom(config), {
        libraryRubricTitle: CLASS_STARTER_THREE_BAND_SCHEMA.title,
        libraryRubricHasCurrentRevision: true,
      })
    ).toEqual([]);
  });

  test('flags a library rubric with no current revision, which new assignments cannot pin to', () => {
    const config = parseAssignmentTypeRubricConfig({
      assignmentTypeKind: 'class_starter',
      rubricJson: CLASS_STARTER_THREE_BAND_SCHEMA.rubric,
      scoringScaleJson: CLASS_STARTER_THREE_BAND_SCHEMA.scoringScale,
    });
    expect(
      auditGradingAssistantRubric(typeFor('Class Starter'), resolvedFrom(config), {
        libraryRubricTitle: CLASS_STARTER_THREE_BAND_SCHEMA.title,
        libraryRubricHasCurrentRevision: false,
      }).map((finding) => finding.code)
    ).toEqual(['library-rubric-no-revision']);
  });

  test.each([
    ['Thesis-Driven Essay', {}],
    ['Pre-Writing', { assignmentTypeKind: 'prewriting' }],
    ['Thesis Statement', { assignmentTypeKind: 'thesis_statement' }],
  ] as const)('passes the built-in %s rubric', (name, input) => {
    expect(
      auditGradingAssistantRubric(
        typeFor(name),
        resolvedFrom(parseAssignmentTypeRubricConfig(input)),
        healthyLibrary
      )
    ).toEqual([]);
  });

  test('flags a scale with a step, which stops scores landing on every whole number', () => {
    const findings = auditGradingAssistantRubric(
      typeFor('Pre-Writing'),
      {
        ...resolvedFrom(
          parseAssignmentTypeRubricConfig({ assignmentTypeKind: 'prewriting' })
        ),
        step: 2,
      },
      healthyLibrary
    );
    expect(findings.map((finding) => finding.code)).toEqual(['scale-step']);
  });

  test('flags an incomplete rubric', () => {
    const findings = auditGradingAssistantRubric(
      typeFor('Thesis Statement'),
      {
        ...resolvedFrom(
          parseAssignmentTypeRubricConfig({
            assignmentTypeKind: 'thesis_statement',
          })
        ),
        rubricIncomplete: true,
      },
      healthyLibrary
    );
    expect(findings.map((finding) => finding.code)).toEqual([
      'rubric-incomplete',
    ]);
  });

  test('flags a Thesis-Driven Essay that is not on the five essay categories', () => {
    const findings = auditGradingAssistantRubric(
      typeFor('Thesis-Driven Essay'),
      {
        ...resolvedFrom(parseAssignmentTypeRubricConfig({})),
        rubricCategories: [
          { key: 'only_one', label: 'Only one', weight: 1 },
        ],
      },
      healthyLibrary
    );
    expect(findings.map((finding) => finding.code)).toEqual([
      'thesis-categories',
    ]);
  });
});
