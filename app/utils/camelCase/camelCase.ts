// example: camelCase('hello-world') => 'helloWorld'
// example: camelCase('Hello World') => 'helloWorld'
// example: camelCase('Hello') => 'hello'

export function camelCase(str: string): string {
	return (
		str
			// Remove any leading and trailing whitespace, and convert to lowercase
			.trim()
			.toLowerCase()
			// Replace spaces or hyphens followed by a character with the uppercase character
			.replace(/[-\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
	)
}
