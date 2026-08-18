'use client';

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

const GLYPH = 'size-4.5 fill-toast-glyph';
const CUT_STROKE = 2.4;

const LIBRARY_PAINTS_THE_CLOSE_BUTTON = {
  '--normal-bg': 'transparent',
  '--normal-bg-hover': 'var(--hover-fill)',
  '--normal-border': 'transparent',
  '--normal-border-hover': 'transparent',
  '--normal-text': 'var(--muted-foreground)',
} as React.CSSProperties;

const Toaster = ({ style, ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      expand
      closeButton
      gap={12}
      style={{ ...LIBRARY_PAINTS_THE_CLOSE_BUTTON, ...style }}
      icons={{
        success: (
          <CircleCheckIcon className={`${GLYPH} stroke-toast-success`} strokeWidth={CUT_STROKE} />
        ),
        info: <InfoIcon className={`${GLYPH} stroke-toast-info`} strokeWidth={CUT_STROKE} />,
        warning: (
          <TriangleAlertIcon className={`${GLYPH} stroke-toast-warning`} strokeWidth={CUT_STROKE} />
        ),
        error: <OctagonXIcon className={`${GLYPH} stroke-toast-error`} strokeWidth={CUT_STROKE} />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'group/toast flex w-full items-stretch overflow-hidden rounded-md border border-border bg-toast-surface text-sm text-popover-foreground shadow-lg',
          icon: 'flex w-11 shrink-0 items-center justify-center self-stretch text-toast-glyph group-data-[type=success]/toast:bg-toast-success group-data-[type=info]/toast:bg-toast-info group-data-[type=warning]/toast:bg-toast-warning group-data-[type=error]/toast:bg-toast-error group-data-[type=loading]/toast:bg-faint',
          content: 'flex min-w-0 flex-1 flex-col gap-0.75 px-4.5 py-3.5',
          title: 'font-medium leading-snug',
          description: 'text-xs leading-snug text-muted-foreground',
          closeButton:
            'order-last mr-3.5 flex size-5 shrink-0 cursor-pointer items-center justify-center self-center rounded-sm text-muted-foreground hover:text-foreground [&>svg]:size-3.5 [&>svg]:stroke-2',
          actionButton:
            'mr-4.5 flex h-6 shrink-0 cursor-pointer items-center self-center rounded-sm bg-primary px-2 text-xs font-medium text-primary-foreground hover:bg-primary-hover',
          cancelButton:
            'mr-4.5 flex h-6 shrink-0 cursor-pointer items-center self-center rounded-sm bg-control-fill px-2 text-xs font-medium text-foreground hover:bg-control-fill-hover',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
