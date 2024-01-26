import { type VariantProps, cva } from 'class-variance-authority'
import * as React from 'react'

const input = cva(
	'flex w-full border bg-background text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
	{
		variants: {
			variant: {
				default: 'border-input focus-visible:ring-ring',
				destructive: 'border-destructive focus-visible:ring-destructive',
			},
			size: {
				default: 'h-10 px-3 py-2 rounded-md',
				sm: 'h-8 px-2 py-1 rounded-sm',
			},
		},
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
	},
)

export interface InputProps
	extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
		VariantProps<typeof input> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
	({ className, type, variant, size, ...props }, ref) => {
		return (
			<input
				type={type}
				className={input({ variant, size, className })}
				ref={ref}
				{...props}
			/>
		)
	},
)
Input.displayName = 'Input'

export { Input }
