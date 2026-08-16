import * as React from 'react';
import { Slider as SliderPrimitive } from 'radix-ui';

import { cn } from '@/shared/lib/utils';

function Slider({ className, ...props }: React.ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn('relative flex w-full touch-none items-center select-none', className)}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="bg-fill-2 relative h-1.5 w-full grow overflow-hidden rounded-full"
      >
        <SliderPrimitive.Range data-slot="slider-range" className="bg-primary absolute h-full" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        data-slot="slider-thumb"
        className="border-primary bg-background block size-3.5 shrink-0 rounded-full border-2 transition-[color,box-shadow] focus-visible:border-foreground focus-visible:outline-none"
      />
    </SliderPrimitive.Root>
  );
}

export { Slider };
