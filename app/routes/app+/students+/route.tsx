import { json, type LoaderFunctionArgs } from '@remix-run/node'
import {
	Outlet,
	useLoaderData,
	useNavigate,
	useParams,
	useSearchParams,
} from '@remix-run/react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { MultiSelect } from '#app/components/multi-select.tsx'
import { SearchInput } from '#app/components/search-input'
import { Pagination } from '#app/components/table/pagination.tsx'
import { Button } from '#app/components/ui/button'
import {
	Table,
	TableHeader,
	TableBody,
	TableHead,
	TableRow,
	TableCell,
} from '#app/components/ui/table'
import { type BreadcrumbHandle } from '#app/utils/breadcrumb'
import { prisma } from '#app/utils/db.server'
import { cn } from '#app/utils/misc.tsx'

export const handle: BreadcrumbHandle = { breadcrumb: 'Students' }

type SortField = 'name' | 'email' | 'school' | 'grade' | 'period' | 'createdAt'
type SortDirection = 'asc' | 'desc'

const SORT_FIELDS: Array<{ label: string; value: SortField }> = [
	{ label: 'Name', value: 'name' },
	{ label: 'Email', value: 'email' },
	{ label: 'School', value: 'school' },
	{ label: 'Grade', value: 'grade' },
	{ label: 'Period', value: 'period' },
	{ label: 'Created At', value: 'createdAt' },
]

export async function loader({ request }: LoaderFunctionArgs) {
	const url = new URL(request.url)
	const query = url.searchParams.get('q') ?? ''
	const skip = parseInt(url.searchParams.get('skip') ?? '1')
	const take = parseInt(url.searchParams.get('take') ?? '10')
	const selectedStudentId = url.searchParams.get('id')
	const sortField = (url.searchParams.get('sort') as SortField) ?? 'name'
	const sortDirection =
		(url.searchParams.get('direction') as SortDirection) ?? 'asc'
	const selectedSchools = url.searchParams.get('school')?.split(',') ?? []
	const selectedGrades = url.searchParams.get('grade')?.split(',') ?? []
	const selectedPeriods = url.searchParams.get('period')?.split(',') ?? []

	const where = {
		AND: [
			{
				OR: [
					{ user: { name: { contains: query } } },
					{ user: { email: { contains: query } } },
					{ school: { contains: query } },
					{ grade: { contains: query } },
					{ period: { contains: query } },
				],
			},
			selectedSchools.length > 0 && !selectedSchools.includes('all')
				? {
						OR: selectedSchools.map(school =>
							school === 'none'
								? { school: null }
								: { school: { equals: school } },
						),
					}
				: {},
			selectedGrades.length > 0 && !selectedGrades.includes('all')
				? {
						OR: selectedGrades.map(grade =>
							grade === 'none' ? { grade: null } : { grade: { equals: grade } },
						),
					}
				: {},
			selectedPeriods.length > 0 && !selectedPeriods.includes('all')
				? {
						OR: selectedPeriods.map(period =>
							period === 'none'
								? { period: null }
								: { period: { equals: period } },
						),
					}
				: {},
		],
	}

	const orderBy =
		sortField === 'name' || sortField === 'email'
			? { user: { [sortField]: sortDirection } }
			: { [sortField]: sortDirection }

	const [students, totalCount, filters] = await Promise.all([
		prisma.studentProfile.findMany({
			where,
			include: {
				user: {
					include: {
						documents: {
							include: {
								courseModuleSessions: {
									include: {
										courseModule: true,
									},
								},
							},
						},
					},
				},
			},
			take,
			skip,
			orderBy,
		}),
		prisma.studentProfile.count({ where }),
		prisma.studentProfile.findMany({
			select: {
				school: true,
				grade: true,
				period: true,
			},
			distinct: ['school', 'grade', 'period'],
		}),
	])

	// Get unique filter values
	const schools = [...new Set(filters.map(f => f.school).filter(Boolean))]
	const grades = [...new Set(filters.map(f => f.grade).filter(Boolean))]
	const periods = [...new Set(filters.map(f => f.period).filter(Boolean))]

	return json({
		students,
		sortField,
		sortDirection,
		totalCount,
		filters: {
			schools,
			grades,
			periods,
		},
	})
}

