import { type z } from 'zod'
import { Action } from '../../types'
import { createUseAction } from '../utils'
import { type Schema } from './schema'

export const useIncrementInstruction = createUseAction<z.infer<typeof Schema>>(
	Action.IncrementInstruction,
)
