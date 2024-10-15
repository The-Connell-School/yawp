import { useSearchParams, Form } from '@remix-run/react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#app/components/ui/select'
import { Period } from '#app/utils/enums'

export function PeriodFilter() {
	const [searchParams, setSearchParams] = useSearchParams()
	const period = searchParams.get('period') ?? ''

	const handlePeriodChange = (newPeriod: string) => {
		if (newPeriod === 'all') {
      setSearchParams(prev => {
				prev.delete('period')
				return prev
			})
		} else {
			setSearchParams(prev => {
				prev.set('period', newPeriod)
				return prev
			})
		}
	}

	return (
		<Form>
			<div className="relative">
				<Select value={period} onValueChange={handlePeriodChange}>
					<SelectTrigger className="w-[100px]">
						<SelectValue placeholder="Period" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All Periods</SelectItem>
						{Object.values(Period).map((period) => (
							<SelectItem key={period} value={period}>
								{period}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
		</Form>
	)
}
