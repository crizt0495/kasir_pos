import { supabase } from '../config/supabase.js';
import { env } from '../config/env.js';
import { resolveProvider } from './smsProviders.js';
import { getSetting } from './settingsService.js';
import webpush from 'web-push';

// Zona waktu toko (Indonesia WIB) — dipakai untuk format tanggal/jam
// di isi notifikasi agar konsisten di semua server (Vercel/cloud = UTC).
const STORE_TZ = 'Asia/Jakarta';

// Web Push — parameter keandalan tinggi (delivery ~100%)
const PUSH_RETRIES = 3;              // total attempt = retries + 1
const PUSH_RETRY_DELAYS = [300, 900]; // backoff ms antar retry
const MAX_PUSH_BODY_BYTES = 3000;     // batas payload push service (~4096 aman)
const PUSH_TTL_SECONDS = 3600;        // 1 jam — tidak menggantung lama

const DEFAULT_NOTIF_SETTINGS = {
  enabled: false,
  owner_phone: '',
  telegram_chat_id: '',
  channels: { web_push: true, sms: false, telegram: false },
};

/** Ambil pengaturan notifikasi (cached via settingsService 1 menit). */
async function loadNotifSettings() {
  try {
    const s = await getSetting('notification');
    return {
      ...DEFAULT_NOTIF_SETTINGS,
      ...s,
      channels: { ...DEFAULT_NOTIF_SETTINGS.channels, ...(s?.channels || {}) },
    };
  } catch {
    return DEFAULT_NOTIF_SETTINGS;
  }
}

const fmtRupiah = (n) => 'Rp' + Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 });

/**
 * Bangun konten notifikasi dari data penjualan (murni, mudah di-test).
 * sale: detail penjualan { invoice_number, total, payment_method, created_at,
 *        customer: {name}, cashier: {username, profiles}, items: [...] }
 */
export function buildSaleNotification(sale) {
  const customerName = sale.customer?.name || 'Pelanggan Umum';
  const cashierName = sale.cashier?.profiles?.full_name || sale.cashier?.username || '-';
  const items = (sale.items || [])
    .map((it) => `- ${it.product?.name || 'Produk'} × ${Number(it.quantity)}`)
    .slice(0, 10);
  if ((sale.items || []).length > 10) items.push('...');

  const dateStr = new Date(sale.created_at).toLocaleString('id-ID', {
    timeZone: STORE_TZ,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const body =
    `Pelanggan: ${customerName}\nKasir: ${cashierName}\n\nProduk:\n${items.join('\n')}\n\n` +
    `Total: ${fmtRupiah(sale.total)}\nPembayaran: ${sale.payment_method || '-'}\nTanggal: ${dateStr}`;

  return {
    title: '🔔 Penjualan Baru',
    body,
    payload: {
      invoice_number: sale.invoice_number,
      sale_id: sale.id,
      total: sale.total,
      payment_method: sale.payment_method,
    },
  };
}

/** Batasi ukuran payload agar tidak ditolak push service (Firefox ~4096 byte). */
function trimPushPayload(payload) {
  const raw = JSON.stringify(payload);
  if (raw.length <= MAX_PUSH_BODY_BYTES) return raw;
  const body = String(payload.body || '');
  return JSON.stringify({
    ...payload,
    body: body.slice(0, MAX_PUSH_BODY_BYTES - 256),
  });
}

/** Error status yang sifatnya sementara (perlu retry) */
function isTransientPushError(err) {
  const sc = err?.statusCode;
  if (sc === 429) return true;
  if (sc >= 500 && sc < 600) return true;
  return sc == null; // error jaringan/timeout (tanpa status HTTP)
}

/**
 * Kirim push ke satu subscription dengan retry (delivery maksimal).
 * return { error, prunable, skipped }:
 *   - prunable=true → subscription sudah tidak valid (404/410/403), hapus dari DB
 *   - skipped=true  → VAPID belum dikonfigurasi (tidak perlu dianggap gagal permanen)
 */
async function sendWebPush(subscription, payload) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    return { error: 'VAPID keys belum dikonfigurasi', prunable: false, skipped: true };
  }
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);

  const keys = subscription.keys || {};
  const sub = {
    endpoint: subscription.endpoint,
    keys: { p256dh: keys.p256dh || '', auth: keys.auth || '' },
  };
  if (!sub.keys.p256dh || !sub.keys.auth) return { error: 'Subscription keys tidak lengkap', prunable: true };

  const message = trimPushPayload(payload);

  let lastErr = null;
  for (let attempt = 0; attempt <= PUSH_RETRIES; attempt += 1) {
    try {
      await webpush.sendNotification(sub, message, { TTL: PUSH_TTL_SECONDS, urgency: 'high' });
      return { error: null, prunable: false };
    } catch (err) {
      // 404/410 → subscription sudah tidak valid (Gone); 403 → VAPID tidak cocok
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        return { error: 'Subscription tidak valid lagi', prunable: true };
      }
      if (err?.statusCode === 403) {
        return { error: 'VAPID key tidak cocok — perlu subscribe ulang', prunable: true };
      }
      lastErr = err;
      if (attempt < PUSH_RETRIES && isTransientPushError(err)) {
        await new Promise((r) => setTimeout(r, PUSH_RETRY_DELAYS[attempt] || 500));
        continue;
      }
    }
  }
  return { error: lastErr?.message || 'Gagal mengirim push', prunable: false };
}

