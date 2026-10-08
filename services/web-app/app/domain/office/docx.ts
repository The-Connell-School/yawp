/**
 * The text of a Word document.
 *
 * Simpler than a deck: one part, `word/document.xml`, holding paragraphs of
 * runs. Blank paragraphs are kept rather than collapsed — on a handout, the
 * empty lines under a question are where a student writes, and how many there
 * are is information the planner should have.
 */
import { blocksOf } from './xml-text';
import { readZipEntries } from './zip';

export function readDocxParagraphs(file: Uint8Array): string[] {
  const entry = readZipEntries(file).get('word/document.xml');
  if (!entry) return [];
  const body =
    /<w:body\b[^>]*>([\s\S]*)<\/w:body>/.exec(
      entry.read().toString('utf8')
    )?.[1] ?? '';
  return blocksOf(body, {
    blockTag: 'w:p',
    runTag: 'w:t',
    breaks: { 'w:br': '\n', 'w:tab': '\t', 'w:cr': '\n' },
  });
}

/** The document as text, with runs of blank lines squeezed down to one. */
export function readDocxText(file: Uint8Array): string {
  return readDocxParagraphs(file)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
