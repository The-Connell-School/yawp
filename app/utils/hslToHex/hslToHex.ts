function parseHSL(hsl: string): [number, number, number] {
	const [h, s, l] = hsl.match(/\d+(\.\d+)?/g)?.map(Number) ?? [0, 0, 0]
	return [Math.round(h), Math.round(s), Math.round(l)]
}

export function getHslFromVar(variable: string) {
	const hsl = getComputedStyle(document.documentElement).getPropertyValue(
		variable,
	)
	return hsl
}

export function hslToHex(hsl: string): string {
	let [h, s, l] = parseHSL(hsl)

	s /= 100
	l /= 100

	let c = (1 - Math.abs(2 * l - 1)) * s
	let x = c * (1 - Math.abs(((h / 60) % 2) - 1))
	let m = l - c / 2
	let r = 0
	let g = 0
	let b = 0

	if (0 <= h && h < 60) {
		r = c
		g = x
		b = 0
	} else if (60 <= h && h < 120) {
		r = x
		g = c
		b = 0
	} else if (120 <= h && h < 180) {
		r = 0
		g = c
		b = x
	} else if (180 <= h && h < 240) {
		r = 0
		g = x
		b = c
	} else if (240 <= h && h < 300) {
		r = x
		g = 0
		b = c
	} else if (300 <= h && h < 360) {
		r = c
		g = 0
		b = x
	}

	let rHex = Math.round((r + m) * 255)
		.toString(16)
		.padStart(2, '0')
	let gHex = Math.round((g + m) * 255)
		.toString(16)
		.padStart(2, '0')
	let bHex = Math.round((b + m) * 255)
		.toString(16)
		.padStart(2, '0')

	return `#${rHex}${gHex}${bHex}`
}
