import { withZod } from '@remix-validated-form/with-zod'
import { z } from 'zod'

export const CourseResourceSchema = z.object({
	title: z.string(),
	description: z.string().nullish(),
	url: z
		.string()
		.regex(/^https:\/\//, 'The URL must start with https://')
		.nullable(),
})

export const CourseModuleInstructionSchema = z.object({
	title: z.string(),
	answerKey: z.string().nullish(),
	answerType: z.string().nullish(),
	answerTypeOptions: z.string().nullish(),
	prompt: z.string(),
	tutorInstructions: z.string().nullish(),
	concludingPrompt: z.string().nullish(),
	concludingPromptType: z.string().nullish(),
	interactiveType: z.string(),
	canAskQuestion: z
		.union([
			z.literal('true').transform(() => true),
			z.literal('false').transform(() => false),
		])
		.nullish(),
	nextInstructionBtnLabel: z.string().nullish(),
})

export const CourseModuleSchema = z.object({
	id: z.string().nullish(),
	title: z.string().min(1, 'Title is required'),
	description: z.string().nullish(),
	tutorInstructions: z.string().nullish(),
	instructions: z.array(CourseModuleInstructionSchema).optional(),
})

export const MAX_SIZE = 1024 * 1024 * 3 // 3MB

export const Schema = z.object({
	title: z.string(),
	description: z.string().nullish(),
	courseModules: z.array(CourseModuleSchema).nullish(),
	courseImageSrc: z.string().nullish(),
	image: z.instanceof(File).nullish(),
	resources: z.array(CourseResourceSchema).nullish(),
})

export const validator = withZod(Schema)
