import { type ReactNode, forwardRef, useId } from 'react'
import { cn } from '#app/utils/misc'
import { InfoCircledIcon } from '../icons'
import { Textarea, type TextareaProps } from '../ui/textarea'
import { Tooltip } from '../ui/tooltip'
import { ErrorList, type ListOfErrors } from './error-list'

// export a version that forwards the ref
export const FormTextarea = forwardRef<
	HTMLTextAreaElement,
	{
		labelProps?: Omit<React.LabelHTMLAttributes<HTMLLabelElement>, 'color'> & {
			info?: string
		}
		textareaProps: TextareaProps
		errors?: ListOfErrors
		className?: string
		index?: number
		helperText?: ReactNode
	}
>(function FormTextarea(
	{ labelProps, textareaProps, errors, className, index, helperText },
	ref,
) {
	const fallbackId = useId()
	const id = textareaProps.id ?? fallbackId
	const errorId = errors?.length ? `${id}-error` : undefined

	return (
		<div className={cn('flex flex-col gap-1', className)}>
			{labelProps?.info ? (
				<label htmlFor={id} {...labelProps}>
					<span className="flex items-center gap-2">
						{labelProps?.children}{' '}
						<Tooltip text={<p className="max-w-[300px]">{labelProps?.info}</p>}>
							<InfoCircledIcon />
						</Tooltip>
					</span>
					{helperText ?? null}
				</label>
			) : (
				<label htmlFor={id} {...labelProps} />
			)}
			<Textarea
				id={id}
				aria-invalid={errorId ? true : undefined}
				aria-describedby={errorId}
				color={errorId ? 'red' : undefined}
				ref={ref}
				{...(index !== undefined ? { 'data-index': index } : {})}
				{...textareaProps}
			/>
			{errorId ? <ErrorList id={errorId} errors={errors} /> : null}
		</div>
	)
})
