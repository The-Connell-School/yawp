import { type z } from 'zod'
import { Action } from '../../types'
import { createUseAction } from '../utils'
import { type Schema } from './schema'

export const useCreateDocumentCommentResponse = createUseAction<
	z.infer<typeof Schema>
>(Action.CreateDocumentCommentResponse)
