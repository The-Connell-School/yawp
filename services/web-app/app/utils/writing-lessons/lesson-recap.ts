/**
 * The abridged lesson a student gets beside a problem they are working.
 *
 * Navigating back to the full lesson mid-set costs them the problem they were
 * on, so the recap carries only what answers "what was the rule again?": the
 * top of the rule, a couple of worked examples, and the quick tip. The framing
 * ("Why This Matters") and the lesson's own exercises are dropped — a student
 * practising the skill has already been sold on it, and is already working a
 * set of problems.
 *
 * Pure: it takes lesson markdown and returns lesson markdown, so it renders
 * through the same lesson renderer the full page uses.
 */

/** Paragraphs of "The Rule" the panel keeps. */
const MAX_RULE_BLOCKS = 3;
/** Worked examples the panel keeps. */
const MAX_EXAMPLES = 2;
/** Opening paragraphs kept when a lesson has no "The Rule" section at all. */
const MAX_FALLBACK_BLOCKS = 2;

type Section = { heading: string; body: string };

function splitSections(content: string): Section[] {
  const sections: Section[] = [];
  const pattern = /^##\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  let previous: { heading: string; start: number } | null = null;

  while ((match = pattern.exec(content)) !== null) {
    if (previous) {
      sections.push({
        heading: previous.heading,
        body: content.slice(previous.start, match.index).trim(),
      });
    }
    previous = {
      heading: match[1].trim(),
      start: match.index + match[0].length,
    };
  }
  if (previous) {
    sections.push({
      heading: previous.heading,
      body: content.slice(previous.start).trim(),
    });
  }
  return sections;
}

function blocksOf(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0 && block !== '---');
}

function findSection(
  sections: Section[],
  pattern: RegExp
): Section | undefined {
  return sections.find((section) => pattern.test(section.heading));
}

export function buildLessonRecap(content: string): string {
  const sections = splitSections(content);
  const parts: string[] = [];

  const rule = findSection(sections, /^the rule$/i);
  if (rule) {
    const kept = blocksOf(rule.body).slice(0, MAX_RULE_BLOCKS);
    if (kept.length > 0) {
      parts.push(`## The Rule\n\n${kept.join('\n\n')}`);
    }
  }

  const examples = findSection(sections, /see it in action/i);
  if (examples) {
    // One example is one block: its bolded label plus the rows under it.
    const kept = blocksOf(examples.body)
      .filter((block) => /^\*\*Example/i.test(block))
      .slice(0, MAX_EXAMPLES);
    if (kept.length > 0) {
      parts.push(`## See It In Action\n\n${kept.join('\n\n')}`);
    }
  }

  const quickTip = findSection(sections, /quick tip/i);
  if (quickTip) {
    const kept = blocksOf(quickTip.body);
    if (kept.length > 0) {
      parts.push(`## Quick Tip\n\n${kept.join('\n\n')}`);
    }
  }

  if (parts.length > 0) return parts.join('\n\n');

  // No sections this reads: fall back to the lesson's own opening, so an
  // unusually structured lesson still refreshes the student on something.
  const opening = blocksOf(content)
    .filter((block) => !block.startsWith('#'))
    .slice(0, MAX_FALLBACK_BLOCKS);
  return opening.join('\n\n');
}
