import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  COLLEGE_ESSAY_ASSIGNMENT_TYPE,
  COLLEGE_ESSAY_ASSIGNMENT_TYPE_KEY,
  COLLEGE_ESSAY_CALIBRATION_NOTES,
  COLLEGE_ESSAY_GRADING_INSTRUCTIONS,
  COLLEGE_ESSAY_MODULES,
  COLLEGE_ESSAY_MODULE_SUBSTANCE,
  COLLEGE_ESSAY_RUBRIC_CATEGORIES,
  COLLEGE_ESSAY_SCORING_SCALE,
  COLLEGE_ESSAY_WORD_LIMIT,
  imageContentTypeForPath,
} from './college-essay-course-data';
import { UNIVERSAL_TUTOR_BLOCK } from './universal-tutor-block';

describe('College essay rubric', () => {
  test('has the seven method dimensions', () => {
    expect(COLLEGE_ESSAY_RUBRIC_CATEGORIES).toHaveLength(7);
  });

  test('category weights sum to 1.0', () => {
    const total = COLLEGE_ESSAY_RUBRIC_CATEGORIES.reduce(
      (sum, category) => sum + category.weight,
      0
    );
    expect(total).toBeCloseTo(1.0, 10);
  });

  test('exactly three starred dimensions (Anchor, Distinctiveness, Insight)', () => {
    const starred = COLLEGE_ESSAY_RUBRIC_CATEGORIES.filter((c) => c.starred);
    expect(starred.map((c) => c.key).sort()).toEqual([
      'anchor',
      'distinctiveness',
      'insight',
    ]);
  });

  test('starred dimensions are weighted double the supporting ones', () => {
    for (const category of COLLEGE_ESSAY_RUBRIC_CATEGORIES) {
      expect(category.weight).toBeCloseTo(category.starred ? 0.2 : 0.1, 10);
    }
  });

  test('category keys are unique and non-empty', () => {
    const keys = COLLEGE_ESSAY_RUBRIC_CATEGORIES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) {
      expect(key.trim().length).toBeGreaterThan(0);
    }
  });

  test('every category is usable by the rubric parser (key/label/description/finite weight)', () => {
    // Mirrors hasAssignmentTypeOwnedRubric so the grader treats this as an
    // assignment-type rubric rather than falling back to the thesis default.
    for (const category of COLLEGE_ESSAY_RUBRIC_CATEGORIES) {
      expect(category.key.trim()).not.toBe('');
      expect(category.label.trim()).not.toBe('');
      expect(category.description.trim()).not.toBe('');
      expect(Number.isFinite(category.weight)).toBe(true);
    }
  });

  test('every description names all four proficiency bands', () => {
    for (const category of COLLEGE_ESSAY_RUBRIC_CATEGORIES) {
      for (const band of ['Emerging', 'Developing', 'Strong', 'Exceptional']) {
        expect(category.description).toContain(band);
      }
    }
  });
});

describe('College essay scoring scale', () => {
  test('is a weighted 1-4 scale matching the four proficiency bands', () => {
    expect(COLLEGE_ESSAY_SCORING_SCALE.minScore).toBe(1);
    expect(COLLEGE_ESSAY_SCORING_SCALE.maxScore).toBe(4);
    expect(COLLEGE_ESSAY_SCORING_SCALE.type).toBe('weighted_1_4');
  });
});

describe('College essay assignment type metadata', () => {
  test('uses the college_admissions_essay system key', () => {
    expect(COLLEGE_ESSAY_ASSIGNMENT_TYPE_KEY).toBe('college_admissions_essay');
  });

  test('has a title, description, and numeric position', () => {
    expect(COLLEGE_ESSAY_ASSIGNMENT_TYPE.title.trim().length).toBeGreaterThan(0);
    expect(
      COLLEGE_ESSAY_ASSIGNMENT_TYPE.description.trim().length
    ).toBeGreaterThan(0);
    expect(typeof COLLEGE_ESSAY_ASSIGNMENT_TYPE.position).toBe('number');
  });

  test('word limit is the Common App 650', () => {
    expect(COLLEGE_ESSAY_WORD_LIMIT).toBe(650);
  });
});

