import {
	type DocumentCommentResponse,
	type DocumentComment,
	type User,
	type UserImage as PrismaUserImage,
} from '@prisma/client'
import { useFetcher } from '@remix-run/react'
import { useRef, useState, type MouseEvent } from 'react'
import { CheckIcon, TrashIcon } from '#app/components/icons'
import { RichTextarea } from '#app/components/rich-textarea.js'
import { Button } from '#app/components/ui/button'
import { UserImage } from '#app/components/user-image'
import { useOnClickOutside } from '#app/hooks/useClickOutside'
import { useUser } from '#app/hooks/useUser'
import { cn, useDoubleCheck } from '#app/utils/misc'
import { timeAgo } from '#app/utils/timeAgo'

export type Comment = JsonifyObject<
	DocumentComment & {
		user: Omit<User, 'createdAt' | 'updatedAt'> & {
			image: Pick<PrismaUserImage, 'id'> | null
		}
		responses: (DocumentCommentResponse & {
			user: Omit<User, 'createdAt' | 'updatedAt'> & {
				image: Pick<PrismaUserImage, 'id'> | null
			}
		})[]
	}
>

export const Comment = (comment: Comment) => {
	const deleteCommentFetcher = useFetcher()
	const createCommentResponseFetcher = useFetcher()
	const dc = useDoubleCheck()
	const user = useUser()
	const ref = useRef(null)
	const [isFocused, setFocused] = useState(false)

	useOnClickOutside(ref, () => {
		document.getElementById(comment.highlightId)?.classList.remove('focused')
		setFocused(false)
	})

	const isTeacherOfCommentUser = user.studentProfiles.find(
		sp => sp.userId === comment.userId,
	)

	const optimisticData = createCommentResponseFetcher.formData
	const optimisticDocumentCommentResponse = optimisticData
		? [
				{
					id: 'unknown',
					createdAt: new Date().toISOString(),
					content: optimisticData.get('content') as string,
					commentId: comment.id,
					userId: user.id,
					user: user as any,
				},
			]
		: []

	const reply = (content: string) =>
		createCommentResponseFetcher.submit(
			{ commentId: comment.id, content },
			{ method: 'POST', action: '/api/model/document-comment-response' },
		)

	const deleteComment = (event: MouseEvent<HTMLButtonElement>) => {
		event.preventDefault()
		event.stopPropagation()

		deleteCommentFetcher.submit(null, {
			method: 'DELETE',
			action: `/api/model/document-comment/${comment.id}`,
		})

		// Remove the associated highlight from the text
		const mark = document.getElementById(comment.highlightId)
		if (mark?.parentNode) {
			while (mark.childNodes.length > 0) {
				mark.parentNode.insertBefore(mark.childNodes[0], mark)
			}
		}
	}

	return (
		<div
			className={cn(
				'relative flex flex-col rounded-lg bg-muted p-3 shadow-sm transition-all duration-200 ease-in-out',
				{ 'bg-primary/20 shadow-lg': isFocused },
			)}
			id={`${comment.highlightId}-comment`}
			onClick={() => {
				if (isFocused) return
				setFocused(true)
				document.getElementById(comment.id)?.scrollIntoView({
					behavior: 'smooth',
					block: 'center',
				})
				document.getElementById(comment.highlightId)?.classList.add('focused')
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
						{...dc.getButtonProps({
							onClick: event => {
								event.stopPropagation()
								if (dc.doubleCheck) {
									deleteComment(event)
								}
							},
						})}
						type="submit"
						size="icon-sm"
						variant={dc.doubleCheck ? 'destructive' : 'ghost'}
					>
						{dc.doubleCheck ? <CheckIcon /> : <TrashIcon />}
					</Button>
				) : null}
			</div>
			<div className="flex flex-col gap-2">
				{comment.responses
					.concat(optimisticDocumentCommentResponse)
					.map(response => (
						<div key={response.id}>
							<div className="mt-1 flex items-center gap-2">
								<UserImage user={response.user} size="xxs" />
								<div>
									<p className="text-xs font-semibold">{response.user.name}</p>
									<p className="text-xs text-muted-foreground">
										{timeAgo(new Date(response.createdAt))}
									</p>
								</div>
							</div>
							<p className="mt-1 whitespace-pre-line text-sm">
								{response.content}
							</p>
						</div>
					))}
				{isFocused ? (
					<RichTextarea
						autoFocus
						placeholder="Reply..."
						name="content"
						size="sm"
						onCmdEnter={reply}
						className="mt-2"
					/>
				) : null}
			</div>
		</div>
	)
}
