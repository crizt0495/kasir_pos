import { useState } from 'react';
import { ScrollText, ChevronDown } from 'lucide-react';
import { auditApi } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { DataTable, SearchInput, Select, Badge, Field, Input, Modal, PageHeader } from '../components/ui/index.jsx';
import { formatDateTime } from '../utils/format.js';

const MODULES = ['auth', 'users', 'roles', 'products', 'categories', 'customers', 'suppliers', 'inventory', 'stock_opname', 'sales', 'purchases', 'returns', 'cashier', 'expenses', 'reports', 'settings', 'audit'];

export default function AuditLogs() {
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 400);
  const [module, setModule] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);

  const list = useApi(
    () => auditApi.list({ search: debounced || undefined, module: module || undefined, from: from || undefined, to: to || undefined, page, pageSize: 20 }).then((r) => r.data),
    [debounced, module, from, to, page]
  );

  const d = list.data;

  return (
    <div className="space-y-4">
      <PageHeader title="Audit Log" description="Semua aktivitas penting pengguna" />

      <DataTable
        columns={[
          { key: 'created_at', header: 'Waktu', render: (r) => formatDateTime(r.created_at) },
          { key: 'user', header: 'User', render: (r) => (
            <div>
              <p className="font-medium text-slate-800">{r.username || r.user?.username || 'Sistem'}</p>
              <p className="text-xs text-slate-400">{r.ip_address || '-'}</p>
            </div>
          )},
          { key: 'action', header: 'Aksi', render: (r) => <Badge color="bg-primary-100 text-primary-700">{r.action}</Badge> },
          { key: 'module', header: 'Modul', render: (r) => <Badge color="bg-slate-100 text-slate-600">{r.module}</Badge> },
          { key: 'record_id', header: 'ID Record', render: (r) => <code className="text-xs text-slate-400">{r.record_id ? r.record_id.slice(0, 8) : '-'}</code> },
          { key: 'details', header: 'Detail', render: (r) => (
            <button
              onClick={() => setSelected(r)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-primary-600 hover:bg-primary-50"
            >
              <ChevronDown className="h-3.5 w-3.5" /> Lihat data
            </button>
          )},
        ]}
        data={d?.items || []}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        page={page}
        totalPages={d?.totalPages}
        total={d?.total}
        pageSize={d?.pageSize}
        onPageChange={setPage}
        toolbar={
          <>
            <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Cari user / aksi..." className="w-full sm:w-56" />
            <div className="flex flex-wrap items-center gap-2">
              <Select value={module} onChange={(e) => { setModule(e.target.value); setPage(1); }} className="w-40">
                <option value="">Semua Modul</option>
                {MODULES.map((m) => <option key={m} value={m}>{m}</option>)}
              </Select>
              <Field className="w-36"><Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} /></Field>
              <Field className="w-36"><Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} /></Field>
            </div>
          </>
        }
      />

      <Modal open={!!selected} onClose={() => setSelected(null)} title="Detail Audit Log" size="lg">
        {selected && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-slate-400">Waktu</p><p>{formatDateTime(selected.created_at)}</p></div>
              <div><p className="text-xs text-slate-400">User</p><p>{selected.username || '-'}</p></div>
              <div><p className="text-xs text-slate-400">Aksi</p><p className="font-medium">{selected.action}</p></div>
              <div><p className="text-xs text-slate-400">Modul</p><p>{selected.module}</p></div>
              <div><p className="text-xs text-slate-400">IP Address</p><p>{selected.ip_address || '-'}</p></div>
              <div><p className="text-xs text-slate-400">User Agent</p><p className="line-clamp-2">{selected.user_agent || '-'}</p></div>
              <div><p className="text-xs text-slate-400">Record ID</p><code>{selected.record_id || '-'}</code></div>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-slate-400">Data Lama</p>
                <pre className="max-h-48 overflow-auto rounded-lg bg-slate-50 p-3 text-xs">{selected.old_data ? JSON.stringify(selected.old_data, null, 2) : '-'}</pre>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-slate-400">Data Baru</p>
                <pre className="max-h-48 overflow-auto rounded-lg bg-emerald-50 p-3 text-xs">{selected.new_data ? JSON.stringify(selected.new_data, null, 2) : '-'}</pre>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
