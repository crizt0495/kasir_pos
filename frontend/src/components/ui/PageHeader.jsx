export function PageHeader({ title, description, actions, className = '' }) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 ${className}`}>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 uppercase">{title}</h1>
        {description && <p className="mt-1 text-sm font-medium text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}