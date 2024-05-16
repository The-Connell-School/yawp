import * as React from 'react'

function flattenObject(
	obj: any,
	prefix = '',
): { [key: string]: string | number | boolean } {
	let flattened: { [key: string]: string | number | boolean } = {}

	for (const i in obj) {
		const propPath = prefix ? `${prefix}.${i}` : i

		if (typeof obj[i] === 'object' && obj[i] !== null) {
			// If it's an array, include the index in the path
			if (Array.isArray(obj[i])) {
				obj[i].forEach((item: any, index: number) => {
					if (typeof item === 'object' && item !== null) {
						Object.assign(
							flattened,
							flattenObject(item, `${propPath}[${index}]`),
						)
					} else {
						flattened[`${propPath}[${index}]`] = item
					}
				})
			} else {
				Object.assign(flattened, flattenObject(obj[i], propPath))
			}
		} else {
			flattened[propPath] = obj[i]
		}
	}

	return flattened
}

interface Params {
	hiddenValues: { [key: string]: string | number | null | boolean }
	upsert: (value: Params['hiddenValues'], prefix?: string) => any
	remove: (key: string) => any
	move: (key: string, newKey: string) => any
}

export const HiddenValuesContext = React.createContext<Params>({
	hiddenValues: {},
	upsert: () => {},
	remove: () => {},
	move: () => {},
})

export const HiddenValuesProvider = (props: { children?: React.ReactNode }) => {
	const [hiddenValues, setHiddenValues] = React.useState<
		Params['hiddenValues']
	>({})

	const value = React.useMemo(
		() => ({
			hiddenValues,
			move: (key: string, newKey: string) => {
				setHiddenValues(prev => {
					let moved: Params['hiddenValues'] = {}
					const withoutKey = Object.keys(prev).reduce(
						(acc, prevK) => {
							if (prevK.startsWith(key) && prev[prevK]) {
								const newKeyWithSuffix = newKey + prevK.slice(newKey.length)
								moved[newKeyWithSuffix] = prev[prevK]
								return acc
							}

							const keyPrefix = key.endsWith(']')
								? key.split('[').slice(0, -1).join('[')
								: key

							if (!prevK.startsWith(keyPrefix)) {
								acc[prevK] = prev[prevK]
								return acc
							}

							const kIdxStr = key
								.slice(0, keyPrefix.length + 3)
								.match(/\[\d+\]/g)
								?.pop()
								?.slice(1, -1)
							const prevKIdxStr = prevK
								.slice(0, keyPrefix.length + 3)
								.match(/\[\d+\]/g)
								?.pop()
								?.slice(1, -1)

							const kIdx = kIdxStr ? parseInt(kIdxStr) : null
							const prevKIdx = prevKIdxStr ? parseInt(prevKIdxStr) : null

							if (prevKIdx != null && kIdx !== null && prevKIdx > kIdx) {
								const newPrevK =
									keyPrefix + `[${prevKIdx - 1}]` + prevK.slice(key.length)
								acc[newPrevK] = prev[prevK]
							} else {
								acc[prevK] = prev[prevK]
							}
							return acc
						},
						{} as Params['hiddenValues'],
					)

					const shiftedUp = Object.keys(withoutKey).reduce(
						(acc, prevK) => {
							const keyPrefix = newKey.endsWith(']')
								? newKey.split('[').slice(0, -1).join('[')
								: newKey

							if (!prevK.startsWith(keyPrefix)) {
								acc[prevK] = prev[prevK]
								return acc
							}

							const newKIdxStr = newKey
								.slice(0, keyPrefix.length + 3)
								.match(/\[\d+\]/g)
								?.pop()
								?.slice(1, -1)
							const prevKIdxStr = prevK
								.slice(0, keyPrefix.length + 3)
								.match(/\[\d+\]/g)
								?.pop()
								?.slice(1, -1)

							const newKIdx = newKIdxStr ? parseInt(newKIdxStr) : null
							const prevKIdx = prevKIdxStr ? parseInt(prevKIdxStr) : null

							if (prevKIdx != null && newKIdx !== null && prevKIdx >= newKIdx) {
								const newPrevK =
									keyPrefix + `[${prevKIdx + 1}]` + prevK.slice(key.length)
								acc[newPrevK] = prev[prevK]
							} else {
								acc[prevK] = prev[prevK]
							}

							return acc
						},
						{} as Params['hiddenValues'],
					)

					return Object.assign(shiftedUp, moved)
				})
			},
			remove: (key: string) => {
				setHiddenValues(prev =>
					Object.keys(prev).reduce(
						(acc, prevK) => {
							if (prevK.startsWith(key)) {
								return acc
							}

							const keyPrefix = key.endsWith(']')
								? key.split('[').slice(0, -1).join('[')
								: key

							if (!prevK.startsWith(keyPrefix)) {
								acc[prevK] = prev[prevK]
								return acc
							}

							const kIdxStr = key
								.slice(0, keyPrefix.length + 3)
								.match(/\[\d+\]/g)
								?.pop()
								?.slice(1, -1)
							const prevKIdxStr = prevK
								.slice(0, keyPrefix.length + 3)
								.match(/\[\d+\]/g)
								?.pop()
								?.slice(1, -1)

							const kIdx = kIdxStr ? parseInt(kIdxStr) : null
							const prevKIdx = prevKIdxStr ? parseInt(prevKIdxStr) : null

							if (prevKIdx != null && kIdx !== null && prevKIdx > kIdx) {
								const newPrevK =
									keyPrefix + `[${prevKIdx - 1}]` + prevK.slice(key.length)
								acc[newPrevK] = prev[prevK]
								return acc
							} else {
								acc[prevK] = prev[prevK]
								return acc
							}
						},
						{} as Params['hiddenValues'],
					),
				)
			},
			upsert: (values: Params['hiddenValues'] | null, prefix?: string) => {
				return values
					? setHiddenValues(prev => ({
							...prev,
							...Object.entries(values).reduce(
								(acc, [key, val]) => {
									acc[`${prefix ? `${prefix}.${key}` : key}`] = val
									return acc
								},
								{} as Params['hiddenValues'],
							),
						}))
					: {}
			},
		}),
		[hiddenValues],
	)

	return (
		<HiddenValuesContext.Provider value={value}>
			{props.children}
		</HiddenValuesContext.Provider>
	)
}

export const useHiddenValues = () => React.useContext(HiddenValuesContext)

export const HiddenValuesInputs = ({
	defaultValues,
}: {
	defaultValues?: object
}) => {
	const { hiddenValues, upsert } = useHiddenValues()

	React.useEffect(() => {
		if (defaultValues) {
			upsert(flattenObject(defaultValues))
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	return (
		<>
			{Object.entries(hiddenValues).map(([key, value]) => (
				<input
					key={key}
					type="hidden"
					name={key}
					value={typeof value === 'boolean' ? String(value) : value ?? ''}
				/>
			))}
		</>
	)
}
