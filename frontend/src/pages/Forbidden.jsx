import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { Button } from '../components/ui/Button.jsx';

export default function Forbidden() {
  return (
    <div className="flex flex-col items-center justify-center gap-5 py-24 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-amber-50 text-amber-500">
        <ShieldAlert className="h-10 w-10" strokeWidth={1.5} />
      </div>
      <div>
        <p className="text-6xl font-extrabold tracking-tight text-slate-900">403</p>
        <p className="mt-2 text-sm text-slate-500">
          Anda tidak memiliki akses ke halaman ini. Hubungi administrator bila menurut Anda ini keliru.
        </p>
      </div>
      <Link to="/dashboard">
        <Button variant="secondary">Kembali ke Dashboard</Button>
      </Link>
    </div>
  );
}