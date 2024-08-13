import { Outlet, Link, useMatch, useNavigate } from '@remix-run/react'
import { PlusIcon } from 'lucide-react'
import useBreakpoint from '#app/hooks/useBreakpoint.js'
import { SearchInput } from './search-input'
import { Button } from './ui/button'
import { DrawerContent, Drawer } from './ui/drawer'

type Props = {
	path: string
	children: React.ReactNode
	hideAddButton?: boolean
}

export const ListLayout = ({ path, children, hideAddButton }: Props) => {
	const navigate = useNavigate()
	const isEditing = !!useMatch(`/app/${path}/:id`)
	const breakpoint = useBreakpoint()
	const showDrawer = ['base', 'sm', 'md'].includes(breakpoint ?? '')

	return (
		<main className="flex h-full">
			<div className="flex w-full flex-col md:w-1/2 md:border-r">
				<div className="flex items-center justify-between gap-2 p-3">
					<SearchInput />
					{hideAddButton ? null : (
						<Link to={`/app/${path}/new`}>
							<Button>
								<PlusIcon className="mr-1" size={16} />
								New
							</Button>
						</Link>
					)}
				</div>
				<div className="no-scrollbar flex flex-grow flex-col gap-2 overflow-auto border-t p-3">
					{children}
				</div>
			</div>
			<div className="no-scrollbar hidden flex-grow w-1/2 overflow-y-scroll md:block">
				<Outlet />
			</div>
			<Drawer
				open={showDrawer && isEditing}
				onClose={() => navigate(`/app/${path}`)}
			>
				<DrawerContent
					className="pb-4"
					onInteractOutside={() => navigate(`/app/${path}`)}
				>
					<Outlet />
				</DrawerContent>
			</Drawer>
		</main>
	)
}
