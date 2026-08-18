export function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-setting items-start gap-x-8">
      <span className="flex min-h-8 items-center justify-end text-right text-sm leading-snug">
        {label}
      </span>
      <div className="min-w-0 space-y-2">
        <div className="flex min-h-8 items-center">{children}</div>
        {hint ? (
          <p className="text-muted-foreground max-w-xl text-xs leading-relaxed">{hint}</p>
        ) : null}
      </div>
    </div>
  );
}
