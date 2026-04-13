import { describe, it, expect } from 'bun:test';
import { buildTutorSystemPrompt } from './build-system-prompt';

const base = {
  tutorInstructions: 'You are a friendly English writing tutor.',
  instructionTutorInstructions: 'Focus on the current instruction only.',
  assignmentTutorContext: 'This assignment is a persuasive essay.',
};

describe('buildTutorSystemPrompt', () => {
  it('includes the behind-the-scenes instruction', () => {
    const result = buildTutorSystemPrompt(base);
    expect(result).toContain('behind-the-scenes information');
  });

  it('includes the document tool instruction', () => {
    const result = buildTutorSystemPrompt(base);
    expect(result).toContain('read_student_document');
    expect(result).toContain('Always call this tool before commenting');
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
      assignmentTutorContext: '',
    });
    expect(result).toContain('behind-the-scenes information');
    expect(result).toContain('read_student_document');
    expect(result.startsWith('\n')).toBe(false);
    expect(result.endsWith('\n')).toBe(false);
  });
});
