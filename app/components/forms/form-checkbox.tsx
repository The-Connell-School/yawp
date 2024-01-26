import { useInputEvent } from '@conform-to/react'
import { useId, useRef } from 'react'
import { Checkbox, type CheckboxProps } from '../ui/checkbox'
import { ErrorList, type ListOfErrors } from './error-list'

export function FormCheckbox({
	labelProps,
	buttonProps,
	errors,
	className,
}: {
	labelProps: JSX.IntrinsicElements['label']
	buttonProps: CheckboxProps
	errors?: ListOfErrors
	className?: string
}) {
	const fallbackId = useId()
	const buttonRef = useRef<HTMLButtonElement>(null)
	// To emulate native events that Conform listen to:
	// See https://conform.guide/integrations
	const control = useInputEvent({
		// Retrieve the checkbox element by name instead as Radix does not expose the internal checkbox element
		// See https://github.com/radix-ui/primitives/discussions/874
		ref: () =>
			buttonRef.current?.form?.elements.namedItem(buttonProps.name ?? ''),
		onFocus: () => buttonRef.current?.focus(),
	})
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
						control.change(Boolean(state.valueOf()))
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
