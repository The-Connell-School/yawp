import { describe, expect, it } from 'bun:test'
import { getRedirectToUrl } from './utils'

describe('Auth verification utilities', () => {
	describe('getRedirectToUrl', () => {
		it('should create correct verification URL with required parameters', () => {
			const request = new Request('http://example.com/test')
			const result = getRedirectToUrl({
				request,
				type: 'organization-teacher-invite',
				target: 'test@example.com'
			})

			expect(result.pathname).toBe('/auth/verify')
			expect(result.searchParams.get('type')).toBe('organization-teacher-invite')
			expect(result.searchParams.get('target')).toBe('test@example.com')
			expect(result.searchParams.has('redirectTo')).toBe(false)
		})

		it('should include redirectTo parameter when provided', () => {
			const request = new Request('http://example.com/test')
			const result = getRedirectToUrl({
				request,
				type: 'organization-student-invite',
				target: 'student@example.com',
				redirectTo: '/app/dashboard'
			})

			expect(result.pathname).toBe('/auth/verify')
			expect(result.searchParams.get('type')).toBe('organization-student-invite')
			expect(result.searchParams.get('target')).toBe('student@example.com')
			expect(result.searchParams.get('redirectTo')).toBe('/app/dashboard')
		})

		it('should handle different verification types', () => {
			const request = new Request('http://example.com/test')
			const types = [
				'organization-teacher-invite',
				'organization-student-invite',
				'organization-owner-invite'
			] as const

			types.forEach(type => {
				const result = getRedirectToUrl({
					request,
					type,
					target: 'user@example.com'
				})

				expect(result.searchParams.get('type')).toBe(type)
			})
		})

		it('should use correct domain from request', () => {
			const request1 = new Request('http://localhost:3000/test')
			const result1 = getRedirectToUrl({
				request: request1,
				type: 'organization-teacher-invite',
				target: 'test@example.com'
			})
			expect(result1.origin).toBe('http://localhost:3000')

			const request2 = new Request('https://production.com/test')
			const result2 = getRedirectToUrl({
				request: request2,
				type: 'organization-teacher-invite',
				target: 'test@example.com'
			})
			expect(result2.origin).toBe('https://production.com')
		})

		it('should handle special characters in target email', () => {
			const request = new Request('http://example.com/test')
			const emailsWithSpecialChars = [
				'user+tag@example.com',
				'user.name@example.com',
				'user_name@example.com',
				'user-name@example.com'
			]

			emailsWithSpecialChars.forEach(email => {
				const result = getRedirectToUrl({
					request,
					type: 'organization-teacher-invite',
					target: email
				})

				expect(result.searchParams.get('target')).toBe(email)
			})
		})

		it('should handle redirectTo with query parameters', () => {
			const request = new Request('http://example.com/test')
			const redirectToWithQuery = '/app/dashboard?tab=profile&view=edit'
			
			const result = getRedirectToUrl({
				request,
				type: 'organization-owner-invite',
				target: 'owner@example.com',
				redirectTo: redirectToWithQuery
			})

			expect(result.searchParams.get('redirectTo')).toBe(redirectToWithQuery)
		})

		it('should handle empty target gracefully', () => {
			const request = new Request('http://example.com/test')
			
			const result = getRedirectToUrl({
				request,
				type: 'organization-teacher-invite',
				target: ''
			})

			expect(result.searchParams.get('target')).toBe('')
			expect(result.pathname).toBe('/auth/verify')
		})

		it('should create URL with HTTPS for non-localhost domains', () => {
			const request = new Request('http://example.com/test', {
				headers: { 'host': 'production.example.com' }
			})
			
			const result = getRedirectToUrl({
				request,
				type: 'organization-student-invite',
				target: 'test@example.com'
			})

			// The getDomainUrl function should use HTTPS for non-localhost
			expect(result.protocol).toBe('https:')
		})

		it('should preserve HTTP for localhost', () => {
			const request = new Request('http://localhost:3000/test', {
				headers: { 'host': 'localhost:3000' }
			})
			
			const result = getRedirectToUrl({
				request,
				type: 'organization-teacher-invite',
				target: 'test@example.com'
			})

			expect(result.protocol).toBe('http:')
			expect(result.hostname).toBe('localhost')
		})

		it('should handle X-Forwarded-Host header', () => {
			const request = new Request('http://internal.example.com/test', {
				headers: { 'X-Forwarded-Host': 'public.example.com' }
			})
			
			const result = getRedirectToUrl({
				request,
				type: 'organization-owner-invite',
				target: 'test@example.com'
			})

			expect(result.hostname).toBe('public.example.com')
		})

		it('should create valid URL that can be used in redirects', () => {
			const request = new Request('http://example.com/test')
			
			const result = getRedirectToUrl({
				request,
				type: 'organization-teacher-invite',
				target: 'teacher@example.com',
				redirectTo: '/app/courses'
			})

			// Should be a valid URL that can be used in a Response redirect
			expect(() => new URL(result.toString())).not.toThrow()
			expect(result.toString()).toContain('/auth/verify')
			expect(result.toString()).toContain('type=organization-teacher-invite')
			expect(result.toString()).toContain('target=teacher%40example.com')
			expect(result.toString()).toContain('redirectTo=%2Fapp%2Fcourses')
		})

		it('should properly encode URL parameters', () => {
			const request = new Request('http://example.com/test')
			const targetWithSpaces = 'test user@example.com'
			const redirectToWithSpaces = '/app/path with spaces'
			
			const result = getRedirectToUrl({
				request,
				type: 'organization-student-invite',
				target: targetWithSpaces,
				redirectTo: redirectToWithSpaces
			})

			// Parameters should be properly encoded in the URL
			expect(result.searchParams.get('target')).toBe(targetWithSpaces)
			expect(result.searchParams.get('redirectTo')).toBe(redirectToWithSpaces)
		})
	})
})