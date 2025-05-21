import { useEffect, useState } from 'react'
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogAction,
	AlertDialogFooter,
	AlertDialogDescription,
	AlertDialogTitle,
	AlertDialogHeader,
	AlertDialogCancel,
} from '~/components/ui/alert-dialog.js'
import { useAsyncFetcherSubmit } from '~/hooks/useAsyncFetcher.js'

export const RestoreDataFromLocalStorageModal = ({
	docId,
	docCreatedAt,
}: {
	docId: string
	docCreatedAt: Date
}) => {
	const { submit, isLoading: isRestoringLocalStorageData } =
		useAsyncFetcherSubmit()
	const [storedData, setStoredData] = useState<{
		html: string
		text: string
	} | null>(null)
	const [isUseLocalStorageDataModalOpen, setIsUseLocalStorageDataModalOpen] =
		useState(false)
	useEffect(() => {
		if (isUseLocalStorageDataModalOpen) return

		const cutoffTime = 1729023642420 // 10/15/2024 3:20pm CT
		if (new Date(docCreatedAt).getTime() < cutoffTime) {
			const raw = localStorage.getItem(`document-${docId}`)
			const stored = raw
				? (JSON.parse(raw) as { text: string; html: string })
				: null
			if (stored) {
				setStoredData(stored)
				setIsUseLocalStorageDataModalOpen(true)
			}
		}
	}, [docCreatedAt, isUseLocalStorageDataModalOpen, docId])

	return isUseLocalStorageDataModalOpen ? (
		<AlertDialog
			open={isUseLocalStorageDataModalOpen}
			onOpenChange={setIsUseLocalStorageDataModalOpen}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Ooops!</AlertDialogTitle>
					<AlertDialogDescription>
						We found some data in your browser's local storage that we think you
						might want to use. Would you like to restore it? Ask your teacher if
						you are unsure.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<p className="text-sm font-bold">Data</p>
						<div className="rounded-md border p-2">
							<div
								dangerouslySetInnerHTML={{
									__html: storedData?.html ?? '',
								}}
							></div>
						</div>
					</div>
				</div>
				<AlertDialogFooter>
					<AlertDialogCancel
						onClick={() => {
							localStorage.removeItem(`document-${docId}`)
							setIsUseLocalStorageDataModalOpen(false)
							setStoredData(null)
						}}
					>
						No, thanks
					</AlertDialogCancel>
					<AlertDialogAction
						onClick={async () => {
							localStorage.removeItem(`document-${docId}`)
							await submit(
								{
									html: storedData?.html ?? '',
									text: storedData?.text ?? '',
								},
								{
									method: 'POST',
									action: `/api/model/document/${docId}`,
								},
							)
							window.location.reload()
						}}
						autoFocus
						disabled={isRestoringLocalStorageData}
					>
						Yes, restore data
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	) : null
}
