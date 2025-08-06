import { describe, expect, it } from 'bun:test'
import { BreadcrumbHandle, BreadcrumbHandleMatch } from './breadcrumb'

describe('Breadcrumb utilities', () => {
	describe('BreadcrumbHandle schema', () => {
		it('should validate objects with breadcrumb property', () => {
			const validHandles = [
				{ breadcrumb: 'Home' },
				{ breadcrumb: 'Dashboard' },
				{ breadcrumb: 123 },
				{ breadcrumb: { name: 'Custom', icon: 'home' } },
				{ breadcrumb: null },
				{ breadcrumb: undefined },
				{ breadcrumb: [] },
				{ breadcrumb: () => 'Dynamic breadcrumb' }
			]

			validHandles.forEach(handle => {
				const result = BreadcrumbHandle.safeParse(handle)
				expect(result.success).toBe(true)
				if (result.success) {
					expect(result.data.breadcrumb).toBe(handle.breadcrumb)
				}
			})
		})

		it('should reject objects without breadcrumb property', () => {
			const invalidHandles = [
				{},
				{ title: 'Home' },
				{ name: 'Dashboard' },
				{ breadcrumbs: 'Home' }, // Wrong property name
			]

			invalidHandles.forEach(handle => {
				const result = BreadcrumbHandle.safeParse(handle)
				expect(result.success).toBe(false)
			})
		})

		it('should allow any type for breadcrumb value', () => {
			const breadcrumbValues = [
				'string',
				123,
				true,
				false,
				null,
				undefined,
				[],
				{},
				{ complex: 'object' },
				() => 'function',
				new Date(),
				/regex/,
			]

			breadcrumbValues.forEach(breadcrumbValue => {
				const handle = { breadcrumb: breadcrumbValue }
				const result = BreadcrumbHandle.safeParse(handle)
				expect(result.success).toBe(true)
				if (result.success) {
					expect(result.data.breadcrumb).toBe(breadcrumbValue)
				}
			})
		})

		it('should handle objects with additional properties', () => {
			const handleWithExtra = {
				breadcrumb: 'Home',
				title: 'Page Title',
				meta: { description: 'Page description' },
				loader: () => ({ data: 'test' })
			}

			const result = BreadcrumbHandle.safeParse(handleWithExtra)
			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.breadcrumb).toBe('Home')
				// Zod should strip unknown properties by default
				expect(result.data).toEqual({ breadcrumb: 'Home' })
			}
		})

		it('should reject non-object values', () => {
			const nonObjectValues = [
				'string',
				123,
				true,
				null,
				undefined,
				[],
				() => 'function'
			]

			nonObjectValues.forEach(value => {
				const result = BreadcrumbHandle.safeParse(value)
				expect(result.success).toBe(false)
			})
		})
	})

	describe('BreadcrumbHandleMatch schema', () => {
		it('should validate objects with handle property containing breadcrumb', () => {
			const validMatches = [
				{ handle: { breadcrumb: 'Home' } },
				{ handle: { breadcrumb: 'Dashboard' } },
				{ handle: { breadcrumb: { name: 'Custom' } } },
				{ handle: { breadcrumb: null } }
			]

			validMatches.forEach(match => {
				const result = BreadcrumbHandleMatch.safeParse(match)
				expect(result.success).toBe(true)
				if (result.success) {
					expect(result.data.handle.breadcrumb).toBe(match.handle.breadcrumb)
				}
			})
		})

		it('should reject objects without handle property', () => {
			const invalidMatches = [
				{},
				{ breadcrumb: 'Home' },
				{ handles: { breadcrumb: 'Home' } }, // Wrong property name
				{ handle: {} }, // Missing breadcrumb in handle
				{ handle: { title: 'Home' } } // Wrong property in handle
			]

			invalidMatches.forEach(match => {
				const result = BreadcrumbHandleMatch.safeParse(match)
				expect(result.success).toBe(false)
			})
		})

		it('should handle nested structure correctly', () => {
			const match = {
				handle: {
					breadcrumb: 'Products',
					meta: 'should be stripped'
				},
				pathname: '/products',
				params: { id: '123' }
			}

			const result = BreadcrumbHandleMatch.safeParse(match)
			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.handle.breadcrumb).toBe('Products')
				// Should only contain handle property
				expect(result.data).toEqual({
					handle: { breadcrumb: 'Products' }
				})
			}
		})

		it('should validate handle with complex breadcrumb objects', () => {
			const complexBreadcrumb = {
				label: 'Custom Page',
				icon: 'home',
				url: '/custom',
				children: [
					{ label: 'Subpage', url: '/custom/sub' }
				]
			}

			const match = {
				handle: { breadcrumb: complexBreadcrumb }
			}

			const result = BreadcrumbHandleMatch.safeParse(match)
			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.handle.breadcrumb).toEqual(complexBreadcrumb)
			}
		})

		it('should handle functional breadcrumbs', () => {
			const functionalBreadcrumb = (params: any) => `User ${params.id}`
			
			const match = {
				handle: { breadcrumb: functionalBreadcrumb }
			}

			const result = BreadcrumbHandleMatch.safeParse(match)
			expect(result.success).toBe(true)
			if (result.success) {
				expect(typeof result.data.handle.breadcrumb).toBe('function')
				expect(result.data.handle.breadcrumb).toBe(functionalBreadcrumb)
			}
		})
	})

	describe('Type inference', () => {
		it('should infer correct TypeScript types', () => {
			// Test that the inferred types work correctly
			const validHandle: BreadcrumbHandle = { breadcrumb: 'Test' }
			const validMatch = { handle: validHandle }

			// These should compile without type errors
			expect(validHandle.breadcrumb).toBe('Test')
			expect(validMatch.handle.breadcrumb).toBe('Test')
		})

		it('should support various breadcrumb types', () => {
			// String breadcrumb
			const stringHandle: BreadcrumbHandle = { breadcrumb: 'Home' }
			
			// Function breadcrumb
			const functionHandle: BreadcrumbHandle = { 
				breadcrumb: (params: any) => `User ${params.id}` 
			}
			
			// Object breadcrumb
			const objectHandle: BreadcrumbHandle = {
				breadcrumb: { label: 'Dashboard', icon: 'dashboard' }
			}

			// Array breadcrumb
			const arrayHandle: BreadcrumbHandle = {
				breadcrumb: ['Home', 'Products', 'Details']
			}

			// All should be valid
			expect(stringHandle.breadcrumb).toBe('Home')
			expect(typeof functionHandle.breadcrumb).toBe('function')
			expect(typeof objectHandle.breadcrumb).toBe('object')
			expect(Array.isArray(arrayHandle.breadcrumb)).toBe(true)
		})
	})

	describe('Common use cases', () => {
		it('should validate route handle exports', () => {
			// Common pattern: export const handle = { breadcrumb: 'Page Name' }
			const routeHandle = { breadcrumb: 'User Profile' }
			
			const result = BreadcrumbHandle.safeParse(routeHandle)
			expect(result.success).toBe(true)
		})

		it('should validate React Router match objects', () => {
			// Common pattern: match objects from React Router
			const routeMatch = {
				handle: { breadcrumb: 'Settings' },
				pathname: '/app/settings',
				params: {},
				data: {},
			}
			
			const result = BreadcrumbHandleMatch.safeParse(routeMatch)
			expect(result.success).toBe(true)
		})

		it('should support dynamic breadcrumbs', () => {
			// Function that returns dynamic breadcrumb based on route data
			const dynamicBreadcrumb = (match: any) => {
				return `${match.data?.user?.name || 'User'} Profile`
			}
			
			const handle = { breadcrumb: dynamicBreadcrumb }
			const result = BreadcrumbHandle.safeParse(handle)
			expect(result.success).toBe(true)
		})

		it('should support breadcrumb objects with metadata', () => {
			// Complex breadcrumb with additional metadata
			const breadcrumbWithMeta = {
				title: 'Product Details',
				path: '/products/123',
				isActive: true,
				icon: 'product',
				permissions: ['read:products']
			}
			
			const handle = { breadcrumb: breadcrumbWithMeta }
			const result = BreadcrumbHandle.safeParse(handle)
			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.breadcrumb).toEqual(breadcrumbWithMeta)
			}
		})
	})
})