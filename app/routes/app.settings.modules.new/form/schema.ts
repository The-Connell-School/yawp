import { withZod } from '@remix-validated-form/with-zod'
import { z } from 'zod'
import { zfd } from 'zod-form-data'
import { InstructionSchema } from '../form-instruction/schema'

export const Schema = z.object({
	title: z.string(),
	tutorId: z.string().nullable(),
	position: zfd.numeric(z.number().min(0)),
	description: z.string().nullable(),
	instructions: z.array(InstructionSchema).optional(),
})
export const validator = withZod(Schema)
