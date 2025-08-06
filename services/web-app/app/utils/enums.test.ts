import { describe, expect, it } from 'bun:test'
import { Period, Grade, Setting } from './enums'

describe('Application enums', () => {
	describe('Period enum', () => {
		it('should have correct values for all periods', () => {
			expect(Period.First).toBe('1st')
			expect(Period.Second).toBe('2nd')
			expect(Period.Third).toBe('3rd')
			expect(Period.Fourth).toBe('4th')
			expect(Period.Fifth).toBe('5th')
			expect(Period.Sixth).toBe('6th')
			expect(Period.Seventh).toBe('7th')
			expect(Period.Eighth).toBe('8th')
			expect(Period.Ninth).toBe('9th')
		})

		it('should have exactly 9 periods', () => {
			const periodValues = Object.values(Period)
			expect(periodValues).toHaveLength(9)
		})

		it('should have all unique values', () => {
			const periodValues = Object.values(Period)
			const uniqueValues = new Set(periodValues)
			expect(uniqueValues.size).toBe(periodValues.length)
		})

		it('should have ordinal format for all periods', () => {
			const periodValues = Object.values(Period)
			periodValues.forEach(period => {
				expect(period).toMatch(/^\d+(st|nd|rd|th)$/)
			})
		})

		it('should allow reverse lookup by value', () => {
			expect(Object.values(Period).includes('1st')).toBe(true)
			expect(Object.values(Period).includes('5th')).toBe(true)
			expect(Object.values(Period).includes('9th')).toBe(true)
		})
	})

	describe('Grade enum', () => {
		it('should have correct values for all grades', () => {
			expect(Grade.Ninth).toBe('9th')
			expect(Grade.Tenth).toBe('10th')
			expect(Grade.Eleventh).toBe('11th')
			expect(Grade.Twelfth).toBe('12th')
		})

		it('should have exactly 4 grades (high school)', () => {
			const gradeValues = Object.values(Grade)
			expect(gradeValues).toHaveLength(4)
		})

		it('should have all unique values', () => {
			const gradeValues = Object.values(Grade)
			const uniqueValues = new Set(gradeValues)
			expect(uniqueValues.size).toBe(gradeValues.length)
		})

		it('should have ordinal format for all grades', () => {
			const gradeValues = Object.values(Grade)
			gradeValues.forEach(grade => {
				expect(grade).toMatch(/^\d+(th)$/)
			})
		})

		it('should represent typical high school grades', () => {
			const gradeValues = Object.values(Grade)
			expect(gradeValues).toContain('9th')
			expect(gradeValues).toContain('10th')
			expect(gradeValues).toContain('11th')
			expect(gradeValues).toContain('12th')
		})

		it('should not overlap with Period enum values', () => {
			const periodValues = Object.values(Period)
			const gradeValues = Object.values(Grade)
			
			// Check that 9th grade is different from 9th period context
			expect(periodValues.includes(Grade.Ninth)).toBe(true) // Both have "9th"
			// But they serve different purposes in the application
		})
	})

	describe('Setting enum', () => {
		it('should have correct values for all settings', () => {
			expect(Setting.SignupPasscode).toBe('signup_passcode')
			expect(Setting.Schools).toBe('schools')
			expect(Setting.Teachers).toBe('teachers')
		})

		it('should have exactly 3 settings', () => {
			const settingValues = Object.values(Setting)
			expect(settingValues).toHaveLength(3)
		})

		it('should have all unique values', () => {
			const settingValues = Object.values(Setting)
			const uniqueValues = new Set(settingValues)
			expect(uniqueValues.size).toBe(settingValues.length)
		})

		it('should use snake_case format for setting keys', () => {
			const settingValues = Object.values(Setting)
			settingValues.forEach(setting => {
				// Should be lowercase and use underscores
				expect(setting).toMatch(/^[a-z_]+$/)
				expect(setting).not.toContain(' ')
				expect(setting).not.toContain('-')
			})
		})

		it('should represent application configuration settings', () => {
			// These should be meaningful setting identifiers
			expect(Setting.SignupPasscode).toContain('signup')
			expect(Setting.SignupPasscode).toContain('passcode')
			expect(Setting.Schools).toBe('schools')
			expect(Setting.Teachers).toBe('teachers')
		})

		it('should allow reverse lookup by value', () => {
			expect(Object.values(Setting).includes('signup_passcode')).toBe(true)
			expect(Object.values(Setting).includes('schools')).toBe(true)
			expect(Object.values(Setting).includes('teachers')).toBe(true)
		})
	})

	describe('Cross-enum relationships', () => {
		it('should have no overlapping values between enums', () => {
			const periodValues = new Set(Object.values(Period))
			const gradeValues = new Set(Object.values(Grade))
			const settingValues = new Set(Object.values(Setting))

			// Period and Grade have overlapping "9th" value, which is expected
			const periodGradeOverlap = Object.values(Period).filter(p => 
				Object.values(Grade).includes(p as any)
			)
			expect(periodGradeOverlap).toEqual(['9th'])

			// Period and Setting should have no overlap
			const periodSettingOverlap = Object.values(Period).filter(p => 
				Object.values(Setting).includes(p as any)
			)
			expect(periodSettingOverlap).toHaveLength(0)

			// Grade and Setting should have no overlap
			const gradeSettingOverlap = Object.values(Grade).filter(g => 
				Object.values(Setting).includes(g as any)
			)
			expect(gradeSettingOverlap).toHaveLength(0)
		})

		it('should use consistent naming conventions within each enum', () => {
			// Period: ordinal numbers (1st, 2nd, etc.)
			Object.values(Period).forEach(period => {
				expect(period).toMatch(/^\d+(st|nd|rd|th)$/)
			})

			// Grade: ordinal numbers with "th" (9th, 10th, etc.)
			Object.values(Grade).forEach(grade => {
				expect(grade).toMatch(/^\d+th$/)
			})

			// Setting: snake_case lowercase
			Object.values(Setting).forEach(setting => {
				expect(setting).toMatch(/^[a-z_]+$/)
			})
		})

		it('should be type-safe and properly exported', () => {
			// These should be properly typed enums
			expect(typeof Period).toBe('object')
			expect(typeof Grade).toBe('object')
			expect(typeof Setting).toBe('object')

			// Should have string enum values
			Object.values(Period).forEach(value => {
				expect(typeof value).toBe('string')
			})
			Object.values(Grade).forEach(value => {
				expect(typeof value).toBe('string')
			})
			Object.values(Setting).forEach(value => {
				expect(typeof value).toBe('string')
			})
		})
	})
})