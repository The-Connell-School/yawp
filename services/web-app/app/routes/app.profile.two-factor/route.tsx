import { Link, Outlet } from 'react-router'
import { LockClosedIcon } from '~/components/icons'
import { button } from '~/components/ui/button'
import { type VerificationTypes } from '~/routes/auth.verify/constants'
import { type BreadcrumbHandle } from '~/utils/breadcrumb'

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
