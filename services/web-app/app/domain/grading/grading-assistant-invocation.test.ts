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

    expect(invocation.system).toStartWith('Coach Jordan with scores 1-5.');
    expect(invocation.system).toContain('"teacherNote": string | null');
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

  test('appends assignment grading context for a template that has no slot for it', () => {
    const invocation = compileGradingAssistantInvocation({
      gradingConfig: gradingConfig(),
      studentFirstName: 'Jordan',
      strictnessLevel: 'intermediate',
      documentText: 'Weathering breaks rock down where it sits.',
      assignmentPrompt: 'What is the difference between weathering and erosion?',
      gradingContext:
        "The teacher's notes on the lesson this ticket closes. The student did not see these; judge the response against them.\n- Main points: Erosion moves the pieces.",
    });

    expect(invocation.userMessage).toContain('Erosion moves the pieces.');
    expect(invocation.userMessage).toContain(
      'The student did not see these'
    );
    expect(invocation.userMessage).not.toContain('{{');
  });

  test('renders grading context inline when the template asks for it', () => {
    const invocation = compileGradingAssistantInvocation({
      gradingConfig: gradingConfig({
        promptTemplate: {
          systemMessage: 'Managed grading system.',
          userMessage: '{{grading_context}}\n\nEssay:\n{{document}}',
        },
      }),
      studentFirstName: 'Jordan',
      strictnessLevel: 'intermediate',
      documentText: 'A response.',
      gradingContext: 'Judge this against the objective.',
    });

    expect(invocation.userMessage).toStartWith(
      'Judge this against the objective.'
    );
    // Inline means once, not once inline and once appended.
    expect(
      invocation.userMessage.split('Judge this against the objective.').length - 1
    ).toBe(1);
  });

  test('leaves the payload untouched for an assignment with no grading context', () => {
    const without = compileGradingAssistantInvocation({
      gradingConfig: gradingConfig(),
      studentFirstName: 'Jordan',
      strictnessLevel: 'intermediate',
      documentText: 'A response.',
      assignmentPrompt: 'A prompt.',
    });
    const withNull = compileGradingAssistantInvocation({
      gradingConfig: gradingConfig(),
      studentFirstName: 'Jordan',
      strictnessLevel: 'intermediate',
      documentText: 'A response.',
      assignmentPrompt: 'A prompt.',
      gradingContext: null,
    });

    expect(withNull.userMessage).toBe(without.userMessage);
    expect(withNull.system).toBe(without.system);
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

  test('a managed template can place it with {{writing_time}}', () => {
    const invocation = compileGradingAssistantInvocation({
      ...base,
      gradingConfig: gradingConfig({
        promptTemplate: {
          systemMessage: 'Grade it.',
          userMessage: '{{writing_time}}\n---\n{{document}}',
        },
      }),
      coldWrite: true,
    });
    expect(invocation.userMessage.startsWith('Cold write:')).toBe(true);
    expect(invocation.userMessage.match(/Cold write:/g)).toHaveLength(1);
  });

  // Daily Pages paragraph type and writing time were removed: the grader is
  // never told either, whatever an old assignment still has stored.
  test('never mentions a writing time or a paragraph type', () => {
    const invocation = compileGradingAssistantInvocation({
      ...base,
      coldWrite: true,
    });
    const text = `${invocation.system}\n${invocation.userMessage}`;
    expect(text).not.toContain('Writing time');
    expect(text).not.toContain('Paragraph type');
  });
});
