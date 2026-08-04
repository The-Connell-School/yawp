import { randomInt } from 'node:crypto';

export const PREVIEW_ACCESS_CODE_PATTERN = /^[a-z]+-[a-z]+-[1-9][0-9]{3}$/;

// Familiar, easy-to-spell, neutral/positive words only. Keeping adjectives and animals
// separate prevents ambiguous or unfortunate generated phrases.
export const ACCESS_CODE_ADJECTIVES = Object.freeze([
  'brave',
  'bright',
  'calm',
  'clever',
  'eager',
  'gentle',
  'happy',
  'kind',
  'lively',
  'merry',
  'nimble',
  'proud',
  'quick',
  'ready',
  'steady',
  'sunny',
  'swift',
  'vivid',
  'warm',
  'wise',
]);

export const ACCESS_CODE_ANIMALS = Object.freeze([
  'badger',
  'beaver',
  'bison',
  'dolphin',
  'falcon',
  'finch',
  'fox',
  'gecko',
  'heron',
  'koala',
  'otter',
  'owl',
  'panda',
  'penguin',
  'rabbit',
  'robin',
  'sparrow',
  'tiger',
  'turtle',
  'wren',
]);

export function generatePreviewAccessCode() {
  const adjective =
    ACCESS_CODE_ADJECTIVES[randomInt(ACCESS_CODE_ADJECTIVES.length)];
  const animal = ACCESS_CODE_ANIMALS[randomInt(ACCESS_CODE_ANIMALS.length)];
  return `${adjective}-${animal}-${randomInt(1000, 10000)}`;
}

export function generateUniquePreviewAccessCode(
  unavailableCodes: Iterable<string>,
  generateCode: () => string = generatePreviewAccessCode
) {
  const unavailable = new Set(
    Array.from(unavailableCodes, (code) => code.trim().toLowerCase())
  );

  for (let attempt = 0; attempt < 10_000; attempt += 1) {
    const code = generateCode().trim().toLowerCase();
    if (!PREVIEW_ACCESS_CODE_PATTERN.test(code)) {
      throw new Error('Generated preview access code has an invalid format.');
    }
    if (!unavailable.has(code)) return code;
  }

  throw new Error('Could not generate a unique preview access code.');
}

export type GeneratedPreviewAccessSeat = {
  code: string;
  organizationId: string;
  label: string;
};

function previewSeatIdentity(number: number) {
  return {
    organizationId: number === 1 ? 'local-dev-org' : `preview-seat-${number}`,
    label: number === 1 ? 'Master' : `Seat ${number}`,
  };
}

export function generatePreviewAccessSeats({
  count = 1,
  existingCodes = [],
  existingSeats = [],
}: {
  count?: number;
  existingCodes?: string[];
  existingSeats?: GeneratedPreviewAccessSeat[];
} = {}): GeneratedPreviewAccessSeat[] {
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new Error('Preview seat count must be a positive integer');
  }

  const byOrganization = new Map(
    existingSeats.map((seat) => [seat.organizationId, seat])
  );
  const retainedCount = existingSeats.reduce((maximum, seat) => {
    const match = /^preview-seat-([1-9][0-9]*)$/.exec(seat.organizationId);
    if (seat.organizationId === 'local-dev-org') return Math.max(maximum, 1);
    return match ? Math.max(maximum, Number(match[1])) : maximum;
  }, existingSeats.length);
  const effectiveCount = Math.max(count, retainedCount);
  const usedCodes = new Set(
    [...existingCodes, ...existingSeats.map((seat) => seat.code)].filter(
      Boolean
    )
  );

  return Array.from({ length: effectiveCount }, (_, index) => {
    const identity = previewSeatIdentity(index + 1);
    const existing = byOrganization.get(identity.organizationId);
    const legacyCode = existingCodes[index];
    const code =
      existing?.code ||
      legacyCode ||
      generateUniquePreviewAccessCode(usedCodes);
    usedCodes.add(code);
    return { code, ...identity };
  });
}
