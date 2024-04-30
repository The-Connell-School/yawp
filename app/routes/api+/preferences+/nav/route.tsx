import { type ActionFunctionArgs, json } from '@remix-run/node'
import { useFetcher, useFetchers } from '@remix-run/react'
import { withZod } from '@remix-validated-form/with-zod'
import { ValidatedForm, validationError } from 'remix-validated-form'
import { z } from 'zod'
import {
	DoubleArrowLeftIcon,
	DoubleArrowRightIcon,
} from '#app/components/icons'
import { Button, type ButtonProps } from '#app/components/ui/button'
import { Tooltip } from '#app/components/ui/tooltip'
import { useRequestInfo } from '#app/hooks/useRequestInfo'
import { navStateCookie } from './cookie.server'

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

export function NavStateSwitch({ buttonProps }: { buttonProps?: ButtonProps }) {
	const fetcher = useFetcher<typeof action>()
	const navState = useNavState()
	const optimistic = useOptimisticNavState()
	const state = optimistic ?? navState ?? 'expanded'
	const nextState = state === 'expanded' ? 'collapsed' : 'expanded'
	const stateLabel = {
		expanded: <DoubleArrowLeftIcon />,
		collapsed: <DoubleArrowRightIcon />,
	}

	return (
		<ValidatedForm
			method="POST"
			action={path}
			validator={validator}
			fetcher={fetcher}
		>
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
		</ValidatedForm>
	)
}
