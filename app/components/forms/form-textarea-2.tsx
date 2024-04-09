import { type Ref, forwardRef, useId, type ReactNode } from 'react'
import { useField } from 'remix-validated-form'
import { cn } from '#app/utils/misc'
import { startCase } from '#app/utils/startCase'
import { InfoCircledIcon } from '../icons'
import { Textarea, type TextareaProps } from '../ui/textarea'
import { Tooltip } from '../ui/tooltip'
import { ErrorList } from './error-list'

interface Props extends TextareaProps {
	name: string
	label?: string
	labelInfo?: string
	hideLabel?: boolean
	subLabel?: ReactNode
	className?: string
	helperText?: ReactNode
}

function Base(
	{
		label,
		labelInfo,
		hideLabel,
		className,
		helperText,
		name,
		subLabel,
		...props
	}: Props,
	ref: Ref<HTMLTextAreaElement>,
) {
	const fallbackId = useId()
	const id = props.id ?? fallbackId
	const { error, getInputProps } = useField(name)
	const errorId = error?.length ? `${id}-error` : undefined

	return (
		<div className={cn('flex flex-col gap-1', className)}>
			{labelInfo ? (
				<label htmlFor={id}>
					<span className="flex items-center gap-2">
						{label ?? startCase(name)}{' '}
						<Tooltip text={<p className="max-w-[300px]">{labelInfo}</p>}>
							<InfoCircledIcon />
						</Tooltip>
					</span>
				</label>
			) : hideLabel ? null : (
				<label htmlFor={id}>{label ?? startCase(name)}</label>
			)}
			{subLabel ? (
				<p className="text-sm text-muted-foreground">{subLabel}</p>
			) : null}
			<Textarea
				id={id}
				ref={ref}
				aria-invalid={errorId ? true : undefined}
				aria-describedby={errorId}
				color={errorId ? 'red' : undefined}
				{...getInputProps({ id, ...props })}
			/>
			{helperText ? (
				<p className="text-muted-foreground">{helperText}</p>
			) : null}
			<div>{errorId ? <ErrorList id={errorId} errors={[error]} /> : null}</div>
		</div>
	)
}

export const FormTextarea = forwardRef<HTMLTextAreaElement, Props>(Base)
