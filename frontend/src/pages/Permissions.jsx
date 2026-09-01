import { useApi } from '../hooks/useApi.js';
import { permissionsApi } from '../api/index.js';
import { Card } from '../components/ui/DataTable.jsx';
import { Skeleton, ErrorState, Badge } from '../components/ui/Feedback.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';

export default function Permissions() {
  const permissions = useApi(() => permissionsApi.list().then((r) => r.data), []);

  return (
    <div className="space-y-4">
      <PageHeader title="Permissions" description="Daftar semua izin (hak akses) granular yang tersedia" />

      {permissions.loading ? (
        <Skeleton className="h-40 w-full" />
      ) : permissions.error ? (
        <ErrorState onRetry={permissions.reload} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Object.entries(permissions.data?.grouped || {}).map(([module, perms]) => (
            <Card key={module} title={module} bodyClassName="divide-y divide-slate-100">
              {perms.map((p) => (
                <div key={p.code} className="flex items-start justify-between gap-2 px-4 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{p.name}</p>
                    <p className="text-xs text-slate-400">{p.description || '-'}</p>
                  </div>
                  <Badge color="bg-slate-100 text-slate-600"><code>{p.code}</code></Badge>
                </div>
              ))}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
