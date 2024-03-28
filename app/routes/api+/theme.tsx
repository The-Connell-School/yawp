import { getFormProps, useForm } from '@conform-to/react'
import { parseWithZod as parse } from '@conform-to/zod'
import { type ActionFunctionArgs, json } from '@remix-run/node'
import { useFetcher, useFetchers } from '@remix-run/react'
import { z } from 'zod'
import { ErrorList } from '#app/components/forms/error-list'
import { LaptopIcon, MoonIcon, SunIcon } from '#app/components/icons'
import { Button, type ButtonProps } from '#app/components/ui/button'
import { Tooltip } from '#app/components/ui/tooltip'
import { useHints } from '#app/hooks/useHints'
import { useRequestInfo } from '#app/hooks/useRequestInfo'
import { setTheme } from '#app/utils/state/theme.server'

const ThemeFormSchema = z.object({
	theme: z.enum(['light', 'dark']),
})

export async function action({ request }: ActionFunctionArgs) {
	const formData = await request.formData()
	const submission = parse(formData, { schema: ThemeFormSchema })

	if (submission.status !== 'success' || !submission.value) {
		return json(submission.reply(), { status: 400 })
	}

	const { theme } = submission.value

	const responseInit = {
		headers: { 'set-cookie': setTheme(theme) },
	}

	return json(submission.reply(), responseInit)
}

/**
 * @returns the user's theme preference, or the client hint theme if the user
 * has not set a preference.
 */
export function useTheme() {
	const hints = useHints()
	const requestInfo = useRequestInfo()
	const optimisticMode = useOptimisticThemeMode()

	if (optimisticMode) {
		return optimisticMode
	}

	return requestInfo.userPrefs.theme ?? hints.theme
}

/**
 * If the user's changing their theme mode preference, this will return the
 * value it's being changed to.
 */
export function useOptimisticThemeMode() {
	const fetchers = useFetchers()
	const themeFetcher = fetchers.find(f => f.formAction === '/api/theme')

	if (themeFetcher && themeFetcher.formData) {
		const submission = parse(themeFetcher.formData, {
			schema: ThemeFormSchema,
		})

		if (submission.status !== 'success' || !submission.value) {
			return
		}

		return submission.value?.theme
	}
}

export function ThemeSwitch({ buttonProps }: { buttonProps?: ButtonProps }) {
	const fetcher = useFetcher<typeof action>()
	const theme = useTheme()

	const [form] = useForm({
		id: 'theme-switch',
		lastResult: fetcher.data,
	})

	const optimisticMode = useOptimisticThemeMode()
	const mode = optimisticMode ?? theme ?? 'light'
	const nextMode = mode === 'dark' ? 'light' : 'dark'

	const modeLabel = {
		light: <SunIcon />,
		dark: <MoonIcon />,
		system: <LaptopIcon />,
	}

	return (
		<fetcher.Form method="POST" action="/api/theme" {...getFormProps(form)}>
			<input type="hidden" name="theme" value={nextMode} />
			<div className="flex gap-2">
				<Tooltip text="Color mode">
					<Button
						size="icon-sm"
						type="submit"
						disabled={['submitting', 'loading'].includes(fetcher.state)}
						{...buttonProps}
					>
						{modeLabel[mode]}
					</Button>
				</Tooltip>
			</div>
			<ErrorList errors={form.errors} id={form.errorId} />
		</fetcher.Form>
	)
}
