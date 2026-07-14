import { describe, expect, test } from 'bun:test';
import type { ResolvedAssignmentTypeGradingConfig } from '~/domain/assignment-types/assignment-type-grading-config.server';
import { compileGradingAssistantInvocation } from './grading-assistant-invocation';

function gradingConfig(
  patch: Partial<ResolvedAssignmentTypeGradingConfig> = {}
): ResolvedAssignmentTypeGradingConfig {
  return {
    source: 'assignment-type',
    assignmentTypeId: 'assignment-type-1',
    assignmentTypeKind: null,
    assignmentTypeTitle: 'Argument Essay',
    label: 'Argument Essay',
    version: 3,
    scoringType: 'weighted_1_5',
    minScore: 1,
    maxScore: 5,
    rubricCategories: [
      {
        key: 'claim',
        label: 'Claim',
        weight: 0.6,
        description: 'States a defensible position.',
      },
      {
        key: 'evidence',
        label: 'Evidence',
        weight: 0.4,
        description: 'Supports the position with relevant evidence.',
      },
    ],
    instructions: {
      mode: 'unified',
      systemInstructions:
        'Act as a precise writing coach who explains every scoring decision.',
      gradingInstructions:
        'Prioritize the strongest next revision and do not rewrite the essay.',
    },
    rubricSnapshot: {},
    promptConfigSnapshot: {},
    outputSchemaSnapshot: {},
    calibrationNotes: null,
    sourceTemplateId: null,
    sourceTemplateSlug: null,
    ...patch,
  };
}

describe('compileGradingAssistantInvocation', () => {
  test('compiles the exact system and user messages for assignment-type instructions', () => {
    const invocation = compileGradingAssistantInvocation({
      gradingConfig: gradingConfig(),
      studentFirstName: 'Jordan',
      strictnessLevel: 'advanced',
      documentText: 'School uniforms should be optional.',
    });

    expect(invocation.system).toContain('You are a grading assistant.');
    expect(invocation.system).toContain(
      '"categories": [{"key": string, "score": 1-5, "comment": string}]'
    );
    expect(invocation.system).toContain(
      'Follow the grading instructions in the user prompt exactly.'
    );
    expect(invocation.system).toContain(
      'Assignment type system instructions:\nAct as a precise writing coach who explains every scoring decision.'
    );
    expect(invocation.userMessage).toContain('Student first name: Jordan');
    expect(invocation.userMessage).toContain(
      'Assignment type grading config: Argument Essay'
    );
    expect(invocation.userMessage).toContain(
      'Grading assistant strictness: Advanced'
    );
    expect(invocation.userMessage).toContain(
      'Hold the student to an advanced standard for this rubric'
    );
    expect(invocation.userMessage).toContain(
      'claim: Claim (60%) - States a defensible position.'
    );
    expect(invocation.userMessage).toContain(
      'evidence: Evidence (40%) - Supports the position with relevant evidence.'
    );
    expect(invocation.userMessage).toContain(
      'Grading instructions:\nPrioritize the strongest next revision and do not rewrite the essay.'
    );
    expect(invocation.userMessage).toContain(
      'Essay:\nSchool uniforms should be optional.'
    );
    expect(invocation.messages).toEqual([
      { role: 'user', content: invocation.userMessage },
    ]);
    expect(invocation.maxTokens).toBe(900);
  });

  test('preserves legacy split system, rubric, and score instructions', () => {
    const invocation = compileGradingAssistantInvocation({
      gradingConfig: gradingConfig({
        instructions: {
          mode: 'legacy-split',
          systemInstructions: 'Use the district grading policy.',
          rubricInstructions: 'Apply every rubric category independently.',
          scoreInstructions: 'Never use half points.',
        },
      }),
      studentFirstName: 'Avery',
      strictnessLevel: 'intermediate',
      documentText: 'A short response.',
    });

    expect(invocation.system).toStartWith(
      'Use the district grading policy.\n\nYou are a grading assistant.'
    );
    expect(invocation.system).toContain('Never use half points.');
    expect(invocation.userMessage).toContain(
      'Rubric Instructions:\nApply every rubric category independently.'
    );
  });

  test('compiles built-in preset instructions without a legacy system prefix', () => {
    const invocation = compileGradingAssistantInvocation({
      gradingConfig: gradingConfig({
        instructions: {
          mode: 'preset',
          rubricInstructions: 'Apply the approved thesis rubric.',
          scoreInstructions: 'Use whole-number proficiency scores.',
        },
      }),
      studentFirstName: 'Morgan',
      strictnessLevel: 'beginner',
      documentText: 'A developing thesis response.',
    });

    expect(invocation.system).toStartWith('You are a grading assistant.');
    expect(invocation.system).toContain('Use whole-number proficiency scores.');
    expect(invocation.userMessage).toContain(
      'Rubric Instructions:\nApply the approved thesis rubric.'
    );
  });

  test('renders a saved prompt-version template with controlled variables', () => {
    const invocation = compileGradingAssistantInvocation({
      gradingConfig: gradingConfig({
        promptTemplate: {
          systemMessage:
            'Coach {{student_first_name}} with scores {{min_score}}-{{max_score}}.',
          userMessage:
            '{{assignment_type}}\n{{strictness}}\n{{rubric}}\n{{grading_instructions}}\nDOCUMENT={{document}}',
        },
      } as Partial<ResolvedAssignmentTypeGradingConfig>),
      studentFirstName: 'Jordan',
      strictnessLevel: 'advanced',
      documentText: 'School uniforms should be optional.',
    });

    expect(invocation.system).toBe('Coach Jordan with scores 1-5.');
    expect(invocation.userMessage).toContain('Argument Essay');
    expect(invocation.userMessage).toContain('Advanced');
    expect(invocation.userMessage).toContain(
      'claim: Claim (60%) - States a defensible position.'
    );
    expect(invocation.userMessage).toContain(
      'Prioritize the strongest next revision and do not rewrite the essay.'
    );
    expect(invocation.userMessage).toContain(
      'DOCUMENT=School uniforms should be optional.'
    );
    expect(invocation.userMessage).not.toContain('{{');
  });
});
