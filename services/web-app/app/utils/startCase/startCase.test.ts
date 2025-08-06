import { describe, expect, it } from 'bun:test'
import { startCase } from './startCase'

describe('startCase function', () => {
	it('should convert camelCase to Start Case', () => {
		expect(startCase('firstName')).toBe('First Name')
		expect(startCase('lastName')).toBe('Last Name')
		expect(startCase('userId')).toBe('User Id')
	})

	it('should convert snake_case to Start Case', () => {
		expect(startCase('first_name')).toBe('First Name')
		expect(startCase('last_name')).toBe('Last Name')
		expect(startCase('user_id')).toBe('User Id')
	})

	it('should convert kebab-case to Start Case', () => {
		expect(startCase('first-name')).toBe('First Name')
		expect(startCase('last-name')).toBe('Last Name')
		expect(startCase('user-id')).toBe('User Id')
	})

	it('should handle mixed cases and separators', () => {
		expect(startCase('firstName_last-Name')).toBe('First Name Last Name')
		expect(startCase('user_ID-number')).toBe('User Id Number')
	})

	it('should handle strings with spaces', () => {
		expect(startCase('first name')).toBe('First Name')
		expect(startCase('   first   name   ')).toBe('First Name')
	})

	it('should handle all uppercase strings', () => {
		expect(startCase('FIRSTNAME')).toBe('Firstname')
		expect(startCase('USER_NAME')).toBe('User Name')
	})

	it('should handle all lowercase strings', () => {
		expect(startCase('firstname')).toBe('Firstname')
		expect(startCase('username')).toBe('Username')
	})

	it('should handle strings with multiple separators', () => {
		expect(startCase('first--name__user---id')).toBe('First Name User Id')
		expect(startCase('a_b-c d__e')).toBe('A B C D E')
	})

	it('should handle empty and single character strings', () => {
		expect(startCase('')).toBe('')
		expect(startCase('a')).toBe('A')
		expect(startCase('A')).toBe('A')
	})

	it('should collapse multiple spaces', () => {
		expect(startCase('first    name')).toBe('First Name')
		expect(startCase('user   -   name')).toBe('User Name')
	})

	it('should handle complex mixed format strings', () => {
		expect(startCase('getUserProfileData')).toBe('Get User Profile Data')
		expect(startCase('user_profile-dataID')).toBe('User Profile Data Id')
		expect(startCase('API_KEY-valueConfig')).toBe('Api Key Value Config')
	})
})