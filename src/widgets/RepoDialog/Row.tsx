export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-form items-start gap-x-4">
      <span className="text-muted-foreground flex min-h-8 items-center justify-end text-right text-sm">
        {label}
      </span>
      <div className="flex min-h-8 min-w-0 items-center">{children}</div>
    </div>
  );
}
