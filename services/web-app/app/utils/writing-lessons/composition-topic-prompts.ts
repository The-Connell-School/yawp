import { isSchoolAppropriate } from './practice-content-safety';

/**
 * Interest-driven composition practice: the student names what the practice
 * should be about (their team, their music, a rule they'd change) and the
 * prompts are built around it. Choice is half the pedagogy here — picking a
 * side of a topic you care about IS the arguable-claim skill.
 */

export type TopicPracticePrompt = {
  id: string;
  exercise: string;
  instruction: string;
};

/** Starter chips shown beside the free-text topic field. */
export const COMPOSITION_TOPIC_SUGGESTIONS: string[] = [
  'music',
  'sports',
  'gaming',
  'movies & TV',
  'a book you love',
  'food',
  'social media',
  'a school rule you’d change',
];

const MAX_TOPIC_LENGTH = 80;

/**
 * Normalizes a student-entered topic and screens it with the same
 * school-appropriate gate used for generated prompts. Returns null when there
 * is nothing safe/usable, so callers can ask for a different topic.
 */
export function sanitizeCompositionTopic(raw: string): string | null {
  const topic = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_TOPIC_LENGTH);
  if (!topic) return null;
  if (!isSchoolAppropriate(topic)) return null;
  return topic;
}

/**
 * Deterministic, human-authored prompt templates with the student's topic
 * woven in — the offline fallback when AI generation is unavailable, so
 * choosing a topic always works (the repo rule: practice never dead-ends).
 */
const TOPIC_PROMPT_TEMPLATES: Record<
  string,
  Array<{ exercise: (topic: string) => string; instruction: string }>
> = {
  'topic-sentences': [
    {
      exercise: (topic) =>
        `Think of one opinion you hold about ${topic} that a friend might push back on.`,
      instruction:
        'Write it as a topic sentence — an arguable claim a paragraph could prove.',
    },
    {
      exercise: (topic) =>
        `Here's an announcement-style opener: "This paragraph will discuss ${topic}."`,
      instruction:
        'Rewrite it as a real topic sentence that makes a claim about the topic.',
    },
    {
      exercise: (topic) =>
        `Picture three specific details or moments from ${topic} that belong together.`,
      instruction:
        'Write the one topic sentence those three details would all support.',
    },
    {
      exercise: (topic) =>
        `Here's a claim about ${topic} that's too vague to argue: "It matters a lot to many people."`,
      instruction:
        'Narrow it into a specific, arguable topic sentence at paragraph altitude.',
    },
  ],
  'thesis-statements': [
    {
      exercise: (topic) =>
        `Imagine you're writing a full essay about ${topic} — the essay only you could write.`,
      instruction:
        'Write its thesis: the one arguable claim the whole essay would defend.',
    },
    {
      exercise: (topic) =>
        `Take a side: what's something about ${topic} people get wrong, argue about, or underrate?`,
      instruction:
        'State your position as a single thesis sentence a skeptic could disagree with.',
    },
    {
      exercise: (topic) =>
        `Here's a fact-shaped non-thesis: "There are many interesting things about ${topic}."`,
      instruction:
        'Replace it with a real thesis — specific, arguable, and worth an essay.',
    },
  ],
  evidence: [
    {
      exercise: (topic) => `Make a claim about ${topic} you genuinely believe.`,
      instruction:
        'Then back it with the strongest specific piece of evidence you know — a moment, example, or detail, not a generality.',
    },
    {
      exercise: (topic) =>
        `A classmate writes about ${topic}: "Everyone knows it's great, and lots of people agree."`,
      instruction:
        'Replace that empty support with one piece of specific, relevant evidence.',
    },
    {
      exercise: (topic) =>
        `Think of a claim about ${topic} you could defend to a doubter.`,
      instruction:
        'Write the claim, then two different pieces of evidence — and say which is stronger.',
    },
  ],
  analysis: [
    {
      exercise: (topic) =>
        `Write one claim about ${topic} and one piece of evidence for it.`,
      instruction:
        'Now add the analysis: one or two sentences explaining how the evidence proves the claim.',
    },
    {
      exercise: (topic) =>
        `Here's evidence with no analysis: a vivid, specific fact you know about ${topic}, just sitting there.`,
      instruction:
        'Write the fact, then the analysis that tells a reader what it means and why it matters.',
    },
    {
      exercise: (topic) =>
        `A friend argues something about ${topic} by just repeating their evidence louder.`,
      instruction:
        'Show them how it is done: claim, evidence, then analysis that connects the two without repeating either.',
    },
  ],
  'hooks-and-openings': [
    {
      exercise: (topic) => `You're opening an essay about ${topic}.`,
      instruction:
        'Write a hook that drops the reader into one specific moment — make a stranger want sentence two.',
    },
    {
      exercise: (topic) =>
        `Here's a dawn-of-time opener: "Throughout history, ${topic} has always been important."`,
      instruction:
        'Rewrite it using any strong hook move: a moment, a surprising fact, a bold claim, or a real question.',
    },
    {
      exercise: (topic) =>
        `Think of the most surprising thing you know (or believe) about ${topic}.`,
      instruction:
        'Turn it into a bold-claim hook — the most arguable, defensible version of your take.',
    },
  ],
  conclusions: [
    {
      exercise: (topic) =>
        `You've just finished an essay arguing your strongest opinion about ${topic}.`,
      instruction:
        'Write the final two sentences — answer "so what?" instead of restating the thesis.',
    },
    {
      exercise: (topic) =>
        `Here's a photocopy ending: "In conclusion, that is why ${topic} is important, as I have shown."`,
      instruction:
        'Rewrite it as a reframe: the same claim in new words, with earned confidence.',
    },
    {
      exercise: (topic) =>
        `Your essay about ${topic} needs to end by zooming out.`,
      instruction:
        'Write a closing line showing what your specific argument reveals about the bigger picture.',
    },
  ],
};

export function buildTopicFallbackPrompts(
  lessonSlug: string,
  topic: string
): TopicPracticePrompt[] {
  const templates = TOPIC_PROMPT_TEMPLATES[lessonSlug];
  if (!templates) return [];

  return templates.map((template, index) => ({
    id: `${lessonSlug}-topic-${index + 1}`,
    exercise: template.exercise(topic),
    instruction: template.instruction,
  }));
}
