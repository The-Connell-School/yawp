import { invariantResponse } from '@epic-web/invariant'
import { type LoaderFunctionArgs, json } from '@remix-run/node'
import { openai } from '#app/services/openai'
import { requireUserId } from '#app/utils/auth.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	invariantResponse(params.id, 'Missing assistant id')
	invariantResponse(params.lastId, 'Missing last id')
	invariantResponse(params.threadId, 'Missing thread id')

	await requireUserId(request)

	const messages = await openai.beta.threads.messages.list(params.threadId, {
		...(params.lastId ? { after: params.lastId } : {}),
		order: 'desc',
		limit: 50,
	})

	const hasMore = (messages as any)?.body.has_more

	return json({
		...messages,
		data: hasMore ? messages.data.reverse() : messages.data.reverse().slice(1),
	})
}
