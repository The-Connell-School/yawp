import { getLLMCompletion } from '~/utils/getLLMCompletion';

interface EvaluateExerciseParams {
  topic: string;
  exercisePrompt: string;
  instruction: string;
  studentResponse: string;
  attemptNumber: number;
}

interface EvaluateExerciseResult {
  isCorrect: boolean;
  feedback: string;
}

const SYSTEM_PROMPT = `You are an expert writing instructor for the YAWP! Writing Program. Your job is to evaluate a student's response to a writing exercise and provide feedback.

You will receive:
- The writing topic being practiced
- The exercise prompt (the original sentence or problem)
- The specific instruction (what the student was asked to do)
- The student's response
- The attempt number (how many times the student has tried)

Evaluate whether the student's response correctly addresses the instruction. Then provide feedback based on these guidelines:

**Attempt 1-2 (incorrect):** Keep feedback brief and specific. Format: "Not quite — [specific issue]." Point out what needs to change without giving away the full answer.

**Attempt 3+ (incorrect):** Provide a more detailed explanation of the concept, include a hint that steers the student toward the correct answer, and add a word of encouragement. Help them understand the "why" without doing the work for them.

**Correct:** Simple, specific praise. Format: "Nice work! You [what they did right]." Acknowledge the specific skill they demonstrated.

Be warm, direct, and respectful. Never be condescending. Meet the student where they are.

IMPORTANT: Respond with valid JSON only. No markdown, no code fences, no extra text. Use this exact format:
{"isCorrect": true or false, "feedback": "Your feedback here"}`;

/**
 * Evaluates a student's exercise response using Claude AI.
 *
 * Returns whether the response is correct and tailored feedback
 * based on the attempt number.
 */
export async function evaluateExercise({
  topic,
  exercisePrompt,
  instruction,
  studentResponse,
  attemptNumber,
}: EvaluateExerciseParams): Promise<EvaluateExerciseResult> {
  const userMessage = [
    `Topic: ${topic}`,
    `Exercise prompt: ${exercisePrompt}`,
    `Instruction: ${instruction}`,
    `Student's response: ${studentResponse}`,
    `Attempt number: ${attemptNumber}`,
  ].join('\n');

  const result = await getLLMCompletion({
    model: 'claude-3-5-sonnet-20240620',
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
    maxTokens: 4096,
  });

  try {
    const parsed = JSON.parse(result) as EvaluateExerciseResult;

    return {
      isCorrect: Boolean(parsed.isCorrect),
      feedback: String(parsed.feedback),
    };
  } catch {
    console.error('Failed to parse exercise evaluation response:', result);

    return {
      isCorrect: false,
      feedback:
        "We couldn't evaluate your response right now. Please try again.",
    };
  }
}
