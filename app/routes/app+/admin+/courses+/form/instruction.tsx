import { GripIcon } from 'lucide-react'
import { useState } from 'react'
import { useControlField } from 'remix-validated-form'
import { type z } from 'zod'
import { FormInput } from '#app/components/forms/form-input-2'
import { FormRadioGroup } from '#app/components/forms/form-radio-group-2'
import { FormSwitch } from '#app/components/forms/form-switch-2'
import { FormTextarea } from '#app/components/forms/form-textarea-2'
import { DotsVerticalIcon, InfoCircledIcon } from '#app/components/icons'
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
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from '#app/components/ui/tabs'
import { Tooltip } from '#app/components/ui/tooltip'
import { useHiddenValues } from '#app/contexts/hidden-values'
import { useCallDebouncedCallback } from '#app/hooks/useCallDebouncedCallback'
import { useOriginalValue } from '#app/hooks/useOriginalValue'
import { InstructionInteraction } from '#app/routes/api+/domain+/tutor-response.js'
import { type CourseModuleInstructionSchema } from './schema'

interface Props {
	name: string
	onDelete: () => void
	onDragStart: (e: React.DragEvent) => void
	onDrop: (e: React.DragEvent) => void
	onDragOver: (e: React.DragEvent) => void
	onDragLeave: (e: React.DragEvent) => void
}

export function Instruction({
	name,
	onDelete,
	onDragStart,
	onDrop,
	onDragOver,
	onDragLeave,
}: Props) {
	const [value, setValue] =
		useControlField<z.infer<typeof CourseModuleInstructionSchema>>(name)

	const [isOpen, setIsOpen] = useState(false)
	const originalValue = useOriginalValue({ isOpen, value })

	const { upsert, remove } = useHiddenValues()
	useCallDebouncedCallback(() => upsert(value, name), 300, [value])

	if (!value) return null

	return (
		<Sheet open={isOpen} onOpenChange={() => setIsOpen(!isOpen)}>
			<SheetTrigger asChild>
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
							>
								<DotsVerticalIcon />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent>
							<DropdownMenuItem
								onClick={() => {
									remove(name)
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
			<SheetContent className="flex w-screen flex-col rounded-l-xl px-4 py-5 sm:w-[550px] sm:max-w-[95%]">
				<SheetHeader className="px-1">
					<SheetTitle>Instruction</SheetTitle>
				</SheetHeader>
				<div className="no-scrollbar flex flex-grow flex-col gap-4 overflow-scroll px-1">
					<FormInput
						label="Title"
						name={`${name}.title`}
						placeholder="Title"
						value={value.title}
						onChange={e => setValue({ ...value, title: e.target.value })}
					/>
					<FormTextarea
						label="Prompt"
						name={`${name}.prompt`}
						placeholder="Welcome student! Begin by introducing yourself."
						labelInfo="This wil be sent to the student word-for-word."
						value={value.prompt}
						onChange={e => setValue({ ...value, prompt: e.target.value })}
					/>
					<FormRadioGroup
						options={[
							{ value: 'textarea', label: 'Text Area' },
							{ value: 'select', label: 'Select' },
						]}
						className="gap-1"
						label="Response type"
						name={`${name}.answerType`}
					/>
					<div className="flex flex-col gap-1">
						{value.answerType === 'select' ? (
							<FormInput
								label="Response options"
								name={`${name}.answerTypeOptions`}
								placeholder="I'm done, I need help, Give a hint"
								value={value.answerTypeOptions ?? ''}
								onChange={e =>
									setValue({ ...value, answerTypeOptions: e.target.value })
								}
							/>
						) : null}
						{value.answerType === 'select' ? (
							<FormSwitch
								label="Can ask a question?"
								className="flex w-full items-center justify-between gap-2 rounded-lg border bg-muted/50 p-2"
								name={`${name}.canAskQuestion`}
								checked={value.canAskQuestion ?? false}
								onCheckedChange={canAskQuestion =>
									setValue({ ...value, canAskQuestion })
								}
							/>
						) : null}
					</div>
					<Tabs
						className="w-full"
						value={value.interactiveType}
						onValueChange={interactiveType =>
							setValue({ ...value, interactiveType })
						}
					>
						<TabsList className="w-full">
							<TabsTrigger
								value={InstructionInteraction.Answer}
								className="w-full"
							>
								Answer
							</TabsTrigger>
							<TabsTrigger
								value={InstructionInteraction.Dialogue}
								className="w-full"
							>
								Dialogue
							</TabsTrigger>
						</TabsList>
						<TabsContent
							value={InstructionInteraction.Answer}
							className="flex flex-col gap-4"
						>
							<p className="text-sm text-muted-foreground">
								Give your tutor something to guide the student towards. When
								they've reached the answer, the tutor will consider this
								instruction satisifed.
							</p>
							<div>
								<FormTextarea
									subLabel={
										<p className="flex flex-wrap gap-1 text-sm text-muted-foreground">
											Leave empty if the student can answer with anything. If
											you need a specific answer, specify the requirements that
											satisfy the answer
										</p>
									}
									placeholder={`I.e. "the content should be 3 sentences or more"`}
									name={`${name}.answerKey`}
									label="Answer"
									value={value.answerKey ?? ''}
									onChange={e =>
										setValue({ ...value, answerKey: e.target.value })
									}
								/>
								<div className="mt-0.5 flex gap-2">
									<p className="text-sm text-muted-foreground">Variables: </p>
									<span className="flex items-center gap-1">
										<code className="text-xs">{`content`}</code>{' '}
										<Tooltip text="Document text">
											<InfoCircledIcon className="h-3.5 w-3.5" />
										</Tooltip>
									</span>
									<span className="mt-0.5 flex items-center gap-1">
										<code className="text-xs">{`response`}</code>{' '}
										<Tooltip text="User input from text area or select options">
											<InfoCircledIcon className="h-3.5 w-3.5" />
										</Tooltip>
									</span>
									<span className="mt-0.5 flex items-center gap-1">
										<code className="text-xs">{`answerKey`}</code>{' '}
										<Tooltip text="The value in the textarea above. I.e. referencing itself.">
											<InfoCircledIcon className="h-3.5 w-3.5" />
										</Tooltip>
									</span>
								</div>
							</div>
						</TabsContent>
						<TabsContent value={InstructionInteraction.Dialogue}>
							<FormTextarea
								label="Tutor Instructions"
								name={`${name}.tutorInstructions`}
								placeholder="Guide students through the first part of the course. First..."
								value={value.tutorInstructions ?? ''}
								onChange={e =>
									setValue({ ...value, tutorInstructions: e.target.value })
								}
							/>
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
