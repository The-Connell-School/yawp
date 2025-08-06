import { describe, expect, it } from 'bun:test'
import { hslToHex } from './hslToHex'

describe('hslToHex function', () => {
	it('should convert basic HSL colors to hex', () => {
		// Red
		expect(hslToHex('hsl(0, 100%, 50%)')).toBe('#ff0000')
		
		// Green
		expect(hslToHex('hsl(120, 100%, 50%)')).toBe('#00ff00')
		
		// Blue
		expect(hslToHex('hsl(240, 100%, 50%)')).toBe('#0000ff')
		
		// White
		expect(hslToHex('hsl(0, 0%, 100%)')).toBe('#ffffff')
		
		// Black
		expect(hslToHex('hsl(0, 0%, 0%)')).toBe('#000000')
	})

	it('should handle HSL values without "hsl()" wrapper', () => {
		expect(hslToHex('0 100% 50%')).toBe('#ff0000')
		expect(hslToHex('120 100% 50%')).toBe('#00ff00')
		expect(hslToHex('240 100% 50%')).toBe('#0000ff')
	})

	it('should handle decimal values', () => {
		expect(hslToHex('hsl(0.5, 100%, 50%)')).toBe('#ff0000')
		expect(hslToHex('hsl(120.7, 100%, 50%)')).toBe('#00ff00')
		expect(hslToHex('hsl(240.9, 100%, 50%)')).toBe('#0000ff')
	})

	it('should convert intermediate colors correctly', () => {
		// Yellow (60 degrees)
		expect(hslToHex('hsl(60, 100%, 50%)')).toBe('#ffff00')
		
		// Cyan (180 degrees)
		expect(hslToHex('hsl(180, 100%, 50%)')).toBe('#00ffff')
		
		// Magenta (300 degrees)
		expect(hslToHex('hsl(300, 100%, 50%)')).toBe('#ff00ff')
	})

	it('should handle different saturation levels', () => {
		// Red with 0% saturation (gray)
		expect(hslToHex('hsl(0, 0%, 50%)')).toBe('#808080')
		
		// Red with 50% saturation
		expect(hslToHex('hsl(0, 50%, 50%)')).toBe('#bf4040')
		
		// Blue with 25% saturation
		expect(hslToHex('hsl(240, 25%, 50%)')).toBe('#606080')
	})

	it('should handle different lightness levels', () => {
		// Red with 25% lightness (dark red)
		expect(hslToHex('hsl(0, 100%, 25%)')).toBe('#800000')
		
		// Red with 75% lightness (light red)
		expect(hslToHex('hsl(0, 100%, 75%)')).toBe('#ff8080')
		
		// Blue with 25% lightness
		expect(hslToHex('hsl(240, 100%, 25%)')).toBe('#000080')
	})

	it('should handle edge cases and invalid values', () => {
		// Empty or invalid strings should return black or handle gracefully
		expect(hslToHex('')).toBe('#000000')
		expect(hslToHex('invalid')).toBe('#000000')
		expect(hslToHex('hsl()')).toBe('#000000')
	})

	it('should handle values outside normal ranges', () => {
		// Hue values over 360 should wrap around
		expect(hslToHex('hsl(420, 100%, 50%)')).toBe('#ffff00') // 420 - 360 = 60 (yellow)
		
		// Negative hue values
		expect(hslToHex('hsl(-60, 100%, 50%)')).toBe('#ff00ff') // -60 + 360 = 300 (magenta)
	})

	it('should produce consistent hex format', () => {
		const results = [
			hslToHex('hsl(0, 100%, 50%)'),
			hslToHex('hsl(120, 100%, 50%)'),
			hslToHex('hsl(240, 100%, 50%)'),
			hslToHex('hsl(0, 0%, 50%)'),
		]

		results.forEach(result => {
			// Should start with #
			expect(result).toMatch(/^#/)
			// Should be exactly 7 characters long
			expect(result).toHaveLength(7)
			// Should only contain valid hex characters
			expect(result).toMatch(/^#[0-9a-f]{6}$/)
		})
	})

	it('should handle specific common colors', () => {
		// Orange
		expect(hslToHex('hsl(30, 100%, 50%)')).toBe('#ff8000')
		
		// Purple
		expect(hslToHex('hsl(270, 100%, 50%)')).toBe('#8000ff')
		
		// Light gray
		expect(hslToHex('hsl(0, 0%, 75%)')).toBe('#bfbfbf')
		
		// Dark gray
		expect(hslToHex('hsl(0, 0%, 25%)')).toBe('#404040')
	})
})