/** Kirim pesan via Telegram Bot; chatId boleh ditekan dari settings */
async function sendTelegram(message, chatIdArg) {
  const chatId = chatIdArg || env.TELEGRAM_CHAT_ID;
  if (!env.TELEGRAM_BOT_TOKEN || !chatId) return 'Telegram tidak dikonfigurasi';
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message }),
    });
    if (!res.ok) return `Telegram HTTP ${res.status}`;
    return null;
  } catch (err) {
    return err?.message || 'Gagal kirim Telegram';
  }
}

/** Kirim SMS ke HP owner via provider yang dikonfigurasi (Twilio / Fonnte) */
export async function sendSMS(message, { to, providerEnv } = {}) {
  const activeEnv = { ...env, ...(providerEnv || {}), SMS_TO: to || env.SMS_TO };
  const provider = resolveProvider(activeEnv);
  if (!provider) return 'SMS tidak dikonfigurasi (isi SMS_TO + salah satu provider)';
  try {
    await provider.send(message, activeEnv);
    return null;
  } catch (err) {
    return `${provider.name}: ${err?.message || 'Gagal kirim'}`;
  }
}

async function logNotification(entry) {
  try {
    await supabase.from('notification_logs').insert(entry);
  } catch {
    /* log gagal tidak boleh mengganggu apa pun */
  }
}

/**
 * Cari semua user yang punya permission notifications.view (Owner).
 * Dipakai 2 query sederhana (role_permissions → user_roles) agar lebih
 * stabil daripada nested filter PostgREST 3 level yang mudah gagal di
 * beberapa versi PostgREST (hasil kosong diam-diam).
 */
export async function findOwnerUsers() {
  const { data: permRows } = await supabase
    .from('role_permissions')
    .select('role_id, permission:permissions!inner(code)')
    .eq('permission.code', 'notifications.view');
  const roleIds = [...new Set((permRows || []).map((r) => r.role_id).filter(Boolean))];
  if (!roleIds.length) return [];

  const { data: urRows } = await supabase.from('user_roles').select('user_id').in('role_id', roleIds);
  return [...new Set((urRows || []).map((ur) => ur.user_id).filter(Boolean))];
}

/**
 * Kirim Web Push ke semua subscription milik para owner.
 *
 * Bila log=true (default), catat SATU baris notification_logs per user
 * (BUKAN per subscription/perangkat) agar 1 transaksi = 1 notif di bell.
 * Bila log=false, hanya kirim & kembalikan hasil per user (dipakai
 * notifyNewSale untuk agregat semua channel jadi satu baris).
 */
async function sendToOwnersWebPush(recipients, title, body, payload, { log = true } = {}) {
  let pushSent = 0;
  let pushFailed = 0;
  const perUser = new Map();
  for (const userId of recipients) {
    const { data: subs } = await supabase
      .from('notification_subscriptions')
      .select('*')
      .eq('user_id', userId);

    if (!subs || subs.length === 0) {
      perUser.set(userId, { sent: 0, failed: 0, error: null, hasDevice: false });
      if (log) {
        await logNotification({
          user_id: userId,
          type: 'SALE',
          title,
          body,
          payload: { ...payload, push_sent: false },
          status: 'sent',
        });
      }
      continue;
    }

    let sent = 0;
    let failed = 0;
    let lastErr = null;
    for (const sub of subs) {
      const { error: err, prunable } = await sendWebPush(sub, { title, body, url: '/pos', ...payload });
      if (prunable) {
        try {
          await supabase.from('notification_subscriptions').delete().eq('id', sub.id);
        } catch {
          /* hapus gagal tidak mengganggu */
        }
      }
      if (err) {
        failed += 1;
        lastErr = err;
      } else {
        sent += 1;
      }
    }
    pushSent += sent;
    pushFailed += failed;
    perUser.set(userId, { sent, failed, error: lastErr, hasDevice: true });

    if (log) {
      await logNotification({
        user_id: userId,
        type: 'SALE',
        title,
        body,
        payload: { ...payload, push_sent: sent > 0, devices: { sent, failed } },
        status: sent > 0 ? 'sent' : 'failed',
        error: sent > 0 ? null : String(lastErr || 'Gagal mengirim push').slice(0, 500),
      });
    }
  }
  return { pushSent, pushFailed, perUser };
}

