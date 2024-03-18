import { Link, Outlet } from '@remix-run/react'
import { LockClosedIcon } from '#app/components/icons'
import { button } from '#app/components/ui/button'
import { type BreadcrumbHandle } from '#app/utils/breadcrumb'
import { type VerificationTypes } from '../_auth+/verify_props'

export const handle: BreadcrumbHandle = {
	breadcrumb: (
		<Link
			to="/app/profile/two-factor"
			className={button({ variant: 'ghost', size: 'sm' })}
		>
			<LockClosedIcon className="mr-2" /> Two factor
		</Link>
	),
}

export const twoFAVerificationType = '2fa' satisfies VerificationTypes

export default function TwoFactorRoute() {
	return <Outlet />
}
