import { randomInt } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Familiar, easy-to-spell, neutral/positive words only. Keeping adjectives and animals
// in separate lists prevents ambiguous or unfortunate generated phrases.
export const ACCESS_CODE_ADJECTIVES = Object.freeze([
  'brave', 'bright', 'calm', 'clever', 'eager', 'gentle', 'happy', 'kind',
  'lively', 'merry', 'nimble', 'proud', 'quick', 'ready', 'steady', 'sunny',
  'swift', 'vivid', 'warm', 'wise',
]);

export const ACCESS_CODE_ANIMALS = Object.freeze([
  'badger', 'beaver', 'bison', 'dolphin', 'falcon', 'finch', 'fox', 'gecko',
  'heron', 'koala', 'otter', 'owl', 'panda', 'penguin', 'rabbit', 'robin',
  'sparrow', 'tiger', 'turtle', 'wren',
]);

export function generatePreviewAccessCode() {
  const adjective =
    ACCESS_CODE_ADJECTIVES[randomInt(ACCESS_CODE_ADJECTIVES.length)];
  const animal = ACCESS_CODE_ANIMALS[randomInt(ACCESS_CODE_ANIMALS.length)];
  return `${adjective}-${animal}-${randomInt(1000, 10000)}`;
}

function previewSeatIdentity(number) {
  return {
    organizationId: number === 1 ? 'local-dev-org' : `preview-seat-${number}`,
    label:
      number === 1
        ? 'Brian Connell'
        : number === 2
          ? 'Bryant Brock'
          : `Seat ${number}`,
  };
}

export function generatePreviewAccessSeats({
  count = 6,
  existingCodes = [],
  existingSeats = [],
} = {}) {
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new Error('Preview seat count must be a positive integer');
  }

  const byOrganization = new Map(
    existingSeats.map((seat) => [seat.organizationId, seat]),
  );
  const usedCodes = new Set(
    [...existingCodes, ...existingSeats.map((seat) => seat.code)].filter(Boolean),
  );
  const retainedCount = existingSeats.reduce((maximum, seat) => {
    const match = /^preview-seat-([1-9][0-9]*)$/.exec(seat.organizationId);
    if (seat.organizationId === 'local-dev-org') return Math.max(maximum, 1);
    return match ? Math.max(maximum, Number(match[1])) : maximum;
  }, existingSeats.length);
  const effectiveCount = Math.max(count, retainedCount);

  return Array.from({ length: effectiveCount }, (_, index) => {
    const number = index + 1;
    const identity = previewSeatIdentity(number);
    const existing = byOrganization.get(identity.organizationId);
    const legacyCode = existingCodes[index];
    let code = existing?.code || legacyCode;
    if (!code) {
      do {
        code = generatePreviewAccessCode();
      } while (usedCodes.has(code));
    }
    usedCodes.add(code);
    return { code, ...identity };
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--seats')) {
    const existingCodes = String(process.env.PREVIEW_ACCESS_CODES ?? '')
      .split(/[;,\n]/)
      .map((code) => code.trim().toLowerCase())
      .filter(Boolean);
    const existingSeats = process.env.PREVIEW_EXISTING_ACCESS_SEATS
      ? JSON.parse(process.env.PREVIEW_EXISTING_ACCESS_SEATS)
      : [];
    const count = Number(process.env.PREVIEW_SEAT_COUNT ?? 6);
    process.stdout.write(
      `${JSON.stringify(
        generatePreviewAccessSeats({ count, existingCodes, existingSeats }),
      )}\n`,
    );
  } else {
    process.stdout.write(`${generatePreviewAccessCode()}\n`);
  }
}
