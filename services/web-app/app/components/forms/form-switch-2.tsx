import React, { type ReactNode, useId } from 'react'
import { useField } from 'remix-validated-form'
import { cn } from '~/utils/misc'
import { startCase } from '~/utils/startCase'
import { InfoCircledIcon } from '../icons'
import { Switch, type SwitchProps } from '../ui/switch'
import { Tooltip } from '../ui/tooltip'
import { ErrorList } from './error-list'

interface Props extends SwitchProps {
	label: ReactNode
	labelInfo?: ReactNode
	hideLabel?: boolean
	name: string
	helperText?: ReactNode
}

export function FormSwitch({
	label,
	labelInfo,
	name,
	hideLabel,
	className,
	helperText,
	...props
}: Props) {
	const fallbackId = useId()
	const id = props.id ?? fallbackId
	const { error, getInputProps } = useField(name)
	const errorId = error?.length ? `${id}-error` : undefined

	return (
		<div className={cn('flex items-center gap-1', className)}>
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
				<div>
					<label htmlFor={id}>{label ?? startCase(name)}</label>
					{helperText ? (
						<p className="text-sm text-muted-foreground">{helperText}</p>
					) : null}
				</div>
			)}
			{errorId ? <ErrorList id={errorId} errors={[error]} /> : null}
			<Switch {...getInputProps({ id, ...props })} />
		</div>
	)
}
