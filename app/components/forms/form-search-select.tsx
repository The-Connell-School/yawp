import { ChevronsUpDownIcon, Check } from 'lucide-react'
import { useId, useState } from 'react'
import { useControlField, useField } from 'remix-validated-form'
import { cn } from '#app/utils/misc'
import pluralize from '#app/utils/pluralize/pluralize'
import { startCase } from '#app/utils/startCase'
import { InfoCircledIcon } from '../icons'
import { Button } from '../ui/button'
import {
	Command,
	CommandInput,
	CommandEmpty,
	CommandGroup,
	CommandItem,
} from '../ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { Tooltip } from '../ui/tooltip'
import { ErrorList } from './error-list'

interface Props {
	id?: string
	entity?: string
	options: { value: string; label: string }[]
	name: string
	label?: string
	labelInfo?: string
	hideLabel?: boolean
	className?: string
	helperText?: string
}

export function FormSearchSelect({
	id: initialId,
	entity = 'item',
	options,
	label,
	labelInfo,
	hideLabel,
	className,
	helperText,
	name,
}: Props) {
	const fallbackId = useId()
	const id = initialId ?? fallbackId

	const { error } = useField(name)
	const [open, setOpen] = useState(false)
	const [value, setValue] = useControlField<string>(name)
	const optLabel = options.find(opt => opt.value === value)?.label
	const errorId = error?.length ? `${id}-error` : undefined
	const pluralizedEntity = pluralize({ word: entity, count: 2 })

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
			<input type="hidden" name={name} key={value} value={value} />
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						variant="outline"
						role="combobox"
						aria-expanded={open}
						className="w-full justify-between text-sm"
					>
						{optLabel || `Select ${entity}...`}
						<ChevronsUpDownIcon className="h-4" />
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-[320px] p-0" align="start">
					<Command>
						<CommandInput placeholder={`Search ${pluralizedEntity}...`} />
						<CommandEmpty>No tutors found.</CommandEmpty>
						<CommandGroup>
							{options.length ? (
								options.map(({ label, value: optValue }) => (
									<CommandItem
										key={optValue}
										value={optValue}
										className="cursor-pointer"
										onSelect={incoming => {
											setValue(incoming === value ? '' : incoming)
											setOpen(false)
										}}
									>
										<Check
											className={cn(
												'mr-2 h-4 w-4',
												value === optValue ? 'opacity-100' : 'opacity-0',
											)}
										/>
										{label}
									</CommandItem>
								))
							) : (
								<p className="w-full p-2 text-center text-sm text-muted-foreground">
									Not tutors found
								</p>
							)}
						</CommandGroup>
					</Command>
				</PopoverContent>
			</Popover>
			{helperText ? (
				<p className="text-muted-foreground">{helperText}</p>
			) : null}
			<div>{errorId ? <ErrorList id={errorId} errors={[error]} /> : null}</div>
		</div>
	)
}
