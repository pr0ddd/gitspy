import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const inputVariants = cva(
  'bg-control-fill border-input text-foreground w-full min-w-0 rounded-md border transition-[color,background-color,border-color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground hover:bg-control-fill-hover focus-visible:bg-control-fill-hover disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-destructive/20',
  {
    variants: {
      size: {
        default: 'h-9 px-3 py-1 text-base md:text-sm',
        sm: 'h-8 px-2.5 text-xs',
        xs: 'h-7 px-2 text-xs',
      },
      bare: {
        true: 'bg-transparent hover:bg-transparent focus-visible:bg-transparent rounded-none border-0 px-0',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  },
);

function Input({
  className,
  type,
  size = 'default',
  bare,
  ...props
}: Omit<React.ComponentProps<'input'>, 'size'> & VariantProps<typeof inputVariants>) {
  return (
    <input
      type={type}
      data-slot="input"
      data-size={size}
      className={cn(inputVariants({ size, bare, className }))}
      {...props}
    />
  );
}

export { Input, inputVariants };
