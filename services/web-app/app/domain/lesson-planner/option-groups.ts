/**
 * Which pieces of a reply are options to choose between (Kevin's notes on the
 * latest run): two or more class starters, exit tickets, framing cards… in a
 * row, with nothing but blank lines between them, read as one set and sit
 * side by side. Prose between two cards keeps them apart, since it is saying
 * something about the one after it.
 */
import { MATERIAL_KIND_LABELS } from './lesson-material';
import type { ReplyPart } from './reply-parts';

export type PartGroup =
  | { kind: 'single'; index: number }
  | { kind: 'options'; indexes: number[]; label: string };

/** What makes two cards the same sort of option, and what to call the set. */
function optionKind(part: ReplyPart): { key: string; label: string } | null {
  switch (part.kind) {
    case 'daily-pages':
      return part.exercise.kind === 'class-starter'
        ? { key: 'class-starter', label: 'Class starter options' }
        : { key: `daily-pages:${part.exercise.kind}`, label: 'Daily Pages options' };
    case 'exit-ticket':
      return { key: 'exit-ticket', label: 'Exit ticket options' };
    case 'practice':
      return { key: 'practice', label: 'Practice options' };
    case 'material':
      return {
        key: `material:${part.material.kind}`,
        label: `${MATERIAL_KIND_LABELS[part.material.kind]} options`,
      };
    default:
      return null;
  }
}

const isBlank = (part: ReplyPart) => part.kind === 'markdown' && part.text.trim() === '';

export function groupOptionParts(parts: ReplyPart[]): PartGroup[] {
  const groups: PartGroup[] = [];
  let index = 0;
  while (index < parts.length) {
    const kind = optionKind(parts[index]!);
    if (!kind) {
      groups.push({ kind: 'single', index });
      index += 1;
      continue;
    }
    const indexes = [index];
    let next = index + 1;
    while (next < parts.length) {
      if (isBlank(parts[next]!)) {
        next += 1;
        continue;
      }
      if (optionKind(parts[next]!)?.key !== kind.key) break;
      indexes.push(next);
      next += 1;
    }
    if (indexes.length > 1) {
      groups.push({ kind: 'options', indexes, label: kind.label });
      index = indexes[indexes.length - 1]! + 1;
    } else {
      groups.push({ kind: 'single', index });
      index += 1;
    }
  }
  return groups;
}
