import { Check, ChevronsUpDown } from 'lucide-react'
import { useState } from 'react'
import { useControlField } from '@rvf/react-router'
import { Button } from '~/components/ui/button'
import {
	Command,
	CommandGroup,
	CommandInput,
	CommandItem,
} from '~/components/ui/command'
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '~/components/ui/popover'
import { TrashIcon } from '~/components/icons'
import { cn } from '~/utils/misc'

export function Student({
	name,
	students,
	onDelete,
}: {
	name: string
	students: {
		email: string
		studentProfile: { workshopLeader: { email: string } | null } | null
	}[]
	onDelete: () => void
}) {
	const [open, setOpen] = useState(false)
	const [value, setValue] = useControlField<string>(name)

	return (
		<>
			<input value={value} name={name} type="hidden" />
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
						<CommandInput placeholder="Search students..." />
						<CommandGroup className="no-scrollbar max-h-64 overflow-y-auto">
							{students.length ? (
								students.map(({ email, studentProfile }) => (
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
										<div className="flex flex-col gap-0.5">
											{email}
											{studentProfile?.workshopLeader ? (
												<span className="text-xs text-muted-foreground">
													{studentProfile.workshopLeader.email} - Current
													teacher
												</span>
											) : null}
										</div>
									</CommandItem>
								))
							) : (
								<p className="w-full p-2 text-center text-sm text-muted-foreground">
									No students found.
								</p>
							)}
						</CommandGroup>
					</Command>
				</PopoverContent>
			</Popover>
		</>
	)
}
