import { useId } from 'react'
import { cn } from '#app/utils/misc'
import { Input, type InputProps } from '../ui/input'
import { ErrorList, type ListOfErrors } from './error-list'

export function FormInput({
	labelProps,
	inputProps,
	errors,
	className,
}: {
	labelProps?: Omit<React.LabelHTMLAttributes<HTMLLabelElement>, 'color'>
	inputProps: InputProps
	errors?: ListOfErrors
	className?: string
}) {
	const fallbackId = useId()
	const id = inputProps.id ?? fallbackId
	const errorId = errors?.length ? `${id}-error` : undefined

	return (
		<div className={cn('flex flex-col gap-1', className)}>
			<label htmlFor={id} {...labelProps} />
			<Input
				id={id}
				aria-invalid={errorId ? true : undefined}
				aria-describedby={errorId}
				variant={errorId ? 'destructive' : undefined}
				{...inputProps}
			/>
			<div>{errorId ? <ErrorList id={errorId} errors={errors} /> : null}</div>
		</div>
	)
}
