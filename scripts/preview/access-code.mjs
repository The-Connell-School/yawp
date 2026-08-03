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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${generatePreviewAccessCode()}\n`);
}
