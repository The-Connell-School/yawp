import { withZod } from '@remix-validated-form/with-zod'
import { z } from 'zod'
import { zfd } from 'zod-form-data'

export const InstructionSchema = z.object({
	title: z.string(),
	answerKey: z.string().nullable().optional(),
	answerType: z.string(),
	answerTypeOptions: z.string().nullable().optional(),
	prompt: z.string(),
	promptType: z.string(),
	position: zfd.numeric(z.number().min(0)).optional(),
	concludingPrompt: z.string().nullable().optional(),
	concludingPromptType: z.string().nullable().optional(),
	canAskQuestion: z.union([
		z.literal('true').transform(() => true),
		z.literal('false').transform(() => false),
	]),
})

export const Schema = z.object({
	title: z.string(),
	tutorId: z.string().nullable(),
	position: zfd.numeric(z.number().min(0)),
	description: z.string().nullable(),
	instructions: z.array(InstructionSchema).optional(),
})

export const validator = withZod(Schema)
