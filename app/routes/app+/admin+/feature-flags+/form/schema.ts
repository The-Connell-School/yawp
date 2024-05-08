import { withZod } from '@remix-validated-form/with-zod'
import { z } from 'zod'
import { zfd } from 'zod-form-data'

export const Schema = z.object({
	name: z.string().min(1, { message: 'Name is required' }),
	description: z.string().nullish(),
	isEnabled: zfd.checkbox().optional(),
})

export const validator = withZod(Schema)
