import { z } from 'zod'

export const Schema = z.object({ documentCommentId: z.string().min(1) })
