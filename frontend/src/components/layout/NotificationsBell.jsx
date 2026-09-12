import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, BellOff, CheckCheck } from 'lucide-react';
import { notificationsApi } from '../../api/index.js';
import { usePermission } from '../../hooks/usePermission.js';
import { formatDateTimeWIB } from '../../utils/format.js';

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

/** Konversi ArrayBuffer applicationServerKey → base64url (format env VAPID). */
function arrayBufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const VAPID_KEY_LS = 'pos_vapid_key';

/** Prioritas tipe saat dedupe per sale_id — DEBT & SALE paling informatif,
 *  SALE_SMS/SALE_TG adalah channel lama yang dulu menambah baris duplikat. */
const TYPE_RANK = { DEBT: 0, SALE: 1, SALE_SMS: 2, SALE_TG: 3 };

/** Gabungkan entri duplikat milik transaksi yang sama (payload.sale_id).
 *  Satu transaksi → satu baris di bell (perbaikan "1 transaksi = 3 notif"). */
function dedupeSale(items) {
  const bySale = new Map();
  const others = [];
  for (const n of items) {
    if (n.payload?.sale_id) {
      const prev = bySale.get(n.payload.sale_id);
      if (!prev || (TYPE_RANK[n.type] ?? 9) < (TYPE_RANK[prev.type] ?? 9)) {
        bySale.set(n.payload.sale_id, n);
      }
    } else {
      others.push(n);
    }
  }
  return [...others, ...bySale.values()].sort(
    (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
  );
}

/** Daftarkan subscription Web Push ke backend (Owner). Dipakai Settings & Bell.
 *  Mengembalikan true bila berhasil, false bila batal/ditolak/gagal (tidak melempar). */
export async function subscribePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !VAPID_PUBLIC_KEY) return false;
  try {
    if ('Notification' in window && Notification.permission === 'denied') return false;
    const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register('/sw.js'));
    let sub = await reg.pushManager.getSubscription();
    // Subscription di browser HP terikat applicationServerKey (VAPID public key) saat dibuat.
    // Jika VAPID pernah diganti, sub lama DITOLAK push service dengan 403 ("VAPID key tidak cocok").
    // applicationServerKey tidak selalu tersedia di daftar properti, jadi juga lacak via localStorage —
    // kombinasi keduanya memastikan sub yang tidak cocok di-unsubscribe lalu dibuat ulang.
    const lastKey = typeof localStorage !== 'undefined' ? localStorage.getItem(VAPID_KEY_LS) : null;
    const subAppKey = sub?.applicationServerKey ? arrayBufferToBase64Url(sub.applicationServerKey) : null;
    const staleSub = sub && (
      (subAppKey && subAppKey !== VAPID_PUBLIC_KEY) ||
      (!subAppKey && lastKey && lastKey !== VAPID_PUBLIC_KEY) ||
      (!subAppKey && !lastKey)
    );
    if (staleSub) {
      try { await sub.unsubscribe(); } catch { /* sub mungkin sudah mati — lanjut subscribe baru */ }
      sub = null;
    }
    if (!sub) {
      if ('Notification' in window && Notification.permission === 'denied') return false;
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    try { localStorage.setItem(VAPID_KEY_LS, VAPID_PUBLIC_KEY); } catch { /* ignore */ }
    const json = sub.toJSON();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await notificationsApi.subscribe({ endpoint: sub.endpoint, keys: json.keys || {} });
        return true;
      } catch (err) {
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 400));
          continue;
        }
        console.warn('Gagal menyimpan subscription Web Push:', err);
      }
    }
    return false;
  } catch {
    /* izin ditolak / VAPID belum dikonfigurasi — abaikan, tidak mengganggu aplikasi */
    return false;
  }
}

export function NotificationsBell() {
  const { can } = usePermission();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const pushSubscribedRef = useRef(false);

  // load dengan referensi stabil — tidak memicu useEffect berulang
  const load = useCallback(async () => {
    try {
      const res = await notificationsApi.list({ limit: 25 });
      const deduped = dedupeSale(res.data?.items || []);
      setItems(deduped);
      setUnread(deduped.filter((n) => n.status === 'sent').length);
    } catch {
      /* abaikan */
    }
  }, []);

  useEffect(() => {
    if (!can('notifications.view')) return undefined;
    if (!pushSubscribedRef.current) {
      pushSubscribedRef.current = true;
      subscribePush();
    }
    load();

    // Polling hanya saat tab VISIBLE (hemat request, hindari rate limit)
    let timer = null;
    const startPolling = () => {
      if (timer) clearInterval(timer);
      timer = setInterval(load, 60_000);
    };
    const stopPolling = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        load();
        startPolling();
      } else {
        stopPolling();
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    if (document.visibilityState === 'visible') startPolling();

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [can, load]);

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
        className="relative rounded-lg border-2 border-transparent p-2 text-slate-500 hover:border-black hover:bg-slate-100 hover:text-slate-700 transition-all duration-100"
        title="Notifikasi penjualan"
        aria-label={`Notifikasi penjualan${unread > 0 ? `, ${unread} belum dibaca` : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-md border border-black bg-danger-500 px-1 text-[0.6rem] font-extrabold text-white" aria-hidden="true">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 z-20 mt-2 w-72 sm:w-80 max-w-[calc(100vw-2rem)] rounded-lg border-2 border-black bg-white shadow-[5px_5px_0_0_#0A0A0A] animate-scale-in">
            <div className="flex items-center justify-between border-b-2 border-black px-4 py-2.5 bg-slate-50">
              <p className="text-sm font-extrabold uppercase tracking-wide text-slate-800">Notifikasi Penjualan</p>
              {unread > 0 && (
                <button onClick={markAllRead} className="flex items-center gap-1 text-xs font-bold text-primary-600 hover:text-primary-800 transition-colors">
                  <CheckCheck className="h-3.5 w-3.5" /> Tandai dibaca
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm font-bold text-slate-400">Belum ada notifikasi</p>
              ) : (
                items.map((n) => (
                  <div
                    key={n.id}
                    className={`border-b border-slate-200 px-4 py-3 transition-colors ${n.status === 'sent' ? 'bg-primary-50' : 'hover:bg-slate-100'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-extrabold text-slate-800">{n.title}</p>
                      {n.status === 'sent' && <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm border border-black bg-danger-500" aria-hidden="true" />}
                    </div>
                    <p className="mt-0.5 whitespace-pre-line text-xs font-medium text-slate-600">{n.body}</p>
                    <p className="mt-1 text-[0.6rem] font-bold text-slate-400">
                      {formatDateTimeWIB(n.created_at)}
                      {n.status === 'failed' && <span className="ml-2 text-danger-500">gagal terkirim</span>}
                    </p>
                  </div>
                ))
              )}
            </div>
            <p className="border-t-2 border-black px-4 py-2 text-center text-[0.6rem] font-bold text-slate-400 bg-slate-50">
              {VAPID_PUBLIC_KEY ? 'Notifikasi push aktif di perangkat ini' : 'Aktifkan Web Push di pengaturan untuk notifikasi ke HP'}
              <BellOff className="ml-1 inline h-3 w-3" aria-hidden="true" />
            </p>
          </div>
        </>
      )}
    </div>
  );
}