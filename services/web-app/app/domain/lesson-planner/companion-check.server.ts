/**
 * A companion poem's lines are checked against the poem (Nov 26), never
 * against the work the lesson is on: a line of "Ozymandias" in a Macbeth
 * lesson is not a line Macbeth is missing. Each held companion the lesson
 * quotes is checked first, corrected word for word to its first printing,
 * and its excerpt slides are set from it; what it verified is then left out
 * of the main work's "not found".
 */
import { companionsUsed, type CompanionText } from './companion-texts';
import { withExcerptsFromSource } from './excerpt-source';
import { checkQuotations, prepareSource } from './quotation-check.server';
import type { RegisteredWork } from './source-texts-data';

export function companionAsWork(companion: CompanionText): RegisteredWork {
  const firstLine = (companion.text ?? '').split('\n').find((line) => line.trim()) ?? companion.title;
  return {
    id: `companion:${companion.id}`,
    title: companion.title,
    author: companion.author,
    gutenbergId: 0,
    structure: 'poems',
    names: [companion.title],
    check: firstLine.trim(),
    edition: `“${companion.title.replace(/[“”]/g, '')}” as first printed (${companion.year})`,
  };
}

export type CompanionCheck = {
  reply: string;
  /** The companions the lesson quotes. */
  used: CompanionText[];
  /** Quotations found in a companion (as written or as corrected). */
  verified: string[];
  corrected: number;
  excerpts: number;
};

export function withCompanionsChecked(reply: string): CompanionCheck {
  const used = companionsUsed(reply);
  let text = reply;
  const verified: string[] = [];
  let corrected = 0;
  let excerpts = 0;
  for (const companion of used) {
    try {
      const source = prepareSource(companion.text!, 'poems');
      const checked = checkQuotations(text, source, { work: companionAsWork(companion) });
      text = checked.reply;
      verified.push(...checked.verified);
      corrected += checked.corrections.length;
      const set = withExcerptsFromSource(text, source);
      text = set.reply;
      excerpts += set.rewritten;
    } catch {
      // A companion that cannot be checked is left as written.
    }
  }
  return { reply: text, used, verified, corrected, excerpts };
}
