import { describe, expect, test } from 'bun:test';
import { AP_HISTORY_MODULES } from './ap-history-module-data';

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

  test('every section carries tutor guidance and one student-facing kickoff instruction', () => {
    for (const module of AP_HISTORY_MODULES) {
      expect(module.description.trim().length).toBeGreaterThan(0);
      expect(module.tutorInstructions.trim().length).toBeGreaterThan(0);
      expect(module.instructions).toHaveLength(1);

      const instruction = module.instructions[0];
      expect(instruction.position).toBe(1);
      expect(instruction.title.trim().length).toBeGreaterThan(0);
      expect(instruction.prompt.trim().length).toBeGreaterThan(0);
      expect(instruction.showChatButton).toBe(true);
    }
  });

  test('section guidance covers both DBQ and LEQ flows (modules are shared across essay types)', () => {
    for (const module of AP_HISTORY_MODULES) {
      expect(module.tutorInstructions).toContain('DBQ');
      expect(module.tutorInstructions).toContain('LEQ');
    }
  });

  test('section guidance meets students where they are instead of hard-blocking work in progress', () => {
    // Existing documents keep their position-1 session, so a student mid-draft
    // may land in an early section. Guidance must never insist on restarting.
    const readSection = AP_HISTORY_MODULES[0];
    expect(readSection.tutorInstructions.toLowerCase()).toContain(
      'meet them where they are'
    );
  });
});
