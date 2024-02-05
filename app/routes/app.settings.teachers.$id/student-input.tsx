import { Check, ChevronsUpDown } from 'lucide-react'
import { type InputHTMLAttributes, useState } from 'react'
import { Button } from '#/app/components/ui/button'
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
} from '#/app/components/ui/command'
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '#/app/components/ui/popover'
import { TrashIcon } from '#app/components/icons'
import { cn } from '#app/utils/misc'

export function StudentInput({
	students,
	onDelete,
	inputProps,
	index,
}: {
	student: { email: string }
	students: { email: string }[]
	onDelete: () => void
	index: number
	inputProps: InputHTMLAttributes<HTMLInputElement>
}) {
	const [open, setOpen] = useState(false)
	const [value, setValue] = useState(inputProps.defaultValue)

	return (
		<>
			<input
				{...inputProps}
				value={value}
				type="hidden"
				defaultValue={undefined}
				data-index={index}
			/>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						variant="outline"
						role="combobox"
						aria-expanded={open}
						className="w-full justify-between text-sm"
					>
						{value || 'Select student...'}
						<div className="flex items-center gap-1">
							<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
							<span
								onClick={e => {
									e.stopPropagation()
									e.preventDefault()
									onDelete()
								}}
								className="rounded-lg p-1 transition-opacity hover:opacity-60"
							>
								<TrashIcon />
							</span>
						</div>
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-[320px] p-0" align="start">
					<Command>
						<CommandInput placeholder="Search framework..." />
						<CommandEmpty>No framework found.</CommandEmpty>
						<CommandGroup>
							{students.length ? (
								students.map(({ email }) => (
									<CommandItem
										key={email}
										value={email}
										onSelect={currentValue => {
											setValue(currentValue === value ? '' : currentValue)
											setOpen(false)
										}}
									>
										<Check
											className={cn(
												'mr-2 h-4 w-4',
												value === email ? 'opacity-100' : 'opacity-0',
											)}
										/>
										{email}
									</CommandItem>
								))
							) : (
								<p className="w-full p-2 text-center text-sm text-muted-foreground">
									Not students found
								</p>
							)}
						</CommandGroup>
					</Command>
				</PopoverContent>
			</Popover>
		</>
	)
}
