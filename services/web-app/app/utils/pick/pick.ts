export function pick<T extends object, K extends keyof T>(
	obj: T | undefined,
	keys: K[],
): Partial<Pick<T, K>> {
	if (!obj) {
		return {}
	}

	const result: Partial<T> = {}
	keys.forEach(key => {
		if (key in obj) {
			result[key] = obj[key]
		}
	})
	return result
}
