import { withZod } from '@remix-validated-form/with-zod'
import { z } from 'zod'

export const Schema = z.object({
	name: z.string(),
	instructions: z.string().nullish(),
})

export const validator = withZod(Schema)
