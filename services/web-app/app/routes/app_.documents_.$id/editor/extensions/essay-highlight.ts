import { Extension, Mark } from '@tiptap/core';
import { Plugin, PluginKey } from 'prosemirror-state';
import { RUBRIC_CATEGORIES } from '~/utils/essay-grading/rubric-categories';

export interface EssayHighlightOptions {
	HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		essayHighlight: {
			setEssayHighlight: (highlightId: string, category: string, gradeId: string) => ReturnType;
			unsetEssayHighlight: () => ReturnType;
			removeHighlight: (highlightId: string) => ReturnType;
		};
	}
}

export const EssayHighlight = Mark.create<EssayHighlightOptions>({
	name: 'essayHighlight',

	addOptions() {
		return {
			HTMLAttributes: {},
		};
	},

	addAttributes() {
		return {
			highlightId: {
				default: null,
				parseHTML: (element) => element.getAttribute('data-highlight-id'),
				renderHTML: (attributes) => {
					if (!attributes.highlightId) return {};
					return { 'data-highlight-id': attributes.highlightId };
				},
			},
			category: {
				default: null,
				parseHTML: (element) => element.getAttribute('data-category'),
				renderHTML: (attributes) => {
					if (!attributes.category) return {};
					return { 'data-category': attributes.category };
				},
			},
			gradeId: {
				default: null,
				parseHTML: (element) => element.getAttribute('data-grade-id'),
				renderHTML: (attributes) => {
					if (!attributes.gradeId) return {};
					return { 'data-grade-id': attributes.gradeId };
				},
			},
		};
	},

	parseHTML() {
		return [
			{
				tag: 'span[data-highlight-id]',
				getAttrs: (dom) => ({
					highlightId: (dom as HTMLElement).getAttribute('data-highlight-id'),
					category: (dom as HTMLElement).getAttribute('data-category'),
					gradeId: (dom as HTMLElement).getAttribute('data-grade-id'),
				}),
			},
		];
	},

	renderHTML({ HTMLAttributes }) {
		const category = HTMLAttributes['data-category'];
		const categoryConfig = RUBRIC_CATEGORIES[category as keyof typeof RUBRIC_CATEGORIES];

		const classes = [
			'essay-highlight',
			`essay-highlight-${category}`,
			categoryConfig?.bgClass,
			categoryConfig?.borderClass,
		]
			.filter(Boolean)
			.join(' ');

		return [
			'span',
			{
				...HTMLAttributes,
				class: classes,
				style: 'border-bottom-width: 2px; border-bottom-style: solid; cursor: pointer;',
			},
			0,
		];
	},

	addCommands() {
		return {
			setEssayHighlight:
				(highlightId, category, gradeId) =>
				({ commands }) => {
					return commands.setMark(this.name, { highlightId, category, gradeId });
				},
			unsetEssayHighlight:
				() =>
				({ commands }) => {
					return commands.unsetMark(this.name);
				},
			removeHighlight:
				(highlightId) =>
				({ tr, state }) => {
					const { doc } = state;
					let modified = false;

					doc.descendants((node, pos) => {
						if (!node.isText) return;

						node.marks.forEach((mark) => {
							if (mark.type.name === 'essayHighlight' && mark.attrs.highlightId === highlightId) {
								const from = pos;
								const to = pos + node.nodeSize;
								tr.removeMark(from, to, mark.type);
								modified = true;
							}
						});
					});

					return modified;
				},
		};
	},
});

export const EssayHighlightExtension = Extension.create({
	name: 'essayHighlightExtension',

	addProseMirrorPlugins() {
		return [
			new Plugin({
				key: new PluginKey('essayHighlightExtension'),
				props: {
					handleDOMEvents: {
						mouseover: (_view, event) => {
							const target = event.target as HTMLElement | null;
							const mark = target?.closest('[data-highlight-id]') as HTMLElement | null;
							if (!mark) return false;

							const highlightId = mark.getAttribute('data-highlight-id');
							const category = mark.getAttribute('data-category');
							const gradeId = mark.getAttribute('data-grade-id');

							if (!highlightId) return false;

							window.dispatchEvent(
								new CustomEvent('essay-highlight-hover', {
									detail: { highlightId, category, gradeId },
								})
							);
							return false;
						},
						mouseout: (_view, event) => {
							const target = event.target as HTMLElement | null;
							const mark = target?.closest('[data-highlight-id]') as HTMLElement | null;
							if (!mark) return false;

							const highlightId = mark.getAttribute('data-highlight-id');
							if (!highlightId) return false;

							window.dispatchEvent(
								new CustomEvent('essay-highlight-unhover', {
									detail: { highlightId },
								})
							);
							return false;
						},
					},
					handleClick(view, pos) {
						const { schema, doc } = view.state;
						const range = doc
							.resolve(pos)
							.marks()
							.find((mark) => mark.type === schema.marks.essayHighlight);

						if (range) {
							const { highlightId, category, gradeId } = range.attrs as {
								highlightId: string;
								category: string;
								gradeId: string;
							};

							window.dispatchEvent(
								new CustomEvent('essay-highlight-click', {
									detail: { highlightId, category, gradeId },
								})
							);
							return true; // Prevent default click handling
						}

						return false;
					},
					handleTextInput(view) {
						// Prevent newly typed text from inheriting the highlight mark
						const { state } = view;
						const { schema, selection } = state;
						const hasHighlight = selection.$from
							.marks()
							.some((m) => m.type === schema.marks.essayHighlight);

						if (hasHighlight) {
							const tr = state.tr.removeStoredMark(schema.marks.essayHighlight);
							view.dispatch(tr);
						}

						return false;
					},
				},
			}),
		];
	},
});
