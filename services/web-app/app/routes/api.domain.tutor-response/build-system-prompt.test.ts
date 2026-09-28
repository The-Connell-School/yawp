import { describe, it, expect } from 'bun:test';
import {
  buildModuleRubricGuidance,
  buildTutorSystemPrompt,
  buildTutorSystemPromptBlocks,
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

/**
 * A Daily Pages paragraph type layers its coaching onto the module's own tutor
 * rather than replacing it: the shared tutor stays the base, the type adds the
 * skill the teacher picked.
 */
describe('buildTutorSystemPrompt paragraph type', () => {
  it('adds the type coaching after the module and instruction layers', () => {
    const result = buildTutorSystemPrompt({
      ...base,
      paragraphModeInstructions: 'PARAGRAPH TYPE: Analyze\nCoach CEA.',
    });
    expect(result.indexOf(base.tutorInstructions)).toBeLessThan(
      result.indexOf('PARAGRAPH TYPE: Analyze')
    );
    expect(result.indexOf(base.instructionTutorInstructions)).toBeLessThan(
      result.indexOf('PARAGRAPH TYPE: Analyze')
    );
    expect(result.indexOf('PARAGRAPH TYPE: Analyze')).toBeLessThan(
      result.indexOf('behind-the-scenes information')
    );
  });

  it('is unchanged when no type is chosen', () => {
    expect(
      buildTutorSystemPrompt({ ...base, paragraphModeInstructions: '' })
    ).toBe(buildTutorSystemPrompt(base));
  });
});

describe('buildTutorSystemPromptBlocks (prompt caching)', () => {
  it('wraps the whole prompt in a single cache_control block', () => {
    const blocks = buildTutorSystemPromptBlocks(base);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.cache_control).toEqual({ type: 'ephemeral' });
    expect(blocks[0]!.text).toBe(buildTutorSystemPrompt(base));
  });

  it('is byte-identical across different students in the same module', () => {
    // Nothing student-specific (document text, message history) ever enters
    // buildTutorSystemPrompt — those flow through `messages` instead — so
    // the same module + instruction params must yield an identical block
    // for every student taking that module. This is the property the cache
    // breakpoint depends on: if any student-specific field leaked in here,
    // every student's first turn would write a fresh, unread cache entry.
    const moduleParams = {
      tutorInstructions: 'Coach the student through their thesis.',
      instructionTutorInstructions: 'Focus on paragraph 2.',
      moduleRubricGuidance: 'Module rubric guidance:\n- Primary: Thesis',
    };
    const studentA = buildTutorSystemPromptBlocks(moduleParams);
    const studentB = buildTutorSystemPromptBlocks(moduleParams);
    expect(studentA[0]!.text).toBe(studentB[0]!.text);
  });

  it('changes when module-level instructions change (still a correct cache key)', () => {
    const blocksA = buildTutorSystemPromptBlocks(base);
    const blocksB = buildTutorSystemPromptBlocks({
      ...base,
      tutorInstructions: 'A completely different module persona.',
    });
    expect(blocksA[0]!.text).not.toBe(blocksB[0]!.text);
  });
});
