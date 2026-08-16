export function PageHeader({ title, description, actions, className = '' }) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 ${className}`}>
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
