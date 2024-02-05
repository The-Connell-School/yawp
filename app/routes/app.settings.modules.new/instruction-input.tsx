import { type Instruction as PrismaInstruction } from '@prisma/client'
import { useState, type ReactNode, useEffect } from 'react'
import { FormRadioGroup } from '#app/components/forms/form-radio-group'
import { FormTextarea } from '#app/components/forms/form-textarea'
import { DotsVerticalIcon } from '#app/components/icons'
import { Button } from '#app/components/ui/button'
import {
	Dialog as DialogComponent,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '#app/components/ui/dialog'
import {
	Drawer as DrawerComponent,
	DrawerTrigger,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
	DrawerFooter,
	DrawerDescription,
} from '#app/components/ui/drawer'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '#app/components/ui/dropdown-menu'
import useBreakpoint from '#app/hooks/useBreakpoint'
import { usePrevious } from '#app/hooks/usePrevious'

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

type ParentProps<T> = {
	trigger: ReactNode
	children: ReactNode
	description?: string
	title: string
	value: T
	onSave: () => void
	onCancel: (prev: T) => void
}

const Dialog = <T,>({
	trigger,
	children,
	description,
	title,
	onCancel,
	onSave,
	value,
}: ParentProps<T>) => {
	const [isOpen, setIsOpen] = useState(false)
	const originalValue = useOriginalValue({ isOpen, value })

	return (
		<DialogComponent open={isOpen} onOpenChange={() => setIsOpen(!isOpen)}>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>
				{children}
				<DialogFooter>
					<Button
						onClick={e => {
							e.preventDefault()
							onSave()
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
							if (originalValue) onCancel(originalValue)
						}}
					>
						Cancel
					</Button>
				</DialogFooter>
			</DialogContent>
		</DialogComponent>
	)
}

const Drawer = <T,>({
	trigger,
	children,
	description,
	title,
	onCancel,
	onSave,
	value,
}: ParentProps<T>) => {
	const [isOpen, setIsOpen] = useState(false)
	const originalValue = useOriginalValue({ isOpen, value })

	return (
		<DrawerComponent open={isOpen} onOpenChange={() => setIsOpen(!isOpen)}>
			<DrawerTrigger asChild>{trigger}</DrawerTrigger>x{' '}
			<DrawerContent>
				<DrawerHeader>
					<DrawerTitle>{title}</DrawerTitle>
					<DrawerDescription>{description}</DrawerDescription>
				</DrawerHeader>
				{children}
				<DrawerFooter>
					<Button
						onClick={e => {
							e.preventDefault()
							onSave()
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
							if (originalValue) onCancel(originalValue)
						}}
					>
						Cancel
					</Button>
				</DrawerFooter>
			</DrawerContent>
		</DrawerComponent>
	)
}

type Instruction = Omit<
	PrismaInstruction,
	'createdAt' | 'updatedAt' | 'moduleId' | 'id'
> & { id?: string }

export function InstructionInput({
	instruction,
	onDelete,
	onCancel,
	onSave,
	index,
}: {
	onDelete: () => void
	onCancel: (prev: Instruction) => void
	onSave: () => void
	instruction: Instruction
	index: number
}) {
	const breakpoint = useBreakpoint()
	const isDesktop = ['lg', 'xl', '2xl'].includes(breakpoint ?? '')
	const Parent = isDesktop ? Dialog : Drawer

	return (
		<>
			<input
				name="instructions_promptType"
				type="hidden"
				value={instruction.promptType}
			/>
			<input
				name="instructions_prompt"
				type="hidden"
				value={instruction.prompt}
			/>
			<input
				name="instructions_answerKey"
				type="hidden"
				value={instruction.answerKey}
			/>
			<Parent
				value={instruction}
				onCancel={onCancel}
				onSave={onSave}
				title={`Instruction #${index + 1}`}
				trigger={
					<div className="flex w-full cursor-pointer items-center justify-between rounded-lg border p-1 pl-3 pr-1 hover:bg-foreground/[2%]">
						<span>Instruction #{index + 1}</span>
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
				}
			>
				<div className="flex flex-col gap-4">
					<FormRadioGroup
						index={index}
						radioGroupProps={{
							className: 'gap-1',
							options: [
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
							],
							defaultValue: instruction.promptType,
							name: 'instructions_promptType',
						}}
						labelProps={{ children: 'Prompt Type' }}
					/>
					<FormTextarea
						index={index}
						textareaProps={{
							placeholder: 'Welcome student! Begin by introducing yourself.',
							name: 'instructions_prompt',
							defaultValue: instruction.prompt,
							required: true,
						}}
						labelProps={{
							children: 'Prompt',
							info: `
              Depending on the above selection, this will either be sent to the student
							word-for-word, or this text will first be sent to GPT-4 and then given to the student.
            `,
						}}
					/>
					<FormTextarea
						index={index}
						textareaProps={{
							placeholder:
								'The answer is 55. If they guess 10 above or below, they are correct.',
							name: 'instructions_answerKey',
							defaultValue: instruction.answerKey,
							required: true,
						}}
						labelProps={{
							children: 'Answer Key',
							info: `
								Describe the end goal of this instruction. This content will be
								checked by GPT-4 to consider whether or not a student has
								successfully completed the instruction
							`,
						}}
					/>
				</div>
			</Parent>
		</>
	)
}
