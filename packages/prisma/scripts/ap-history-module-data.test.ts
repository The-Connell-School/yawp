import { describe, expect, test } from 'bun:test';
import {
  AP_HISTORY_MODULES,
  AP_HISTORY_SEED_DEFAULT_ESSAY_TYPE,
  AP_HISTORY_SEED_MODULES,
  pickApHistoryEssayVariant,
  resolveApHistoryInstructionPrompt,
  resolveApHistoryRegisterMode,
  resolveApHistorySectionTutorInstructions,
  resolveApHistoryStepTutorInstructions,
} from './ap-history-module-data';

describe('AP History module (section) seed data', () => {
  test('breaks the tutor into the writing-process sections', () => {
    expect(AP_HISTORY_MODULES.map((module) => module.title)).toEqual([
      'Read the Documents',
      'Pre-Writing',
      'Drafting',
      'Revision',
    ]);
  });

  test('positions are sequential from 1 so position 1 upgrades the legacy single module in place', () => {
    expect(AP_HISTORY_MODULES.map((module) => module.position)).toEqual([
      1, 2, 3, 4,
    ]);
  });

  test('every section carries essay-type-specific tutor guidance and student-facing instructions', () => {
    for (const module of AP_HISTORY_MODULES) {
      expect(module.description.trim().length).toBeGreaterThan(0);
      expect(module.tutorInstructions.dbq.trim().length).toBeGreaterThan(0);
      expect(module.tutorInstructions.leq.trim().length).toBeGreaterThan(0);
      expect(module.instructions.length).toBeGreaterThanOrEqual(1);

      for (const [index, instruction] of module.instructions.entries()) {
        expect(instruction.position).toBe(index + 1);
        expect(instruction.title.trim().length).toBeGreaterThan(0);
        expect(instruction.prompt.dbq.trim().length).toBeGreaterThan(0);
        expect(instruction.prompt.leq.trim().length).toBeGreaterThan(0);
        expect(instruction.showChatButton).toBe(true);
      }
    }
  });

  test('Drafting is broken into steps that walk the essay from intro to conclusion', () => {
    const drafting = AP_HISTORY_MODULES.find(
      (module) => module.title === 'Drafting'
    );

    expect(drafting).toBeDefined();
    expect(
      drafting!.instructions.map((instruction) => instruction.title)
    ).toEqual([
      'Introduction',
      'Body Paragraphs',
      'Strengthen the Evidence',
      'Conclusion',
    ]);

    // Each drafting step carries its own tutor guidance for both essay types,
    // so the coach narrows from the section to the step at hand.
    for (const instruction of drafting!.instructions) {
      expect(instruction.tutorInstructions?.dbq.trim().length).toBeGreaterThan(
        0
      );
      expect(instruction.tutorInstructions?.leq.trim().length).toBeGreaterThan(
        0
      );
    }
  });

  test('DBQ and LEQ guidance is tailored, not hedged: the evidence work differs by essay type', () => {
    // The DBQ tutor talks documents/HIPP; the LEQ tutor talks named evidence
    // and reasoning. Neither hedges with the other essay type's playbook.
    const dbqDrafting = resolveApHistorySectionTutorInstructions(
      'dbq',
      'Drafting'
    )!;
    const leqDrafting = resolveApHistorySectionTutorInstructions(
      'leq',
      'Drafting'
    )!;

    expect(dbqDrafting).toContain('documents');
    expect(dbqDrafting).toContain('HIPP');
    expect(dbqDrafting).not.toContain('LEQ');

    expect(leqDrafting).toContain('reasoning skill');
    expect(leqDrafting).not.toContain('HIPP');
    expect(leqDrafting).not.toContain('DBQ');

    // The two essay types get different guidance strings.
    expect(dbqDrafting).not.toBe(leqDrafting);
  });

  test('the LEQ opening bubble does not describe a DBQ, and vice versa', () => {
    const dbqOpener = resolveApHistoryInstructionPrompt(
      'dbq',
      'Read the Documents',
      'Analyze the sources'
    )!;
    const leqOpener = resolveApHistoryInstructionPrompt(
      'leq',
      'Read the Documents',
      'Analyze the sources'
    )!;

    expect(dbqOpener).toContain('documents');
    expect(leqOpener).toContain('no documents on an LEQ');
    expect(dbqOpener).not.toBe(leqOpener);
  });

  test('the DBQ Read the Documents section spells out what HIPP stands for up front', () => {
    // Students first meet HIPP in the reading section, so the guidance must
    // define the acronym rather than assume the student already knows it.
    const readSection = resolveApHistorySectionTutorInstructions(
      'dbq',
      'Read the Documents'
    )!;

    expect(readSection).toContain('HIPP stands for');
    expect(readSection).toContain('Historical situation');
    expect(readSection).toContain('Intended audience');
    expect(readSection).toContain('Point of view');
    expect(readSection).toContain('Purpose');

    // The definition comes before the acronym is put to work in the guidance.
    expect(readSection.indexOf('HIPP stands for')).toBeLessThan(
      readSection.indexOf('one HIPP angle')
    );
  });

  test('section guidance meets students where they are instead of hard-blocking work in progress', () => {
    // Existing documents keep their position-1 session, so a student mid-draft
    // may land in an early section. Guidance must never insist on restarting.
    for (const essayType of ['dbq', 'leq'] as const) {
      const readSection = resolveApHistorySectionTutorInstructions(
        essayType,
        'Read the Documents'
      )!;
      expect(readSection.toLowerCase()).toContain('meet them where they are');
    }
  });

  test('every section declares the register mode the universal tutor block reads', () => {
    // The Universal YAWP! Tutor Instructions leave DRAFTING vs POLISHED to the
    // course-builder, per module. Every canonical section must answer it, or
    // the tutor is left guessing whether mechanics feedback is in scope.
    expect(
      AP_HISTORY_MODULES.map((module) => [module.title, module.registerMode])
    ).toEqual([
      ['Read the Documents', 'drafting'],
      ['Pre-Writing', 'drafting'],
      ['Drafting', 'polished'],
      ['Revision', 'polished'],
    ]);
  });

  test('section guidance ends with the section register directive', () => {
    // The directive is composed into the guidance string so the value seeded
    // into the database is exactly what the runtime would have built, and an
    // admin can edit both in one textarea.
    for (const essayType of ['dbq', 'leq'] as const) {
      const preWriting = resolveApHistorySectionTutorInstructions(
        essayType,
        'Pre-Writing'
      )!;
      const drafting = resolveApHistorySectionTutorInstructions(
        essayType,
        'Drafting'
      )!;

      expect(preWriting).toContain('REGISTER MODE FOR THIS MODULE: DRAFTING');
      expect(preWriting).not.toContain(
        'REGISTER MODE FOR THIS MODULE: POLISHED'
      );
      expect(drafting).toContain('REGISTER MODE FOR THIS MODULE: POLISHED');
      expect(drafting).not.toContain('REGISTER MODE FOR THIS MODULE: DRAFTING');

      // It closes the guidance rather than interrupting it.
      expect(preWriting.trimEnd().split('\n').at(-1)).toContain(
        'REGISTER MODE FOR THIS MODULE:'
      );
    }
  });

  test('the seeded variants are exactly what the runtime resolves', () => {
    // The DB-first read is only safe because seeding writes the authored value
    // byte for byte. If these ever diverge, seeding silently changes coaching.
    for (const seedModule of AP_HISTORY_SEED_MODULES) {
      for (const essayType of ['dbq', 'leq'] as const) {
        expect(seedModule.tutorInstructionsVariantsJson[essayType]).toBe(
          resolveApHistorySectionTutorInstructions(essayType, seedModule.title)!
        );
      }
    }
  });

  test('seeded step variants match the runtime step resolver', () => {
    for (const seedModule of AP_HISTORY_SEED_MODULES) {
      for (const seedStep of seedModule.instructions) {
        if (!('tutorInstructionsVariantsJson' in seedStep)) continue;
        for (const essayType of ['dbq', 'leq'] as const) {
          expect(seedStep.tutorInstructionsVariantsJson![essayType]).toBe(
            resolveApHistoryStepTutorInstructions(
              essayType,
              seedModule.title,
              seedStep.title
            )!
          );
        }
      }
    }
  });

  test('resolveApHistoryRegisterMode answers per section and null off the canonical path', () => {
    expect(resolveApHistoryRegisterMode('Pre-Writing')).toBe('drafting');
    expect(resolveApHistoryRegisterMode('Revision')).toBe('polished');
    // Legacy single-module documents get no register directive at all, which
    // leaves their prompt exactly as it was.
    expect(resolveApHistoryRegisterMode('AP History Essay')).toBeNull();
  });

  describe('resolvers', () => {
    test('return null for a module/step outside the canonical sections (legacy)', () => {
      expect(
        resolveApHistorySectionTutorInstructions('dbq', 'AP History Essay')
      ).toBeNull();
      expect(
        resolveApHistoryInstructionPrompt('dbq', 'AP History Essay', 'Write')
      ).toBeNull();
    });

    test('return null for a step without its own step-level guidance', () => {
      expect(
        resolveApHistoryStepTutorInstructions(
          'dbq',
          'Read the Documents',
          'Analyze the sources'
        )
      ).toBeNull();
    });

    test('pickApHistoryEssayVariant selects by essay type', () => {
      const variants = { dbq: 'D', leq: 'L' };
      expect(pickApHistoryEssayVariant(variants, 'dbq')).toBe('D');
      expect(pickApHistoryEssayVariant(variants, 'leq')).toBe('L');
    });
  });

  describe('seed (string-valued) modules', () => {
    test('mirror the canonical sections with the default essay-type variant', () => {
      expect(AP_HISTORY_SEED_MODULES.map((module) => module.title)).toEqual(
        AP_HISTORY_MODULES.map((module) => module.title)
      );

      for (const [index, seedModule] of AP_HISTORY_SEED_MODULES.entries()) {
        const canonical = AP_HISTORY_MODULES[index];
        expect(seedModule.position).toBe(canonical.position);
        expect(typeof seedModule.tutorInstructions).toBe('string');
        // The single-string column carries the default essay type's fully
        // composed guidance, register directive included.
        expect(seedModule.tutorInstructions).toBe(
          resolveApHistorySectionTutorInstructions(
            AP_HISTORY_SEED_DEFAULT_ESSAY_TYPE,
            canonical.title
          )!
        );
        expect(seedModule.tutorInstructions).toContain(
          canonical.tutorInstructions[AP_HISTORY_SEED_DEFAULT_ESSAY_TYPE]
        );
        expect(seedModule.instructions).toHaveLength(
          canonical.instructions.length
        );
        for (const [stepIndex, seedStep] of seedModule.instructions.entries()) {
          const canonicalStep = canonical.instructions[stepIndex];
          expect(typeof seedStep.prompt).toBe('string');
          expect(seedStep.prompt).toBe(
            canonicalStep.prompt[AP_HISTORY_SEED_DEFAULT_ESSAY_TYPE]
          );
          if (canonicalStep.tutorInstructions) {
            expect(seedStep.tutorInstructions).toBe(
              canonicalStep.tutorInstructions[AP_HISTORY_SEED_DEFAULT_ESSAY_TYPE]
            );
          }
        }
      }
    });
  });
});
