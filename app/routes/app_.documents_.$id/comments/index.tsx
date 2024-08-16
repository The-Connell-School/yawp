import { type Fetcher, useFetchers } from '@remix-run/react'
import { useEffect } from 'react';
import { useUser } from '#app/hooks/useUser'
import { Comment, type Comment as CommentType } from './comment'

type Props = { comments: CommentType[] }

export const Comments = ({ comments }: Props) => {
	const user = useUser()
	const fetcher = useFetchers().find(f => f.key === 'create-document-comment')

	useBlurComments(comments)
	useFocusOptimisticComment(fetcher)

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
		<div className="no-scrollbar no-scrollbar h-full w-full overflow-y-scroll md:w-3/5">
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

const useBlurComments = (comments: CommentType[]) => {
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			comments.forEach(comment => {
				const commentElement = document.getElementById(`comment-${comment.id}`);
				const commentMark = document.querySelector(`[data-comment-id="${comment.id}"]`);
				const clickedElement = commentElement?.contains(event.target as Node)
				const clickedMark = commentMark?.contains(event.target as Node)

				if (clickedElement || clickedMark) {
					return
				}

				commentElement?.classList.remove('bg-primary/20', 'shadow-lg');
				commentMark?.classList.remove('focused');
			});
		};

		document.addEventListener('click', handleClickOutside);

		return () => {
			document.removeEventListener('click', handleClickOutside);
		};
	}, [comments]);
}

const useFocusOptimisticComment = (fetcher: Fetcher | undefined) => {
	useEffect(() => {
		if (fetcher && fetcher.state === 'idle' && fetcher.data) {
			const comment = document.getElementById(`comment-${fetcher.data.id}`);
			if (comment) {
				comment.scrollIntoView({ behavior: 'smooth' });
				comment.classList.add('bg-primary/20', 'shadow-lg');
			}
		}
	}, [fetcher]);
}
