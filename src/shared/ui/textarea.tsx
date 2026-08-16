import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/shared/lib/utils';

const textareaVariants = cva(
  'bg-control-fill border-input text-foreground w-full resize-none rounded-md border px-2.5 py-1.5 text-sm transition-[color,background-color,border-color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground hover:bg-control-fill-hover focus-visible:bg-control-fill-hover disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-destructive/20',
  {
    variants: {
      bare: {
        true: 'bg-transparent hover:bg-transparent focus-visible:bg-transparent rounded-none border-0 px-0 py-0',
      },
    },
  },
);

function Textarea({
  className,
  bare,
  ...props
}: React.ComponentProps<'textarea'> & VariantProps<typeof textareaVariants>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(textareaVariants({ bare, className }))}
      {...props}
    />
  );
}

export { Textarea, textareaVariants };
