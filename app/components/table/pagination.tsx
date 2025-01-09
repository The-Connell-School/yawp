import { useSearchParams } from '@remix-run/react'
import {
	ChevronLeft,
	ChevronRight,
	ChevronsLeft,
	ChevronsRight,
} from 'lucide-react'

export const Pagination = ({ totalCount }: { totalCount: number }) => {
	const [searchParams, setSearchParams] = useSearchParams()
	const skip = parseInt(searchParams.get('skip') || '0', 10)
	const take = parseInt(searchParams.get('take') || '10', 10)

	const setSkip = (newSkip: number) => {
		setSearchParams(prev => {
			prev.set('skip', newSkip.toString())
			return prev
		})
	}

	const setTake = (newTake: number) => {
		setSearchParams(prev => {
			prev.set('take', newTake.toString())
			return prev
		})
	}

	return (
		<div className="flex flex-col items-start justify-between gap-2 md:flex-row md:items-center">
			<div className="flex gap-1">
				<button
					className="rounded-md border bg-white p-2 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
					onClick={() => setSkip(0)}
					disabled={skip === 0}
					aria-label="go to start"
				>
					<ChevronsLeft size={16} />
				</button>
				<button
					className="rounded-md border bg-white p-2 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
					onClick={() => setSkip(Math.max(0, skip - take))}
					disabled={skip === 0}
					aria-label="go back"
				>
					<ChevronLeft size={16} />
				</button>
				<button
					className="rounded-md border bg-white p-2 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
					onClick={() => setSkip(skip + take)}
					disabled={skip + take >= totalCount}
					aria-label="go forward"
				>
					<ChevronRight size={16} />
				</button>
				<button
					className="rounded-md border bg-white p-2 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
					onClick={() => setSkip(Math.floor(totalCount / take) * take)}
					disabled={skip + take >= totalCount}
					aria-label="go to end"
				>
					<ChevronsRight size={16} />
				</button>
			</div>
			<div className="mr-2 flex min-w-max items-center gap-2 text-sm">
				<div>Page</div>
				<strong>
					{Math.floor(skip / take) + 1} of {Math.ceil(totalCount / take)}
				</strong>
			</div>
			<div className="flex items-center gap-2">
				<div>
					<div className="flex">
						<div className="flex h-7 items-center rounded-l-md border bg-gray-100 px-3 text-sm">
							Go to page
						</div>
						<input
							className="h-7 w-16 rounded-r-md border bg-white px-3"
							type="number"
							value={Math.floor(skip / take) + 1}
							onChange={e => {
								const page = e.target.value ? Number(e.target.value) - 1 : 0
								setSkip(page * take)
							}}
						/>
					</div>
				</div>
				<select
					className="max-w-[150px] rounded-md border bg-white px-3 py-1 text-sm focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
					value={take}
					onChange={e => {
						const newTake = parseInt(e.target.value)
						setTake(newTake)
						setSkip(0)
					}}
				>
					{[10, 20, 30, 40, 50].map(pageSize => (
						<option key={pageSize} value={pageSize}>
							Show {pageSize}
						</option>
					))}
				</select>
			</div>
		</div>
	)
}
