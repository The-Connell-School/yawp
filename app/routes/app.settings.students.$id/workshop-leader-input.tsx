import { useInputControl, type FieldMetadata } from '@conform-to/react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { useState } from 'react'
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

export function WorkshopLeaderInput({
	workshopLeaders,
	field,
}: {
	workshopLeaders: { email: string }[]
	field: FieldMetadata<string>
}) {
	const [open, setOpen] = useState(false)
	const control = useInputControl(field)

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					role="combobox"
					aria-expanded={open}
					className="w-full justify-between"
				>
					{control.value
						? workshopLeaders.find(wl => wl.email === control.value)?.email
						: 'Select workshop leader...'}
					<div className="flex items-center gap-1">
						<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
					</div>
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-[320px] p-0" align="start">
				<Command>
					<CommandInput placeholder="Search framework..." />
					<CommandEmpty>No framework found.</CommandEmpty>
					<CommandGroup>
						{workshopLeaders.length ? (
							workshopLeaders.map(({ email }) => (
								<CommandItem
									key={email}
									value={email}
									onSelect={currentValue => {
										control.change(
											currentValue === control.value ? '' : currentValue,
										)
										setOpen(false)
									}}
								>
									<Check
										className={cn(
											'mr-2 h-4 w-4',
											control.value === email ? 'opacity-100' : 'opacity-0',
										)}
									/>
									{email}
								</CommandItem>
							))
						) : (
							<p className="w-full p-2 text-center text-sm text-muted-foreground">
								No students found
							</p>
						)}
					</CommandGroup>
				</Command>
			</PopoverContent>
		</Popover>
	)
}
