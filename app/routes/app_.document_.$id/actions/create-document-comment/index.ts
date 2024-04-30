import { type z } from 'zod'
import { Action } from '../../types'
import { createUseAction } from '../utils'
import { type Schema } from './schema'

export const useCreateDocumentComment = createUseAction<z.infer<typeof Schema>>(
	Action.CreateDocumentComment,
)
