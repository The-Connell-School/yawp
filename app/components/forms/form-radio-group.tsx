import { useId, useState } from 'react'
import { v4 } from 'uuid'
import { cn } from '#app/utils/misc'
import { InfoCircledIcon } from '../icons'
import {
	RadioGroup,
	RadioGroupItem,
	type RadioGroupProps,
} from '../ui/radio-group'
import { Tooltip } from '../ui/tooltip'
import { ErrorList, type ListOfErrors } from './error-list'

export function FormRadioGroup({
	labelProps,
	radioGroupProps: { options, ...radioGroupProps },
	errors,
	className,
	index,
}: {
	labelProps?: Omit<React.LabelHTMLAttributes<HTMLLabelElement>, 'color'> & {
		info?: string
	}
	radioGroupProps: RadioGroupProps & {
		options: { value: string; label: string; info?: string }[]
		form?: string
	}
	errors?: ListOfErrors
	className?: string
	index?: number
}) {
	const fallbackId = useId()
	const id = radioGroupProps.id ?? fallbackId
	const errorId = errors?.length ? `${id}-error` : undefined
	const [value, setValue] = useState(radioGroupProps.defaultValue)

	return (
		<>
			<input
				{...radioGroupProps}
				{...(index !== undefined ? { 'data-index': index } : {})}
				type="hidden"
				value={value}
				defaultValue={undefined}
			/>
			<div className={cn('flex flex-col gap-1', className)}>
				{labelProps?.info ? (
					<label htmlFor={id} {...labelProps}>
						<span className="flex items-center gap-2">
							{labelProps?.children}{' '}
							<Tooltip
								text={<p className="max-w-[300px]">{labelProps?.info}</p>}
							>
								<InfoCircledIcon />
							</Tooltip>
						</span>
					</label>
				) : (
					<label htmlFor={id} {...labelProps} />
				)}
				<RadioGroup {...radioGroupProps} onValueChange={setValue}>
					{options.map(option => (
						<div key={v4()} className="flex items-center space-x-2">
							<RadioGroupItem value={option.value} id={option.value} />
							<label htmlFor={option.value}>{option.label}</label>
							{option.info ? (
								<Tooltip text={<p className="max-w-[300px]">{option.info}</p>}>
									<InfoCircledIcon />
								</Tooltip>
							) : null}
						</div>
					))}
				</RadioGroup>
				{errorId ? <ErrorList id={errorId} errors={errors} /> : null}
			</div>
		</>
	)
}
