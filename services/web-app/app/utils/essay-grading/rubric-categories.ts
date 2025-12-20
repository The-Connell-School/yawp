export const RUBRIC_CATEGORIES = {
	thesis: {
		id: 'thesis',
		label: 'Thesis and Content',
		color: 'blue',
		bgClass: 'bg-blue-100',
		borderClass: 'border-blue-400',
		hoverClass: 'hover:bg-blue-200',
		focusClass: 'bg-blue-300',
		description: 'Clear argument, main idea, and relevance of content',
	},
	organization: {
		id: 'organization',
		label: 'Organization and Structure',
		color: 'purple',
		bgClass: 'bg-purple-100',
		borderClass: 'border-purple-400',
		hoverClass: 'hover:bg-purple-200',
		focusClass: 'bg-purple-300',
		description: 'Introduction, body, conclusion flow, and transitions',
	},
	evidence: {
		id: 'evidence',
		label: 'Evidence and Support',
		color: 'green',
		bgClass: 'bg-green-100',
		borderClass: 'border-green-400',
		hoverClass: 'hover:bg-green-200',
		focusClass: 'bg-green-300',
		description: 'Use of examples, quotes, reasoning, and analysis',
	},
	voice: {
		id: 'voice',
		label: 'Voice and Style',
		color: 'orange',
		bgClass: 'bg-orange-100',
		borderClass: 'border-orange-400',
		hoverClass: 'hover:bg-orange-200',
		focusClass: 'bg-orange-300',
		description: 'Appropriate tone, word choice, and sentence variety',
	},
	grammar: {
		id: 'grammar',
		label: 'Grammar and Mechanics',
		color: 'red',
		bgClass: 'bg-red-100',
		borderClass: 'border-red-400',
		hoverClass: 'hover:bg-red-200',
		focusClass: 'bg-red-300',
		description: 'Sentence structure, punctuation, and spelling',
	},
} as const;

export type RubricCategoryId = keyof typeof RUBRIC_CATEGORIES;

export const RUBRIC_CATEGORY_IDS: RubricCategoryId[] = [
	'thesis',
	'organization',
	'evidence',
	'voice',
	'grammar',
] as const;

export const SCORE_LABELS = {
	1: 'Needs Improvement',
	2: 'Developing',
	3: 'Proficient',
	4: 'Exemplary',
} as const;

export type ScoreValue = keyof typeof SCORE_LABELS;

export const SCORE_DESCRIPTIONS = {
	1: 'Significant gaps, requires major revision',
	2: 'Shows understanding but needs refinement',
	3: 'Meets expectations with minor areas for growth',
	4: 'Exceeds expectations, demonstrates mastery',
} as const;

export function calculateOverallScore(scores: { category: string; score: number }[]): number {
	if (scores.length === 0) return 0;
	const sum = scores.reduce((acc, { score }) => acc + score, 0);
	return Math.round((sum / scores.length) * 10) / 10; // Round to 1 decimal place
}

export function getScoreLabel(score: number): string {
	const rounded = Math.round(score) as ScoreValue;
	return SCORE_LABELS[rounded] || 'Unknown';
}
