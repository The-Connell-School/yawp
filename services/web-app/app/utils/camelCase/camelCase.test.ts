import { describe, expect, it } from 'bun:test'
import { camelCase } from './camelCase'

describe('camelCase function', () => {
	it('should convert kebab-case to camelCase', () => {
		expect(camelCase('hello-world')).toBe('helloWorld')
		expect(camelCase('user-name')).toBe('userName')
		expect(camelCase('first-name-last-name')).toBe('firstNameLastName')
	})

	it('should convert space-separated words to camelCase', () => {
		expect(camelCase('Hello World')).toBe('helloWorld')
		expect(camelCase('user name')).toBe('userName')
		expect(camelCase('First Name Last Name')).toBe('firstNameLastName')
	})

	it('should convert single words to lowercase', () => {
		expect(camelCase('Hello')).toBe('hello')
		expect(camelCase('WORLD')).toBe('world')
		expect(camelCase('UserName')).toBe('username')
	})

	it('should handle mixed separators', () => {
		expect(camelCase('hello-world test')).toBe('helloWorldTest')
		expect(camelCase('user-name id')).toBe('userNameId')
		expect(camelCase('first-name last name')).toBe('firstNameLastName')
	})

	it('should handle multiple spaces and hyphens', () => {
		expect(camelCase('hello   world')).toBe('helloWorld')
		expect(camelCase('user---name')).toBe('userName')
		expect(camelCase('first--name  last---name')).toBe('firstNameLastName')
	})

	it('should handle leading and trailing whitespace', () => {
		expect(camelCase('  hello world  ')).toBe('helloWorld')
		expect(camelCase('   user-name   ')).toBe('userName')
	})

	it('should handle empty strings and single characters', () => {
		expect(camelCase('')).toBe('')
		expect(camelCase('a')).toBe('a')
		expect(camelCase('A')).toBe('a')
		expect(camelCase('-')).toBe('')
		expect(camelCase(' ')).toBe('')
	})

	it('should handle strings that are already camelCase', () => {
		expect(camelCase('helloWorld')).toBe('helloworld')
		expect(camelCase('userName')).toBe('username')
		expect(camelCase('firstName')).toBe('firstname')
	})

	it('should handle complex mixed format strings', () => {
		expect(camelCase('get-user Profile Data')).toBe('getUserProfileData')
		expect(camelCase('API Key-value Config')).toBe('apiKeyValueConfig')
		expect(camelCase('user--profile-data ID')).toBe('userProfileDataId')
	})

	it('should handle strings with numbers', () => {
		expect(camelCase('user-id-123')).toBe('userId123')
		expect(camelCase('test 2 name')).toBe('test2Name')
		expect(camelCase('v1-api-key')).toBe('v1ApiKey')
	})

	it('should handle special edge cases', () => {
		expect(camelCase('- -')).toBe('')
		expect(camelCase('a-b-c')).toBe('aBC')
		expect(camelCase('x y z')).toBe('xYZ')
	})
})