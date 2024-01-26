import { describe, expect, it } from 'vitest'
import { pick } from './pick' // Adjust import path as needed

describe('pick function', () => {
	it('should pick specified keys from an object', () => {
		const obj = { a: 1, b: 2, c: 3 }
		const keys = ['a', 'c'] as any
		const expected = { a: 1, c: 3 }
		expect(pick(obj, keys)).toEqual(expected)
	})

	it('should return an empty object when source is undefined', () => {
		const obj = undefined
		const keys = ['a', 'c'] as any
		expect(pick(obj, keys)).toEqual({})
	})

	it('should ignore keys that do not exist in the source object', () => {
		const obj = { a: 1, b: 2 }
		const keys = ['a', 'c'] as any
		const expected = { a: 1 }
		expect(pick(obj, keys)).toEqual(expected)
	})
})
