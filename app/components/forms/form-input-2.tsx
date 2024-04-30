import { useId } from 'react'
import { useField } from 'remix-validated-form'
import { cn } from '#app/utils/misc'
import { startCase } from '#app/utils/startCase'
import { InfoCircledIcon } from '../icons'
import { Input, type InputProps } from '../ui/input'
import { Tooltip } from '../ui/tooltip'

interface Props extends InputProps {
	name: string
	label?: string
	labelInfo?: string
	hideLabel?: boolean
	className?: string
	helperText?: string
}

export function FormInput({
	label,
	labelInfo,
	hideLabel,
	className,
	helperText,
	name,
	...props
}: Props) {
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
			<Input
				aria-invalid={errorId ? true : undefined}
				aria-describedby={errorId}
				variant={errorId ? 'destructive' : undefined}
				className={props.type === 'email' ? 'lowercase' : ''}
				{...getInputProps({ id, ...props })}
			/>
			{helperText ? (
				<p className="text-xs text-muted-foreground">{helperText}</p>
			) : null}
			{error ? (
				<p className="text-left text-[12px] text-destructive">{error}</p>
			) : null}
		</div>
	)
}
