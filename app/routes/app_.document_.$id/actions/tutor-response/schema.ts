import { z } from 'zod'

export const Schema = z.object({
	cmsId: z.string().min(1),
	response: z.string().min(1),
	context: z.string().nullish(),
})
