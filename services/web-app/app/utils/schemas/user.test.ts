import { describe, expect, it } from 'bun:test'
import { 
	PasswordSchema, 
	NameSchema, 
	EmailSchema, 
	PasswordAndConfirmPasswordSchema 
} from './user'

describe('User validation schemas', () => {
	describe('PasswordSchema', () => {
		it('should accept valid passwords', () => {
			const validPasswords = [
				'password123',
				'StrongP@ss1',
				'123456789',
				'a'.repeat(100), // Max length
			]

			validPasswords.forEach(password => {
				const result = PasswordSchema.safeParse(password)
				expect(result.success).toBe(true)
			})
		})

		it('should reject passwords that are too short', () => {
			const shortPasswords = ['', 'a', '12', '123', '1234', '12345']

			shortPasswords.forEach(password => {
				const result = PasswordSchema.safeParse(password)
				expect(result.success).toBe(false)
				if (!result.success) {
					expect(result.error.errors[0].message).toBe('Password is too short')
				}
			})
		})

		it('should reject passwords that are too long', () => {
			const longPassword = 'a'.repeat(101)
			const result = PasswordSchema.safeParse(longPassword)
			expect(result.success).toBe(false)
			if (!result.success) {
				expect(result.error.errors[0].message).toBe('Password is too long')
			}
		})

		it('should require password field', () => {
			const result = PasswordSchema.safeParse(undefined)
			expect(result.success).toBe(false)
			if (!result.success) {
				expect(result.error.errors[0].message).toBe('Password is required')
			}
		})
	})

	describe('NameSchema', () => {
		it('should accept valid names', () => {
			const validNames = [
				'John',
				'Jane Doe',
				'John-Paul',
				"O'Connor",
				'José María',
				'a'.repeat(40), // Max length
			]

			validNames.forEach(name => {
				const result = NameSchema.safeParse(name)
				expect(result.success).toBe(true)
			})
		})

		it('should reject names that are too short', () => {
			const shortNames = ['', 'a', 'ab']

			shortNames.forEach(name => {
				const result = NameSchema.safeParse(name)
				expect(result.success).toBe(false)
				if (!result.success) {
					expect(result.error.errors[0].message).toBe('Name is too short')
				}
			})
		})

		it('should reject names that are too long', () => {
			const longName = 'a'.repeat(41)
			const result = NameSchema.safeParse(longName)
			expect(result.success).toBe(false)
			if (!result.success) {
				expect(result.error.errors[0].message).toBe('Name is too long')
			}
		})

		it('should require name field', () => {
			const result = NameSchema.safeParse(undefined)
			expect(result.success).toBe(false)
			if (!result.success) {
				expect(result.error.errors[0].message).toBe('Name is required')
			}
		})
	})

	describe('EmailSchema', () => {
		it('should accept valid emails', () => {
			const validEmails = [
				'test@example.com',
				'user.name@domain.co.uk',
				'user+tag@example.org',
				'user123@test-domain.com',
				'a@b.co',
			]

			validEmails.forEach(email => {
				const result = EmailSchema.safeParse(email)
				expect(result.success).toBe(true)
				if (result.success) {
					// Should transform to lowercase
					expect(result.data).toBe(email.toLowerCase())
				}
			})
		})

		it('should transform emails to lowercase', () => {
			const mixedCaseEmails = [
				'TEST@EXAMPLE.COM',
				'User.Name@Domain.CO.UK',
				'USER+TAG@EXAMPLE.ORG',
			]

			mixedCaseEmails.forEach(email => {
				const result = EmailSchema.safeParse(email)
				expect(result.success).toBe(true)
				if (result.success) {
					expect(result.data).toBe(email.toLowerCase())
				}
			})
		})

		it('should reject invalid email formats', () => {
			const invalidEmails = [
				'invalid',
				'@example.com',
				'user@',
				'user..name@example.com',
				'user name@example.com',
				'user@exam ple.com',
				'',
			]

			invalidEmails.forEach(email => {
				const result = EmailSchema.safeParse(email)
				expect(result.success).toBe(false)
				if (!result.success) {
					expect(result.error.errors[0].message).toBe('Email is invalid')
				}
			})
		})

		it('should reject emails that are too short', () => {
			const shortEmails = ['a@b', 'ab']

			shortEmails.forEach(email => {
				const result = EmailSchema.safeParse(email)
				expect(result.success).toBe(false)
				if (!result.success) {
					const messages = result.error.errors.map(e => e.message)
					expect(messages).toContain('Email is too short')
				}
			})
		})

		it('should reject emails that are too long', () => {
			const longEmail = 'a'.repeat(90) + '@example.com'
			const result = EmailSchema.safeParse(longEmail)
			expect(result.success).toBe(false)
			if (!result.success) {
				expect(result.error.errors[0].message).toBe('Email is too long')
			}
		})

		it('should require email field', () => {
			const result = EmailSchema.safeParse(undefined)
			expect(result.success).toBe(false)
			if (!result.success) {
				expect(result.error.errors[0].message).toBe('Email is required')
			}
		})
	})

	describe('PasswordAndConfirmPasswordSchema', () => {
		it('should accept matching passwords', () => {
			const validData = {
				password: 'password123',
				confirmPassword: 'password123',
			}

			const result = PasswordAndConfirmPasswordSchema.safeParse(validData)
			expect(result.success).toBe(true)
		})

		it('should reject non-matching passwords', () => {
			const invalidData = {
				password: 'password123',
				confirmPassword: 'different123',
			}

			const result = PasswordAndConfirmPasswordSchema.safeParse(invalidData)
			expect(result.success).toBe(false)
			if (!result.success) {
				const confirmPasswordError = result.error.errors.find(
					e => e.path.includes('confirmPassword')
				)
				expect(confirmPasswordError?.message).toBe('The passwords must match')
			}
		})

		it('should validate both password fields independently', () => {
			const invalidData = {
				password: 'short', // Too short
				confirmPassword: 'short', // Too short but matches
			}

			const result = PasswordAndConfirmPasswordSchema.safeParse(invalidData)
			expect(result.success).toBe(false)
			if (!result.success) {
				const passwordErrors = result.error.errors.filter(
					e => e.message === 'Password is too short'
				)
				expect(passwordErrors).toHaveLength(2) // Both password fields should fail
			}
		})

		it('should handle empty confirmPassword', () => {
			const invalidData = {
				password: 'password123',
				confirmPassword: '',
			}

			const result = PasswordAndConfirmPasswordSchema.safeParse(invalidData)
			expect(result.success).toBe(false)
			if (!result.success) {
				const errors = result.error.errors.map(e => e.message)
				expect(errors).toContain('Password is too short')
				expect(errors).toContain('The passwords must match')
			}
		})

		it('should handle missing fields', () => {
			const result1 = PasswordAndConfirmPasswordSchema.safeParse({})
			expect(result1.success).toBe(false)

			const result2 = PasswordAndConfirmPasswordSchema.safeParse({
				password: 'password123'
			})
			expect(result2.success).toBe(false)

			const result3 = PasswordAndConfirmPasswordSchema.safeParse({
				confirmPassword: 'password123'
			})
			expect(result3.success).toBe(false)
		})

		it('should handle edge case with identical invalid passwords', () => {
			const invalidData = {
				password: 'a'.repeat(101), // Too long
				confirmPassword: 'a'.repeat(101), // Too long but matches
			}

			const result = PasswordAndConfirmPasswordSchema.safeParse(invalidData)
			expect(result.success).toBe(false)
			if (!result.success) {
				const longPasswordErrors = result.error.errors.filter(
					e => e.message === 'Password is too long'
				)
				expect(longPasswordErrors).toHaveLength(2)
				
				// Should not have matching error since they technically match
				const matchErrors = result.error.errors.filter(
					e => e.message === 'The passwords must match'
				)
				expect(matchErrors).toHaveLength(0)
			}
		})
	})
})