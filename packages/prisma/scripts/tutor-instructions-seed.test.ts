import { describe, expect, test } from 'bun:test';
import {
  isReseedTutorInstructionsRequested,
  tutorInstructionSeedUpdate,
  withoutTutorInstructionFields,
} from './tutor-instructions-seed';

const authored = {
  tutorInstructions: 'AUTHORED DEFAULT',
  tutorInstructionsVariantsJson: { dbq: 'AUTHORED DBQ', leq: 'AUTHORED LEQ' },
};

describe('tutorInstructionSeedUpdate', () => {
  test('populates a row that has never been seeded', () => {
    expect(
      tutorInstructionSeedUpdate(
        authored,
        { tutorInstructions: null, tutorInstructionsVariantsJson: null },
        false
      )
    ).toEqual(authored);
  });

  test('leaves an admin-edited row completely alone', () => {
    // This is the whole point: a re-seed on deploy must not revert somebody's
    // work in admin.
    expect(
      tutorInstructionSeedUpdate(
        authored,
        {
          tutorInstructions: 'EDITED BY AN ADMIN',
          tutorInstructionsVariantsJson: { dbq: 'EDITED DBQ' },
        },
        false
      )
    ).toEqual({});
  });

  test('fills only the fields that are actually empty', () => {
    // A row seeded before variants existed keeps its edited single string and
    // still picks up the new variants column.
    expect(
      tutorInstructionSeedUpdate(
        authored,
        {
          tutorInstructions: 'EDITED BY AN ADMIN',
          tutorInstructionsVariantsJson: null,
        },
        false
      )
    ).toEqual({
      tutorInstructionsVariantsJson: authored.tutorInstructionsVariantsJson,
    });
  });

  test('treats blank strings and empty objects as unseeded', () => {
    expect(
      tutorInstructionSeedUpdate(
        authored,
        { tutorInstructions: '   ', tutorInstructionsVariantsJson: {} },
        false
      )
    ).toEqual(authored);
  });

  test('overwrites everything when a re-seed is explicitly requested', () => {
    expect(
      tutorInstructionSeedUpdate(
        authored,
        {
          tutorInstructions: 'EDITED BY AN ADMIN',
          tutorInstructionsVariantsJson: { dbq: 'EDITED DBQ' },
        },
        true
      )
    ).toEqual(authored);
  });

  test('never invents a field the caller did not author', () => {
    expect(
      tutorInstructionSeedUpdate(
        { tutorInstructions: 'AUTHORED DEFAULT' },
        { tutorInstructions: null, tutorInstructionsVariantsJson: null },
        false
      )
    ).toEqual({ tutorInstructions: 'AUTHORED DEFAULT' });
  });
});

describe('isReseedTutorInstructionsRequested', () => {
  test('is off unless explicitly set to true', () => {
    expect(isReseedTutorInstructionsRequested({})).toBe(false);
    expect(
      isReseedTutorInstructionsRequested({ RESEED_TUTOR_INSTRUCTIONS: '1' })
    ).toBe(false);
    expect(
      isReseedTutorInstructionsRequested({ RESEED_TUTOR_INSTRUCTIONS: 'false' })
    ).toBe(false);
    expect(
      isReseedTutorInstructionsRequested({ RESEED_TUTOR_INSTRUCTIONS: 'true' })
    ).toBe(true);
  });
});

describe('withoutTutorInstructionFields', () => {
  test('keeps the always-overwritable fields and drops the protected ones', () => {
    expect(
      withoutTutorInstructionFields({
        title: 'Pre-Writing',
        position: 2,
        description: 'Plan before drafting.',
        ...authored,
      })
    ).toEqual({
      title: 'Pre-Writing',
      position: 2,
      description: 'Plan before drafting.',
    });
  });
});