export default function StudentsRoute() {
	const navigate = useNavigate()
	const params = useParams()
	const [searchParams, setSearchParams] = useSearchParams()
	const { students, sortField, sortDirection, filters, totalCount } =
		useLoaderData<typeof loader>()

	const handleSort = (field: SortField) => {
		setSearchParams(prev => {
			if (prev.get('sort') === field) {
				prev.set('direction', prev.get('direction') === 'asc' ? 'desc' : 'asc')
			} else {
				prev.set('sort', field)
				prev.set('direction', 'asc')
			}
			return prev
		})
	}

	const handleFilter = (key: string, values: string[]) => {
		setSearchParams(prev => {
			if (values.length > 0) {
				prev.set(key, values.join(','))
			} else {
				prev.delete(key)
			}
			return prev
		})
	}

	const getSelectedValues = (key: string) => {
		const value = searchParams.get(key)
		return value ? value.split(',') : []
	}

	const hasActiveFilters = ['school', 'grade', 'period'].some(
		key => getSelectedValues(key).length > 0,
	)

	const clearFilters = () => {
		setSearchParams(prev => {
			prev.delete('school')
			prev.delete('grade')
			prev.delete('period')
			return prev
		})
	}

	return (
		<main className="flex h-screen overflow-hidden">
			<div className="flex-1">
				<h1 className="mb-4 px-4 pt-4 text-2xl font-bold">Students</h1>
				<div className="mb-4 flex flex-col gap-2 px-4">
					<div className="flex-1">
						<SearchInput />
					</div>
					<div className="flex items-start gap-2">
						<MultiSelect
							label="School"
							options={[
								...filters.schools.map(school => ({
									value: school ?? 'none',
									label: school ?? 'None',
								})),
							]}
							queryKey="school"
							onChange={values => handleFilter('school', values)}
						/>
						<MultiSelect
							label="Grade"
							options={[
								...filters.grades.map(grade => ({
									value: grade ?? 'none',
									label: grade ?? 'None',
								})),
							]}
							queryKey="grade"
							onChange={values => handleFilter('grade', values)}
						/>
						<MultiSelect
							label="Period"
							options={[
								...filters.periods.map(period => ({
									value: period ?? 'none',
									label: period ?? 'None',
								})),
							]}
							queryKey="period"
							onChange={values => handleFilter('period', values)}
						/>
						{hasActiveFilters && (
							<Button variant="link" size="sm" onClick={clearFilters}>
								Clear
							</Button>
						)}
					</div>
				</div>
				<Table>
					<TableHeader>
						<TableRow>
							{SORT_FIELDS.map(({ label, value }, index) => (
								<TableHead
									key={value}
									className={
										index === 0
											? 'pl-4'
											: index === SORT_FIELDS.length - 1
												? 'pr-4'
												: ''
									}
								>
									<Button
										variant="unstyled"
										className="h-8 p-0"
										onClick={() => handleSort(value)}
									>
										{label}
										{sortField === value ? (
											sortDirection === 'desc' ? (
												<ArrowUp
													className="ml-2 h-4 w-4 text-primary"
													strokeWidth={3}
												/>
											) : (
												<ArrowDown
													className="ml-2 h-4 w-4 text-primary"
													strokeWidth={3}
												/>
											)
										) : (
											<ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />
										)}
									</Button>
								</TableHead>
							))}
						</TableRow>
					</TableHeader>
					<TableBody>
						{students.map(student => (
							<TableRow
								key={student.id}
								onClick={() => {
									const params = new URLSearchParams(window.location.search)
									navigate(`/app/students/${student.id}?${params}`)
								}}
								className={cn(
									'cursor-pointer',
									params?.id === student.id
										? 'bg-primary/10 hover:bg-primary/10'
										: 'hover:bg-primary/5',
								)}
							>
								<TableCell className="pl-4">{student.user.name}</TableCell>
								<TableCell>{student.user.email}</TableCell>
								<TableCell>{student.school}</TableCell>
								<TableCell>{student.grade}</TableCell>
								<TableCell>{student.period}</TableCell>
								<TableCell className="pr-4">
									{new Date(student.createdAt).toLocaleDateString()}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
				<div className="p-4">
					<Pagination totalCount={totalCount} />
				</div>
			</div>
			<Outlet />
		</main>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
