import { type FieldMetadata } from '@conform-to/react'
import { useCallback, useEffect, useState } from 'react'

export function useFieldArray<T>(
	field: FieldMetadata<T[], any>,
	track: (keyof T)[],
) {
	const [fields, setFields] = useState<T[]>((field.initialValue ?? []) as T[])

	const getValues = useCallback(() => {
		return fields.map((current, i) => {
			return track.reduce((acc, key) => {
				const element = document?.querySelector(
					`[name="${field.name}_${key as string}"][data-index="${i}"]`,
				) as HTMLInputElement | HTMLTextAreaElement
				return { ...acc, [key]: element?.value ?? current[key] }
			}, {} as T)
		})
	}, [field.name, fields, track])

	useEffect(() => {
		setFields((field.initialValue ?? []) as T[])
	}, [field.formId, field.initialValue])

	const remove = (i: number) => {
		const values = getValues()
		setFields(values.slice(0, i).concat(values.slice(i + 1)) as any)
	}

	const append = (value: T) => {
		const values = getValues()
		setFields(values.concat(value) as any)
	}

	const reset = (i: number, prev: T) => {
		setFields(current => current.map((f, index) => (index === i ? prev : f)))
	}

	return {
		fields: fields ?? [],
		remove,
		append,
		reset,
		setValues: (getter?: (v: T[]) => T[] | T[]) =>
			getter
				? typeof getter === 'function'
					? setFields(getter(getValues()))
					: setFields(getter)
				: setFields(getValues()),
	}
}
