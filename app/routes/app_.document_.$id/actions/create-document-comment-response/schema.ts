import { z } from 'zod'

export const Schema = z.object({
	commentId: z.string(),
	content: z.string(),
})
