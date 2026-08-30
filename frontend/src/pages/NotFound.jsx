import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Button } from '../components/ui/index.jsx';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-5 py-24 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary-50 text-primary-500">
        <Compass className="h-10 w-10" strokeWidth={1.5} />
      </div>
      <div>
        <p className="text-6xl font-extrabold tracking-tight text-slate-900">404</p>
        <p className="mt-2 text-sm text-slate-500">Halaman yang Anda cari tidak ditemukan.</p>
      </div>
      <Link to="/dashboard">
        <Button variant="secondary">Kembali ke Dashboard</Button>
      </Link>
    </div>
  );
}
