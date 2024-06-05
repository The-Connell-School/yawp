import { useState } from 'react'
import { useControlField, useField } from 'remix-validated-form'
import { type z } from 'zod'
import { FormInput } from '#app/components/forms/form-input-2'
import { FormTextarea } from '#app/components/forms/form-textarea-2'
import { CaretRightIcon, DotsVerticalIcon } from '#app/components/icons'
import { Button } from '#app/components/ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '#app/components/ui/dropdown-menu'
import {
	Sheet,
	SheetContent,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from '#app/components/ui/sheet'
import { useHiddenValues } from '#app/contexts/hidden-values'
import { useCallDebouncedCallback } from '#app/hooks/useCallDebouncedCallback'
import { useOriginalValue } from '#app/hooks/useOriginalValue'
import { cn } from '#app/utils/misc'
import { type CourseResourceSchema } from './schema'

interface Props {
	name: string
	onDelete: () => void
}

export function CourseResource({ name, onDelete }: Props) {
	const { error: urlError } = useField(`${name}.url`)

	const [value, setValue] =
		useControlField<z.infer<typeof CourseResourceSchema>>(name)

	const { upsert, remove: removeHiddenFields } = useHiddenValues()
	useCallDebouncedCallback(() => upsert(value, name), 300, [value])

	const [isOpen, setIsOpen] = useState(false)
	const originalValue = useOriginalValue({ isOpen, value })

	if (!value) return null

	return (
		<Sheet open={isOpen} onOpenChange={setIsOpen}>
			<SheetTrigger
				className="flex w-full items-center justify-between"
				asChild
			>
				<div
					className={cn(
						'flex w-full cursor-pointer items-center justify-between rounded-lg border p-1 pl-3 pr-1 hover:bg-foreground/[2%]',
						{ 'border-destructive': urlError },
					)}
				>
					<div className="flex items-center">
						<span>{value.title}</span>
						{urlError ? (
							<span className="ml-2 flex items-center gap-2 text-xs text-destructive">
								<CaretRightIcon /> {urlError}
							</span>
						) : null}
					</div>
					<DropdownMenu>
						<DropdownMenuTrigger>
							<Button
								variant="ghost"
								size="icon-sm"
								onClick={e => e.preventDefault()}
								asChild
							>
								<div>
									<DotsVerticalIcon />
								</div>
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent>
							<DropdownMenuItem
								onClick={() => {
									removeHiddenFields(name)
									onDelete()
								}}
								className="cursor-pointer"
							>
								Delete
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</SheetTrigger>
			<SheetContent className="sm:max-w-screen flex w-screen flex-col rounded-l-xl px-4 py-5 sm:w-[600px]">
				<SheetHeader className="px-1">
					<SheetTitle>Resource</SheetTitle>
				</SheetHeader>
				<div className="no-scrollbar flex flex-grow flex-col gap-3 overflow-scroll px-1">
					<FormInput
						label="Title"
						name={`${name}.title`}
						placeholder="Title"
						value={value.title}
						onChange={e => setValue({ ...value, title: e.target.value })}
					/>
					<FormTextarea
						label="Description"
						name={`${name}.description`}
						placeholder="Description"
						value={value.description ?? ''}
						onChange={e => setValue({ ...value, description: e.target.value })}
					/>
					<FormInput
						label="Link"
						name={`${name}.url`}
						placeholder="https://example.com/resource.pdf"
						value={value.url ?? ''}
						onChange={e => setValue({ ...value, url: e.target.value })}
					/>
				</div>
				<SheetFooter className="mb-4 px-1 sm:mb-0">
					<Button
						onClick={e => {
							e.preventDefault()
							setIsOpen(false)
						}}
					>
						Save
					</Button>
					<Button
						variant="outline"
						onClick={e => {
							e.preventDefault()
							setIsOpen(false)
							if (originalValue) setValue(originalValue)
						}}
					>
						Cancel
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	)
}
