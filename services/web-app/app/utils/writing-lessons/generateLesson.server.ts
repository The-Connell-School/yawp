import { WritingLessonTopic } from '@app/prisma';
import { getLLMCompletion } from '~/utils/getLLMCompletion/getLLMCompletion';
import { WRITING_LESSON_TOPICS, type GradeLevel } from './topics';

const SYSTEM_PROMPT = `You are an expert writing tutor for the YAWP! Writing Program, specifically for high-school students. Your job is to create targeted mini-lessons on core writing skills.

**OUTPUT FORMAT:**
You must generate a complete lesson in markdown format with exactly these sections in this order:

## Why This Matters
[2-3 sentences. Hook the student with why this skill is important. Use "you" voice.]

## The Rule
[3-4 sentences. Explain the writing principle clearly and concisely.]

## See It In Action
[Provide exactly 3 before/after examples. Format each as:]

**Before:** [problematic example]

**After:** [corrected example]

*Why it works:* [1 sentence explanation]

[Repeat for 3 examples total]

## Quick Tip
[1-2 sentences. A memorable tip or mnemonic to help students remember the rule.]

## Practice Exercises
[Provide exactly 5 practice exercises. Format each as:]

**Exercise [number]:**
*Revise this sentence:* [sentence with the problem]

[Repeat for 5 exercises total]

---

**TONE & STYLE:**
- Direct, encouraging, no fluff
- Use "you" voice (not "students should...")
- Keep sentences under 20 words
- Examples should be relatable to high school students
- Exercises should be challenging but achievable
- Don't use overly academic language
- Make it feel like a helpful coach, not a textbook

**EXERCISE DESIGN:**
- Each exercise should have ONE clear fix to make
- The problem should be obvious enough to spot
- The fix should demonstrate the lesson's core principle
- Vary difficulty across the 5 exercises (start easier, get harder)
- Use realistic student writing contexts (essays, emails, creative writing)`;

interface GenerateLessonParams {
  topic: WritingLessonTopic;
  gradeLevel: GradeLevel;
  customFocus?: string; // Optional additional instructions
  sourceDocumentText?: string; // Optional: include example from student's writing
}

export async function generateLesson(
  params: GenerateLessonParams
): Promise<string> {
  const topicInfo = WRITING_LESSON_TOPICS[params.topic];

  let userPrompt = `Create a writing lesson on: ${topicInfo.name} (${topicInfo.description})

Grade Level: ${params.gradeLevel}
`;

  if (params.customFocus) {
    userPrompt += `\nSpecial Focus: ${params.customFocus}\n`;
  }

  if (params.sourceDocumentText) {
    userPrompt += `\nSTUDENT'S WRITING SAMPLE:
${params.sourceDocumentText.slice(0, 1000)} // Limit to first 1000 chars

Try to include ONE example from the student's actual writing in the "See It In Action" section if their writing demonstrates this issue.
`;
  }

  userPrompt += `\nGenerate the complete lesson following the exact format specified in your instructions.`;

  try {
    const content = await getLLMCompletion({
      model: 'claude-3-5-sonnet-20240620',
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: 2048,
      temperature: 0.7, // Slightly higher for creative examples
      metadata: {
        feature: 'writing-lessons',
        action: 'generate-lesson',
        topic: params.topic,
        gradeLevel: params.gradeLevel,
      },
    });

    return content;
  } catch (error) {
    console.error('Failed to generate writing lesson:', error);
    throw new Error(
      'Failed to generate lesson. Please try again or contact support.'
    );
  }
}

// Helper to generate a default title from content
export function generateLessonTitle(
  topic: WritingLessonTopic,
  gradeLevel: GradeLevel
): string {
  const topicInfo = WRITING_LESSON_TOPICS[topic];
  const gradeLevelLabel =
    gradeLevel === 'middle-school'
      ? 'Middle School'
      : gradeLevel === 'high-school'
        ? 'High School'
        : 'College';
  return `${topicInfo.name} (${gradeLevelLabel})`;
}
