import { z } from 'zod';

// Rubric category selection (Step 1)
export const RubricSelectionSchema = z
	.object({
		thesis: z.enum(['on']).optional(),
		organization: z.enum(['on']).optional(),
		evidence: z.enum(['on']).optional(),
		voice: z.enum(['on']).optional(),
		grammar: z.enum(['on']).optional(),
		useFullRubric: z.enum(['on']).optional(),
	})
	.refine(
		(data) => {
			// At least one category must be selected (or useFullRubric)
			const hasCategory = Object.entries(data).some(
				([key, value]) => key !== 'useFullRubric' && value === 'on'
			);
			return data.useFullRubric === 'on' || hasCategory;
		},
		{
			message: 'Please select at least one rubric category',
		}
	);

// AI feedback request
export const GenerateGradingFeedbackSchema = z.object({
	documentId: z.string(),
	essayText: z.string().min(1, 'Essay text is required'),
	essayHtml: z.string().min(1, 'Essay HTML is required'),
	categories: z
		.array(z.enum(['thesis', 'organization', 'evidence', 'voice', 'grammar']))
		.min(1, 'At least one category is required'),
	graderType: z.enum(['teacher', 'student']).default('teacher'),
});

// Highlight data structure
export const HighlightSchema = z.object({
	highlightId: z.string(),
	category: z.enum(['thesis', 'organization', 'evidence', 'voice', 'grammar']),
	content: z.string(),
	feedback: z.string(),
	position: z.number(),
});

// Category score
export const CategoryScoreSchema = z.object({
	category: z.enum(['thesis', 'organization', 'evidence', 'voice', 'grammar']),
	score: z.number().min(1).max(4),
	feedback: z.string(),
});

// Create essay grade
export const CreateEssayGradeSchema = z.object({
	documentId: z.string(),
	graderType: z.enum(['teacher', 'student']),
	essayHtml: z.string(),
	essayText: z.string(),
	categoryScores: z.array(CategoryScoreSchema),
	highlights: z.array(HighlightSchema),
	overallFeedback: z.string().optional(),
});

// Update essay grade
export const UpdateEssayGradeSchema = z.object({
	categoryScores: z.array(CategoryScoreSchema).optional(),
	highlights: z.array(HighlightSchema).optional(),
	overallFeedback: z.string().optional(),
});

// AI response schema
export const AIHighlightSchema = z.object({
	text: z.string(),
	feedback: z.string(),
});

export const AICategoryFeedbackSchema = z.object({
	score: z.number().min(1).max(4),
	feedback: z.string(),
	highlights: z.array(AIHighlightSchema),
});

export const AIGradingResponseSchema = z.object({
	categories: z.record(
		z.enum(['thesis', 'organization', 'evidence', 'voice', 'grammar']),
		AICategoryFeedbackSchema
	),
	overallFeedback: z.string(),
});

// Type exports
export type RubricSelection = z.infer<typeof RubricSelectionSchema>;
export type GenerateGradingFeedback = z.infer<typeof GenerateGradingFeedbackSchema>;
export type Highlight = z.infer<typeof HighlightSchema>;
export type CategoryScore = z.infer<typeof CategoryScoreSchema>;
export type CreateEssayGrade = z.infer<typeof CreateEssayGradeSchema>;
export type UpdateEssayGrade = z.infer<typeof UpdateEssayGradeSchema>;
export type AIHighlight = z.infer<typeof AIHighlightSchema>;
export type AICategoryFeedback = z.infer<typeof AICategoryFeedbackSchema>;
export type AIGradingResponse = z.infer<typeof AIGradingResponseSchema>;
