import { describe, it, expect } from 'bun:test';
import { buildTutorSystemPrompt } from './build-system-prompt';

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
});