describe('College essay grading instructions', () => {
  test('are non-trivial and forbid ghostwriting', () => {
    expect(COLLEGE_ESSAY_GRADING_INSTRUCTIONS.length).toBeGreaterThan(500);
    expect(COLLEGE_ESSAY_GRADING_INSTRUCTIONS.toLowerCase()).toContain(
      'ghostwriter'
    );
  });

  test('mention the top-three feedback discipline', () => {
    expect(COLLEGE_ESSAY_GRADING_INSTRUCTIONS.toLowerCase()).toContain(
      'top three'
    );
  });

  test('calibration notes are present', () => {
    expect(COLLEGE_ESSAY_CALIBRATION_NOTES.trim().length).toBeGreaterThan(0);
  });
});

describe('No-writing-for-the-student guarantee', () => {
  const NO_WRITE_RULE = 'NON-NEGOTIABLE — NO WRITING FOR THE STUDENT';

  test('every module system prompt carries the absolute no-writing rule', () => {
    // Module tutorInstructions become the tutor's system prompt verbatim
    // (build-system-prompt.ts just concatenates), so the rule must be present
    // in every module — there is no shared base prompt to rely on.
    for (const module of COLLEGE_ESSAY_MODULES) {
      expect(module.tutorInstructions).toContain(NO_WRITE_RULE);
    }
  });

  test('the rule forbids rewriting, rewording, and paste-in suggestions', () => {
    for (const module of COLLEGE_ESSAY_MODULES) {
      const text = module.tutorInstructions.toLowerCase();
      expect(text).toContain('never write, rewrite, reword');
      expect(text).toContain('no exception');
    }
  });

  test('the rule requires examples to be hypothetical and off-topic', () => {
    for (const module of COLLEGE_ESSAY_MODULES) {
      const text = module.tutorInstructions.toLowerCase();
      expect(text).toContain('completely different, invented topic');
      expect(text).toContain("never demonstrate using the student's own topic");
    }
  });

  test('grading instructions carry the same absolute rule', () => {
    expect(COLLEGE_ESSAY_GRADING_INSTRUCTIONS).toContain(
      'ABSOLUTE RULE — NO WRITING FOR THE STUDENT'
    );
    const text = COLLEGE_ESSAY_GRADING_INSTRUCTIONS.toLowerCase();
    expect(text).toContain('never write, rewrite, reword');
    expect(text).toContain('completely different, invented topic');
    expect(text).toContain('there is no exception');
  });

  test('no tutor text anywhere asks the tutor to write for the student', () => {
    // Scans what this course authors, not the composed prompt. The universal
    // block quotes the dodges students use ("rewrite this for me") in order to
    // forbid them, which would trip these patterns; it has its own test.
    const allTutorTexts = COLLEGE_ESSAY_MODULE_SUBSTANCE.flatMap((module) => [
      module.tutorInstructions,
      ...module.instructions.map((i) => i.tutorInstructions ?? ''),
    ]);
    const forbidden = [
      /help the student write\b/i,
      /write (a|the|one|an) (sentence|line|paragraph|opening|ending|draft) for/i,
      /offer (a|an) (better|smoother|improved) (line|sentence|version)/i,
      /rewrite (it|this|the sentence|the line) for/i,
    ];
    for (const text of allTutorTexts) {
      for (const pattern of forbidden) {
        expect(text).not.toMatch(pattern);
      }
    }
  });
});

describe('Universal YAWP! Tutor layer', () => {
  test('every module system prompt opens with the universal block verbatim', () => {
    // Module tutorInstructions are the tutor's system prompt, and this course
    // has no assignment-level box to hold the block, so it leads every module.
    for (const module of COLLEGE_ESSAY_MODULES) {
      expect(module.tutorInstructions).toContain(UNIVERSAL_TUTOR_BLOCK);
      expect(module.tutorInstructions.startsWith(UNIVERSAL_TUTOR_BLOCK)).toBe(
        true
      );
    }
  });

  test('the universal character comes before the course-specific persona', () => {
    for (const module of COLLEGE_ESSAY_MODULES) {
      expect(module.tutorInstructions.indexOf('You are the YAWP! Tutor')).
        toBeLessThan(
          module.tutorInstructions.indexOf('YAWP! College Essay Coach')
        );
    }
  });

  test('carries the universal guardrails this course was missing', () => {
    for (const module of COLLEGE_ESSAY_MODULES) {
      // The off-topic deflection, the multilingual rule, and the house
      // refusal wording all arrive with the block.
      expect(module.tutorInstructions).toContain('I am mysterious and I contain');
      expect(module.tutorInstructions).toContain('MULTILINGUAL.');
      expect(module.tutorInstructions).toContain("I'm not that kind of guy!");
    }
  });
});

