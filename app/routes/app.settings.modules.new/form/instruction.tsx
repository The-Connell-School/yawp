import { useState, useEffect } from 'react'
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
import { Tooltip } from '#app/components/ui/tooltip'
import { usePrevious } from '#app/hooks/usePrevious'
import { type InstructionSchema } from './schema'

interface Props {
	index: number
	onDelete: () => void
}

const useOriginalValue = <T,>({
	isOpen,
	value,
}: {
	isOpen: boolean
	value: T
}) => {
	const [original, setOriginal] = useState<T>()
	const wasOpen = usePrevious(isOpen)

	useEffect(() => {
		if (isOpen && !wasOpen) {
			setOriginal(value)
		}
	}, [value, wasOpen, isOpen])

	return original
}

export function Instruction({ index, onDelete }: Props) {
	const [value, setValue] = useControlField<z.infer<typeof InstructionSchema>>(
		`instructions[${index}]`,
	)
	const [isOpen, setIsOpen] = useState(false)
	const originalValue = useOriginalValue({ isOpen, value })

	if (!value) return null

	return (
		<>
			{/* Because the inputs hide on sheet close,
					we need to maintain hidden inputs that track those values */}
			{[
				'title',
				'answerKey',
				'answerType',
				'answerTypeOptions',
				'prompt',
				'promptType',
				'concludingPrompt',
				'concludingPromptType',
				'canAskQuestion',
			].map(key => (
				<input
					key={key}
					type="hidden"
					name={`instructions[${index}].${key}`}
					// @ts-ignore
					value={value[key]}
				/>
			))}
			<Sheet open={isOpen} onOpenChange={() => setIsOpen(!isOpen)}>
				<SheetTrigger asChild>
					<div className="flex w-full cursor-pointer items-center justify-between rounded-lg border p-1 pl-3 pr-1 hover:bg-foreground/[2%]">
						<span>{value.title}</span>
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
								<DropdownMenuItem onClick={onDelete} className="cursor-pointer">
									Delete
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</SheetTrigger>
				<SheetContent className="sm:max-w-screen flex w-screen flex-col rounded-l-xl px-4 py-5 sm:w-[600px]">
					<SheetHeader className="px-1">
						<SheetTitle>Instruction</SheetTitle>
					</SheetHeader>
					<div className="flex flex-grow flex-col gap-4 overflow-scroll px-1">
						<FormInput
							label="Title"
							name={`instructions[${index}].title2`}
							placeholder="Title"
							value={value.title}
							onChange={e => setValue({ ...value, title: e.target.value })}
						/>
						<FormRadioGroup
							options={[
								{
									value: 'hardcoded',
									label: 'Hardcoded',
									info: 'The prompt below will be given to the student word-for-word.',
								},
								{
									value: 'ai',
									label: 'AI',
									info: 'The prompt below will be sent to GPT-4. That response will be given to the student.',
								},
							]}
							className="gap-1"
							label="Prompt type"
							name={`instructions[${index}].promptType`}
						/>
						<FormTextarea
							label="Prompt"
							name={`instructions[${index}].prompt`}
							placeholder="Welcome student! Begin by introducing yourself."
							labelInfo="Depending on the above selection, this will either be sent to the student word-for-word, or this text will first be sent to GPT-4 and then given to the student."
							value={value.prompt}
							onChange={e => setValue({ ...value, prompt: e.target.value })}
						/>
						<FormRadioGroup
							options={[
								{ value: 'textarea', label: 'Text Area' },
								{ value: 'select', label: 'Select' },
							]}
							className="gap-1"
							label="Answer type"
							name={`instructions[${index}].answerType`}
						/>
						{value.answerType === 'select' ? (
							<FormInput
								label="Answer options"
								name={`instructions[${index}].answerTypeOptions`}
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
								name={`instructions[${index}].canAskQuestion`}
								checked={value.canAskQuestion}
								onCheckedChange={canAskQuestion =>
									setValue({ ...value, canAskQuestion })
								}
							/>
						) : null}
						<FormTextarea
							subLabel={
								<p className="flex flex-wrap gap-1 text-sm text-muted-foreground">
									Use variables to reference specific values. Options:
									<span className="flex items-center gap-1">
										<code className="text-xs">{`user_content`}</code>{' '}
										<Tooltip text="Document text">
											<InfoCircledIcon className="h-3.5 w-3.5" />
										</Tooltip>
									</span>
									<span className="mt-0.5 flex items-center gap-1">
										<code className="text-xs">{`user_input`}</code>{' '}
										<Tooltip text="User input from text area or select options">
											<InfoCircledIcon className="h-3.5 w-3.5" />
										</Tooltip>
									</span>
								</p>
							}
							placeholder={`I.e. "the content should be 3 sentences or more"`}
							name={`instructions[${index}].answerKey`}
							label="Answer key"
							labelInfo="Describe the end goal of this instruction. This content will be checked by GPT-4 to consider whether or not a student has successfully completed the instruction"
							value={value.answerKey ?? ''}
							onChange={e => setValue({ ...value, answerKey: e.target.value })}
						/>
						<FormRadioGroup
							options={[
								{
									value: 'hardcoded-concluding-prompt',
									label: 'Hardcoded',
									info: 'The prompt below will be given to the student word-for-word.',
								},
								{
									value: 'ai-concluding-prompt',
									label: 'AI',
									info: 'The prompt below will be sent to GPT-4. That response will be given to the student.',
								},
							]}
							className="gap-1"
							label="Concluding prompt type"
							name={`instructions[${index}].concludingPromptType`}
						/>
						<FormTextarea
							label="Concluding prompt"
							name={`instructions[${index}].concludingPrompt`}
							placeholder="Congratulation, you've complete this step!"
							labelInfo="Depending on the above selection, this will either be sent to the student word-for-word, or this text will first be sent to GPT-4 and then given to the student."
							value={value.concludingPrompt ?? ''}
							onChange={e =>
								setValue({ ...value, concludingPrompt: e.target.value })
							}
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
		</>
	)
}
