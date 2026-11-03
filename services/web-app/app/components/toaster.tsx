import { useEffect } from 'react'
import { Toaster as SonnerToaster, toast as showToast } from 'sonner'
import { type Toast } from '~/utils/toast.server.ts'
import useBreakpoint from '~/hooks/useBreakpoint'

export function Toaster({ toast }: { toast?: Toast | null }) {
	const breakpoint = useBreakpoint()
	const isMobile = breakpoint === 'base' || breakpoint === 'sm'

	return (
		<>
			<div data-yawp-mobile-toast={isMobile ? 'true' : undefined}>
				<SonnerToaster
					closeButton
					position={isMobile ? 'top-center' : 'bottom-right'}
					theme="light"
					toastOptions={{
						classNames: {
							toast: isMobile ? 'yawp-mobile-sonner-toast' : undefined,
						},
					}}
					style={
						isMobile
							? {
									top: 'max(env(safe-area-inset-top, 0px), 1rem)',
								}
							: undefined
					}
				/>
			</div>
			{toast ? <ShowToast toast={toast} /> : null}
		</>
	)
}

function ShowToast({ toast }: { toast: Toast }) {
	const { id, type, title, description, closeButton } = toast
	useEffect(() => {
		setTimeout(() => {
			showToast[type](title, { id, description, closeButton })
		}, 0)
	}, [description, id, title, type, closeButton])
	return null
}
