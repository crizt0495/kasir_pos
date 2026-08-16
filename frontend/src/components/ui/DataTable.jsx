import { useRef, useState, useEffect } from 'react';
import { Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowUp, ArrowDown } from 'lucide-react';
import { Skeleton, EmptyState, ErrorState } from './Feedback.jsx';
import { Button } from './Button.jsx';

export function SearchInput({ value, onChange, placeholder = 'Cari...', className = '', 'aria-label': ariaLabel }) {
  return (
    <label className={`relative ${className}`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm placeholder:text-slate-400 transition-all duration-120 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
        aria-label={ariaLabel || placeholder}
      />
    </label>
  );
}

export function Pagination({ page, totalPages, total, pageSize, onPageChange }) {
  if (totalPages <= 1) return null;

  const pages = [];
  const showPages = 5;
  let start = Math.max(1, page - Math.floor(showPages / 2));
  let end = Math.min(totalPages, start + showPages - 1);

  if (end - start + 1 < showPages) {
    start = Math.max(1, end - showPages + 1);
  }

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  return (
    <nav className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm text-slate-600" aria-label="Pagination">
      <span className="flex items-center">
        Menampilkan <b>{(page - 1) * pageSize + 1}</b>–<b>{Math.min(page * pageSize, total)}</b> dari <b>{total}</b> data
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          icon={ChevronsLeft}
          onClick={() => onPageChange(1)}
          disabled={page <= 1}
          aria-label="Halaman pertama"
        />
        <Button
          variant="ghost"
          size="sm"
          icon={ChevronLeft}
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Halaman sebelumnya"
        />
        {start > 1 && (
          <>
            <Button variant="ghost" size="sm" onClick={() => onPageChange(1)} aria-label="Halaman 1">
              1
            </Button>
            {start > 2 && <span className="px-1 text-slate-400">…</span>}
          </>
        )}
        {pages.map((p) => (
          <Button
            key={p}
            variant={p === page ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => onPageChange(p)}
            aria-label={`Halaman ${p}`}
            aria-current={p === page ? 'page' : undefined}
          >
            {p}
          </Button>
        ))}
        {end < totalPages && (
          <>
            {end < totalPages - 1 && <span className="px-1 text-slate-400">…</span>}
            <Button variant="ghost" size="sm" onClick={() => onPageChange(totalPages)} aria-label={`Halaman ${totalPages}`}>
              {totalPages}
            </Button>
          </>
        )}
        <Button
          variant="ghost"
          size="sm"
          icon={ChevronRight}
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Halaman selanjutnya"
        />
        <Button
          variant="ghost"
          size="sm"
          icon={ChevronsRight}
          onClick={() => onPageChange(totalPages)}
          disabled={page >= totalPages}
          aria-label="Halaman terakhir"
        />
      </div>
    </nav>
  );
}

export function DataTable({
  columns,
  data = [],
  loading = false,
  error = null,
  onRetry,
  emptyText = 'Belum ada data',
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  rowKey = 'id',
  onRowClick,
  toolbar,
  className = '',
  sort = null,
  onSortChange,
  striped = true,
  hoverable = true,
}) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden ${className}`}>
      {toolbar && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-4 py-3">
          {toolbar}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm" role="grid">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              {columns.map((c) => {
                const sortable = Boolean(c.sortable && onSortChange);
                const sortKey = c.sortKey || c.key;
                const active = sortable && sort?.key === sortKey;
                return (
                  <th
                    key={c.key}
                    className={`px-4 py-3 font-semibold ${c.className || ''} ${c.align ? `text-${c.align}` : ''}`}
                    scope="col"
                    style={{ width: c.width }}
                  >
                    {sortable ? (
                      <button
                        onClick={() => onSortChange(sortKey)}
                        className={`inline-flex items-center gap-1 hover:text-slate-800 transition-colors ${active ? 'text-primary-600' : ''}`}
                        aria-sort={active ? (sort.order === 'asc' ? 'ascending' : 'descending') : 'none'}
                      >
                        {c.header}
                        {active ? (
                          sort.order === 'asc' ? (
                            <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                          ) : (
                            <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                          )
                        ) : (
                          <ArrowUp className="h-3.5 w-3.5 opacity-30" aria-hidden="true" />
                        )}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className={`divide-y divide-slate-100 ${striped ? 'bg-white' : ''}`}>
            {loading ? (
              <tr>
                <td colSpan={columns.length}>
                  <div className="space-y-3 p-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="flex gap-4">
                        {Array.from({ length: columns.length }).map((_, j) => (
                          <Skeleton key={j} className="h-5 flex-1" />
                        ))}
                      </div>
                    ))}
                  </div>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={columns.length}>
                  <ErrorState message="Terjadi kesalahan, silakan coba lagi" onRetry={onRetry} />
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  <EmptyState title={emptyText} />
                </td>
              </tr>
            ) : (
              data.map((row, idx) => (
                <tr
                  key={row[rowKey] ?? idx}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`${hoverable ? 'transition-colors' : ''} ${
                    onRowClick
                      ? 'cursor-pointer hover:bg-primary-50/50'
                      : 'hover:bg-slate-50/60'
                  } ${idx % 2 === 1 && striped ? 'bg-slate-50/50' : ''}`}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(row); }} : undefined}
                  role={onRowClick ? 'button' : undefined}
                  aria-label={onRowClick ? 'Klik untuk melihat detail' : undefined}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`px-4 py-3 text-slate-700 ${c.className || ''} ${c.align ? `text-${c.align}` : ''}`}
                    >
                      {c.render ? c.render(row) : row[c.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {!loading && !error && data.length > 0 && total !== undefined && (
        <div className="border-t border-slate-200">
          <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPageChange={onPageChange} />
        </div>
      )}
    </div>
  );
}

export function Card({ title, actions, children, className = '', bodyClassName = '', headerClassName = '', hover = false }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${hover ? 'card-hover' : ''} ${className}`}>
      {(title || actions) && (
        <div className={`flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 ${headerClassName}`}>
          {title && <h3 className="text-sm font-semibold text-slate-800">{title}</h3>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}

export function CardHeader({ title, description, actions, className = '' }) {
  return (
    <div className={`flex items-start justify-between gap-4 ${className}`}>
      <div className="flex-1 min-w-0">
        {title && <h3 className="text-base font-semibold text-slate-900">{title}</h3>}
        {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex-shrink-0">{actions}</div>}
    </div>
  );
}

export function Tabs({ tabs, active, onChange, className = '', variant = 'default' }) {
  const variants = {
    default: 'flex gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1',
    underline: 'flex gap-4 border-b border-slate-200 pb-1',
    pill: 'flex gap-2',
  };

  return (
    <div className={`${variants[variant]} ${className}`} role="tablist" aria-label="Tab navigation">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          role="tab"
          aria-selected={active === t.key}
          aria-controls={`${t.key}-panel`}
          id={`${t.key}-tab`}
          className={(() => {
            const base = 'whitespace-nowrap text-sm font-medium transition-all duration-120';
            if (variant === 'default') {
              return `${base} rounded-md px-3 py-1.5 ${active === t.key ? 'bg-primary-100 text-primary-700' : 'text-slate-600 hover:bg-slate-100'}`;
            }
            if (variant === 'underline') {
              return `${base} pb-2 border-b-2 ${active === t.key ? 'border-primary-600 text-primary-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`;
            }
            return `${base} rounded-lg px-4 py-2 ${active === t.key ? 'bg-primary-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`;
          })()}
        >
          {t.icon && <t.icon className="inline h-4 w-4 shrink-0" aria-hidden="true" />}
          {t.label}
          {t.badge && (
            <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[0.65rem] font-medium text-slate-600">
              {t.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function TabPanels({ tabs, active, children, className = '' }) {
  return (
    <div className={className}>
      {tabs.map((t) => (
        <div
          key={t.key}
          role="tabpanel"
          id={`${t.key}-panel`}
          aria-labelledby={`${t.key}-tab`}
          hidden={active !== t.key}
          className="animate-fade-in"
        >
          {children[t.key]}
        </div>
      ))}
    </div>
  );
}

export function Dropdown({ trigger, items, align = 'right', className = '' }) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target) && triggerRef.current && !triggerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  useEffect(() => {
    function handleEscape(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) {
      document.addEventListener('keydown', handleEscape);
    }
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open]);

  return (
    <div className={`relative inline-block ${className}`}>
      <div ref={triggerRef} onClick={() => setOpen(!open)}>
        {trigger}
      </div>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            ref={dropdownRef}
            className={`absolute z-20 mt-1.5 min-w-[180px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg animate-scale-in ${align === 'right' ? 'right-0' : 'left-0'}`}
            role="menu"
          >
            {items.map((item, index) => (
              <button
                key={index}
                onClick={() => {
                  item.onClick?.();
                  if (!item.keepOpen) setOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors ${item.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                role="menuitem"
                disabled={item.disabled}
              >
                {item.icon && <item.icon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />}
                <span>{item.label}</span>
                {item.shortcut && <span className="ml-auto text-xs text-slate-400">{item.shortcut}</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}