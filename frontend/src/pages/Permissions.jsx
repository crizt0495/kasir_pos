import { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, RefreshCw } from 'lucide-react';
import { rolesApi, permissionsApi } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import { usePermission } from '../hooks/usePermission.js';
import { toast } from '../stores/uiStore.js';
import { getErrorMessage } from '../api/client.js';
import { Card } from '../components/ui/DataTable.jsx';
import { Skeleton, ErrorState } from '../components/ui/Feedback.jsx';
import { Button } from '../components/ui/Button.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';

export default function Permissions() {
  const { can } = usePermission();
  const matrix = useApi(() => permissionsApi.matrix().then((r) => r.data), []);
  const editable = can('roles.update');

  const [roleSets, setRoleSets] = useState({});
  const [saving, setSaving] = useState(null);

  useEffect(() => {
    if (!matrix.data) return;
    const next = {};
    matrix.data.roles.forEach((r) => {
      next[r.id] = new Set(r.permission_codes);
    });
    setRoleSets(next);
  }, [matrix.data]);

  const grouped = useMemo(() => {
    const g = {};
    (matrix.data?.permissions || []).forEach((p) => {
      if (!g[p.module]) g[p.module] = [];
      g[p.module].push(p);
    });
    return g;
  }, [matrix.data]);

  const roles = matrix.data?.roles || [];

  const toggle = async (role, code) => {
    setSaving(`${role.id}:${code}`);
    try {
      const nextSet = new Set(roleSets[role.id] || []);
      if (nextSet.has(code)) nextSet.delete(code);
      else nextSet.add(code);
      const permission_codes = Array.from(nextSet);
      setRoleSets((prev) => ({ ...prev, [role.id]: nextSet }));
      await rolesApi.setPermissions(role.id, { permission_codes });
      toast.success(`Permission "${role.name}" diperbarui`);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Gagal menyimpan permission'));
      matrix.reload();
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Permissions"
        description="Kelola hak akses granular per role termasuk Owner. Permission kritis (roles.*, users.*, permissions.view) tidak bisa dicabut dari role yang sedang Anda gunakan."
        actions={
          can('permissions.view') && (
            <Button variant="secondary" size="sm" onClick={matrix.reload} icon={RefreshCw}>
              Muat Ulang
            </Button>
          )
        }
      />

      {matrix.loading ? (
        <Skeleton className="h-40 w-full" />
      ) : matrix.error ? (
        <ErrorState onRetry={matrix.reload} />
      ) : roles.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-500">Tidak ada role tersedia.</Card>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Permission</th>
                  {roles.map((r) => (
                    <th key={r.id} className="px-3 py-3 text-center">
                      <span className="inline-flex items-center gap-1">
                        {r.is_system && <ShieldCheck className="h-3.5 w-3.5 text-red-400" />}
                        {r.name}
                      </span>
                      {r.is_system && <span className="block text-[10px] font-normal normal-case text-red-400">sistem</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Object.entries(grouped).map(([module, perms]) => (
                  <PermissionGroup
                    key={module}
                    module={module}
                    perms={perms}
                    roles={roles}
                    roleSets={roleSets}
                    editable={editable}
                    saving={saving}
                    onToggle={toggle}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {!editable && (
            <p className="text-xs text-slate-400">Anda tidak punya izin <code>roles.update</code>, sehingga tampilan hanya mode baca.</p>
          )}
        </div>
      )}
    </div>
  );
}

function PermissionGroup({ module, perms, roles, roleSets, editable, saving, onToggle }) {
  return (
    <>
      <tr className="bg-slate-50/60">
        <td colSpan={roles.length + 1} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-primary-600">
          {module}
        </td>
      </tr>
      {perms.map((p) => (
        <tr key={p.code} className="hover:bg-slate-50/40">
          <td className="px-4 py-2.5">
            <p className="font-medium text-slate-800">{p.name}</p>
            <p className="text-xs text-slate-400">
              <code>{p.code}</code>
              {p.description ? ` — ${p.description}` : ''}
            </p>
          </td>
          {roles.map((r) => {
            const checked = roleSets[r.id]?.has(p.code) || false;
            const disabled = !editable || saving !== null;
            return (
              <td key={r.id} className="px-3 py-2.5 text-center">
                <div className="flex justify-center">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => onToggle(r, p.code)}
                    className="h-5 w-9 rounded-full border-2 border-slate-300 bg-slate-200 appearance-none cursor-pointer transition-all duration-150 ease-out
                      checked:border-primary-600 checked:bg-primary-600 checked:translate-x-full
                      focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
                      disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label={`${p.name} untuk ${r.name}`}
                    title={`${r.name}: ${p.name}`}
                  />
                </div>
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
