import { type ActionFunctionArgs, json } from '@remix-run/node'
import { type Fetcher, useFetcher, useFetchers } from '@remix-run/react'
import { withZod } from '@remix-validated-form/with-zod'
import { ValidatedForm, validationError } from 'remix-validated-form'
import { z } from 'zod'
import { useRequestInfo } from '#app/hooks/useRequestInfo'
import { type NavState, navStateCookie } from './cookie.server'

// Preference:
// for left navigation menu width (collapsed or expanded).

const path = '/api/preferences/nav'
const Schema = z.object({ state: z.enum(['expanded', 'collapsed']) })
const validator = withZod(Schema)

export async function action({ request }: ActionFunctionArgs) {
	const formData = await request.formData()
	const { error, data } = await validator.validate(formData)
	if (error) return validationError(error)

	const cookieHeader = request.headers.get('Cookie')
	const cookie = (await navStateCookie.parse(cookieHeader)) ?? {}
	cookie.state = data.state

	return json(
		{},
		{ headers: { 'Set-Cookie': await navStateCookie.serialize(cookie) } },
	)
}

export function useNavState() {
	const requestInfo = useRequestInfo()
	const optimistic = useOptimisticNavState()
	if (optimistic) return optimistic
	return requestInfo.userPrefs.navState ?? 'expanded'
}

function useOptimisticNavState() {
	const fetchers = useFetchers()
	const f = fetchers.find(f => f.formAction === path)
	if (f && f.formData)
		return f.formData.get('state') === 'collapsed' ? 'collapsed' : 'expanded'
}

type Props = {
	children: (params: { state: NavState; fetcher: Fetcher }) => React.ReactNode
}

export function NavStateSwitch({ children }: Props) {
	const fetcher = useFetcher<typeof action>()
	const navState = useNavState()
	const optimistic = useOptimisticNavState()
	const state = optimistic ?? navState ?? 'expanded'
	const nextState = state === 'expanded' ? 'collapsed' : 'expanded'

	return (
		<ValidatedForm
			method="POST"
			action={path}
			validator={validator}
			fetcher={fetcher}
		>
			<input type="hidden" name="state" value={nextState} />
			{children({ fetcher, state })}
		</ValidatedForm>
	)
}
