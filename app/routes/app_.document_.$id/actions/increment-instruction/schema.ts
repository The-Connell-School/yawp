import { z } from 'zod'

export const Schema = z.object({ cmsId: z.string().min(1) })
