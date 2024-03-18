import { useId } from 'react'
import { useControlField, useField } from 'remix-validated-form'
import { v4 } from 'uuid'
import { cn } from '#app/utils/misc'
import { startCase } from '#app/utils/startCase'
import { InfoCircledIcon } from '../icons'
import {
	RadioGroup,
	RadioGroupItem,
	type RadioGroupProps,
} from '../ui/radio-group'
import { Tooltip } from '../ui/tooltip'
import { ErrorList } from './error-list'

interface Props extends RadioGroupProps {
	value?: string
	label?: string
	labelInfo?: string
	hideLabel?: boolean
	name: string
	options: { value: string; label: string; info?: string; key?: string }[]
	onValueChange?: (value: string) => void
}

export function BaseRadioGroup({
	value,
	label,
	labelInfo,
	hideLabel,
	name,
	options,
	className,
	onValueChange,
	...props
}: Props) {
	const fallbackId = useId()
	const id = props.id ?? fallbackId
	const { error } = useField(name)
	const errorId = error?.length ? `${id}-error` : undefined

	return (
		<>
			<input type="hidden" name={name} key={value} value={value} />
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
				<RadioGroup
					{...props}
					onValueChange={onValueChange}
					defaultValue={value}
				>
					{options.map(option => (
						<div key={v4()} className="flex items-center space-x-2">
							<RadioGroupItem
								value={option.value}
								id={option.key ?? option.value}
								key={option.key}
							/>
							<label
								htmlFor={option.value}
								className="flex w-full items-center gap-2 text-sm"
							>
								{option.label}
								{option.info ? (
									<Tooltip
										text={<p className="max-w-[300px]">{option.info}</p>}
									>
										<InfoCircledIcon />
									</Tooltip>
								) : null}
							</label>
						</div>
					))}
				</RadioGroup>
				{errorId ? <ErrorList id={errorId} errors={[error]} /> : null}
			</div>
		</>
	)
}

export function FormRadioGroup(props: Omit<Props, 'value' | 'onValueChange'>) {
	const [value, setValue] = useControlField<string>(props.name)

	return <BaseRadioGroup {...props} onValueChange={setValue} value={value} />
}
