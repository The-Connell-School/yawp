import { useRef, useState, useEffect } from 'react'

type Params = {
	height?: string
	onCmdEnter?: (text: string) => void
}

export const useRichTextarea = ({ onCmdEnter, height = '50px' }: Params) => {
	const heightInt = parseInt(height.slice(0, 2))
	const textareaRef = useRef<HTMLTextAreaElement>(null)
	const [hasText, setHasText] = useState(false)

	useEffect(() => {
		if (textareaRef.current) {
			const lineHeight = parseFloat(
				getComputedStyle(textareaRef.current).lineHeight,
			)
			textareaRef.current.style.height = Math.max(heightInt, lineHeight) + 'px'
		}
	}, [heightInt])

	const handleTextareaChange = () => {
		if (textareaRef.current) {
			textareaRef.current.style.height = height
			textareaRef.current.style.height =
				Math.max(heightInt, textareaRef.current.scrollHeight + 3) + 'px'

			setHasText(!!textareaRef.current.value)
		}
	}

	const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && hasText) {
			event.preventDefault()

			if (textareaRef.current?.value) {
				onCmdEnter?.(textareaRef.current.value)
			}

			textareaRef.current!.value = ''

			if (textareaRef.current) {
				const lineHeight = parseFloat(
					getComputedStyle(textareaRef.current).lineHeight,
				)
				textareaRef.current.style.height =
					Math.max(heightInt, lineHeight) + 'px'
			}
		}
	}

	return {
		textareaRef,
		handleTextareaChange,
		handleKeyDown,
		hasText,
	}
}
