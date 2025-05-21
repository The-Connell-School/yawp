import { useId } from 'react'
import { useControlField } from 'remix-validated-form'

interface Props
	extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'children'> {
	name: string
	imageName?: string
	children: (props: {
		src: string | null
		pick: () => void
		remove: () => void
	}) => React.ReactNode
}

export function FormImage({
	children,
	name,
	imageName = 'image',
	...props
}: Props) {
	const fallbackId = useId()
	const id = props.id ?? fallbackId
	const [src, setSrc] = useControlField<string | null>(name)

	return (
		<>
			<input type="hidden" value={src ?? ''} name={name} />
			<input
				id={id}
				name={imageName}
				type="file"
				className="hidden"
				accept="image/*"
				onChange={e => {
					const file = e.target.files?.[0]
					if (file) setSrc(URL.createObjectURL(file))
				}}
			/>
			{children({
				src,
				pick: () => document.getElementById(id)?.click(),
				remove: () => {
					setSrc(null)
					// Remove the file from the input so that the same file can be selected again
					document.getElementById(id)?.setAttribute('type', 'text')
					document.getElementById(id)?.setAttribute('type', 'file')
				},
			})}
		</>
	)
}
