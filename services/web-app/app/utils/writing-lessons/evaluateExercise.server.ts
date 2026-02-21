import { WritingLessonTopic } from '@app/prisma';
import { getLLMCompletion } from '~/utils/getLLMCompletion/getLLMCompletion';
import { WRITING_LESSON_TOPICS } from './topics';

interface EvaluateExerciseParams {
  topic: WritingLessonTopic;
  exercisePrompt: string; // The original sentence/text
  instruction: string; // What the student was asked to do
  studentResponse: string; // What the student wrote
  attemptNumber: number; // Which attempt this is (1st, 2nd, 3rd, etc.)
}

interface EvaluationResult {
  isCorrect: boolean;
  feedback: string;
}

const SYSTEM_PROMPT = `You are an expert writing tutor evaluating a student's practice exercise response.

Your job is to determine if the student correctly applied the writing skill, and provide appropriate feedback based on their attempt number.

**EVALUATION CRITERIA:**
- Did the student identify and fix the core writing issue?
- Is their revision grammatically correct?
- Does it demonstrate understanding of the principle?
- Small variations in wording are OK if the core fix is correct

**FEEDBACK GUIDELINES:**

For Attempt 1-2 (if incorrect):
- Keep it brief (1-2 sentences)
- Point out the specific issue: "Not quite — [what's still wrong]."
- Hint at the solution without giving it away
- Stay encouraging

For Attempt 3+ (if incorrect):
- Provide more detailed explanation (3-4 sentences)
- Explain WHY their response doesn't work
- Give a clear hint about what to look for
- Remain supportive: "You're getting closer! Here's what to focus on..."

For Correct answers (any attempt):
- Keep it simple and positive (1 sentence)
- "Nice work! You [what they did right]."
- Don't over-explain correct answers

**OUTPUT FORMAT:**
Respond with valid JSON only:
{
  "isCorrect": true/false,
  "feedback": "your feedback string here"
}`;

export async function evaluateExercise(
  params: EvaluateExerciseParams
): Promise<EvaluationResult> {
  const topicInfo = WRITING_LESSON_TOPICS[params.topic];

  const userPrompt = `Topic: ${topicInfo.name}

Original Exercise: "${params.exercisePrompt}"
Instruction: ${params.instruction}

Student's Response: "${params.studentResponse}"

Attempt Number: ${params.attemptNumber}

Evaluate if the student correctly applied the writing skill. Respond with JSON.`;

  try {
    const response = await getLLMCompletion({
      model: 'claude-3-5-sonnet-20240620',
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: 512,
      temperature: 0.3, // Lower temperature for consistent evaluation
      metadata: {
        feature: 'writing-lessons',
        action: 'evaluate-exercise',
        topic: params.topic,
        attemptNumber: params.attemptNumber,
      },
    });

    // Parse the JSON response
    const parsed = JSON.parse(response) as EvaluationResult;

    // Validate the response has required fields
    if (typeof parsed.isCorrect !== 'boolean' || !parsed.feedback) {
      throw new Error('Invalid evaluation response format');
    }

    return parsed;
  } catch (error) {
    console.error('Failed to evaluate exercise:', error);

    // Fallback response if AI fails
    return {
      isCorrect: false,
      feedback:
        'Unable to evaluate your response right now. Please try again or ask your teacher for help.',
    };
  }
}

// Helper to check if student should get more detailed feedback
export function shouldProvideDetailedFeedback(attemptNumber: number): boolean {
  return attemptNumber >= 3;
}

// Helper to format attempt feedback
export function formatAttemptMessage(attemptNumber: number): string {
  if (attemptNumber === 1) return 'First try!';
  if (attemptNumber === 2) return 'Second attempt';
  if (attemptNumber === 3) return 'Third try — let me give you more help';
  return `Attempt ${attemptNumber}`;
}
