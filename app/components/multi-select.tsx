import { useSearchParams } from '@remix-run/react'
import { Check, PlusCircle } from 'lucide-react'
import { cn } from '#app/utils/misc'
import pluralize from '#app/utils/pluralize/pluralize.ts'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import {
	Command,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from './ui/command'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { Separator } from './ui/separator'

interface Props {
	label: string
	queryKey: string
	options: { value: string; label: string }[]
	onChange: (values: string[]) => void
}

export function MultiSelect({ label, options, onChange, queryKey }: Props) {
	const [searchParams] = useSearchParams()
	const selectedValues = searchParams.get(queryKey)?.split(',') || []

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button variant="outline" className="h-8 gap-1 border-dashed px-2">
					<PlusCircle size={16} />
					{label}
					{selectedValues?.length > 0 && (
						<>
							<Separator orientation="vertical" className="mx-1" />
							<Badge
								variant="secondary"
								className="rounded-sm px-1 font-normal lg:hidden"
							>
								{selectedValues.length}
							</Badge>
							<div className="hidden space-x-1 lg:flex">
								{selectedValues.length > 2 ? (
									<Badge
										variant="secondary"
										className="rounded-sm px-1 font-normal"
									>
										{selectedValues.length} selected
									</Badge>
								) : (
									options
										.filter(option => selectedValues.includes(option.value))
										.map(option => (
											<Badge
												variant="secondary"
												key={option.value}
												className="rounded-sm px-1 font-normal"
											>
												{option.label}
											</Badge>
										))
								)}
							</div>
						</>
					)}
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-[200px] p-0" align="start">
				<Command>
					<CommandInput placeholder={`Search ${label.toLowerCase()}`} />
					<CommandList>
						<CommandGroup>
							{options.length > 0 ? (
								options.map(option => {
									const isSelected = selectedValues.includes(option.value)
									return (
										<CommandItem
											key={option.value}
											onSelect={() => {
												const newValues = isSelected
													? selectedValues.filter(
															value => value !== option.value,
														)
													: [...selectedValues, option.value]
												onChange?.(newValues)
											}}
										>
											<div
												className={cn(
													'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
													isSelected
														? 'bg-primary text-primary-foreground'
														: 'opacity-50 [&_svg]:invisible',
												)}
											>
												<Check />
											</div>
											<span>{option.label}</span>
										</CommandItem>
									)
								})
							) : (
								<div className="py-6 text-center text-sm">
									No results found.
								</div>
							)}
						</CommandGroup>
						{selectedValues.length > 0 && (
							<>
								<CommandSeparator />
								<CommandGroup>
									<CommandItem
										onSelect={() => onChange?.([])}
										className="justify-center text-center"
									>
										Clear{' '}
										{pluralize({
											word: label.toLowerCase(),
											count: selectedValues.length,
										})}
									</CommandItem>
								</CommandGroup>
							</>
						)}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	)
}
