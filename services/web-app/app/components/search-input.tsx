import { useSearchParams, useNavigate, Form } from 'react-router'
import { useState, useEffect } from 'react'
import { useDebounce } from '~/hooks/useDebounce'
import { cn, useIsPending } from '~/utils/misc'
import { MagnifyingGlassIcon } from './icons'
import { Input } from './ui/input'

export function SearchInput() {
	const [searchParams] = useSearchParams()
	const initialQuery = searchParams.get('q') ?? ''
	const [searchQuery, setSearchQuery] = useState(initialQuery)
	const isPending = useIsPending()
	const [debouncedSearchQuery, isDebouncing] = useDebounce(searchQuery, 400)
	const navigate = useNavigate()
	const isLoading = isPending || isDebouncing

	useEffect(() => {
		if (debouncedSearchQuery !== initialQuery) {
			navigate(
				`${window.location.pathname}?q=${encodeURIComponent(debouncedSearchQuery)}`,
				{ replace: true },
			)
		}
	}, [debouncedSearchQuery, initialQuery, navigate])

	return (
		<Form>
			<div className="relative">
				<MagnifyingGlassIcon
					className={cn(
						'pointer-events-none absolute left-2.5 top-2.5 h-5 w-5',
						{ 'opacity-60': isLoading },
					)}
				/>
				<Input
					placeholder="Search"
					className="pl-9"
					defaultValue={searchParams.get('q') ?? ''}
					onChange={e => setSearchQuery(e.target.value)}
				/>
				<input type="submit" hidden />
			</div>
		</Form>
	)
}
