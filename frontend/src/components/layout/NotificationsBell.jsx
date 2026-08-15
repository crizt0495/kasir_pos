import { useEffect, useState } from 'react';
import { Bell, BellOff, CheckCheck } from 'lucide-react';
import { notificationsApi } from '../../api/index.js';
import { usePermission } from '../../hooks/usePermission.js';
import { formatDateTime } from '../../utils/format.js';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

/** Konversi base64url VAPID key → Uint8Array (format pushManager) */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

/** Daftarkan subscription Web Push ke backend (Owner) */
async function subscribePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !VAPID_PUBLIC_KEY) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    const json = sub.toJSON();
    await notificationsApi.subscribe({
      endpoint: sub.endpoint,
      keys: json.keys || {},
    });
  } catch {
    /* izin ditolak / VAPID belum dikonfigurasi — abaikan, tidak mengganggu aplikasi */
  }
}

export function NotificationsBell() {
  const { can } = usePermission();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);

  const load = async () => {
    try {
      const res = await notificationsApi.list({ limit: 15 });
      setItems(res.data?.items || []);
      setUnread(res.data?.unread || 0);
    } catch {
      /* abaikan */
    }
  };

  useEffect(() => {
    if (!can('notifications.view')) return;
    subscribePush();
    load();
    const timer = setInterval(load, 60_000); // poll unread count
    return () => clearInterval(timer);
  }, [can]);

  const markAllRead = async () => {
    try {
      await notificationsApi.readAll();
      setUnread(0);
      setItems((prev) => prev.map((n) => (n.status === 'sent' ? { ...n, status: 'read' } : n)));
    } catch {
      /* abaikan */
    }
  };

  if (!can('notifications.view')) return null;

  return (
    <div className="relative">
      <button
        onClick={() => {
          setOpen((v) => !v);
          if (!open) load();
        }}
        className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        title="Notifikasi penjualan"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-slate-200 bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
              <p className="text-sm font-semibold text-slate-800">Notifikasi Penjualan</p>
              {unread > 0 && (
                <button onClick={markAllRead} className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800">
                  <CheckCheck className="h-3.5 w-3.5" /> Tandai dibaca
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-slate-400">Belum ada notifikasi</p>
              ) : (
                items.map((n) => (
                  <div key={n.id} className={`border-b border-slate-50 px-4 py-3 ${n.status === 'sent' ? 'bg-indigo-50/40' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-slate-800">{n.title}</p>
                      {n.status === 'sent' && <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-indigo-500" />}
                    </div>
                    <p className="mt-0.5 whitespace-pre-line text-xs text-slate-500">{n.body}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {formatDateTime(n.created_at)}
                      {n.status === 'failed' && <span className="ml-2 text-red-500">gagal terkirim</span>}
                    </p>
                  </div>
                ))
              )}
            </div>
            <p className="border-t border-slate-100 px-4 py-2 text-center text-[11px] text-slate-400">
              {VAPID_PUBLIC_KEY ? 'Notifikasi push aktif di perangkat ini' : 'Aktifkan Web Push di pengaturan untuk notifikasi ke HP'}
              <BellOff className="ml-1 inline h-3 w-3" />
            </p>
          </div>
        </>
      )}
    </div>
  );
}
