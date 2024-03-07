import { Extension } from '@tiptap/core'

type Options = '1' | '1.5' | '2'

export interface LineHeightOptions {
	types: string[]
	heights: Options[]
	defaultHeight: '1'
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
			heights: ['1', '1.5', '2'],
			defaultHeight: '1',
		}
	},

	addGlobalAttributes() {
		return [
			{
				types: this.options.types,
				attributes: {
					lineHeight: {
						default: this.options.defaultHeight,
						parseHTML: element =>
							element.style.lineHeight || this.options.defaultHeight,
						renderHTML: ({ lineHeight }) => {
							if (lineHeight === this.options.defaultHeight) {
								return {}
							}

							return {
								style: `line-height: ${parseFloat(lineHeight) * 1.2 + 0.2}`,
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
