import { useParams } from '@remix-run/react'
import { type ReactNode } from 'react'
import useSWR from 'swr'
import { AssistantIcon } from '#app/components/icons'
import { Button, type ButtonProps } from '#app/components/ui/button'
import { useUser } from '#app/hooks/useUser'
import { getUserImgSrc } from '#app/utils/misc'

type Props = {
	lastId: string
	hideLoadMore: boolean
	assistantName: string | null
	onLoadMore: (args: { lastId: string }) => void
}

export function PreviousMessages({
	lastId,
	assistantName,
	onLoadMore,
	hideLoadMore,
}: Props) {
	const params = useParams()
	const assistantId = params.id
	const threadId = params.threadId

	const url = `/app/assistants/${assistantId}/${threadId}/${lastId}`
	const { data, error, isLoading } = useSWR<{
		data: { id: string; role: string; content: { type: string }[] }[]
	}>(url, () => fetch(url).then(res => res.json()) as any)

	const hasMore = (data as any | undefined)?.body.has_more
	const nextLastId = (data as any | undefined)?.body.last_id

	if (error) return <div>failed to load previous messages</div>
	if (isLoading) return <div>loading...</div>

	return (
		<>
			{hasMore && !hideLoadMore ? (
				<LoadMoreButton onClick={() => onLoadMore({ lastId: nextLastId })} />
			) : null}
			{data?.data.map(message => {
				const isUser = message.role === 'user'
				const text = (
					message.content.find(ct => ct.type === 'text') as
						| { text: { value: string } }
						| undefined
				)?.text.value

				if (!isUser && !text?.length) {
					return null
				}

				return (
					<Message
						key={message.id}
						isUser={isUser}
						assistantName={assistantName}
					>
						<p>{text}</p>
					</Message>
				)
			})}
		</>
	)
}

export const LoadMoreButton = (props: ButtonProps) => (
	<div className="flex w-full justify-center">
		<Button variant="secondary" {...props}>
			Load more
		</Button>
	</div>
)

export const Message = ({
	isUser,
	children,
	assistantName,
}: {
	isUser: boolean
	children?: ReactNode
	assistantName?: string | null
}) => {
	const user = useUser()

	return (
		<div className="p-4">
			<div className="mx-auto flex max-w-[700px] gap-4">
				<div>
					{isUser ? (
						<img
							src={getUserImgSrc(user.image?.id)}
							alt={user.name ?? user.email}
							className="h-8 w-8 min-w-8 rounded-full object-cover"
						/>
					) : (
						<div className="flex items-center justify-center rounded-full bg-primary/50 p-2">
							<AssistantIcon />
						</div>
					)}
				</div>
				<div className="w-full">
					<h4>{isUser ? user.name : assistantName}</h4>
					{children}
				</div>
			</div>
		</div>
	)
}