/**
 * Kirim notifikasi uji (test) melalui semua channel yang aktif.
 * Dipakai dari halaman Settings sehingga owner bisa memverifikasi
 * konfigurasi (SMS/Telegram/Web Push) tanpa harus melakukan transaksi.
 */
export async function sendTestNotification(recipients) {
  const notifSettings = await loadNotifSettings();
  const results = {};

  if (notifSettings.channels.web_push && recipients.length) {
    const { pushSent, pushFailed } = await sendToOwnersWebPush(
      recipients,
      '🔔 Notifikasi Uji',
      'Ini notifikasi uji dari POS. Jika Anda menerima ini, Web Push sudah berfungsi.',
      { type: 'test', at: Date.now(), url: '/settings' }
    );
    results.web_push = { sent: pushSent, failed: pushFailed };
  } else if (notifSettings.channels.web_push) {
    results.web_push = { sent: 0, failed: 0, skipped: 'Tidak ada owner dengan subscription' };
  }

  if (notifSettings.channels.sms) {
    const ownerPhone = notifSettings.owner_phone || env.SMS_TO;
    if (ownerPhone) {
      const smsErr = await sendSMS('Notifikasi uji dari POS — SMS ke HP Owner berfungsi.', { to: ownerPhone });
      await logNotification({
        user_id: recipients[0] || null,
        type: 'SALE_SMS',
        title: 'SMS',
        body: 'Notifikasi uji dari POS',
        payload: { type: 'test' },
        status: smsErr ? 'failed' : 'sent',
        error: smsErr ? smsErr.slice(0, 500) : null,
      });
      results.sms = smsErr ? { status: 'failed', error: smsErr } : { status: 'sent' };
    } else {
      results.sms = { status: 'skipped', error: 'Nomor HP owner belum diisi' };
    }
  }

  if (notifSettings.channels.telegram) {
    const tgChatId = notifSettings.telegram_chat_id || env.TELEGRAM_CHAT_ID;
    if (tgChatId && env.TELEGRAM_BOT_TOKEN) {
      const tgErr = await sendTelegram('🔔 Notifikasi uji dari POS — Telegram berfungsi.', tgChatId);
      await logNotification({
        user_id: recipients[0] || null,
        type: 'SALE_TG',
        title: 'Telegram',
        body: 'Notifikasi uji dari POS',
        payload: { type: 'test' },
        status: tgErr ? 'failed' : 'sent',
        error: tgErr ? tgErr.slice(0, 500) : null,
      });
      results.telegram = tgErr ? { status: 'failed', error: tgErr } : { status: 'sent' };
    } else {
      results.telegram = { status: 'skipped', error: 'Telegram belum dikonfigurasi (bot token / chat id)' };
    }
  }

  return results;
}

/**
 * Kirim notifikasi penjualan ke Owner (semua user dengan permission
 * notifications.view) via Web Push + SMS + Telegram.
 *
 * FIRE-AND-FORGET: fungsi ini TIDAK PERNAH melempar error. Kegagalan
 * tidak dicatat dan TIDAK menyebabkan transaksi gagal / rollback.
 */
