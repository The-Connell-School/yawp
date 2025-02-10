import { useSearchParams } from '@remix-run/react'
import { ArrowRight, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { cn } from '#app/utils/misc'
import { startCase } from '#app/utils/startCase'
import { Button } from '../ui/button'
import {
	Sheet,
	SheetContent,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from '../ui/sheet'
import { FormInput } from './form-input-2'

interface Props {
	name: string
	label?: string
	className?: string
	defaultValue?: string
	formId?: string
}

export function FormListInput({
	name,
	label,
	className,
	defaultValue = '',
	formId,
}: Props) {
	const [searchParams, setSearchParams] = useSearchParams()
	const open = searchParams.get('open') === formId
	const onOpenChange = (open: boolean) => {
		if (open) {
			setSearchParams(prev => {
				prev.set('open', formId ?? '')
				return prev
			})
		} else {
			setSearchParams(prev => {
				prev.delete('open')
				return prev
			})
		}
	}
	const [items, setItems] = useState<string[]>(
		defaultValue ? defaultValue.split(',') : [],
	)
	const [newItem, setNewItem] = useState('')

	const handleAddItem = () => {
		if (newItem.trim()) {
			setItems([...items, newItem.trim()])
			setNewItem('')
		}
	}

	const handleRemoveItem = (index: number) => {
		setItems(items.filter((_, i) => i !== index))
	}

	const handleKeyPress = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter') {
			e.preventDefault()
			handleAddItem()
		}
	}

	return (
		<div className={cn('flex flex-col gap-2', className)}>
			<input type="hidden" name={name} value={items.join(',')} />
			<label>{label ?? startCase(name)}</label>

			<Sheet open={open} onOpenChange={onOpenChange}>
				<SheetTrigger asChild>
					<Button
						type="button"
						variant="outline"
						className="w-full justify-start"
					>
						<span className="flex-1 text-left">{items.length} items</span>
						<ArrowRight className="h-4 w-4" />
					</Button>
				</SheetTrigger>
				<SheetContent className="flex h-full flex-col gap-0 p-0">
					<SheetHeader className="mb-2 p-4">
						<SheetTitle>{label ?? startCase(name)}</SheetTitle>
					</SheetHeader>

					<div className="flex gap-2 border-b px-4 pb-4">
						<FormInput
							name="newItem"
							value={newItem}
							onChange={e => setNewItem(e.target.value)}
							onKeyPress={handleKeyPress}
							className="flex-1"
							hideLabel
						/>
						<Button type="button" onClick={handleAddItem}>
							Add
						</Button>
					</div>

					<div className="flex-1 overflow-y-scroll p-4">
						<div className="flex flex-col gap-2">
							{items.map((item, index) => (
								<div key={index} className="flex items-center gap-2">
									<FormInput
										name={`item-${index}`}
										value={item}
										onChange={e => {
											const newItems = [...items]
											newItems[index] = e.target.value
											setItems(newItems)
										}}
										hideLabel
										className="flex-1"
									/>
									<Button
										type="button"
										variant="ghost"
										onClick={() => handleRemoveItem(index)}
									>
										<Trash2 className="h-4 w-4" />
									</Button>
								</div>
							))}
						</div>
					</div>

					<SheetFooter className="border-t p-4">
						<Button type="submit" form={formId}>
							Save Changes
						</Button>
					</SheetFooter>
				</SheetContent>
			</Sheet>
		</div>
	)
}
