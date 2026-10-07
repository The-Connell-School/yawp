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

export const PREVIEW_FREE_CLASSROOM_ACCESS_LABEL = 'Free classroom';

/** Preview-only org for Free Tier A QA (see seed-preview-free-classroom.ts). */
export const PREVIEW_FREE_CLASSROOM_ORG_ID = 'preview-free-classroom';

export function withFreeClassroomPreviewAccessSeat(
  seats: GeneratedPreviewAccessSeat[],
  generateCode: () => string = generatePreviewAccessCode
): GeneratedPreviewAccessSeat[] {
  if (
    seats.some((seat) => seat.organizationId === PREVIEW_FREE_CLASSROOM_ORG_ID)
  ) {
    return seats;
  }
  const usedCodes = seats.map((seat) => seat.code);
  const code = generateUniquePreviewAccessCode(usedCodes, generateCode);
  return [
    ...seats,
    {
      code,
      organizationId: PREVIEW_FREE_CLASSROOM_ORG_ID,
      label: PREVIEW_FREE_CLASSROOM_ACCESS_LABEL,
    },
  ];
}

function previewSeatIdentity(
  number: number,
  masterOrganizationId: string,
  masterLabel: string
) {
  return {
    organizationId:
      number === 1 ? masterOrganizationId : `preview-seat-${number}`,
    label: number === 1 ? masterLabel : `Seat ${number}`,
  };
}

export function generatePreviewAccessSeats({
  count = 1,
  existingCodes = [],
  existingSeats = [],
  reservedCodes = [],
  generateCode = generatePreviewAccessCode,
  masterOrganizationId = 'local-dev-org',
  masterLabel = 'Master',
}: {
  count?: number;
  existingCodes?: string[];
  existingSeats?: GeneratedPreviewAccessSeat[];
  reservedCodes?: string[];
  generateCode?: () => string;
  masterOrganizationId?: string;
  masterLabel?: string;
} = {}): GeneratedPreviewAccessSeat[] {
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new Error('Preview seat count must be a positive integer');
  }

  const byOrganization = new Map(
    existingSeats.map((seat) => [seat.organizationId, seat])
  );
  const retainedCount = existingSeats.reduce((maximum, seat) => {
    const match = /^preview-seat-([1-9][0-9]*)$/.exec(seat.organizationId);
    if (seat.organizationId === masterOrganizationId) {
      return Math.max(maximum, 1);
    }
    return match ? Math.max(maximum, Number(match[1])) : maximum;
  }, existingSeats.length);
  const effectiveCount = Math.max(count, retainedCount);
  const reserved = new Set(
    reservedCodes.map((code) => code.trim().toLowerCase()).filter(Boolean)
  );
  const usedCodes = new Set([
    ...reserved,
    ...existingCodes.filter((code) => !reserved.has(code)),
    ...existingSeats
      .map((seat) => seat.code)
      .filter((code) => !reserved.has(code)),
  ]);

  return Array.from({ length: effectiveCount }, (_, index) => {
    const identity = previewSeatIdentity(
      index + 1,
      masterOrganizationId,
      masterLabel
    );
    const existing = byOrganization.get(identity.organizationId);
    const legacyCode = existingCodes[index];
    const preservedCode = existing?.code || legacyCode;
    if (preservedCode && reserved.has(preservedCode)) {
      throw new Error(
        `Generic master access code collides with the existing organization code for ${identity.organizationId}.`
      );
    }
    const code =
      preservedCode ?? generateUniquePreviewAccessCode(usedCodes, generateCode);
    usedCodes.add(code);
    return { code, ...identity };
  });
}
