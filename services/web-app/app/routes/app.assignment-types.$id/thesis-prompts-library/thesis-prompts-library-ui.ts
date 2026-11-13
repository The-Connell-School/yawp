import {
  CATEGORY_LABEL,
  COGNITIVE_MOVE_LABEL,
  COLLECTION_LABEL,
  type GradeBand,
  type ThesisLibraryEntry,
} from './data';

export const THESIS_LIBRARY_INITIAL_VISIBLE = 6;

export function formatThesisGradeBands(gradeBands: GradeBand[]): string | null {
  if (gradeBands.length === 0) return null;
  const ordered = [...gradeBands].sort(
    (a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10)
  );
  if (ordered.length === 1) return `Grades ${ordered[0]}`;
  const nums = ordered.map((g) => Number.parseInt(g, 10));
  const consecutive =
    nums[nums.length - 1]! - nums[0]! === nums.length - 1 &&
    nums.every((n, i) => i === 0 || n === nums[i - 1]! + 1);
  if (consecutive) {
    return `Grades ${ordered[0]}–${ordered[ordered.length - 1]}`;
  }
  return `Grades ${ordered.join(', ')}`;
}

export function formatThesisPromptMetaLine(entry: ThesisLibraryEntry): string {
  const parts: string[] = [];
  const grades = formatThesisGradeBands(entry.gradeBands);
  if (grades) parts.push(grades);

  if (entry.collection === 'mine') {
    parts.push(COLLECTION_LABEL.mine);
  } else if (entry.category) {
    parts.push(CATEGORY_LABEL[entry.category]);
  }

  const move = entry.cognitiveMoves[0];
  if (move) {
    parts.push(`Skill: ${COGNITIVE_MOVE_LABEL[move]}`);
  }

  return parts.join(' · ');
}

export function thesisPromptPrimaryLine(entry: ThesisLibraryEntry): string {
  const body = entry.prompt.trim();
  const title = entry.title.trim();
  if (!body || body === title) return title || body;
  const paragraphs = body.split(/\n\s*\n/).filter(Boolean);
  if (paragraphs.length > 1) return title || paragraphs[0]!;
  return title.length > 0 && title.length < body.length ? title : body;
}
