import omit from 'lodash/omit'
import { useState } from 'react'
import { useControlField, useField, useFieldArray } from 'remix-validated-form'
import { type z } from 'zod'
import { FormInput } from '#app/components/forms/form-input-2'
import { FormSearchSelect } from '#app/components/forms/form-search-select'
import { FormTextarea } from '#app/components/forms/form-textarea-2'
import { DotsVerticalIcon } from '#app/components/icons'
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
import { Instruction } from './instruction'
import {
	type CourseModuleInstructionSchema,
	type CourseModuleSchema,
} from './schema'

interface Props {
	tutors: { id: string; name: string }[]
	index: number
	onDelete: () => void
}

export function CourseModule({ tutors, index, onDelete }: Props) {
	const path = `courseModules[${index}]`
	const [value, setValue] =
		useControlField<z.infer<typeof CourseModuleSchema>>(path)

	const { upsert, remove: removeHiddenFields } = useHiddenValues()
	useCallDebouncedCallback(
		() => upsert(omit(value, ['instructions']), path),
		300,
		[value],
	)

	const [isOpen, setIsOpen] = useState(false)
	const originalValue = useOriginalValue({ isOpen, value })

	const { error } = useField(`${path}.instructions`)
	const [instructions, { push, remove }] = useFieldArray<
		z.infer<typeof CourseModuleInstructionSchema>
	>(`${path}.instructions`)

	if (!value) return null

	return (
		<Sheet open={isOpen} onOpenChange={setIsOpen}>
			<SheetTrigger
				className="flex w-full items-center justify-between"
				asChild
			>
				<div className="flex w-full cursor-pointer items-center justify-between rounded-lg border p-1 pl-3 pr-1 hover:bg-foreground/[2%]">
					<span>{value.title}</span>
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
									removeHiddenFields(path)
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
			<SheetContent className="flex flex-col" forceMount>
				<SheetHeader className="px-1">
					<SheetTitle>Module</SheetTitle>
				</SheetHeader>
				<div className="flex flex-grow flex-col gap-3 overflow-scroll px-1">
					<FormInput
						label="Title"
						name={`${path}.title`}
						placeholder="Title"
						value={value.title}
						onChange={e => setValue({ ...value, title: e.target.value })}
					/>
					<FormSearchSelect
						label="Tutor"
						name={`${path}.tutorId`}
						options={tutors.map(t => ({ value: t.id, label: t.name }))}
					/>
					<FormTextarea
						label="Description"
						name={`${path}.description`}
						placeholder="Description"
						value={value.description ?? ''}
						onChange={e => setValue({ ...value, description: e.target.value })}
					/>
					<div className="flex w-full flex-col gap-1">
						<label>Instructions</label>
						<p className="mb-1 text-sm text-muted-foreground">
							Instructions are the building block of a module.
						</p>
						<div className="flex flex-col gap-1">
							{instructions.map(({ key }, i) => (
								<Instruction
									key={key}
									onDelete={() => remove(i)}
									index={i}
									subPath={path}
								/>
							))}
							<Button
								variant="outline"
								onClick={e => {
									e.preventDefault()
									push({
										answerKey: '',
										answerType: 'textarea',
										answerTypeOptions: '',
										prompt: '',
										promptType: 'hardcoded',
										canAskQuestion: false,
										concludingPrompt: '',
										concludingPromptType: 'hardcoded',
										title: 'New instruction',
										interactiveType: 'answer',
									})
								}}
							>
								Add instruction
							</Button>
							{error && <p className="text-destructive-foreground">{error}</p>}
						</div>
					</div>
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
