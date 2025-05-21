import { type SVGProps } from 'react'

export * from '@radix-ui/react-icons'

export const AssistantIcon = (props: SVGProps<SVGSVGElement>) => (
	<svg
		viewBox="0 0 32 32"
		xmlns="http://www.w3.org/2000/svg"
		className="h-5 w-5"
		{...props}
	>
		<path fill="currentColor" d="M18 10h2v2h-2zm-6 0h2v2h-2z" />
		<path
			fill="currentColor"
			d="M26 20h-5v-2h1a2.002 2.002 0 0 0 2-2v-4h2v-2h-2V8a2.002 2.002 0 0 0-2-2h-2V2h-2v4h-4V2h-2v4h-2a2.002 2.002 0 0 0-2 2v2H6v2h2v4a2.002 2.002 0 0 0 2 2h1v2H6a2.002 2.002 0 0 0-2 2v8h2v-8h20v8h2v-8a2.002 2.002 0 0 0-2-2M10 8h12v8H10Zm3 10h6v2h-6Z"
		/>
	</svg>
)

export const HamburgerIcon = (props: SVGProps<SVGSVGElement>) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		fill="none"
		viewBox="0 0 24 24"
		strokeWidth={1.5}
		stroke="currentColor"
		className="h-5 w-5"
		{...props}
	>
		<path
			strokeLinecap="round"
			strokeLinejoin="round"
			d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
		/>
	</svg>
)

export const ReloadIcon = (props: SVGProps<SVGSVGElement>) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		fill="none"
		viewBox="0 0 24 24"
		strokeWidth={1.5}
		stroke="currentColor"
		className="h-5 w-5"
		{...props}
	>
		<path
			strokeLinecap="round"
			strokeLinejoin="round"
			d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
		/>
	</svg>
)

export const XIcon = (props: SVGProps<SVGSVGElement>) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		fill="none"
		viewBox="0 0 24 24"
		strokeWidth="1.5"
		stroke="currentColor"
		className="h-5 w-5"
		{...props}
	>
		<path
			strokeLinecap="round"
			strokeLinejoin="round"
			d="M6 18 18 6M6 6l12 12"
		/>
	</svg>
)

export const TeacherIcon = (props: SVGProps<SVGSVGElement>) => (
	<svg
		width="24"
		height="24"
		viewBox="0 0 24 24"
		xmlns="http://www.w3.org/2000/svg"
		{...props}
	>
		<g
			fill="none"
			stroke="currentColor"
			strokeLinecap="round"
			strokeWidth="1.5"
		>
			<path d="M1 20v-1a7 7 0 0 1 7-7v0a7 7 0 0 1 7 7v1" />
			<path d="M13 14v0a5 5 0 0 1 5-5v0a5 5 0 0 1 5 5v.5" />
			<path
				strokeLinejoin="round"
				d="M8 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8m10-3a3 3 0 1 0 0-6a3 3 0 0 0 0 6"
			/>
		</g>
	</svg>
)
