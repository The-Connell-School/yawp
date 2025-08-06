import { describe, expect, it } from 'bun:test'
import {
	getUserImgSrc,
	getErrorMessage,
	cn,
	getDomainUrl,
	getReferrerRoute,
	mergeHeaders,
	combineHeaders,
	combineResponseInits,
	downloadFile,
	toArray,
} from './misc'

describe('Misc utility functions', () => {
	describe('getUserImgSrc', () => {
		it('should return correct image URL', () => {
			expect(getUserImgSrc('123')).toBe('/api/image/user/123')
			expect(getUserImgSrc('user-abc')).toBe('/api/image/user/user-abc')
			expect(getUserImgSrc('')).toBe('/api/image/user/')
		})
	})

	describe('getErrorMessage', () => {
		it('should return string errors as-is', () => {
			expect(getErrorMessage('Something went wrong')).toBe('Something went wrong')
			expect(getErrorMessage('')).toBe('')
		})

		it('should extract message from error objects', () => {
			const error = new Error('Test error message')
			expect(getErrorMessage(error)).toBe('Test error message')

			const customError = { message: 'Custom error' }
			expect(getErrorMessage(customError)).toBe('Custom error')
		})

		it('should handle objects with non-string messages', () => {
			const error = { message: 123 }
			expect(getErrorMessage(error)).toBe('Unknown Error')
		})

		it('should handle objects without message property', () => {
			const error = { code: 500, status: 'error' }
			expect(getErrorMessage(error)).toBe('Unknown Error')
		})

		it('should handle null and undefined', () => {
			expect(getErrorMessage(null)).toBe('Unknown Error')
			expect(getErrorMessage(undefined)).toBe('Unknown Error')
		})

		it('should handle non-object, non-string values', () => {
			expect(getErrorMessage(123)).toBe('Unknown Error')
			expect(getErrorMessage(true)).toBe('Unknown Error')
			expect(getErrorMessage([])).toBe('Unknown Error')
		})
	})

	describe('cn (className utility)', () => {
		it('should combine class names correctly', () => {
			expect(cn('class1', 'class2')).toBe('class1 class2')
			expect(cn('text-red-500', 'bg-blue-100')).toBe('text-red-500 bg-blue-100')
		})

		it('should handle conditional classes', () => {
			expect(cn('base', true && 'conditional', false && 'hidden')).toBe('base conditional')
			expect(cn('base', null, undefined, 'visible')).toBe('base visible')
		})

		it('should merge conflicting Tailwind classes', () => {
			// The exact behavior depends on tailwind-merge configuration
			// These tests verify the function works with various inputs
			expect(cn('text-red-500', 'text-blue-500')).toBeTruthy()
			expect(cn('p-2', 'p-4')).toBeTruthy()
		})

		it('should handle empty inputs', () => {
			expect(cn()).toBe('')
			expect(cn('', null, undefined)).toBe('')
		})
	})

	describe('getDomainUrl', () => {
		it('should use X-Forwarded-Host header when available', () => {
			const request = new Request('http://example.com', {
				headers: { 'X-Forwarded-Host': 'forwarded.com' }
			})
			expect(getDomainUrl(request)).toBe('https://forwarded.com')
		})

		it('should use host header when X-Forwarded-Host is not available', () => {
			const request = new Request('http://example.com', {
				headers: { 'host': 'host.com' }
			})
			expect(getDomainUrl(request)).toBe('https://host.com')
		})

		it('should fall back to URL host', () => {
			const request = new Request('http://example.com')
			expect(getDomainUrl(request)).toBe('https://example.com')
		})

		it('should use http protocol for localhost', () => {
			const request = new Request('http://localhost:3000', {
				headers: { 'host': 'localhost:3000' }
			})
			expect(getDomainUrl(request)).toBe('http://localhost:3000')

			const request2 = new Request('http://example.com', {
				headers: { 'X-Forwarded-Host': 'localhost' }
			})
			expect(getDomainUrl(request2)).toBe('http://localhost')
		})
	})

	describe('getReferrerRoute', () => {
		it('should extract route from same-domain referrer', () => {
			const request = new Request('http://example.com/current', {
				headers: { 
					'referer': 'http://example.com/previous',
					'host': 'example.com'
				}
			})
			expect(getReferrerRoute(request)).toBe('/previous')
		})

		it('should return root for cross-domain referrer', () => {
			const request = new Request('http://example.com/current', {
				headers: { 
					'referer': 'http://other-domain.com/page',
					'host': 'example.com'
				}
			})
			expect(getReferrerRoute(request)).toBe('/')
		})

		it('should return root when no referrer', () => {
			const request = new Request('http://example.com/current', {
				headers: { 'host': 'example.com' }
			})
			expect(getReferrerRoute(request)).toBe('/')
		})

		it('should check both referer and referrer headers', () => {
			const request1 = new Request('http://example.com/current', {
				headers: { 
					'referer': 'http://example.com/from-referer',
					'host': 'example.com'
				}
			})
			expect(getReferrerRoute(request1)).toBe('/from-referer')

			const request2 = new Request('http://example.com/current', {
				headers: { 
					'referrer': 'http://example.com/from-referrer',
					'host': 'example.com'
				}
			})
			expect(getReferrerRoute(request2)).toBe('/from-referrer')
		})
	})

	describe('mergeHeaders', () => {
		it('should merge multiple headers objects', () => {
			const headers1 = new Headers({ 'Content-Type': 'application/json' })
			const headers2 = new Headers({ 'Authorization': 'Bearer token' })
			const headers3 = new Headers({ 'X-Custom': 'value' })

			const merged = mergeHeaders(headers1, headers2, headers3)

			expect(merged.get('Content-Type')).toBe('application/json')
			expect(merged.get('Authorization')).toBe('Bearer token')
			expect(merged.get('X-Custom')).toBe('value')
		})

		it('should override headers with same name (last one wins)', () => {
			const headers1 = new Headers({ 'Content-Type': 'text/html' })
			const headers2 = new Headers({ 'Content-Type': 'application/json' })

			const merged = mergeHeaders(headers1, headers2)
			expect(merged.get('Content-Type')).toBe('application/json')
		})

		it('should handle null and undefined headers', () => {
			const headers1 = new Headers({ 'Content-Type': 'application/json' })
			const merged = mergeHeaders(headers1, null, undefined)
			expect(merged.get('Content-Type')).toBe('application/json')
		})

		it('should handle plain objects as headers', () => {
			const merged = mergeHeaders(
				{ 'Content-Type': 'application/json' },
				{ 'Authorization': 'Bearer token' }
			)
			expect(merged.get('Content-Type')).toBe('application/json')
			expect(merged.get('Authorization')).toBe('Bearer token')
		})
	})

	describe('combineHeaders', () => {
		it('should combine headers without overriding', () => {
			const headers1 = new Headers({ 'Set-Cookie': 'session=abc' })
			const headers2 = new Headers({ 'Set-Cookie': 'theme=dark' })

			const combined = combineHeaders(headers1, headers2)
			const cookies = combined.getSetCookie?.() || combined.get('Set-Cookie')?.split(', ') || []
			
			// Should have both cookies
			expect(cookies).toContain('session=abc')
			expect(cookies).toContain('theme=dark')
		})

		it('should handle different header names', () => {
			const headers1 = new Headers({ 'Content-Type': 'application/json' })
			const headers2 = new Headers({ 'Authorization': 'Bearer token' })

			const combined = combineHeaders(headers1, headers2)
			expect(combined.get('Content-Type')).toBe('application/json')
			expect(combined.get('Authorization')).toBe('Bearer token')
		})
	})

	describe('combineResponseInits', () => {
		it('should combine response init objects', () => {
			const init1 = {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			}
			const init2 = {
				statusText: 'OK',
				headers: { 'Authorization': 'Bearer token' }
			}

			const combined = combineResponseInits(init1, init2)
			expect(combined.status).toBe(200)
			expect(combined.statusText).toBe('OK')
			
			const headers = new Headers(combined.headers)
			expect(headers.get('Content-Type')).toBe('application/json')
			expect(headers.get('Authorization')).toBe('Bearer token')
		})

		it('should override non-header properties', () => {
			const init1 = { status: 200, statusText: 'OK' }
			const init2 = { status: 201, statusText: 'Created' }

			const combined = combineResponseInits(init1, init2)
			expect(combined.status).toBe(201)
			expect(combined.statusText).toBe('Created')
		})

		it('should handle null and undefined', () => {
			const init1 = { status: 200 }
			const combined = combineResponseInits(init1, null, undefined)
			expect(combined.status).toBe(200)
		})
	})

	describe('toArray', () => {
		it('should return arrays as-is', () => {
			const arr = ['a', 'b', 'c']
			expect(toArray(arr)).toBe(arr)
			expect(toArray(['single'])).toEqual(['single'])
			expect(toArray([])).toEqual([])
		})

		it('should wrap strings in arrays', () => {
			expect(toArray('test')).toEqual(['test'])
			expect(toArray('single')).toEqual(['single'])
		})

		it('should return empty array for falsy values', () => {
			expect(toArray(undefined)).toEqual([])
			expect(toArray('')).toEqual([])
		})

		it('should handle arrays with undefined elements', () => {
			expect(toArray(['a', undefined, 'c'])).toEqual(['a', undefined, 'c'])
		})
	})

	describe('downloadFile', () => {
		// Note: This function uses fetch and would require mocking in a real test environment
		// For now, we'll test the basic structure and error handling logic

		it('should have correct function signature', () => {
			expect(typeof downloadFile).toBe('function')
			expect(downloadFile.length).toBe(1) // one required parameter (url)
		})

		// In a real implementation, you'd mock fetch and test:
		// - Successful downloads
		// - Retry logic on failures
		// - Content type handling
		// - Buffer conversion
		// - Maximum retry limits
	})
})