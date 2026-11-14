import { Extension } from '@tiptap/core'

type Options = '1' | '1.15' | '1.5' | '2'

export interface LineHeightOptions {
	types: string[]
	heights: Options[]
	defaultHeight: '1.15'
}

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		lineHeight: {
			/**
			 * Set the line height attribute
			 */
			setLineHeight: (height: Options) => ReturnType
			/**
			 * Unset the line height attribute
			 */
			unsetLineHeight: () => ReturnType
		}
	}
}

export const LineHeight = Extension.create<LineHeightOptions>({
	name: 'lineHeight',

	addOptions() {
		return {
			types: [
				'paragraph',
				'heading',
				'blockquote',
				'codeBlock',
				'bulletList',
				'orderedList',
				'listItem',
				'tableCell',
				'tableHeaderCell',
				'caption',
				'table',
			],
			heights: ['1', '1.15', '1.5', '2'],
			defaultHeight: '1.15',
		}
	},

	addGlobalAttributes() {
		return [
			{
				types: this.options.types,
				attributes: {
					lineHeight: {
						default: this.options.defaultHeight,
						parseHTML: element => {
							const raw = element.style.lineHeight?.trim() || ''
							const heights = this.options.heights
							if (heights.includes(raw as Options)) {
								return raw as Options
							}
							const n = parseFloat(raw)
							if (!Number.isFinite(n)) {
								return this.options.defaultHeight
							}
							// Legacy HTML used `line-height: n*1.2+0.2`; map back to canonical preset.
							const reversed = (n - 0.2) / 1.2
							let best: Options = this.options.defaultHeight
							let bestDist = Infinity
							for (const h of heights) {
								const d = Math.abs(parseFloat(h) - reversed)
								if (d < bestDist) {
									bestDist = d
									best = h
								}
							}
							return best
						},
						renderHTML: ({ lineHeight }) => {
							if (lineHeight === this.options.defaultHeight) {
								return {}
							}

							return {
								style: `line-height: ${lineHeight}`,
							}
						},
					},
				},
			},
		]
	},

	addCommands() {
		return {
			setLineHeight:
				(height: Options) =>
				({ commands }) => {
					if (!this.options.heights.includes(height)) {
						return false
					}

					return this.options.types.every(type =>
						commands.updateAttributes(type, { lineHeight: height }),
					)
				},

			unsetLineHeight:
				() =>
				({ commands }) => {
					return this.options.types.every(type =>
						commands.resetAttributes(type, 'lineHeight'),
					)
				},
		}
	},
})
