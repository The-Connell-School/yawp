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

describe('buildTutorSystemPrompt — AP coaching', () => {
  it('uses synthesis coaching when tutorContext is AP synthesis JSON', () => {
    const apContext = JSON.stringify({
      essayType: 'synthesis',
      sourcePassages: [
        { label: 'Source A', title: 'Privacy', body: 'Surveillance text.' },
      ],
    });
    const result = buildTutorSystemPrompt({
      tutorInstructions: 'Generic module text that should be ignored.',
      instructionTutorInstructions: null,
      assignmentTutorContext: apContext,
    });
    expect(result).toContain('SYNTHESIS essay');
    expect(result).toContain('Source A');
    expect(result).toContain('Surveillance text.');
    // Generic module text is replaced, not appended, for AP assignments.
    expect(result).not.toContain('Generic module text');
    expect(result).toContain('read_student_document');
  });

  it('uses rhetorical-analysis coaching with the passage text', () => {
    const result = buildTutorSystemPrompt({
      tutorInstructions: null,
      instructionTutorInstructions: null,
      assignmentTutorContext: JSON.stringify({
        essayType: 'rhetorical-analysis',
        sourcePassages: [{ label: 'Passage', body: 'A persuasive speech.' }],
      }),
    });
    expect(result).toContain('RHETORICAL ANALYSIS essay');
    expect(result).toContain('A persuasive speech.');
  });

  it('uses argument coaching with no sources', () => {
    const result = buildTutorSystemPrompt({
      tutorInstructions: null,
      instructionTutorInstructions: null,
      assignmentTutorContext: JSON.stringify({ essayType: 'argument' }),
    });
    expect(result).toContain('ARGUMENT essay');
  });

  it('includes teacher notes when present', () => {
    const result = buildTutorSystemPrompt({
      tutorInstructions: null,
      instructionTutorInstructions: null,
      assignmentTutorContext: JSON.stringify({
        essayType: 'argument',
        teacherNotes: 'Emphasize counterargument.',
      }),
    });
    expect(result).toContain('Emphasize counterargument.');
  });

  it('falls back to the standard path for plain-text tutorContext', () => {
    const result = buildTutorSystemPrompt({
      tutorInstructions: 'Module coaching.',
      instructionTutorInstructions: null,
      assignmentTutorContext: 'Plain text guidance.',
    });
    expect(result).toContain('Module coaching.');
    expect(result).toContain('Plain text guidance.');
    expect(result).not.toContain('SYNTHESIS essay');
  });

  it('uses poetry analysis coaching for AP Lit poetry-analysis', () => {
    const result = buildTutorSystemPrompt({
      tutorInstructions: null,
      instructionTutorInstructions: null,
      assignmentTutorContext: JSON.stringify({
        essayType: 'poetry-analysis',
        sourcePassages: [{ label: 'Poem', body: 'Two roads diverged' }],
      }),
    });
    expect(result).toContain('POETRY ANALYSIS essay');
    expect(result).toContain('Two roads diverged');
  });

  it('uses prose fiction coaching for AP Lit prose-fiction-analysis', () => {
    const result = buildTutorSystemPrompt({
      tutorInstructions: null,
      instructionTutorInstructions: null,
      assignmentTutorContext: JSON.stringify({
        essayType: 'prose-fiction-analysis',
        sourcePassages: [{ label: 'Passage', body: 'It was a dark night.' }],
      }),
    });
    expect(result).toContain('PROSE FICTION ANALYSIS essay');
  });

  it('uses literary argument coaching with no sources', () => {
    const result = buildTutorSystemPrompt({
      tutorInstructions: null,
      instructionTutorInstructions: null,
      assignmentTutorContext: JSON.stringify({ essayType: 'literary-argument' }),
    });
    expect(result).toContain('LITERARY ARGUMENT essay');
  });
});