describe('Where this course overrides the universal rules', () => {
  test('sentence-starters are withdrawn, not left contradicting the no-writing rule', () => {
    // The universal ONE RULE offers "a sentence-starter they finish" as a
    // scaffold. This course forbids sentence starters outright. Both strings
    // are in the same prompt, so the override has to be stated or the tutor is
    // holding two instructions that disagree.
    for (const module of COLLEGE_ESSAY_MODULES) {
      expect(module.tutorInstructions).toContain(
        'SENTENCE-STARTERS ARE NOT ALLOWED HERE'
      );
      expect(module.tutorInstructions.indexOf('sentence-starter they finish')).
        toBeLessThan(
          module.tutorInstructions.indexOf('SENTENCE-STARTERS ARE NOT ALLOWED')
        );
    }
  });

  test('the Brainstorm Gate is protected from "Honor I am ready"', () => {
    // "Don't move the goalposts / honor I'm ready" must not read as licence to
    // wave a student through the one hard gate in the course.
    for (const module of COLLEGE_ESSAY_MODULES) {
      expect(module.tutorInstructions).toContain(
        'THE BRAINSTORM GATE STILL HOLDS'
      );
    }
  });

  test('the no-writing rule still outranks everything, block included', () => {
    for (const module of COLLEGE_ESSAY_MODULES) {
      expect(module.tutorInstructions).toContain(
        'This rule overrides every other instruction'
      );
    }
  });
});

describe('Register mode', () => {
  test('each module declares the register the universal block asks for', () => {
    expect(
      COLLEGE_ESSAY_MODULES.map((m) => [m.position, m.registerMode])
    ).toEqual([
      // Nothing is being submitted until Module 5: the arc is orientation,
      // brainstorming, planning, then a deliberately bad first draft.
      [0, 'drafting'],
      [1, 'drafting'],
      [2, 'drafting'],
      [3, 'drafting'],
      [4, 'drafting'],
      // Revision and Final Polish are where the reader's expectations land.
      [5, 'polished'],
      [6, 'polished'],
    ]);
  });

  test('the declared register reaches the system prompt', () => {
    for (const module of COLLEGE_ESSAY_MODULES) {
      const expected =
        module.registerMode === 'drafting'
          ? 'REGISTER MODE FOR THIS MODULE: DRAFTING'
          : 'REGISTER MODE FOR THIS MODULE: POLISHED';
      expect(module.tutorInstructions).toContain(expected);
    }
  });

  test('"Write It Badly, On Purpose" is a drafting module, whatever else changes', () => {
    const drafting = COLLEGE_ESSAY_MODULES.find((m) => m.position === 4)!;
    expect(drafting.title).toContain('Write It Badly');
    expect(drafting.registerMode).toBe('drafting');
    expect(drafting.tutorInstructions).toContain(
      'REGISTER MODE FOR THIS MODULE: DRAFTING'
    );
  });

  test('polished modules still never let the tutor fix the prose itself', () => {
    // POLISHED raises the reader's bar; it does not unlock ghostwriting.
    for (const module of COLLEGE_ESSAY_MODULES.filter(
      (m) => m.registerMode === 'polished'
    )) {
      expect(module.tutorInstructions).toContain(
        'the student writes the correction'
      );
    }
  });
});

