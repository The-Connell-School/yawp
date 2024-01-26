export function pick<T extends object, K extends keyof T>(
	obj: T | undefined,
	keys: K[],
): Pick<T, K> {
	if (!obj) {
		return {} as Pick<T, K>
	}

	const result: Partial<T> = {}
	keys.forEach(key => {
		if (key in obj) {
			result[key] = obj[key]
		}
	})
	return result as Pick<T, K>
}
