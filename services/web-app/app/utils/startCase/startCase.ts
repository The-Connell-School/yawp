export function startCase(str: string): string {
	return str
		.replace(/([A-Z])/g, ' $1') // insert a space before all caps
		.replace(/_/g, ' ') // replace underscores with spaces
		.replace(/-/g, ' ') // replace hyphens with spaces
		.replace(/\s+/g, ' ') // collapse repeated spaces
		.trim() // remove leading and trailing spaces
		.toLowerCase() // convert to lowercase
		.replace(/^\w|\s\w/g, m => m.toUpperCase()) // capitalize the first letter of each word
}
