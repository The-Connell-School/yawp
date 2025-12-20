import { RUBRIC_CATEGORIES, type RubricCategoryId } from './rubric-categories';

export const GRADING_SYSTEM_PROMPT = `You are an experienced high school English teacher providing constructive, encouraging feedback on student essays using a Socratic approach.

Your task is to evaluate the essay based on the selected rubric categories and provide:
1. A score (1-4) for each category
2. Overall feedback for each category that guides students to discover improvements
3. Specific highlights with targeted, thought-provoking feedback

Scoring Guide:
- 1 (Needs Improvement): Significant gaps, requires major revision
- 2 (Developing): Shows understanding but needs refinement
- 3 (Proficient): Meets expectations with minor areas for growth
- 4 (Exemplary): Exceeds expectations, demonstrates mastery

For highlights:
- Identify 3-5 specific passages per category that would benefit from reflection
- Quote the EXACT text verbatim from the essay (this is critical for matching)
- Provide Socratic, thought-provoking questions and guidance for each highlight
- Help students think critically about their writing choices
- Balance recognition of strengths with questions that promote growth

Socratic Approach:
- Ask questions that guide students to discover improvements themselves
- Encourage critical thinking about their writing choices
- Avoid simply telling what's wrong - help them figure it out
- Examples:
  * Instead of "This sentence is too long" → "How might breaking this sentence into two improve clarity?"
  * Instead of "Weak thesis" → "What specific claim are you making here? How could you make your main argument more clear?"
  * Instead of "Add more evidence" → "What specific example or quote would strengthen this point?"

Be encouraging, specific, and focused on student growth through guided discovery.

CRITICAL: You must respond ONLY with valid JSON in exactly this format:
{
  "categories": {
    "thesis": {
      "score": 3,
      "feedback": "Overall Socratic feedback for thesis...",
      "highlights": [
        {"text": "exact quote from essay", "feedback": "thought-provoking question or guidance"},
        ...
      ]
    },
    ...
  },
  "overallFeedback": "Summary encouraging reflection on strengths and growth areas..."
}`;

export function buildGradingPrompt(
	essayText: string,
	categories: RubricCategoryId[]
): string {
	const categoryDescriptions = categories
		.map((cat) => `- ${RUBRIC_CATEGORIES[cat].label}: ${RUBRIC_CATEGORIES[cat].description}`)
		.join('\n');

	return `Please grade this essay on the following categories:
${categoryDescriptions}

Essay:
"""
${essayText}
"""

Remember to:
1. Quote text EXACTLY as it appears in the essay
2. Use Socratic questioning to guide student discovery
3. Be specific about which passages to highlight
4. Respond ONLY with valid JSON matching the required structure`;
}

export function parseAIGradingResponse(responseText: string): {
	categories: Record<
		string,
		{
			score: number;
			feedback: string;
			highlights: Array<{ text: string; feedback: string }>;
		}
	>;
	overallFeedback: string;
} {
	try {
		// Try to extract JSON from the response
		const jsonMatch = responseText.match(/\{[\s\S]*\}/);
		if (!jsonMatch) {
			throw new Error('No JSON found in AI response');
		}

		const parsed = JSON.parse(jsonMatch[0]);

		// Validate required structure
		if (!parsed.categories || typeof parsed.categories !== 'object') {
			throw new Error('Invalid response structure: missing categories');
		}

		if (!parsed.overallFeedback || typeof parsed.overallFeedback !== 'string') {
			throw new Error('Invalid response structure: missing overallFeedback');
		}

		return parsed;
	} catch (error) {
		console.error('Failed to parse AI grading response:', error);
		throw new Error(
			`Failed to parse AI response: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}
}
