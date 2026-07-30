import { describe, it, expect } from 'bun:test';
import {
  buildModuleRubricGuidance,
  buildTutorSystemPrompt,
} from './build-system-prompt';

const base = {
  tutorInstructions: 'You are a friendly English writing tutor.',
  instructionTutorInstructions: 'Focus on the current instruction only.',
};

describe('buildTutorSystemPrompt', () => {
  it('includes the behind-the-scenes instruction', () => {
    const result = buildTutorSystemPrompt(base);
    expect(result).toContain('behind-the-scenes information');
  });

  it('includes the explicit document context instruction', () => {
    const result = buildTutorSystemPrompt(base);
    expect(result).toContain('student_document_context');
    expect(result).toContain('current document draft');
    expect(result).not.toContain('read_student_document');
  });

  it('does not include any <student_document> tags', () => {
    const result = buildTutorSystemPrompt(base);
    expect(result).not.toContain('<student_document>');
  });

  it('still includes the "quote the student back" carve-out', () => {
    const result = buildTutorSystemPrompt(base);
    expect(result.toLowerCase()).toContain('quote');
    expect(result.toLowerCase()).toContain("student's own writing");
  });

  it('drops undefined / null parts cleanly', () => {
    const result = buildTutorSystemPrompt({
      tutorInstructions: undefined,
      instructionTutorInstructions: null,
    });
    expect(result).toContain('behind-the-scenes information');
    expect(result).toContain('student_document_context');
    expect(result.startsWith('\n')).toBe(false);
    expect(result.endsWith('\n')).toBe(false);
  });

  it('opens with the assignment-type guidelines, above the module instructions', () => {
    const result = buildTutorSystemPrompt({
      ...base,
      assignmentTypeTutorInstructions:
        'You are the YAWP! Tutor. Never write the work for the student.',
    });

    expect(result.startsWith('You are the YAWP! Tutor.')).toBe(true);
    expect(result.indexOf('You are the YAWP! Tutor.')).toBeLessThan(
      result.indexOf(base.tutorInstructions)
    );
    expect(result.indexOf(base.tutorInstructions)).toBeLessThan(
      result.indexOf(base.instructionTutorInstructions)
    );
  });

  it('is unchanged for assignment types with no overarching guidelines', () => {
    const withoutLayer = buildTutorSystemPrompt(base);
    const withEmptyLayer = buildTutorSystemPrompt({
      ...base,
      assignmentTypeTutorInstructions: null,
    });

    expect(withEmptyLayer).toBe(withoutLayer);
    expect(withoutLayer.startsWith(base.tutorInstructions)).toBe(true);
  });

  it('includes module rubric guidance and excludes not-applicable categories', () => {
    const guidance = buildModuleRubricGuidance({
      categories: [
        {
          key: 'thesis_and_content',
          label: 'Thesis/Content',
          description: 'Original, defensible thesis.',
          weight: 0.25,
        },
        {
          key: 'organization_and_structure',
          label: 'Organization/Structure',
          description: 'Purposeful structure.',
          weight: 0.25,
        },
        {
          key: 'evidence_and_support',
          label: 'Evidence/Support',
          description: 'Precise evidence.',
          weight: 0.2,
        },
        {
          key: 'grammar_and_mechanics',
          label: 'Grammar/Syntax/Formatting',
          description: 'Technical correctness.',
          weight: 0.1,
        },
      ],
      alignment: {
        thesis_and_content: 'primary',
        organization_and_structure: 'supporting',
        evidence_and_support: 'preparatory',
        grammar_and_mechanics: 'not-applicable',
      },
    });

    expect(guidance).toContain('Primary');
    expect(guidance).toContain('Thesis/Content (25%)');
    expect(guidance).toContain('Supporting');
    expect(guidance).toContain('Organization/Structure (25%)');
    expect(guidance).toContain('Preparatory');
    expect(guidance).toContain('Evidence/Support (20%)');
    expect(guidance).not.toContain('Grammar/Syntax/Formatting');

    const prompt = buildTutorSystemPrompt({
      ...base,
      moduleRubricGuidance: guidance,
    });

    expect(prompt).toContain('Module rubric guidance');
    expect(prompt).toContain('Primary');
  });
});
