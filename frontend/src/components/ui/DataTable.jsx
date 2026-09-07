import { useRef, useState, useEffect } from 'react';
import { Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowUp, ArrowDown, Columns3, Check } from 'lucide-react';
import { Skeleton, EmptyState, ErrorState } from './Feedback.jsx';
import { Button } from './Button.jsx';

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 250];

export function SearchInput({ value, onChange, placeholder = 'Cari...', className = '', 'aria-label': ariaLabel }) {
  return (
    <label className={`relative ${className}`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border-2 border-black bg-white py-2 pl-9 pr-3 text-sm font-medium shadow-[3px_3px_0_0_#0A0A0A] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1"
        aria-label={ariaLabel || placeholder}
      />
    </label>
  );
}

export function Pagination({ page, totalPages, total, pageSize, onPageChange, onPageSizeChange, pageSizeOptions = PAGE_SIZE_OPTIONS }) {
  useEffect(() => {
    if (totalPages && page > totalPages && page > 1 && onPageChange) {
      onPageChange(totalPages);
    }
  }, [totalPages, page, onPageChange]);

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
    <nav className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-black bg-slate-50 px-3 py-3 text-sm text-slate-700 sm:px-4" aria-label="Pagination">
      <div className="flex items-center gap-3">
        {onPageSizeChange && (
          <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
            Tampilkan
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="rounded-md border-2 border-black bg-white px-2 py-1 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
            per halaman
          </label>
        )}
        <span className="hidden text-xs font-bold text-slate-600 sm:inline">
          Menampilkan <b>{Math.max((page - 1) * pageSize + 1, total > 0 ? 1 : 0)}</b>–<b>{Math.min(page * pageSize, total)}</b> dari <b>{total}</b> data
        </span>
      </div>
      <span className="text-xs font-bold text-slate-600 sm:hidden">
        {page}/{totalPages} · {total} data
      </span>
      {totalPages > 1 && (
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
          <div className="flex items-center gap-1">
            {start > 1 && (
              <>
                <Button variant="ghost" size="sm" onClick={() => onPageChange(1)} aria-label="Halaman 1">
                  1
                </Button>
                {start > 2 && <span className="px-1 text-slate-500 font-bold">…</span>}
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
                {end < totalPages - 1 && <span className="px-1 text-slate-500 font-bold">…</span>}
                <Button variant="ghost" size="sm" onClick={() => onPageChange(totalPages)} aria-label={`Halaman ${totalPages}`}>
                  {totalPages}
                </Button>
              </>
            )}
          </div>
          <span className="text-xs text-slate-500 font-bold px-1">
            {page}/{totalPages}
          </span>
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
      )}
    </nav>
  );
}

const PRIORITY_CLASS = { md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' };

function readHiddenCols(storageKey) {
  if (!storageKey) return [];
  try {
    const raw = JSON.parse(localStorage.getItem(`dt:hidden:${storageKey}`) || '[]');
    return Array.isArray(raw) ? raw.filter((v) => typeof v === 'string') : [];
  } catch {
    return [];
  }
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
  onPageSizeChange,
  rowKey = 'id',
  onRowClick,
  toolbar,
  className = '',
  sort = null,
  onSortChange,
  striped = true,
  hoverable = true,
  renderCard,
  storageKey,
}) {
  const hasCards = Boolean(renderCard);
  const [hiddenCols, setHiddenCols] = useState(() => new Set(readHiddenCols(storageKey)));

  useEffect(() => {
    setHiddenCols(new Set(readHiddenCols(storageKey)));
  }, [storageKey]);

  const hideableColumns = columns.filter((c) => c.hideable !== false);
  const showPicker = hideableColumns.length > 1;

  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(`dt:hidden:${storageKey}`, JSON.stringify([...hiddenCols]));
    } catch { /* penyimpanan tidak tersedia */ }
  }, [storageKey, hiddenCols]);

  const toggleCol = (key) => {
    setHiddenCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else {
        const remaining = columns.filter((c) => !next.has(c.key) && c.key !== key);
        if (!remaining.length) return prev;
        next.add(key);
      }
      return next;
    });
  };

  const visibleColumns = columns.filter((c) => !hiddenCols.has(c.key));
  const colSpan = Math.max(visibleColumns.length, 1);

  const hasData = data.length > 0;
  const firstLoad = loading && !hasData;
  const refreshing = loading && hasData;

  const pickerItems = hideableColumns.map((c) => ({
    label: c.headerLabel || (typeof c.header === 'string' ? c.header : c.key),
    icon: hiddenCols.has(c.key) ? undefined : Check,
    keepOpen: true,
    onClick: () => toggleCol(c.key),
  }));

  return (
    <div className={`relative rounded-xl border-2 border-black bg-white shadow-[6px_6px_0_0_#0A0A0A] overflow-hidden ${className}`}>
      {refreshing && <div className="absolute inset-x-0 top-0 z-30 h-1 animate-pulse bg-primary-500" aria-hidden="true" />}

      {toolbar && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-black bg-slate-50 px-3 py-3 sm:px-4">
          {toolbar}
        </div>
      )}

      {(showPicker || refreshing) && (
        <div className="flex items-center justify-end gap-2 border-b-2 border-black bg-white px-3 py-2 sm:px-4">
          <span className="mr-auto text-xs font-bold text-slate-500" role="status">
            {firstLoad ? 'Memuat data...' : refreshing ? 'Memperbarui...' : ''}
          </span>
          {showPicker && (
            <Dropdown
              trigger={
                <Button size="xs" variant="ghost" icon={Columns3}>
                  Kolom ({visibleColumns.length}/{columns.length})
                </Button>
              }
              items={pickerItems}
            />
          )}
        </div>
      )}

      {hasCards && (
        <div className="md:hidden">
          {firstLoad ? (
            <div className="p-3 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-lg border-2 border-black bg-white p-4 shadow-[3px_3px_0_0_#0A0A0A] space-y-3">
                  <div className="flex gap-3">
                    <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                  <Skeleton className="h-3 w-full" />
                  <div className="flex gap-2">
                    <Skeleton className="h-6 w-16 rounded-lg" />
                    <Skeleton className="h-6 w-20 rounded-lg" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <ErrorState message="Terjadi kesalahan, silakan coba lagi" onRetry={onRetry} />
          ) : data.length === 0 && !loading ? (
            <EmptyState title={emptyText} />
          ) : (
            <div className={`p-3 space-y-2 transition-opacity duration-150 ${refreshing ? 'pointer-events-none opacity-50' : ''}`}>
              {data.map((row, idx) => (
                <div
                  key={row[rowKey] ?? idx}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`rounded-lg border-2 border-black bg-white p-3 shadow-[3px_3px_0_0_#0A0A0A] transition-all ${
                    onRowClick ? 'cursor-pointer active:translate-x-[3px] active:translate-y-[3px] active:shadow-none hover:bg-primary-50' : ''
                  }`}
                  role={onRowClick ? 'button' : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(row); }} : undefined}
                >
                  {renderCard(row, visibleColumns)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className={`${hasCards ? 'hidden md:block' : ''} overflow-auto max-h-[70dvh] transition-opacity duration-150 ${refreshing ? 'pointer-events-none opacity-50' : ''}`}>
        <table className="w-full min-w-[640px] text-left text-sm" role="grid">
          <thead className="sticky top-0 z-10">
            <tr className="border-b-2 border-black bg-slate-900 text-xs uppercase tracking-wider text-white">
              {visibleColumns.map((c) => {
                const sortable = Boolean(c.sortable && onSortChange);
                const sortKey = c.sortKey || c.key;
                const active = sortable && sort?.key === sortKey;
                return (
                  <th
                    key={c.key}
                    className={`bg-slate-900 px-4 py-3 font-extrabold ${c.className || ''} ${c.align ? `text-${c.align}` : ''} ${PRIORITY_CLASS[c.priority] || ''}`}
                    scope="col"
                    style={{ width: c.width }}
                    aria-sort={active ? (sort.order === 'asc' ? 'ascending' : 'descending') : undefined}
                  >
                    {sortable ? (
                      <button
                        onClick={() => onSortChange(sortKey)}
                        className={`inline-flex items-center gap-1 hover:text-primary-300 transition-colors ${active ? 'text-warning-400' : ''}`}
                      >
                        {c.header}
                        {active ? (
                          sort.order === 'asc' ? (
                            <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                          ) : (
                            <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                          )
                        ) : (
                          <ArrowUp className="h-3.5 w-3.5 opacity-40" aria-hidden="true" />
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
          <tbody className={`divide-y-2 divide-slate-200 ${striped ? 'bg-white' : ''}`}>
            {firstLoad ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={`skeleton-${i}`} className={i % 2 === 1 && striped ? 'bg-slate-100' : ''}>
                  {visibleColumns.map((c) => (
                    <td key={c.key} className={`px-4 py-3 ${PRIORITY_CLASS[c.priority] || ''}`}>
                      <Skeleton className="h-5 w-full max-w-[160px]" />
                    </td>
                  ))}
                </tr>
              ))
            ) : error ? (
              <tr>
                <td colSpan={colSpan}>
                  <ErrorState message="Terjadi kesalahan, silakan coba lagi" onRetry={onRetry} />
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={colSpan}>
                  <EmptyState title={emptyText} />
                </td>
              </tr>
            ) : (
              data.map((row, idx) => (
                <tr
                  key={row[rowKey] ?? idx}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`${
                    onRowClick
                      ? 'cursor-pointer hover:bg-primary-50'
                      : 'hover:bg-slate-100'
                  } ${idx % 2 === 1 && striped ? 'bg-slate-100' : ''}`}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(row); }} : undefined}
                  role={onRowClick ? 'button' : undefined}
                  aria-label={onRowClick ? 'Klik untuk melihat detail' : undefined}
                >
                  {visibleColumns.map((c) => (
                    <td
                      key={c.key}
                      className={`px-4 py-3 text-slate-800 font-medium ${c.className || ''} ${c.align ? `text-${c.align}` : ''} ${PRIORITY_CLASS[c.priority] || ''}`}
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
      {!error && !(loading && !hasData) && total !== undefined && (
        <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} />
      )}
    </div>
  );
}

export function Card({ title, actions, children, className = '', bodyClassName = '', headerClassName = '', hover = false }) {
  return (
    <div className={`rounded-xl border-2 border-black bg-white shadow-[4px_4px_0_0_#0A0A0A] ${hover ? 'card-hover' : ''} ${className}`}>
      {(title || actions) && (
        <div className={`flex items-center justify-between gap-3 border-b-2 border-black px-5 py-4 bg-slate-50 ${headerClassName}`}>
          {title && <h3 className="text-sm font-extrabold uppercase tracking-wide text-slate-900">{title}</h3>}
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
        {title && <h3 className="text-base font-extrabold text-slate-900">{title}</h3>}
        {description && <p className="mt-0.5 text-sm text-slate-500 font-medium">{description}</p>}
      </div>
      {actions && <div className="flex-shrink-0">{actions}</div>}
    </div>
  );
}

export function Tabs({ tabs, active, onChange, className = '', variant = 'default' }) {
  const variants = {
    default: 'flex gap-1 overflow-x-auto rounded-lg border-2 border-black bg-white p-1 shadow-[3px_3px_0_0_#0A0A0A]',
    underline: 'flex gap-4 border-b-2 border-black pb-1',
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
            const base = 'whitespace-nowrap text-sm font-bold transition-all duration-100';
            if (variant === 'default') {
              return `${base} rounded-md px-3 py-1.5 border-2 ${active === t.key ? 'bg-primary-500 text-white border-black shadow-[2px_2px_0_0_#0A0A0A]' : 'border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`;
            }
            if (variant === 'underline') {
              return `${base} pb-2 border-b-[6px] ${active === t.key ? 'border-primary-500 text-primary-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`;
            }
            return `${base} rounded-lg border-2 px-4 py-2 ${active === t.key ? 'bg-primary-500 text-white border-black shadow-[3px_3px_0_0_#0A0A0A]' : 'border-black bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 shadow-[3px_3px_0_0_#0A0A0A]'}`;
          })()}
        >
          {t.icon && <t.icon className="inline h-4 w-4 shrink-0" aria-hidden="true" />}
          {t.label}
          {t.badge && (
            <span className="ml-1.5 rounded border border-black bg-slate-100 px-1.5 py-0.5 text-[0.65rem] font-extrabold text-slate-700">
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
            className={`absolute z-20 mt-1.5 min-w-[180px] rounded-lg border-2 border-black bg-white py-1 shadow-[5px_5px_0_0_#0A0A0A] animate-scale-in ${align === 'right' ? 'right-0' : 'left-0'}`}
            role="menu"
          >
            {items.map((item, index) => (
              <button
                key={index}
                onClick={() => {
                  item.onClick?.();
                  if (!item.keepOpen) setOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-primary-50 transition-colors ${item.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                role="menuitem"
                disabled={item.disabled}
              >
                {item.icon && <item.icon className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />}
                <span>{item.label}</span>
                {item.shortcut && <span className="ml-auto text-xs text-slate-400 font-bold">{item.shortcut}</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}