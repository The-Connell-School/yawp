import { v4 as uuidv4 } from 'uuid';
import type { Highlight } from '../schemas/essay-grade';
import type { RubricCategoryId } from './rubric-categories';

export interface AIHighlight {
	text: string;
	feedback: string;
}

export interface TextPosition {
	start: number;
	end: number;
	text: string;
}

/**
 * Normalize text for fuzzy matching (lowercase, collapse whitespace)
 */
function normalizeText(text: string): string {
	return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Find the position of a text snippet in the essay
 * Uses exact matching first, then falls back to normalized matching
 */
export function findTextPosition(essayText: string, snippetText: string): TextPosition | null {
	// Try exact match first
	let index = essayText.indexOf(snippetText);

	if (index !== -1) {
		return {
			start: index,
			end: index + snippetText.length,
			text: snippetText,
		};
	}

	// Try normalized matching
	const normalizedEssay = normalizeText(essayText);
	const normalizedSnippet = normalizeText(snippetText);

	index = normalizedEssay.indexOf(normalizedSnippet);

	if (index !== -1) {
		// Map back to original text positions
		// Count actual characters (with original spacing) up to this position
		let originalIndex = 0;
		let normalizedCount = 0;

		for (let i = 0; i < essayText.length; i++) {
			if (normalizedCount === index) {
				originalIndex = i;
				break;
			}

			// Only count non-whitespace or first space in a sequence
			const char = essayText[i];
			const isSpace = /\s/.test(char);
			const prevChar = i > 0 ? essayText[i - 1] : '';
			const isPrevSpace = /\s/.test(prevChar);

			if (!isSpace || !isPrevSpace) {
				normalizedCount++;
			}
		}

		// Find the length of the actual text
		let actualLength = 0;
		let normalizedLength = 0;

		for (let i = originalIndex; i < essayText.length; i++) {
			if (normalizedLength >= normalizedSnippet.length) {
				break;
			}

			const char = essayText[i];
			const isSpace = /\s/.test(char);
			const prevChar = i > 0 ? essayText[i - 1] : '';
			const isPrevSpace = /\s/.test(prevChar);

			actualLength++;

			if (!isSpace || !isPrevSpace) {
				normalizedLength++;
			}
		}

		const actualText = essayText.substring(originalIndex, originalIndex + actualLength);

		return {
			start: originalIndex,
			end: originalIndex + actualLength,
			text: actualText,
		};
	}

	// No match found
	console.warn(`Could not find text position for snippet: "${snippetText.substring(0, 50)}..."`);
	return null;
}

/**
 * Convert AI highlights to database highlight format with positions
 */
export function generateHighlights(
	essayText: string,
	aiHighlights: AIHighlight[],
	category: RubricCategoryId,
	gradeId: string
): Highlight[] {
	const highlights: Highlight[] = [];
	let position = 0;

	for (const aiHighlight of aiHighlights) {
		const textPosition = findTextPosition(essayText, aiHighlight.text);

		if (textPosition) {
			highlights.push({
				highlightId: uuidv4(),
				category,
				content: textPosition.text,
				feedback: aiHighlight.feedback,
				position: position++,
			});
		} else {
			// Log warning but continue with other highlights
			console.warn(
				`Skipping highlight for category ${category}: Could not locate text "${aiHighlight.text.substring(0, 50)}..."`
			);
		}
	}

	return highlights;
}

/**
 * Generate all highlights from AI response for all categories
 */
export function generateAllHighlights(
	essayText: string,
	aiResponse: Record<
		string,
		{
			score: number;
			feedback: string;
			highlights: AIHighlight[];
		}
	>,
	gradeId: string
): Highlight[] {
	const allHighlights: Highlight[] = [];

	for (const [category, categoryData] of Object.entries(aiResponse)) {
		const categoryHighlights = generateHighlights(
			essayText,
			categoryData.highlights,
			category as RubricCategoryId,
			gradeId
		);
		allHighlights.push(...categoryHighlights);
	}

	return allHighlights;
}
