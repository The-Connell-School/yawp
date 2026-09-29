import { describe, expect, test } from 'bun:test';
import { UNIVERSAL_TUTOR_BLOCK } from '../../../../../packages/prisma/scripts/universal-tutor-block';
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

  describe('universal YAWP! Tutor layer', () => {
    test('leads with the universal block verbatim, before any AP-specific coaching', () => {
      const prompt = buildApHistoryTutorSystemPrompt(dbqSnapshot);

      expect(prompt).toContain(UNIVERSAL_TUTOR_BLOCK);
      expect(prompt.startsWith(UNIVERSAL_TUTOR_BLOCK)).toBe(true);
      // The AP layer is a specialization underneath the universal character,
      // not a replacement for it.
      expect(prompt.indexOf(UNIVERSAL_TUTOR_BLOCK)).toBeLessThan(
        prompt.indexOf('AP History')
      );
    });

    test('carries the universal guardrails into both essay types', () => {
      for (const snapshot of [dbqSnapshot, leqSnapshot]) {
        const prompt = buildApHistoryTutorSystemPrompt(snapshot);
        expect(prompt).toContain('You are the YAWP! Tutor');
        expect(prompt).toContain("I'm not that kind of guy!");
        expect(prompt).toContain('I am mysterious and I contain so many');
        expect(prompt).toContain('MULTILINGUAL.');
      }
    });

    test('the AP layer no longer contradicts the universal encouragement rule', () => {
      // The universal block asks the tutor to lead with genuine encouragement
      // and to bless excellent work. A blanket ban on praise would cancel it.
      const prompt = buildApHistoryTutorSystemPrompt(dbqSnapshot);

      expect(prompt).not.toContain('No "great job" praise');
      // The intent behind that old rule survives: praise must be specific.
      expect(prompt).toContain('Praise is specific or it is noise');
    });

    test('reconciles "never say ready to submit" with honoring "I\'m ready"', () => {
      const prompt = buildApHistoryTutorSystemPrompt(dbqSnapshot, {
        title: 'Revision',
        tutorInstructions: 'Whole-essay pass.',
      });

      // Submission stays the student's call, but the tutor still may not keep
      // inventing new problems once a step's bar is met.
      expect(prompt).toContain('ready to submit');
      expect(prompt).toContain('do not move the goalposts');
    });

    test('tells the tutor mechanics never cost AP rubric points, even when polished', () => {
      const prompt = buildApHistoryTutorSystemPrompt(dbqSnapshot, {
        title: 'Drafting',
        tutorInstructions: 'Argument-first paragraphs.',
      });

      expect(prompt).toContain('mechanics never cost a rubric point');
    });
  });

  describe('assignment-level General Tutor Instructions', () => {
    test('uses the stored assignment-level instructions when admin has set them', () => {
      const prompt = buildApHistoryTutorSystemPrompt(
        dbqSnapshot,
        undefined,
        'EDITED IN ADMIN. You are the YAWP! Tutor with a house rule.'
      );

      expect(prompt.startsWith('EDITED IN ADMIN.')).toBe(true);
      expect(prompt).not.toContain(UNIVERSAL_TUTOR_BLOCK);
      // The AP History substance is unaffected by the swap.
      expect(prompt).toContain('DBQ Rubric (7 points');
    });

    test('falls back to the authored universal block when the row is empty', () => {
      for (const empty of [undefined, null, '', '   \n  ']) {
        const prompt = buildApHistoryTutorSystemPrompt(
          dbqSnapshot,
          undefined,
          empty
        );
        expect(prompt.startsWith(UNIVERSAL_TUTOR_BLOCK)).toBe(true);
      }
    });

    test('a seeded row and an unseeded environment produce the same prompt', () => {
      // This is what makes writing the defaults into the database safe: the
      // stored value is the authored value until somebody edits it.
      expect(
        buildApHistoryTutorSystemPrompt(
          dbqSnapshot,
          undefined,
          UNIVERSAL_TUTOR_BLOCK
        )
      ).toBe(buildApHistoryTutorSystemPrompt(dbqSnapshot));
    });
  });

  describe('register mode', () => {
    test('rides along inside the section guidance it governs', () => {
      // Register mode is composed onto the section guidance upstream, so the
      // prompt builder passes it through with the rest of that string. That is
      // what lets an admin edit it in the same textarea.
      const prompt = buildApHistoryTutorSystemPrompt(dbqSnapshot, {
        title: 'Pre-Writing',
        tutorInstructions:
          'Coach thesis and contextualization.\nREGISTER MODE FOR THIS MODULE: DRAFTING — ideas only.',
      });

      expect(prompt).toContain('REGISTER MODE FOR THIS MODULE: DRAFTING');
      expect(prompt.indexOf('Current section: "Pre-Writing"')).toBeLessThan(
        prompt.indexOf('REGISTER MODE FOR THIS MODULE:')
      );
    });

    test('legacy sessions with no section carry no register directive', () => {
      const prompt = buildApHistoryTutorSystemPrompt(dbqSnapshot);
      expect(prompt).not.toContain('REGISTER MODE FOR THIS MODULE:');
    });
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

  test('narrows to the current step when the instruction provides guidance', () => {
    const prompt = buildApHistoryTutorSystemPrompt(dbqSnapshot, {
      title: 'Drafting',
      tutorInstructions: 'Coach argument-first body paragraphs.',
      instruction: {
        title: 'Strengthen the Evidence',
        tutorInstructions:
          'HIPP-source at least 2 documents and add specific outside evidence.',
      },
    });

    expect(prompt).toContain('Current section: "Drafting"');
    expect(prompt).toContain('Current step: "Strengthen the Evidence"');
    expect(prompt).toContain(
      'HIPP-source at least 2 documents and add specific outside evidence.'
    );
  });

  test('steps without their own guidance fall back to section-level coaching only', () => {
    const prompt = buildApHistoryTutorSystemPrompt(dbqSnapshot, {
      title: 'Pre-Writing',
      tutorInstructions: 'Coach thesis and contextualization.',
      instruction: { title: 'Plan your essay', tutorInstructions: null },
    });

    expect(prompt).toContain('Current section: "Pre-Writing"');
    expect(prompt).not.toContain('Current step:');
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
