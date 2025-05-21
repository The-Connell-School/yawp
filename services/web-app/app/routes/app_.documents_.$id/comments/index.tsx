import { type Fetcher, useFetchers } from 'react-router'
import { MessageCircleOff, MessageCircle } from 'lucide-react'
import { useEffect } from 'react';
import { useLocalStorage } from 'usehooks-ts';
import { Button } from '~/components/ui/button'
import { useUser } from '~/hooks/useUser'
import { cn } from '~/utils/misc'
import { Comment, type Comment as CommentType } from './comment'

type Props = { comments: CommentType[] }

export const Comments = ({ comments }: Props) => {
	const user = useUser()
	const fetcher = useFetchers().find(f => f.key === 'create-document-comment')
	const [commentsExpanded, setCommentsExpanded] = useLocalStorage(`commentsExpanded-${comments[0]?.documentId}`, true)

	useBlurComments(comments)
	useFocusOptimisticComment(fetcher)

	// @ts-expect-error - TODO: fix this
	const optimisticComment: CommentType | [] = fetcher?.formData
		? {
				user,
				id: 'optimistic-document-comment',
				createdAt: new Date(),
				userId: user.id,
				content: fetcher.formData.get('content') as string,
				highlightId: fetcher.formData.get('highlightId') as string,
				responses: [],
				documentId: '',
			}
		: []

	return (
		<div className="no-scrollbar h-full w-full overflow-y-scroll md:w-3/5">
			<Button
				variant="ghost"
				size="sm"
				onClick={() => setCommentsExpanded(!commentsExpanded)}
				className="w-full flex items-center justify-center py-2 rounded-none h-[41px] border-b"
			>
				{commentsExpanded ? (
					<MessageCircleOff size={18} />
				) : (
					<MessageCircle size={18} />
				)}
				<span className="ml-2">{commentsExpanded ? "Hide" : "Show"} Comments</span>
			</Button>
			<div
				className={cn(
					"no-scrollbar flex grow flex-col gap-2 transition-all duration-300",
					commentsExpanded ? "max-h-full p-2 overflow-scroll" : "max-h-0 overflow-hidden"
				)}
			>
				{comments.length > 0 ? (
					<>
						{comments.concat(optimisticComment).map(comment => (
							<Comment key={comment.id} {...comment} />
						))}
					</>
				) : (
					<p className="my-auto h-full p-4 text-center text-muted-foreground">
						No comments yet.
					</p>
				)}
			</div>
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
