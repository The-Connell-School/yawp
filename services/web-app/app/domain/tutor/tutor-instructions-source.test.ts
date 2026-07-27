import { describe, expect, test } from 'bun:test';
import {
  readTutorInstructionVariant,
  resolveTutorInstructions,
} from './tutor-instructions-source';

describe('readTutorInstructionVariant', () => {
  test('reads the requested variant from a stored variants column', () => {
    const stored = { dbq: 'Coach documents.', leq: 'Coach named evidence.' };

    expect(readTutorInstructionVariant(stored, 'dbq')).toBe('Coach documents.');
    expect(readTutorInstructionVariant(stored, 'leq')).toBe(
      'Coach named evidence.'
    );
  });

  test('returns null for a variant key the row does not carry', () => {
    expect(readTutorInstructionVariant({ dbq: 'Coach documents.' }, 'leq')).toBe(
      null
    );
  });

  test('treats blank and whitespace-only entries as absent', () => {
    // An admin who clears the box gets the authored default back rather than a
    // tutor with no guidance at all.
    expect(readTutorInstructionVariant({ dbq: '' }, 'dbq')).toBe(null);
    expect(readTutorInstructionVariant({ dbq: '   \n ' }, 'dbq')).toBe(null);
  });

  test('returns null for malformed or missing JSON instead of throwing', () => {
    for (const malformed of [
      null,
      undefined,
      'not an object',
      42,
      { dbq: 12 },
      { dbq: { nested: 'value' } },
      [],
    ]) {
      expect(readTutorInstructionVariant(malformed, 'dbq')).toBe(null);
    }
  });

  test('trims stored values', () => {
    expect(readTutorInstructionVariant({ dbq: '  Coach documents.  ' }, 'dbq')).toBe(
      'Coach documents.'
    );
  });
});

describe('resolveTutorInstructions', () => {
  test('takes the first layer with content', () => {
    expect(resolveTutorInstructions('stored', 'code default')).toBe('stored');
  });

  test('falls through blank, null, and undefined layers', () => {
    expect(resolveTutorInstructions(null, '', '   ', undefined, 'code')).toBe(
      'code'
    );
  });

  test('returns null when nothing has content', () => {
    expect(resolveTutorInstructions(null, undefined, '  ')).toBe(null);
  });
});
