import { type FieldMetadata, useInputControl } from '@conform-to/react'
import { useId, useRef } from 'react'
import { Checkbox, type CheckboxProps } from '../ui/checkbox'
import { ErrorList, type ListOfErrors } from './error-list'

export function FormCheckbox({
	labelProps,
	buttonProps,
	errors,
	className,
	field,
}: {
	field: FieldMetadata<string>
	labelProps: JSX.IntrinsicElements['label']
	buttonProps: CheckboxProps
	errors?: ListOfErrors
	className?: string
}) {
	const fallbackId = useId()
	const buttonRef = useRef<HTMLButtonElement>(null)
	const control = useInputControl(field)
	const id = buttonProps.id ?? buttonProps.name ?? fallbackId
	const errorId = errors?.length ? `${id}-error` : undefined

	return (
		<div className={className}>
			<div className="flex items-center gap-2">
				<Checkbox
					id={id}
					ref={buttonRef}
					aria-invalid={errorId ? true : undefined}
					aria-describedby={errorId}
					{...buttonProps}
					onCheckedChange={state => {
						control.change(state.valueOf().toString())
						buttonProps.onCheckedChange?.(state)
					}}
					onFocus={event => {
						control.focus()
						buttonProps.onFocus?.(event)
					}}
					onBlur={event => {
						control.blur()
						buttonProps.onBlur?.(event)
					}}
					type="button"
					value={control.value}
				/>
				<label
					htmlFor={id}
					{...labelProps}
					className="text-body-xs mt-0.5 self-center"
				/>
			</div>
			<div className="min-h-2">
				{errorId ? <ErrorList id={errorId} errors={errors} /> : null}
			</div>
		</div>
	)
}
