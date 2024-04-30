type JsonifyObject<T> = T extends null
	? null
	: {
			[K in keyof T]: T[K] extends Date
				? string
				: T[K] extends Date | null
					? string | null
					: T[K] extends Array<infer U>
						? JsonifyArray<U>
						: T[K] extends object | null
							? JsonifyObject<T[K]>
							: T[K]
		}

type JsonifyArray<T> = T extends Date | null
	? (string | null)[]
	: T extends Array<infer U>
		? JsonifyArray<U>[]
		: T extends object | null
			? JsonifyObject<T>[]
			: T[]
