import { useFetcher } from '@remix-run/react'
import { type Action } from '../types'

export const createUseAction =
	<T extends {}>(action: Action) =>
	() => {
		const fetcher = useFetcher({
			key: action,
		})

		return {
			Form: fetcher.Form,
			state: fetcher.state,
			optimisticData: (fetcher.formData
				? Object.fromEntries(fetcher.formData)
				: {}) as T,
			mutate: (params: T) =>
				fetcher.submit(params, {
					method: 'POST',
				}),
		}
	}
