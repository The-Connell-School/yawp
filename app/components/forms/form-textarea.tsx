import { useId } from 'react'
import { cn } from '#app/utils/misc'
import { Textarea, type TextareaProps } from '../ui/textarea'
import { ErrorList, type ListOfErrors } from './error-list'

export function FormTextarea({
	labelProps,
	textareaProps,
	errors,
	className,
}: {
	labelProps: Omit<React.LabelHTMLAttributes<HTMLLabelElement>, 'color'>
	textareaProps: TextareaProps
	errors?: ListOfErrors
	className?: string
}) {
	const fallbackId = useId()
	const id = textareaProps.id ?? fallbackId
	const errorId = errors?.length ? `${id}-error` : undefined

	return (
		<div className={cn('flex flex-col gap-1', className)}>
			<label htmlFor={id} {...labelProps} />
			<Textarea
				id={id}
				aria-invalid={errorId ? true : undefined}
				aria-describedby={errorId}
				color={errorId ? 'red' : undefined}
				{...textareaProps}
			/>
			{errorId ? <ErrorList id={errorId} errors={errors} /> : null}
		</div>
	)
}
