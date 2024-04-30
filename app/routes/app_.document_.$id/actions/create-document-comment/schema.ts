import { z } from 'zod'

export const Schema = z.object({
	highlightId: z.string().min(1),
	content: z.string().min(1),
	documentId: z.string().min(1),
})
