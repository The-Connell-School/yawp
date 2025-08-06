import { describe, expect, it, jest } from 'bun:test'
import { timeAgo } from './timeAgo'

describe('timeAgo function', () => {
	const mockDate = new Date('2023-12-01T10:00:00Z')

	it('should return "< a minute ago" for times less than 60 seconds ago', () => {
		jest.spyOn(Date, 'now').mockReturnValue(mockDate.getTime() + 30 * 1000) // 30 seconds later
		expect(timeAgo(mockDate)).toBe('< a minute ago')
		expect(timeAgo(mockDate.toISOString())).toBe('< a minute ago')
	})

	it('should return "X minute(s) ago" for times less than an hour ago', () => {
		jest.spyOn(Date, 'now').mockReturnValue(mockDate.getTime() + 5 * 60 * 1000) // 5 minutes later
		expect(timeAgo(mockDate)).toBe('5 minutes ago')
		
		jest.spyOn(Date, 'now').mockReturnValue(mockDate.getTime() + 1 * 60 * 1000) // 1 minute later
		expect(timeAgo(mockDate)).toBe('1 minute ago')
	})

	it('should return "X hour(s) ago" for times less than a day ago', () => {
		jest.spyOn(Date, 'now').mockReturnValue(mockDate.getTime() + 3 * 60 * 60 * 1000) // 3 hours later
		expect(timeAgo(mockDate)).toBe('3 hours ago')
		
		jest.spyOn(Date, 'now').mockReturnValue(mockDate.getTime() + 1 * 60 * 60 * 1000) // 1 hour later
		expect(timeAgo(mockDate)).toBe('1 hour ago')
	})

	it('should return "X day(s) ago" for times less than a week ago', () => {
		jest.spyOn(Date, 'now').mockReturnValue(mockDate.getTime() + 3 * 24 * 60 * 60 * 1000) // 3 days later
		expect(timeAgo(mockDate)).toBe('3 days ago')
		
		jest.spyOn(Date, 'now').mockReturnValue(mockDate.getTime() + 1 * 24 * 60 * 60 * 1000) // 1 day later
		expect(timeAgo(mockDate)).toBe('1 day ago')
	})

	it('should return "X week(s) ago" for times less than a month ago', () => {
		jest.spyOn(Date, 'now').mockReturnValue(mockDate.getTime() + 2 * 7 * 24 * 60 * 60 * 1000) // 2 weeks later
		expect(timeAgo(mockDate)).toBe('2 weeks ago')
		
		jest.spyOn(Date, 'now').mockReturnValue(mockDate.getTime() + 1 * 7 * 24 * 60 * 60 * 1000) // 1 week later
		expect(timeAgo(mockDate)).toBe('1 week ago')
	})

	it('should return "X month(s) ago" for times less than a year ago', () => {
		jest.spyOn(Date, 'now').mockReturnValue(mockDate.getTime() + 6 * 30 * 24 * 60 * 60 * 1000) // ~6 months later
		expect(timeAgo(mockDate)).toBe('6 months ago')
		
		jest.spyOn(Date, 'now').mockReturnValue(mockDate.getTime() + 1 * 30 * 24 * 60 * 60 * 1000) // ~1 month later
		expect(timeAgo(mockDate)).toBe('1 month ago')
	})

	it('should return "X year(s) ago" for times more than a year ago', () => {
		jest.spyOn(Date, 'now').mockReturnValue(mockDate.getTime() + 2 * 365 * 24 * 60 * 60 * 1000) // ~2 years later
		expect(timeAgo(mockDate)).toBe('2 years ago')
		
		jest.spyOn(Date, 'now').mockReturnValue(mockDate.getTime() + 1 * 365 * 24 * 60 * 60 * 1000) // ~1 year later
		expect(timeAgo(mockDate)).toBe('1 year ago')
	})

	it('should handle string input correctly', () => {
		jest.spyOn(Date, 'now').mockReturnValue(mockDate.getTime() + 5 * 60 * 1000) // 5 minutes later
		expect(timeAgo('2023-12-01T10:00:00Z')).toBe('5 minutes ago')
	})
})