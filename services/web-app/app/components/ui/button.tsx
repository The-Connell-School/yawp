import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import * as React from 'react'
import { cn } from '~/utils/misc.js'

const button = cva(
	'inline-flex items-center text-sm justify-center whitespace-nowrap rounded-full font-medium ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 transition-opacity',
	{
		variants: {
			variant: {
				default: 'bg-primary text-primary-foreground hover:bg-primary/90',
				destructive:
					'bg-destructive text-destructive-foreground hover:bg-destructive/90',
				outline:
					'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
				secondary:
					'bg-secondary text-secondary-foreground hover:bg-secondary/80',
				ghost: 'hover:bg-accent hover:text-accent-foreground',
				link: 'text-primary underline-offset-4 hover:underline px-0.5 py-0',
				sidebar: 'bg-foreground/15 text-foreground hover:bg-foreground/10',
				success: 'bg-success text-success-foreground hover:bg-success/90',
				'outline-primary':
					'border border-primary text-primary hover:bg-primary/10',
				unstyled: '',
			},
			size: {
				default: 'h-10 px-4',
				sm: 'h-8 px-3',
				lg: 'h-11 px-5 text-md',
				icon: 'h-10 w-10',
				'icon-sm': 'h-8 w-8',
			},
		},
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
	},
)

export interface ButtonProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement>,
		VariantProps<typeof button> {
	asChild?: boolean
	isLoading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
	({ isLoading, className, variant, size, asChild = false, ...props }, ref) => {
		return asChild ? (
			<Slot
				className={cn(button({ variant, size }), className)}
				ref={ref}
				disabled={isLoading}
				{...props}
			/>
		) : (
			<button
				className={cn(button({ variant, size }), className)}
				ref={ref}
				disabled={isLoading}
				{...props}
			>
				<>
					{isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
					{props.children}
				</>
			</button>
		)
	},
)
Button.displayName = 'Button'

export { Button, button }