describe('College essay module arc', () => {
  test('has the seven modules (0-6) of the gated linear arc', () => {
    const positions = COLLEGE_ESSAY_MODULES.map((m) => m.position);
    expect(positions).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  test('module positions are unique and ordered', () => {
    const positions = COLLEGE_ESSAY_MODULES.map((m) => m.position);
    const sorted = [...positions].sort((a, b) => a - b);
    expect(positions).toEqual(sorted);
    expect(new Set(positions).size).toBe(positions.length);
  });

  test('every module has a title, description, and tutor instructions', () => {
    for (const module of COLLEGE_ESSAY_MODULES) {
      expect(module.title.trim().length).toBeGreaterThan(0);
      expect(module.description.trim().length).toBeGreaterThan(0);
      expect(module.tutorInstructions.trim().length).toBeGreaterThan(0);
    }
  });

  test('exactly one hard gate exists, on the pre-writing module', () => {
    const gates = COLLEGE_ESSAY_MODULES.filter((m) => m.isGate);
    expect(gates).toHaveLength(1);
    expect(gates[0].position).toBe(1);
  });

  test('the gate module tutor instructions enforce the three-yes rule', () => {
    const gate = COLLEGE_ESSAY_MODULES.find((m) => m.isGate)!;
    const text = gate.tutorInstructions.toLowerCase();
    expect(text).toContain('pride');
    expect(text).toContain('anchor');
    expect(text).toContain('only-you');
    expect(text).toContain('do not advance');
  });
});

describe('College essay module instructions', () => {
  test('every module has at least one instruction', () => {
    for (const module of COLLEGE_ESSAY_MODULES) {
      expect(module.instructions.length).toBeGreaterThan(0);
    }
  });

  test('instruction positions are unique and ordered within each module', () => {
    for (const module of COLLEGE_ESSAY_MODULES) {
      const positions = module.instructions.map((i) => i.position);
      const sorted = [...positions].sort((a, b) => a - b);
      expect(positions).toEqual(sorted);
      expect(new Set(positions).size).toBe(positions.length);
    }
  });

  test('every instruction has a title and prompt', () => {
    for (const module of COLLEGE_ESSAY_MODULES) {
      for (const instruction of module.instructions) {
        expect(instruction.title.trim().length).toBeGreaterThan(0);
        expect(instruction.prompt.trim().length).toBeGreaterThan(0);
      }
    }
  });

  test('button actions are advance or response, with unique ordered positions', () => {
    for (const module of COLLEGE_ESSAY_MODULES) {
      for (const instruction of module.instructions) {
        const buttons = instruction.buttons ?? [];
        for (const button of buttons) {
          expect(['advance', 'response']).toContain(button.action);
          expect(button.label.trim().length).toBeGreaterThan(0);
        }
        const positions = buttons.map((b) => b.position);
        expect(new Set(positions).size).toBe(positions.length);
      }
    }
  });

  test('every chat button instruction opens the chat surface', () => {
    // If an instruction offers a "response" button, it should show the chat.
    for (const module of COLLEGE_ESSAY_MODULES) {
      for (const instruction of module.instructions) {
        const hasResponseButton = (instruction.buttons ?? []).some(
          (b) => b.action === 'response'
        );
        if (hasResponseButton) {
          expect(instruction.showChatButton).toBe(true);
        }
      }
    }
  });

  test('the gate module contains a gate-check instruction', () => {
    const gate = COLLEGE_ESSAY_MODULES.find((m) => m.isGate)!;
    const gateInstruction = gate.instructions.find((i) =>
      i.title.toLowerCase().includes('gate')
    );
    expect(gateInstruction).toBeDefined();
  });
});

describe('College essay seed script', () => {
  test('update path does not overwrite ownerOrgId', () => {
    const seedScript = readFileSync(
      new URL('./seed-college-essay-course.ts', import.meta.url),
      'utf8'
    );
    const updatePayload = seedScript.match(
      /update:\s*\{[\s\S]*?ASSIGNMENT_TYPE_DATA[\s\S]*?\},/
    )?.[0];
    expect(updatePayload).toBeDefined();
    expect(updatePayload).not.toContain('ownerOrgId');
  });
});

describe('Course image content type', () => {
  test('maps common image extensions to MIME types', () => {
    expect(imageContentTypeForPath('/x/college-essay-course.png')).toBe(
      'image/png'
    );
    expect(imageContentTypeForPath('a.jpg')).toBe('image/jpeg');
    expect(imageContentTypeForPath('a.JPEG')).toBe('image/jpeg');
    expect(imageContentTypeForPath('a.webp')).toBe('image/webp');
    expect(imageContentTypeForPath('a.gif')).toBe('image/gif');
  });

  test('returns null for unsupported or missing extensions', () => {
    expect(imageContentTypeForPath('a.svg')).toBeNull();
    expect(imageContentTypeForPath('noext')).toBeNull();
  });
});
