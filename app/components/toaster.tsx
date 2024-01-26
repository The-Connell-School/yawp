import { useEffect } from 'react'
import { Toaster as SonnerToaster, toast as showToast } from 'sonner'
import { type Toast } from '#app/utils/toast.server.ts'

export function Toaster({ toast }: { toast?: Toast | null }) {
	return (
		<>
			<SonnerToaster closeButton position="top-center" />
			{toast ? <ShowToast toast={toast} /> : null}
		</>
	)
}

function ShowToast({ toast }: { toast: Toast }) {
	const { id, type, title, description } = toast
	useEffect(() => {
		setTimeout(() => {
			showToast[type](title, { id, description })
		}, 0)
	}, [description, id, title, type])
	return null
}
