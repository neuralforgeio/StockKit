export function Field({
  label,
  required,
  hint,
  action,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="block text-xs font-medium text-fg-muted">
          {label}
          {required && <span className="text-danger"> *</span>}
        </label>
        {action}
      </div>
      <div className="mt-1">{children}</div>
      {hint && <p className="mt-1 text-xs text-fg-subtle">{hint}</p>}
    </div>
  );
}

export function inputClass(extra = "") {
  return `block w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 ${extra}`;
}
