import { getFormProps, useForm } from '@conform-to/react'
import { parseWithZod as parse } from '@conform-to/zod'
import { type ActionFunctionArgs, json } from '@remix-run/node'
import { useFetcher, useFetchers } from '@remix-run/react'
import { z } from 'zod'
import { ErrorList } from '#app/components/forms/error-list'
import {
	DoubleArrowLeftIcon,
	DoubleArrowRightIcon,
} from '#app/components/icons'
import { Button, type ButtonProps } from '#app/components/ui/button'
import { Tooltip } from '#app/components/ui/tooltip'
import { useRequestInfo } from '#app/hooks/useRequestInfo'
import { navStateCookie } from '#app/utils/state/nav-state.server'

const FormSchema = z.object({
	state: z.enum(['expanded', 'collapsed']),
})

export async function action({ request }: ActionFunctionArgs) {
	const formData = await request.formData()
	const submission = parse(formData, { schema: FormSchema })

	if (submission.status !== 'success' || !submission.value) {
		return json(submission.reply(), { status: 400 })
	}

	const { state } = submission.value

	const cookieHeader = request.headers.get('Cookie')
	const cookie = (await navStateCookie.parse(cookieHeader)) ?? {}
	cookie.state = state

	const responseInit = {
		headers: { 'Set-Cookie': await navStateCookie.serialize(cookie) },
	}

	return json(submission.reply(), responseInit)
}

/**
 * @returns the user's nav-state preference, or the client hint nav-state if the user
 * has not set a preference.
 */
export function useNavState() {
	const requestInfo = useRequestInfo()
	const optimistic = useOptimisticNavState()

	if (optimistic) {
		return optimistic
	}

	return requestInfo.userPrefs.navState ?? 'expanded'
}

/**
 * If the user's changing their nav-state preference, this will return the
 * value it's being changed to.
 */
export function useOptimisticNavState() {
	const fetchers = useFetchers()
	const fetcher = fetchers.find(f => f.formAction === '/api/nav-state')

	if (fetcher && fetcher.formData) {
		const submission = parse(fetcher.formData, { schema: FormSchema })

		if (submission.status !== 'success' || !submission.value) {
			return
		}

		return submission.value?.state
	}
}

export function NavStateSwitch({ buttonProps }: { buttonProps?: ButtonProps }) {
	const fetcher = useFetcher<typeof action>()
	const navState = useNavState()

	const [form] = useForm({
		id: 'nav-state-switch',
		lastResult: fetcher.data,
	})

	const optimistic = useOptimisticNavState()
	const state = optimistic ?? navState ?? 'expanded'
	const nextState = state === 'expanded' ? 'collapsed' : 'expanded'

	const stateLabel = {
		expanded: <DoubleArrowLeftIcon />,
		collapsed: <DoubleArrowRightIcon />,
	}

	return (
		<fetcher.Form method="POST" action="/api/nav-state" {...getFormProps(form)}>
			<input type="hidden" name="state" value={nextState} />
			<div className="flex gap-2">
				<Tooltip text={state ? 'Collapse navigation' : 'Expand navigation'}>
					<Button
						size="icon-sm"
						type="submit"
						disabled={['submitting', 'loading'].includes(fetcher.state)}
						{...buttonProps}
					>
						{stateLabel[state]}
					</Button>
				</Tooltip>
			</div>
			<ErrorList errors={form.errors} id={form.errorId} />
		</fetcher.Form>
	)
}
