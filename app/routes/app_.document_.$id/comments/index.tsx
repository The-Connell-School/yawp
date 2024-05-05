import { useFetchers } from '@remix-run/react'
import { useUser } from '#app/hooks/useUser'
import { Comment, type Comment as CommentType } from './comment'

type Props = { comments: CommentType[] }

export const Comments = ({ comments }: Props) => {
	const user = useUser()
	const fetcher = useFetchers().find(f => f.key === 'create-document-comment')

	const optimisticComment: CommentType | [] = fetcher?.formData
		? {
				user,
				id: 'optimistic-document-comment',
				createdAt: new Date().toISOString(),
				userId: user.id,
				content: fetcher.formData.get('content') as string,
				highlightId: fetcher.formData.get('highlightId') as string,
				responses: [],
				documentId: '',
			}
		: []

	return (
		<div className="h-full w-full overflow-scroll md:w-3/5">
			{comments.length > 0 ? (
				<div className="flex flex-col gap-2 p-2">
					{comments.concat(optimisticComment).map(comment => (
						<Comment key={comment.id} {...comment} />
					))}
				</div>
			) : (
				<p className="my-auto h-full p-4 text-center text-muted-foreground">
					No comments yet.
				</p>
			)}
		</div>
	)
}
