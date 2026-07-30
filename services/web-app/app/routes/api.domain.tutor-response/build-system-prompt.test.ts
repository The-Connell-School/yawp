import { describe, it, expect } from 'bun:test';
import {
  buildModuleRubricGuidance,
  buildTutorSystemPrompt,
} from './build-system-prompt';
import {
  TUTOR_GUIDELINE_LAYER_META,
  UNIVERSAL_YAWP_TUTOR_GUIDELINES,
} from '~/domain/tutoring/tutor-guidelines';

const base = {
  tutorInstructions: 'You are a friendly English writing tutor.',
  instructionTutorInstructions: 'Focus on the current instruction only.',
};

describe('buildTutorSystemPrompt guideline layers', () => {
  it('always includes the universal YAWP guidelines, even with nothing configured', () => {
    const result = buildTutorSystemPrompt({
      tutorInstructions: null,
      instructionTutorInstructions: null,
    });

    expect(result).toContain(TUTOR_GUIDELINE_LAYER_META.universal.label);
    expect(result).toContain(UNIVERSAL_YAWP_TUTOR_GUIDELINES);
  });

  it('includes course guidelines above module and step guidelines', () => {
    const result = buildTutorSystemPrompt({
      courseTutorInstructions: 'AP Lit: coach the 6-point rubric.',
      tutorInstructions: 'Module: draft the free-response essay.',
      instructionTutorInstructions: 'Step: get a defensible thesis down.',
    });

    const universalAt = result.indexOf(
      TUTOR_GUIDELINE_LAYER_META.universal.label
    );
    const courseAt = result.indexOf(TUTOR_GUIDELINE_LAYER_META.course.label);
    const moduleAt = result.indexOf(TUTOR_GUIDELINE_LAYER_META.module.label);
    const stepAt = result.indexOf(TUTOR_GUIDELINE_LAYER_META.step.label);

    expect(universalAt).toBeGreaterThanOrEqual(0);
    expect(courseAt).toBeGreaterThan(universalAt);
    expect(moduleAt).toBeGreaterThan(courseAt);
    expect(stepAt).toBeGreaterThan(moduleAt);
    expect(result).toContain('AP Lit: coach the 6-point rubric.');
    expect(result).toContain('Module: draft the free-response essay.');
    expect(result).toContain('Step: get a defensible thesis down.');
  });

  it('labels module guidance even when no course guidelines exist', () => {
    const result = buildTutorSystemPrompt({
      courseTutorInstructions: null,
      tutorInstructions: 'Module: draft the free-response essay.',
      instructionTutorInstructions: null,
    });

    expect(result).toContain(TUTOR_GUIDELINE_LAYER_META.module.label);
    expect(result).not.toContain(TUTOR_GUIDELINE_LAYER_META.course.label);
  });

  it('keeps rubric guidance and system mechanics after the guideline layers', () => {
    const result = buildTutorSystemPrompt({
      ...base,
      moduleRubricGuidance: 'Module rubric guidance:\n- Primary: Thesis',
    });

    expect(result.indexOf('Module rubric guidance')).toBeGreaterThan(
      result.indexOf(TUTOR_GUIDELINE_LAYER_META.universal.label)
    );
    expect(result.indexOf('behind-the-scenes information')).toBeGreaterThan(
      result.indexOf('Module rubric guidance')
    );
  });
});

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
