import { type Upload } from '@prisma/client'
import { useId, useState } from 'react'
import { TrashIcon, UploadIcon } from '#app/components/icons'
import { Button } from '#app/components/ui/button'
import { cn } from '#app/utils/misc'

export const FilesInput = ({
	file,
	index,
	onDelete,
}: {
	file: Upload
	index: number
	onDelete: () => void
}) => {
	const id = useId()
	const [blob, setBlob] = useState(file.blob.toString())
	const [name, setName] = useState(file.name)
	const [contentType, setContentType] = useState(file.contentType)

	return (
		<>
			<input type="hidden" value={blob} name="files_blob" data-index={index} />
			<input type="hidden" value={name} name="files_name" data-index={index} />
			<input
				type="hidden"
				value={contentType}
				name="files_contentType"
				data-index={index}
			/>
			<div
				className={cn('flex w-full cursor-pointer rounded-lg border', {
					'border-dashed border-primary/50 bg-primary/5': !name,
				})}
			>
				<input
					id={id}
					data-index={index}
					name="files_file"
					type="file"
					className="peer sr-only"
					onChange={e => {
						const file = e.currentTarget.files?.[0]
						if (file) {
							setName(file.name)
							setContentType(file.type)
							const reader = new FileReader()
							reader.onload = event => {
								const value = event.target?.result?.toString()

								if (value) {
									setBlob(value)
								}
							}
							reader.readAsDataURL(file)
						}
					}}
					required
				/>
				<label
					htmlFor={id}
					className={cn(
						'flex h-full w-full flex-grow cursor-pointer items-center gap-2 rounded-lg px-2',
						{ 'text-primary': !name },
					)}
				>
					{name ? name : 'Upload'}
					{name ? null : <UploadIcon />}
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
		</>
	)
}
