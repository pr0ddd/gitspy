import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';

import { cn } from '@/shared/lib/utils';

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground hover:bg-primary-hover focus-visible:bg-primary-hover',
        destructive:
          'bg-destructive text-white hover:bg-destructive/90 focus-visible:bg-destructive/90',
        destructiveSoft:
          'bg-destructive/15 text-destructive hover:bg-destructive/25 focus-visible:bg-destructive/25',
        added: 'text-added hover:bg-added/15 focus-visible:bg-added/15',
        deleted: 'text-deleted hover:bg-deleted/15 focus-visible:bg-deleted/15',
        outline:
          'border-button-border border hover:bg-hover-fill hover:text-foreground focus-visible:bg-hover-fill focus-visible:text-foreground',
        addedSoft:
          'bg-fill-added text-subject font-semibold hover:bg-fill-added-hover focus-visible:bg-fill-added-hover',
        deletedSoft:
          'bg-fill-deleted text-subject font-semibold hover:bg-fill-deleted-hover focus-visible:bg-fill-deleted-hover',
        outlineAdded:
          'border-added bg-fill-added text-subject border font-semibold hover:bg-fill-added-hover focus-visible:bg-fill-added-hover',
        outlineDeleted:
          'border-deleted bg-fill-deleted text-subject border font-semibold hover:bg-fill-deleted-hover focus-visible:bg-fill-deleted-hover',
        secondary: 'bg-fill-2 text-secondary-foreground hover:bg-fill-3 focus-visible:bg-fill-3',
        ghost:
          'hover:bg-hover-fill hover:text-foreground focus-visible:bg-hover-fill focus-visible:text-foreground',
        muted:
          'text-muted-foreground hover:bg-hover-fill hover:text-foreground focus-visible:bg-hover-fill focus-visible:text-foreground',
        field:
          'bg-control-fill hover:bg-control-fill-hover text-muted-foreground hover:text-foreground focus-visible:bg-control-fill-hover focus-visible:text-foreground',
        action:
          'text-muted-foreground font-normal [&_svg]:opacity-75 hover:bg-hover-fill hover:text-foreground hover:[&_svg]:opacity-100 focus-visible:bg-hover-fill focus-visible:text-foreground focus-visible:[&_svg]:opacity-100',
        split:
          'text-muted-foreground font-normal [&_svg]:opacity-75 group-hover/split:text-foreground group-hover/split:[&_svg]:opacity-100 focus-visible:text-foreground focus-visible:[&_svg]:opacity-100',
        heading:
          'text-subject hover:text-foreground focus-visible:text-foreground [&_svg]:opacity-75 hover:[&_svg]:opacity-100 focus-visible:[&_svg]:opacity-100',
        link: 'text-primary underline-offset-4 hover:underline focus-visible:underline',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        '3xs':
          "h-5 gap-1 rounded-sm px-1.5 text-2xs has-[>svg]:px-1 [&_svg:not([class*='size-'])]:size-3",
        '2xs':
          "h-6.5 gap-1 rounded-md px-2 text-2xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        xs: "h-7 gap-1.5 rounded-md px-2.5 text-xs has-[>svg]:px-2 [&_svg:not([class*='size-'])]:size-3",
        sm: 'h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5',
        'sm-lead': 'h-8 gap-1.5 rounded-md pr-1 pl-2.5',
        'sm-tail': 'h-8 rounded-md px-1',
        crumb:
          "h-10 flex-col items-start justify-center gap-0 rounded-md px-3 text-sm [&_svg:not([class*='size-'])]:size-3.5",
        bar: "self-stretch gap-1.5 rounded-none px-3 text-xs [&_svg:not([class*='size-'])]:size-3",
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
        icon: 'size-9',
        'icon-2xs': "size-5 rounded-md [&_svg:not([class*='size-'])]:size-3",
        'icon-xs': "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
      },
      reveal: {
        true: 'opacity-0 transition-none group-hover:opacity-100 focus-visible:opacity-100',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  reveal,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, reveal, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
