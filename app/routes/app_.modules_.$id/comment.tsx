import {
	type DocumentCommentResponse,
	type DocumentComment,
	type User,
	type UserImage,
} from '@prisma/client'
import { useFetcher } from '@remix-run/react'
import { SendHorizontalIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { FormTextarea } from '#app/components/forms/form-textarea'
import { CheckIcon, TrashIcon } from '#app/components/icons'
import { Button } from '#app/components/ui/button'
import { useOnClickOutside } from '#app/hooks/useClickOutside'
import { useUser } from '#app/hooks/useUser'
import { cn, getUserImgSrc } from '#app/utils/misc'
import { timeAgo } from '#app/utils/timeAgo'

export const Comment = ({
	comment,
	id,
	highlightId,
	courseModuleSessionId,
}: {
	id: string
	courseModuleSessionId: string
	comment: DocumentComment & {
		user: User & { image: UserImage }
		responses: (DocumentCommentResponse & {
			user: User & { image: UserImage }
		})[]
	}
	highlightId: string
}) => {
	const ref = useRef(null)
	const deleteButtonRef = useRef(null)
	const textareaRef = useRef<HTMLTextAreaElement | null>(null)
	const user = useUser()
	const fetcher = useFetcher()
	const [isFocused, setFocused] = useState(false)
	const [dc, setDc] = useState(false)
	const onClickOutside = () => {
		document.getElementById(highlightId)?.classList.remove('focused')
		setFocused(false)
	}

	useOnClickOutside(deleteButtonRef, () => setDc(false))
	useOnClickOutside(ref, onClickOutside)

	const isTeacherOfCommentUser = user.studentProfiles.find(
		sp => sp.userId === comment.userId,
	)

	const isFetching =
		fetcher.formData?.get('intent') === 'create-document-comment-response' &&
		fetcher.formData?.get('commentId') === comment.id
	const newResponse = isFetching
		? [
				{
					id: 'unknown',
					createdAt: new Date().toISOString(),
					content: fetcher.formData?.get('commentResponse') as string,
					commentId: comment.id,
					userId: user.id,
					user: user as any,
				},
			]
		: []
	const responses = comment.responses.concat(newResponse as any)

	const onChange = () => {
		if (textareaRef.current) {
			textareaRef.current.style.height = '32px'
			textareaRef.current.style.height =
				Math.max(32, textareaRef.current.scrollHeight + 2) + 'px'
		}
	}

	const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (
			(event.metaKey || event.ctrlKey) &&
			event.key === 'Enter' &&
			event.currentTarget.value
		) {
			event.preventDefault()

			if (event.currentTarget.form) {
				const input = document.getElementById(
					`comment-${comment.id}-response`,
				) as HTMLInputElement

				if (input.value) {
					const formData = new FormData()
					formData.append('commentId', comment.id)
					formData.append('courseModuleSessionId', courseModuleSessionId)
					formData.append('commentResponse', input.value.trim())
					formData.append('intent', 'create-document-comment-response')
					fetcher.submit(formData, { method: 'POST' })
					input.value = ''
				}
			}

			textareaRef.current!.value = ''

			if (textareaRef.current) {
				const lineHeight = parseFloat(
					getComputedStyle(textareaRef.current).lineHeight,
				)
				textareaRef.current.style.height = Math.max(50, lineHeight) + 'px'
			}
		}
	}

	return (
		<div
			className={cn(
				'relative flex flex-col overflow-hidden rounded-lg bg-muted p-4 shadow-sm transition-all duration-200 ease-in-out',
				{ 'bg-primary/20 shadow-lg': isFocused },
			)}
			id={id}
			onClick={() => {
				if (isFocused) return
				setFocused(true)
				document.getElementById(id)?.scrollIntoView({
					behavior: 'smooth',
					block: 'center',
				})
				document.getElementById(highlightId)?.classList.add('focused')
			}}
			ref={ref}
		>
			<div className="flex items-center gap-1">
				<p className="w-full border-l-2 border-muted-foreground/50 pl-2 text-sm italic">
					{comment.content.length > 90
						? comment.content.slice(0, 90) + '...'
						: comment.content}
				</p>
				{comment.userId === user.id || isTeacherOfCommentUser ? (
					<Button
						size="icon-sm"
						ref={deleteButtonRef}
						variant={dc ? 'destructive' : 'ghost'}
						className="opacity-50 hover:opacity-100"
						onClick={e => {
							e.preventDefault()
							e.stopPropagation()

							if (dc) {
								const formData = new FormData()
								formData.append('commentId', comment.id)
								formData.append('courseModuleSessionId', courseModuleSessionId)
								formData.append('intent', 'delete-document-comment')
								fetcher.submit(formData, { method: 'POST' })

								const mark = document.getElementById(highlightId)
								if (mark?.parentNode) {
									while (mark.childNodes.length > 0) {
										mark.parentNode.insertBefore(mark.childNodes[0], mark)
									}
								}
							} else {
								setDc(true)
							}
						}}
					>
						{dc ? <CheckIcon /> : <TrashIcon />}
					</Button>
				) : null}
			</div>
			<div className="flex flex-col gap-2">
				{responses.map(response => (
					<div key={response.id}>
						<div className="mt-2 flex items-center gap-2">
							<img
								src={getUserImgSrc(response.user.image?.id)}
								alt={response.user.name ?? response.user.email}
								className="h-6 w-6 min-w-6 rounded-full object-cover"
							/>
							<div>
								<p className="text-sm font-semibold">{response.user.name}</p>
								<p className="text-sm text-muted-foreground">
									{timeAgo(new Date(response.createdAt))}
								</p>
							</div>
						</div>
						<p className="mt-2 whitespace-pre-line text-sm">
							{response.content}
						</p>
					</div>
				))}
				<div
					className={cn('mt-2 hidden w-full items-end gap-1.5', {
						flex: isFocused,
					})}
				>
					<FormTextarea
						textareaProps={{
							placeholder: 'Reply...',
							required: true,
							size: 'sm',
							name: 'DocumentcommentResponse',
							id: `comment-${comment.id}-response`,
							className: 'no-scrollbar my-auto w-full resize-none',
							onChange,
							onKeyDown,
						}}
						className="w-full"
						ref={textareaRef}
					/>
					<Button
						size="icon-sm"
						className="px-2"
						onClick={e => {
							e.preventDefault()

							const input = document.getElementById(
								`comment-${comment.id}-response`,
							) as HTMLInputElement

							if (input.value) {
								const formData = new FormData()
								formData.append('commentId', comment.id)
								formData.append('courseModuleSessionId', courseModuleSessionId)
								formData.append('commentResponse', input.value.trim())
								formData.append('intent', 'create-document-comment-response')
								fetcher.submit(formData, { method: 'POST' })
								input.value = ''
							}
						}}
					>
						<SendHorizontalIcon className="h-4 w-4" />
					</Button>
				</div>
			</div>
		</div>
	)
}
