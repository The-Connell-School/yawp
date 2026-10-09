/**
 * The real .pptx and .docx files the office readers are tested against.
 *
 * They are checked in rather than generated at test time: a fixture built by
 * the same code under test proves nothing, and these came out of python's
 * zipfile. Test-only — nothing in the app imports this.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type OfficeFixture =
  | 'deck.pptx'
  /** The same deck with every text run stripped — a deck of pictures. */
  | 'deck-images-only.pptx'
  | 'handout.docx';

export function readFixture(name: OfficeFixture): Buffer {
  return readFileSync(join(import.meta.dir, 'fixtures', name));
}
