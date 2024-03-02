import { useInputControl } from '@conform-to/react'
import { type Upload } from '@prisma/client'
import { useId, type InputHTMLAttributes } from 'react'
import { TrashIcon, UploadIcon } from '#app/components/icons'
import { cn } from '#app/utils/misc'
import { Button } from '../ui/button'

export const FormFileInput = ({
	field,
	index,
	onDelete,
	...props
}: InputHTMLAttributes<HTMLInputElement> & {
	field: any
	index: number
	onDelete: () => void
}) => {
	const control = useInputControl(field)
	const fallbackId = useId()
	const id = props.id ?? fallbackId

	const value = control.value as unknown as Upload
	const hasFile = value.blob.length > 0

	return (
		<div
			className={cn('flex w-full cursor-pointer rounded-lg border', {
				'border-dashed border-primary/50 bg-primary/5': !hasFile,
			})}
		>
			<input
				{...props}
				id={id}
				data-index={index}
				type="file"
				accept=".txt,.html,.xml,.pdf"
				className="peer sr-only"
				required
				onChange={e => {
					const file = e.currentTarget.files?.[0]
					if (file) {
						const reader = new FileReader()
						reader.onload = event => {
							const value = event.target?.result?.toString()

							if (value) {
								control.change({
									blob: value,
									name: file.name,
									contentType: file.type,
								} as any)
							}
						}
						reader.readAsDataURL(file)
					}
				}}
			/>
			<label
				htmlFor={id}
				className={cn(
					'flex h-full w-full flex-grow cursor-pointer items-center gap-2 rounded-lg px-2',
					{ 'text-primary': !hasFile },
				)}
			>
				{hasFile ? value.name : 'Upload'}
				{hasFile ? null : <UploadIcon />}
			</label>
			<Button
				variant="ghost"
				onClick={e => {
					e.preventDefault()
					onDelete?.()
				}}
			>
				<TrashIcon />
			</Button>
		</div>
	)
}