export async function notifyNewSale(sale) {
  try {
    const notifSettings = await loadNotifSettings();
    if (!notifSettings.enabled) return;

    const { title, body, payload } = buildSaleNotification(sale);

    // Pesan SMS ringkas utk HP owner
    const customerName = sale.customer?.name || 'Umum';
    const dateShort = new Date(sale.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: STORE_TZ });
    const smsMessage =
      `${sale.invoice_number} - ${customerName} - ` +
      `Rp${Number(sale.total || 0).toLocaleString('id-ID')} (${sale.payment_method || '-'}) ${dateShort}`;

    // Cari user yang punya permission notifications.view (Owner).
    // Semua level embedded pakai !inner agar filter benar-benar menyaring.
    const recipients = await findOwnerUsers();

    // 1) Web Push — kirim ke SEMUA perangkat owner, hasil dirangkum per user
    //    (SMS/Telegram tetap sekali kirim utk channel masing-masing).
    //    log=false agar log agregat dibuat sekali saja di bawah.
    const { perUser } = notifSettings.channels.web_push
      ? await sendToOwnersWebPush(recipients, title, body, payload, { log: false })
      : { perUser: new Map() };

    // 2) SMS — sekali kirim ke no. HP owner
    let smsErr = null;
    if (notifSettings.channels.sms) {
      const ownerPhone = notifSettings.owner_phone || env.SMS_TO;
      if (ownerPhone) smsErr = await sendSMS(smsMessage, { to: ownerPhone });
    }

    // 3) Telegram — sekali kirim
    let tgErr = null;
    if (notifSettings.channels.telegram) {
      const tgChatId = notifSettings.telegram_chat_id || env.TELEGRAM_CHAT_ID;
      if (tgChatId && env.TELEGRAM_BOT_TOKEN) tgErr = await sendTelegram(`${title}\n\n${body}`, tgChatId);
    }

    // 4) SATU baris log per recipient — semua channel dirangkum dalam payload
    //    agar 1 transaksi = 1 notif di bell (bukan 1 per perangkat/channel).
    const smsStatus = notifSettings.channels.sms ? (smsErr ? 'failed' : 'sent') : null;
    const tgStatus = notifSettings.channels.telegram ? (tgErr ? 'failed' : 'sent') : null;

    for (const userId of recipients) {
      const p = perUser.get(userId) || { sent: 0, failed: 0, error: null, hasDevice: false };
      const webStatus = notifSettings.channels.web_push
        ? p.sent > 0
          ? 'sent'
          : p.hasDevice
            ? 'failed'
            : 'no-device'
        : null;
      const anyGagal = p.failed > 0 || Boolean(smsErr) || Boolean(tgErr);

      await logNotification({
        user_id: userId,
        type: 'SALE',
        title,
        body,
        payload: {
          ...payload,
          push_sent: p.sent > 0,
          channels: { web_push: webStatus, sms: smsStatus, telegram: tgStatus },
        },
        status: anyGagal ? 'failed' : 'sent',
        error: anyGagal ? String(p.error || smsErr || tgErr).slice(0, 500) : null,
      });
    }

    // 5) Hutang notification — catat di notification_logs bila ada shortfall
    //    Fire-and-forget, tidak boleh menggagalkan transaksi (spec §18)
    const cashReceived = Number(sale?.payments?.[0]?.cash_received);
    const total = Number(sale?.total || 0);
    if (sale?.payments?.[0]?.cash_received != null && cashReceived < total && cashReceived >= 0) {
      const debtAmount = total - cashReceived;
      const cName = sale.customer?.name || 'Umum';
      const cKasir = sale.cashier?.profiles?.full_name || sale.cashier?.username || '-';
      const debtBody =
        `Pelanggan: ${cName}\nNo. Transaksi: ${sale.invoice_number}\n` +
        `Total: Rp${total.toLocaleString('id-ID')}\nDibayar: Rp${cashReceived.toLocaleString('id-ID')}\n` +
        `Hutang: Rp${debtAmount.toLocaleString('id-ID')}\nKasir: ${cKasir}\n` +
        `Tanggal: ${new Date(sale.created_at).toLocaleString('id-ID', { timeZone: STORE_TZ, day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
      const debtPayload = {
        invoice_number: sale.invoice_number,
        sale_id: sale.id,
        customer_id: sale.customer_id,
        debt_amount: debtAmount,
        cashier_id: sale.cashier_id,
      };

      for (const userId of recipients) {
        try {
          await logNotification({
            user_id: userId,
            type: 'DEBT',
            title: '💰 HUTANG BARU',
            body: debtBody,
            payload: debtPayload,
            status: 'sent',
          });
        } catch {
          /* abaikan */
        }
      }
    }
  } catch (err) {
    try {
      await logNotification({
        type: 'SALE',
        title: '🔔 Penjualan Baru',
        body: `Penjualan ${sale?.invoice_number || ''} — gagal mengirim notifikasi`,
        payload: { sale_id: sale?.id, invoice_number: sale?.invoice_number },
        status: 'failed',
        error: String(err?.message || err).slice(0, 500),
      });
    } catch {
      /* abaikan */
    }
  }
}
