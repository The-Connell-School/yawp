import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AP_ENGLISH_LIT_ASSIGNMENT_TYPE_DATA,
  AP_ENGLISH_LIT_ASSIGNMENT_TYPE_KEY,
  AP_ENGLISH_LIT_INSTRUCTION_DATA,
  AP_ENGLISH_LIT_MODULE_DATA,
} from './ap-english-lit-course-data';
import { buildApEnglishLitCoachingBlock } from './ap-english-lit-coach-block';
import { UNIVERSAL_TUTOR_BLOCK } from './universal-tutor-block';

describe('AP English Literature course data', () => {
  test('ships the module with the coaching block already in tutorInstructions', () => {
    // This column is what the admin Tutor settings screen shows and edits. A
    // module seeded without it leaves admin looking like the course has no
    // tutor instructions at all, even though the runtime falls back to the
    // authored block.
    expect(AP_ENGLISH_LIT_MODULE_DATA.tutorInstructions).toBe(
      buildApEnglishLitCoachingBlock()
    );
  });

  test('carries both the universal layer and the AP Lit layer', () => {
    const instructions = AP_ENGLISH_LIT_MODULE_DATA.tutorInstructions;

    expect(instructions).toContain(UNIVERSAL_TUTOR_BLOCK);
    expect(instructions).toContain('THIS ASSIGNMENT: AP ENGLISH LITERATURE.');
    expect(instructions).toContain('Coaching principles (always follow):');
    expect(instructions).toContain(
      'HOW THESE PRINCIPLES SIT UNDER THE UNIVERSAL RULES ABOVE.'
    );
    expect(instructions).toContain('REGISTER MODE FOR THIS MODULE: POLISHED');
  });

  test('leads with the universal block so the tutor is the YAWP! Tutor first', () => {
    expect(
      AP_ENGLISH_LIT_MODULE_DATA.tutorInstructions.startsWith('WHO YOU ARE.')
    ).toBe(true);
  });

  test('describes the course the same way in both seeds', () => {
    expect(AP_ENGLISH_LIT_ASSIGNMENT_TYPE_KEY).toBe('ap_english_lit_essay');
    expect(AP_ENGLISH_LIT_ASSIGNMENT_TYPE_DATA.title).toBe(
      'AP English Literature Essay'
    );
    expect(AP_ENGLISH_LIT_MODULE_DATA.position).toBe(1);
    expect(AP_ENGLISH_LIT_INSTRUCTION_DATA.showChatButton).toBe(true);
  });
});

describe('AP English Literature seeds', () => {
  // Both seeds create the same course. They drifted once — the synthetic seed
  // built the module without tutorInstructions — so they must now read the
  // course definition from one place rather than restating it.
  const seedSources = {
    'seed-ap-english-lit-library.ts': join(
      import.meta.dirname,
      'seed-ap-english-lit-library.ts'
    ),
    'local-dev/seed-synthetic-data.ts': join(
      import.meta.dirname,
      'local-dev/seed-synthetic-data.ts'
    ),
  };

  for (const [label, path] of Object.entries(seedSources)) {
    test(`${label} builds the course from the shared definition`, () => {
      const source = readFileSync(path, 'utf8');

      expect(source).toContain('ap-english-lit-course-data');
      expect(source).toContain('AP_ENGLISH_LIT_MODULE_DATA');
      // A literal course title here means the seed is restating the course
      // definition instead of importing it.
      expect(source).not.toContain("title: 'AP English Literature Essay'");
    });
  }

  test('local dev seed protects admin edits to the coaching block', () => {
    const source = readFileSync(
      join(import.meta.dirname, 'local-dev/seed-synthetic-data.ts'),
      'utf8'
    );

    expect(source).toContain('tutorInstructionSeedUpdate');
    expect(source).toContain('withoutTutorInstructionFields');
  });
});
