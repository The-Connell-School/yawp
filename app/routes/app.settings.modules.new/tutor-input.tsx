import { Check, ChevronsUpDownIcon } from 'lucide-react'
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
import { cn } from '#app/utils/misc'

export function TutorInput({
	tutors,
	inputProps,
}: {
	tutors: { name: string; id: string }[]
	inputProps: InputHTMLAttributes<HTMLInputElement>
}) {
	const [open, setOpen] = useState(false)
	const [value, setValue] = useState(inputProps.defaultValue)
	const currentName = tutors.find(t => t.id === value)?.name

	return (
		<>
			<input
				{...inputProps}
				value={value}
				type="hidden"
				defaultValue={undefined}
			/>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						variant="outline"
						role="combobox"
						aria-expanded={open}
						className="w-full justify-between text-sm"
					>
						{currentName || 'Select tutor...'}
						<ChevronsUpDownIcon className="h-4" />
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-[320px] p-0" align="start">
					<Command>
						<CommandInput placeholder="Search tutors..." />
						<CommandEmpty>No tutors found.</CommandEmpty>
						<CommandGroup>
							{tutors.length ? (
								tutors.map(({ name, id }) => (
									<CommandItem
										key={id}
										value={id}
										onSelect={currentValue => {
											setValue(currentValue === value ? '' : currentValue)
											setOpen(false)
										}}
									>
										<Check
											className={cn(
												'mr-2 h-4 w-4',
												value === id ? 'opacity-100' : 'opacity-0',
											)}
										/>
										{name}
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
		</>
	)
}
