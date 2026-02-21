import type { Exercise, ParsedLesson } from './topics';

/**
 * Parses markdown lesson content into structured sections
 * Expected format from AI generation:
 * ## Why This Matters
 * ## The Rule
 * ## See It In Action
 * ## Quick Tip
 * ## Practice Exercises
 */
export function parseLesson(markdownContent: string): ParsedLesson {
  const sections = splitIntoSections(markdownContent);

  return {
    hook: extractSection(sections, 'Why This Matters') || '',
    rule: extractSection(sections, 'The Rule') || '',
    examples: parseExamples(extractSection(sections, 'See It In Action') || ''),
    tip: extractSection(sections, 'Quick Tip') || '',
    exercises: parseExercises(
      extractSection(sections, 'Practice Exercises') || ''
    ),
  };
}

function splitIntoSections(content: string): Map<string, string> {
  const sections = new Map<string, string>();
  const lines = content.split('\n');

  let currentSection: string | null = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    // Check if line is a section header (## Section Name)
    const headerMatch = line.match(/^##\s+(.+)$/);

    if (headerMatch) {
      // Save previous section if exists
      if (currentSection) {
        sections.set(currentSection, currentContent.join('\n').trim());
      }

      // Start new section
      currentSection = headerMatch[1].trim();
      currentContent = [];
    } else if (currentSection) {
      currentContent.push(line);
    }
  }

  // Save last section
  if (currentSection) {
    sections.set(currentSection, currentContent.join('\n').trim());
  }

  return sections;
}

function extractSection(sections: Map<string, string>, name: string): string {
  return sections.get(name) || '';
}

function parseExamples(content: string): ParsedLesson['examples'] {
  const examples: ParsedLesson['examples'] = [];
  const exampleBlocks = content.split(/\*\*Before:\*\*/i).slice(1); // Split and skip first empty element

  for (const block of exampleBlocks) {
    const parts = block.split(/\*\*After:\*\*/i);
    if (parts.length < 2) continue;

    const before = parts[0].trim();
    const afterAndExplanation = parts[1].split(/\*Why it works:\*\*/i);

    const after = afterAndExplanation[0].trim();
    const explanation = afterAndExplanation[1]?.trim() || '';

    examples.push({ before, after, explanation });
  }

  return examples;
}

function parseExercises(content: string): Exercise[] {
  const exercises: Exercise[] = [];

  // Match pattern: **Exercise [number]:**\n*Revise this sentence:* [text]
  const exerciseMatches = content.matchAll(
    /\*\*Exercise\s+\d+:\*\*\s*\n\s*\*([^:]+):\*\s*([^\n]+)/gi
  );

  for (const match of exerciseMatches) {
    const instruction = match[1].trim(); // e.g., "Revise this sentence"
    const prompt = match[2].trim(); // The actual sentence

    exercises.push({
      prompt,
      instruction,
    });
  }

  return exercises;
}

/**
 * Validates that a lesson has all required components
 */
export function validateLesson(lesson: ParsedLesson): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!lesson.hook || lesson.hook.length < 10) {
    errors.push('Missing or too short "Why This Matters" section');
  }

  if (!lesson.rule || lesson.rule.length < 10) {
    errors.push('Missing or too short "The Rule" section');
  }

  if (lesson.examples.length < 2) {
    errors.push('Need at least 2 examples in "See It In Action"');
  }

  if (!lesson.tip || lesson.tip.length < 5) {
    errors.push('Missing or too short "Quick Tip" section');
  }

  if (lesson.exercises.length < 3) {
    errors.push('Need at least 3 practice exercises');
  }

  for (let i = 0; i < lesson.exercises.length; i++) {
    const ex = lesson.exercises[i];
    if (!ex.prompt || !ex.instruction) {
      errors.push(`Exercise ${i + 1} is missing prompt or instruction`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
