import { Outlet, Link, useMatch, useNavigate } from '@remix-run/react'
import { PlusIcon } from 'lucide-react'
import useBreakpoint from '#app/hooks/useBreakpoint.js'
import { SearchInput } from './search-input'
import { Button } from './ui/button'
import { DrawerContent, Drawer } from './ui/drawer'

type Props = { path: string; children: React.ReactNode }

export const SettingsLayout = ({ path, children }: Props) => {
	const navigate = useNavigate()
	const isEditing = !!useMatch(`/app/settings/${path}/:id`)
	const breakpoint = useBreakpoint()
	const showDrawer = ['base', 'sm', 'md'].includes(breakpoint ?? '')

	return (
		<main className="h-fulld flex">
			<div className="flex w-full flex-col md:w-1/2 md:border-r">
				<div className="flex items-center justify-between gap-2 p-3">
					<SearchInput />
					<Link to={`/app/settings/${path}/new`}>
						<Button>
							<PlusIcon className="mr-1" />
							New
						</Button>
					</Link>
				</div>
				<div className="flex flex-col gap-2 overflow-auto border-t p-3 pb-14">
					{children}
				</div>
			</div>
			<div className="hidden h-[calc(100vh-111px)] w-1/2 overflow-y-scroll sm:h-[calc(100vh-54px)] lg:block">
				<Outlet />
			</div>
			<Drawer
				open={showDrawer && isEditing}
				onClose={() => navigate(`/app/settings/${path}`)}
			>
				<DrawerContent
					className="pb-4"
					onInteractOutside={() => navigate(`/app/settings/${path}`)}
				>
					<Outlet />
				</DrawerContent>
			</Drawer>
		</main>
	)
}
