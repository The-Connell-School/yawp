import {
	type DocumentCommentResponse,
	type DocumentComment,
	type User,
	type UserImage as PrismaUserImage,
} from '@app/prisma'
import { useFetcher } from 'react-router'
import { useRef, type MouseEvent } from 'react'
import { CheckIcon, TrashIcon } from '~/components/icons'
import { RichTextarea } from '~/components/rich-textarea.js'
import { Button } from '~/components/ui/button'
import { UserImage } from '~/components/user-image'
import { useUser } from '~/hooks/useUser'
import { useDoubleCheck } from '~/utils/misc'
import { timeAgo } from '~/utils/timeAgo'

export type Comment =
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

export const Comment = (comment: Comment) => {
	const deleteCommentFetcher = useFetcher()
	const createCommentResponseFetcher = useFetcher()
	const dc = useDoubleCheck()
	const user = useUser()
	const ref = useRef(null)

	const isTeacherOfCommentUser = user.studentProfiles.find(
		sp => sp.userId === comment.userId,
	)

	const optimisticData = createCommentResponseFetcher.formData
	const optimisticDocumentCommentResponse = optimisticData
		? [
				{
					id: 'unknown',
					createdAt: new Date(),
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

		const mark = document.querySelector(`[data-comment-id="${comment.id}"]`)
		if (mark?.parentNode) {
			while (mark.childNodes.length > 0) {
				mark.parentNode.insertBefore(mark.childNodes[0], mark)
			}

			try {
				mark.parentNode.removeChild(mark)
			} catch (error) {
				// eslint-disable-next-line no-console
				console.error(error)
			}
		}
	}

	return (
		<div
			className='relative flex flex-col rounded-lg bg-muted p-3 transition-all duration-200 ease-in-out'
			id={`comment-${comment.id}`}
			onClick={() => {
				const commentNode = document.getElementById(`comment-${comment.id}`)
				if (commentNode) {
					commentNode.classList.add('bg-primary/20', 'shadow-lg')
				}
				const mark = document.querySelector(`[data-comment-id="${comment.id}"]`)
				if (mark instanceof HTMLElement) {
					mark.classList.add('focused')
					mark.scrollIntoView({ behavior: 'smooth', block: 'center' })
				}
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
					<RichTextarea
						placeholder="Reply..."
						name="content"
						size="sm"
						onCmdEnter={reply}
						className="mt-2 bg-muted"
					/>
			</div>
		</div>
	)
}
