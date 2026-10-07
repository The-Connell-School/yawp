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
    step: 1,
    rubricIncomplete: false,
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
  test('includes the assignment prompt in the user message when provided', () => {
    const invocation = compileGradingAssistantInvocation({
      gradingConfig: gradingConfig(),
      studentFirstName: 'Jordan',
      strictnessLevel: 'intermediate',
      documentText: 'My reflection for today.',
      assignmentPrompt: 'What surprised you in chapter 4?',
    });

    expect(invocation.userMessage).toContain(
      'Assignment prompt: What surprised you in chapter 4?'
    );
  });

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

  test('keeps the private-output contract on an opted-in managed prompt', () => {
    const invocation = compileGradingAssistantInvocation({
      gradingConfig: gradingConfig({ outputSchemaSnapshot: { teacherNotesEnabled: true }, promptTemplate: { systemMessage: 'Managed grading system.', userMessage: '{{rubric}}\n{{grading_instructions}}\n{{document}}' } }),
      studentFirstName: 'Jordan', strictnessLevel: 'intermediate', documentText: 'A memory.',
    });
    expect(invocation.system).toStartWith('Managed grading system.');
    expect(invocation.system).toContain('"teacherNote": string | null');
    expect(invocation.system).toContain('Never put private observations in overallComment');
    expect(invocation.system).toContain('Do not infer AI authorship');
  });

});

describe('compileGradingAssistantInvocation writing time', () => {
  const base = {
    gradingConfig: gradingConfig(),
    studentFirstName: 'Jordan',
    strictnessLevel: 'intermediate' as const,
    documentText: 'School uniforms should be optional.',
  };

  test('leaves the prompt exactly as it was when no writing time is set', () => {
    const without = compileGradingAssistantInvocation(base);
    expect(compileGradingAssistantInvocation({ ...base, writingTimeMinutes: null }))
      .toEqual(without);
    expect(without.userMessage).not.toContain('Writing time');
  });

  test('tells the assistant how long the student had', () => {
    const invocation = compileGradingAssistantInvocation({
      ...base,
      writingTimeMinutes: 10,
    });
    expect(invocation.userMessage).toContain('Writing time:');
    expect(invocation.userMessage).toContain('10 minutes');
    // Placed before the essay, beside the other things the teacher decided.
    expect(invocation.userMessage.indexOf('Writing time:')).toBeLessThan(
      invocation.userMessage.indexOf('Essay:')
    );
  });

  test('a managed template can place it with {{writing_time}}', () => {
    const invocation = compileGradingAssistantInvocation({
      ...base,
      gradingConfig: gradingConfig({
        promptTemplate: {
          systemMessage: 'Grade it.',
          userMessage: '{{writing_time}}\n---\n{{document}}',
        },
      }),
      writingTimeMinutes: 20,
    });
    expect(invocation.userMessage.startsWith('Writing time:')).toBe(true);
    expect(invocation.userMessage.match(/Writing time:/g)).toHaveLength(1);
  });

  test('an older managed template without the variable still receives it', () => {
    const invocation = compileGradingAssistantInvocation({
      ...base,
      gradingConfig: gradingConfig({
        promptTemplate: {
          systemMessage: 'Grade it.',
          userMessage: 'Essay:\n{{document}}',
        },
      }),
      writingTimeMinutes: 20,
    });
    expect(invocation.userMessage).toContain('20 minutes');
  });
});

/**
 * A tutor-off assignment is a cold write: the student's unassisted writing.
 * The grader is told so it holds the piece to the same rubric but does not send
 * the student to a tutor they never had.
 */
describe('compileGradingAssistantInvocation cold write', () => {
  const base = {
    gradingConfig: gradingConfig(),
    studentFirstName: 'Jordan',
    strictnessLevel: 'intermediate' as const,
    documentText: 'School uniforms should be optional.',
  };

  test('leaves the prompt exactly as it was when the tutor was on or unknown', () => {
    const without = compileGradingAssistantInvocation(base);
    expect(
      compileGradingAssistantInvocation({ ...base, coldWrite: false })
    ).toEqual(without);
    expect(without.userMessage).not.toContain('Cold write');
  });

  test('tells the assistant it is grading a cold write, ahead of the essay', () => {
    const invocation = compileGradingAssistantInvocation({
      ...base,
      coldWrite: true,
    });
    expect(invocation.userMessage).toContain('Cold write:');
    expect(invocation.userMessage).toContain('same rubric');
    expect(invocation.userMessage.indexOf('Cold write:')).toBeLessThan(
      invocation.userMessage.indexOf('Essay:')
    );
  });

  test('sits beside the writing time when both are set', () => {
    const invocation = compileGradingAssistantInvocation({
      ...base,
      coldWrite: true,
      writingTimeMinutes: 15,
    });
    expect(invocation.userMessage).toContain('15 minutes');
    expect(invocation.userMessage.indexOf('Writing time:')).toBeLessThan(
      invocation.userMessage.indexOf('Cold write:')
    );
    expect(invocation.userMessage.indexOf('Cold write:')).toBeLessThan(
      invocation.userMessage.indexOf('Essay:')
    );
  });
});

/**
 * The paragraph type a teacher chose layers its own guidance onto the one
 * Daily Pages rubric. No type is every assignment before this existed.
 */
describe('compileGradingAssistantInvocation paragraph type', () => {
  const base = {
    gradingConfig: gradingConfig(),
    studentFirstName: 'Jordan',
    strictnessLevel: 'intermediate' as const,
    documentText: 'Nick never admits that he envies Gatsby.',
  };

  test('leaves the prompt exactly as it was when no type is chosen', () => {
    const without = compileGradingAssistantInvocation(base);
    expect(
      compileGradingAssistantInvocation({ ...base, paragraphMode: null })
    ).toEqual(without);
    expect(without.userMessage).not.toContain('Paragraph type');
  });

  test('adds the type guidance ahead of the essay', () => {
    const invocation = compileGradingAssistantInvocation({
      ...base,
      paragraphMode: 'analyze',
      writingTimeMinutes: 15,
    });
    expect(invocation.userMessage).toContain('Paragraph type: Analyze');
    expect(invocation.userMessage).toContain('Claim-Evidence-Analysis');
    expect(invocation.userMessage.indexOf('Paragraph type:')).toBeLessThan(
      invocation.userMessage.indexOf('Essay:')
    );
  });

  test('ignores a type that is not switched on', () => {
    expect(
      compileGradingAssistantInvocation({ ...base, paragraphMode: 'argue' })
    ).toEqual(compileGradingAssistantInvocation(base));
  });
});
