import { Link } from 'react-router-dom';
import { Button } from '../components/ui/index.jsx';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <p className="text-6xl font-bold text-slate-300">404</p>
      <p className="text-sm text-slate-500">Halaman yang Anda cari tidak ditemukan.</p>
      <Link to="/dashboard">
        <Button variant="secondary">Kembali ke Dashboard</Button>
      </Link>
    </div>
  );
}
