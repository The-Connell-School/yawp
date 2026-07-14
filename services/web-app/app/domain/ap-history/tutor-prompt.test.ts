import { describe, expect, test } from 'bun:test';
import { buildApHistorySnapshot } from './schema';
import { buildApHistoryTutorSystemPrompt } from './tutor-prompt';

const dbqSnapshot = buildApHistorySnapshot({
  externalKey: 'apush-dbq-new-deal-federal-power',
  course: 'apush',
  essayType: 'dbq',
  prompt: 'Evaluate the extent to which the New Deal changed federal power.',
  period: '1932-1980',
  periodNumber: 7,
  reasoningSkill: 'causation',
  defaultTimeMode: 'untimed',
  defaultDurationMinutes: 60,
  sources: [
    {
      externalKey: 'apush-dbq-new-deal-federal-power-doc-1',
      position: 1,
      title: 'Document 1',
      attribution: 'Franklin D. Roosevelt, first inaugural address, 1933',
      body: 'This Nation asks for action, and action now.',
      caption: 'Roosevelt outlines the federal response.',
      mediaType: 'text',
      imageUrl: null,
      imageAlt: null,
      provenanceUrl: null,
    },
  ],
});

const leqSnapshot = buildApHistorySnapshot({
  externalKey: 'apush-leq-market-revolution',
  course: 'apush',
  essayType: 'leq',
  prompt: 'Evaluate the extent to which the Market Revolution transformed society.',
  period: '1815-1848',
  periodNumber: 4,
  reasoningSkill: 'causation',
  defaultTimeMode: 'untimed',
  defaultDurationMinutes: 40,
  sources: [],
});

describe('buildApHistoryTutorSystemPrompt', () => {
  test('uses the 7-point DBQ rubric and includes the document set', () => {
    const prompt = buildApHistoryTutorSystemPrompt(dbqSnapshot);

    expect(prompt).toContain('DBQ Rubric (7 points');
    expect(prompt).not.toContain('LEQ Rubric (6 points');
    expect(prompt).toContain('Coaching arc (DBQ)');
    // assignment context surfaces essay type, period, reasoning skill, prompt
    expect(prompt).toContain('Period 7');
    expect(prompt).toContain('causation');
    expect(prompt).toContain(dbqSnapshot.prompt);
    // sources are embedded so the tutor can coach on document use
    expect(prompt).toContain('Document 1');
    expect(prompt).toContain('This Nation asks for action');
    expect(prompt).toContain('Roosevelt outlines the federal response.');
  });

  test('uses the 6-point LEQ rubric and omits the source section when there are none', () => {
    const prompt = buildApHistoryTutorSystemPrompt(leqSnapshot);

    expect(prompt).toContain('LEQ Rubric (6 points');
    expect(prompt).not.toContain('DBQ Rubric (7 points');
    expect(prompt).toContain('Coaching arc (LEQ)');
    expect(prompt).not.toContain('Source documents (');
  });

  test('always includes failure detectors and the behind-the-scenes guardrails', () => {
    const prompt = buildApHistoryTutorSystemPrompt(dbqSnapshot);

    expect(prompt).toContain('Named failure-mode detectors');
    expect(prompt).toContain('thesis-restates-prompt');
    expect(prompt).toContain('Never tell the student you are being shown');
    expect(prompt).toContain('student_document_context');
    // never writes the essay for the student
    expect(prompt).toContain('Never write for the student');
  });

  test('focuses coaching on the current section when the module provides guidance', () => {
    const prompt = buildApHistoryTutorSystemPrompt(dbqSnapshot, {
      title: 'Read the Documents',
      tutorInstructions:
        'Coach source analysis and document groupings; hold off on drafting.',
    });

    expect(prompt).toContain('Current section: "Read the Documents"');
    expect(prompt).toContain(
      'Coach source analysis and document groupings; hold off on drafting.'
    );
    // the full arc still travels with the prompt so the tutor knows what
    // comes before and after the current section
    expect(prompt).toContain('Coaching arc (DBQ)');
  });

  test('legacy single-module sessions without guidance produce the unchanged prompt', () => {
    const withLegacyModule = buildApHistoryTutorSystemPrompt(dbqSnapshot, {
      title: 'AP History Essay',
      tutorInstructions: null,
    });

    expect(withLegacyModule).not.toContain('Current section:');
    expect(withLegacyModule).toBe(buildApHistoryTutorSystemPrompt(dbqSnapshot));
  });
});
