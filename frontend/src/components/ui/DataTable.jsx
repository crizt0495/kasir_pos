import { Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowUp, ArrowDown } from 'lucide-react';
import { SkeletonRows, EmptyState, ErrorState } from './Feedback.jsx';

export function SearchInput({ value, onChange, placeholder = 'Cari...', className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
    </div>
  );
}

export function Pagination({ page, totalPages, total, pageSize, onPageChange }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm text-slate-600">
      <span>
        Menampilkan <b>{(page - 1) * pageSize + 1}</b>–<b>{Math.min(page * pageSize, total)}</b> dari <b>{total}</b> data
      </span>
      <div className="flex items-center gap-1">
        <button
          className="rounded-md p-1.5 hover:bg-slate-100 disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => onPageChange(1)}
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button
          className="rounded-md p-1.5 hover:bg-slate-100 disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="px-2">
          Halaman <b>{page}</b> / {totalPages || 1}
        </span>
        <button
          className="rounded-md p-1.5 hover:bg-slate-100 disabled:opacity-40"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          className="rounded-md p-1.5 hover:bg-slate-100 disabled:opacity-40"
          disabled={page >= totalPages}
          onClick={() => onPageChange(totalPages)}
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * DataTable generik dengan server-side pagination + sorting opsional.
 * columns: [{ key, header, render(row), className, sortable, sortKey }]
 * sorting: { key, order } | null — aktifkan dengan prop sort + onSortChange
 */
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
}) {
  return (
    <div className={`overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {toolbar && <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">{toolbar}</div>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              {columns.map((c) => {
                const sortable = Boolean(c.sortable && onSortChange);
                const sortKey = c.sortKey || c.key;
                const active = sortable && sort?.key === sortKey;
                return (
                  <th key={c.key} className={`px-4 py-2.5 font-semibold ${c.className || ''}`}>
                    {sortable ? (
                      <button
                        onClick={() => onSortChange(sortKey)}
                        className={`inline-flex items-center gap-1 hover:text-slate-800 ${active ? 'text-indigo-600' : ''}`}
                      >
                        {c.header}
                        {active ? (sort.order === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUp className="h-3 w-3 opacity-30" />}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={columns.length}>
                  <SkeletonRows rows={6} cols={columns.length} />
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
                  className={onRowClick ? 'cursor-pointer transition-colors hover:bg-indigo-50/50' : 'hover:bg-slate-50/60'}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={`px-4 py-2.5 text-slate-700 ${c.className || ''}`}>
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

export function Card({ title, actions, children, className = '', bodyClassName = '' }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          {title && <h3 className="text-sm font-semibold text-slate-800">{title}</h3>}
          {actions}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            active === t.key ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
