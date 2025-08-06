import { describe, expect, it } from 'bun:test'
import pluralize from './pluralize'

describe('pluralize function', () => {
	describe('main pluralize function', () => {
		it('should pluralize words when count > 1', () => {
			expect(pluralize({ word: 'cat', count: 2 })).toBe('cats')
			expect(pluralize({ word: 'dog', count: 5 })).toBe('dogs')
			expect(pluralize({ word: 'child', count: 3 })).toBe('children')
		})

		it('should singularize words when count = 1', () => {
			expect(pluralize({ word: 'cats', count: 1 })).toBe('cat')
			expect(pluralize({ word: 'dogs', count: 1 })).toBe('dog')
			expect(pluralize({ word: 'children', count: 1 })).toBe('child')
		})

		it('should include count when inclusive is true', () => {
			expect(pluralize({ word: 'cat', count: 1, inclusive: true })).toBe('1 cat')
			expect(pluralize({ word: 'cat', count: 2, inclusive: true })).toBe('2 cats')
			expect(pluralize({ word: 'dog', count: 0, inclusive: true })).toBe('0 dogs')
		})

		it('should not include count when inclusive is false or undefined', () => {
			expect(pluralize({ word: 'cat', count: 1 })).toBe('cat')
			expect(pluralize({ word: 'cat', count: 2 })).toBe('cats')
			expect(pluralize({ word: 'cat', count: 1, inclusive: false })).toBe('cat')
		})

		it('should handle zero count as plural', () => {
			expect(pluralize({ word: 'cat', count: 0 })).toBe('cats')
			expect(pluralize({ word: 'child', count: 0 })).toBe('children')
		})
	})

	describe('pluralize.plural', () => {
		it('should handle regular plurals', () => {
			expect(pluralize.plural('cat')).toBe('cats')
			expect(pluralize.plural('dog')).toBe('dogs')
			expect(pluralize.plural('house')).toBe('houses')
			expect(pluralize.plural('book')).toBe('books')
		})

		it('should handle words ending in s, x, z, ch, sh', () => {
			expect(pluralize.plural('bus')).toBe('buses')
			expect(pluralize.plural('box')).toBe('boxes')
			expect(pluralize.plural('buzz')).toBe('buzzes')
			expect(pluralize.plural('church')).toBe('churches')
			expect(pluralize.plural('dish')).toBe('dishes')
		})

		it('should handle words ending in y', () => {
			expect(pluralize.plural('city')).toBe('cities')
			expect(pluralize.plural('baby')).toBe('babies')
			expect(pluralize.plural('key')).toBe('keys') // vowel before y
			expect(pluralize.plural('toy')).toBe('toys') // vowel before y
		})

		it('should handle words ending in f or fe', () => {
			expect(pluralize.plural('knife')).toBe('knives')
			expect(pluralize.plural('leaf')).toBe('leaves')
			expect(pluralize.plural('wolf')).toBe('wolves')
			expect(pluralize.plural('life')).toBe('lives')
		})

		it('should handle irregular plurals', () => {
			expect(pluralize.plural('child')).toBe('children')
			expect(pluralize.plural('foot')).toBe('feet')
			expect(pluralize.plural('tooth')).toBe('teeth')
			expect(pluralize.plural('goose')).toBe('geese')
			expect(pluralize.plural('man')).toBe('men')
			expect(pluralize.plural('woman')).toBe('women')
			expect(pluralize.plural('mouse')).toBe('mice')
			expect(pluralize.plural('ox')).toBe('oxen')
		})

		it('should handle uncountable words', () => {
			expect(pluralize.plural('sheep')).toBe('sheep')
			expect(pluralize.plural('fish')).toBe('fish')
			expect(pluralize.plural('deer')).toBe('deer')
			expect(pluralize.plural('information')).toBe('information')
			expect(pluralize.plural('water')).toBe('water')
		})

		it('should preserve case', () => {
			expect(pluralize.plural('Cat')).toBe('Cats')
			expect(pluralize.plural('HOUSE')).toBe('HOUSES')
			expect(pluralize.plural('Child')).toBe('Children')
		})
	})

	describe('pluralize.singular', () => {
		it('should handle regular singulars', () => {
			expect(pluralize.singular('cats')).toBe('cat')
			expect(pluralize.singular('dogs')).toBe('dog')
			expect(pluralize.singular('houses')).toBe('house')
			expect(pluralize.singular('books')).toBe('book')
		})

		it('should handle words ending in ies', () => {
			expect(pluralize.singular('cities')).toBe('city')
			expect(pluralize.singular('babies')).toBe('baby')
			expect(pluralize.singular('stories')).toBe('story')
		})

		it('should handle words ending in ves', () => {
			expect(pluralize.singular('knives')).toBe('knife')
			expect(pluralize.singular('leaves')).toBe('leaf')
			expect(pluralize.singular('wolves')).toBe('wolf')
			expect(pluralize.singular('lives')).toBe('life')
		})

		it('should handle irregular singulars', () => {
			expect(pluralize.singular('children')).toBe('child')
			expect(pluralize.singular('feet')).toBe('foot')
			expect(pluralize.singular('teeth')).toBe('tooth')
			expect(pluralize.singular('geese')).toBe('goose')
			expect(pluralize.singular('men')).toBe('man')
			expect(pluralize.singular('women')).toBe('woman')
			expect(pluralize.singular('mice')).toBe('mouse')
			expect(pluralize.singular('oxen')).toBe('ox')
		})

		it('should handle uncountable words', () => {
			expect(pluralize.singular('sheep')).toBe('sheep')
			expect(pluralize.singular('fish')).toBe('fish')
			expect(pluralize.singular('deer')).toBe('deer')
			expect(pluralize.singular('information')).toBe('information')
		})

		it('should preserve case', () => {
			expect(pluralize.singular('Cats')).toBe('Cat')
			expect(pluralize.singular('HOUSES')).toBe('HOUSE')
			expect(pluralize.singular('Children')).toBe('Child')
		})
	})

	describe('pluralize.isPlural', () => {
		it('should identify plural words', () => {
			expect(pluralize.isPlural('cats')).toBe(true)
			expect(pluralize.isPlural('dogs')).toBe(true)
			expect(pluralize.isPlural('children')).toBe(true)
			expect(pluralize.isPlural('feet')).toBe(true)
			expect(pluralize.isPlural('mice')).toBe(true)
		})

		it('should identify singular words as not plural', () => {
			expect(pluralize.isPlural('cat')).toBe(false)
			expect(pluralize.isPlural('dog')).toBe(false)
			expect(pluralize.isPlural('child')).toBe(false)
			expect(pluralize.isPlural('foot')).toBe(false)
			expect(pluralize.isPlural('mouse')).toBe(false)
		})

		it('should handle uncountable words', () => {
			expect(pluralize.isPlural('sheep')).toBe(true)
			expect(pluralize.isPlural('fish')).toBe(true)
			expect(pluralize.isPlural('deer')).toBe(true)
		})
	})

	describe('pluralize.isSingular', () => {
		it('should identify singular words', () => {
			expect(pluralize.isSingular('cat')).toBe(true)
			expect(pluralize.isSingular('dog')).toBe(true)
			expect(pluralize.isSingular('child')).toBe(true)
			expect(pluralize.isSingular('foot')).toBe(true)
			expect(pluralize.isSingular('mouse')).toBe(true)
		})

		it('should identify plural words as not singular', () => {
			expect(pluralize.isSingular('cats')).toBe(false)
			expect(pluralize.isSingular('dogs')).toBe(false)
			expect(pluralize.isSingular('children')).toBe(false)
			expect(pluralize.isSingular('feet')).toBe(false)
			expect(pluralize.isSingular('mice')).toBe(false)
		})

		it('should handle uncountable words', () => {
			expect(pluralize.isSingular('sheep')).toBe(true)
			expect(pluralize.isSingular('fish')).toBe(true)
			expect(pluralize.isSingular('deer')).toBe(true)
		})
	})

	describe('edge cases and special words', () => {
		it('should handle Latin words', () => {
			expect(pluralize.plural('datum')).toBe('data')
			expect(pluralize.plural('criterion')).toBe('criteria')
			expect(pluralize.plural('phenomenon')).toBe('phenomena')
			expect(pluralize.singular('data')).toBe('datum')
			expect(pluralize.singular('criteria')).toBe('criterion')
		})

		it('should handle words ending in o', () => {
			expect(pluralize.plural('hero')).toBe('heroes')
			expect(pluralize.plural('potato')).toBe('potatoes')
			expect(pluralize.plural('tomato')).toBe('tomatoes')
			expect(pluralize.plural('photo')).toBe('photos') // exceptions
			expect(pluralize.plural('piano')).toBe('pianos')
		})

		it('should handle compound words', () => {
			expect(pluralize.plural('passerby')).toBe('passersby')
			expect(pluralize.singular('passersby')).toBe('passerby')
		})

		it('should handle empty strings and edge cases', () => {
			expect(pluralize.plural('')).toBe('')
			expect(pluralize.singular('')).toBe('')
			expect(pluralize({ word: '', count: 1 })).toBe('')
			expect(pluralize({ word: '', count: 2 })).toBe('')
		})

		it('should handle single character words', () => {
			expect(pluralize.plural('a')).toBe('as')
			expect(pluralize.plural('I')).toBe('we')
			expect(pluralize.singular('as')).toBe('a')
		})
	})
})