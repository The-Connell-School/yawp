import omit from 'lodash/omit'
import { GripIcon } from 'lucide-react'
import { useState } from 'react'
import { useControlField, useField, useFieldArray } from 'remix-validated-form'
import { type z } from 'zod'
import { FormInput } from '~/components/forms/form-input-2'
import { FormTextarea } from '~/components/forms/form-textarea-2'
import { DotsVerticalIcon } from '~/components/icons'
import { Button } from '~/components/ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import {
	Sheet,
	SheetContent,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from '~/components/ui/sheet'
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from '~/components/ui/tabs'
import { useHiddenValues } from '~/contexts/hidden-values'
import { useCallDebouncedCallback } from '~/hooks/useCallDebouncedCallback'
import { useDragAndDrop } from '~/hooks/useDragAndDrop.js'
import { useOriginalValue } from '~/hooks/useOriginalValue'
import { Instruction } from './instruction'
import {
	type CourseModuleInstructionSchema,
	type CourseModuleSchema,
} from './schema'

interface Props {
	name: string
	onDelete: () => void
	onDragStart: (e: React.DragEvent) => void
	onDrop: (e: React.DragEvent) => void
	onDragOver: (e: React.DragEvent) => void
	onDragLeave: (e: React.DragEvent) => void
}

export function CourseModule({
	name,
	onDelete,
	onDragStart,
	onDrop,
	onDragOver,
	onDragLeave,
}: Props) {
	const [value, setValue] =
		useControlField<z.infer<typeof CourseModuleSchema>>(name)

	const {
		upsert,
		remove: removeHiddenFields,
		move: moveHiddenFields,
	} = useHiddenValues()

	useCallDebouncedCallback(
		() => upsert(omit(value, ['instructions']), name),
		300,
		[value],
	)

	const [isOpen, setIsOpen] = useState(false)
	const originalValue = useOriginalValue({ isOpen, value })

	const { error } = useField(`${name}.instructions`)
	const [instructions, { push, remove, move }] = useFieldArray<
		z.infer<typeof CourseModuleInstructionSchema>
	>(`${name}.instructions`)

	const getDragHandlers = useDragAndDrop({
		onDrop: (from, to) => {
			move(from, to)
			moveHiddenFields(
				`${name}.instructions[${from}]`,
				`${name}.instructions[${to}]`,
			)
		},
	})

	if (!value) return null

	return (
		<Sheet open={isOpen} onOpenChange={setIsOpen}>
			<SheetTrigger
				className="flex w-full items-center justify-between"
				asChild
			>
				<div
					className={`
						transition-margin flex w-full cursor-pointer items-center rounded-lg
						border p-1 pl-3 pr-1 duration-300 ease-in-out hover:bg-foreground/[2%]
					`}
					draggable
					onDragStart={onDragStart}
					onDrop={onDrop}
					onDragOver={onDragOver}
					onDragLeave={onDragLeave}
				>
					<span className="grow">{value.title}</span>
					<GripIcon size={15} className="cursor-grab opacity-50" />
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
					<SheetTitle>Module</SheetTitle>
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
					<Tabs
						defaultValue={value.isSelfGuided ? 'self' : 'tutor'}
						className="w-full"
						onValueChange={val =>
							setValue({ ...value, isSelfGuided: val === 'self' })
						}
					>
						<TabsList className="w-full">
							<TabsTrigger value="tutor" className="w-full">
								Tutor-guided
							</TabsTrigger>
							<TabsTrigger value="self" className="w-full">
								Self-guided
							</TabsTrigger>
						</TabsList>
						<TabsContent value="tutor" className="flex flex-col gap-4">
							<FormTextarea
								label="Context"
								subLabel="Add instructions & context for the tutor."
								name={`${name}.tutorInstructions`}
								placeholder="You are a helpful tutor..."
								value={value.tutorInstructions ?? ''}
								onChange={e =>
									setValue({ ...value, tutorInstructions: e.target.value })
								}
							/>
							<div className="flex w-full flex-col gap-1">
								<label>Instructions</label>
								<p className="mb-1 text-sm text-muted-foreground">
									Instructions are the building block of a module.
								</p>
								<div
									className="flex flex-col gap-1"
									onDragOver={e => e.preventDefault()}
								>
									{instructions.map(({ key }, i) => (
										<Instruction
											key={key}
											onDelete={() => remove(i)}
											name={`${name}.instructions[${i}]`}
											{...getDragHandlers(i)}
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
												canAskQuestion: false,
												title: 'New instruction',
												interactiveType: 'answer',
											})
										}}
									>
										Add instruction
									</Button>
									{error && (
										<p className="text-destructive-foreground">{error}</p>
									)}
								</div>
							</div>
						</TabsContent>
						<TabsContent value="self" className="flex flex-col gap-4">
							<p className="text-sm text-muted-foreground">
								This module will be self-guided. Students will work through the
								content independently without tutor assistance.
							</p>
						</TabsContent>
					</Tabs>
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
