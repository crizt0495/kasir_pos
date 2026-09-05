import { supabase } from '../config/supabase.js';
import { env } from '../config/env.js';
import { resolveProvider } from './smsProviders.js';
import { getSetting } from './settingsService.js';

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

/** Kirim push ke satu subscription; return error message jika gagal, null jika sukses */
async function sendWebPush(subscription, payload) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    return 'VAPID keys belum dikonfigurasi';
  }
  // Import dinamis agar VAPID kosong tidak perlu library di-load
  const webpush = (await import('web-push')).default;
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);

  const keys = subscription.keys || {};
  const sub = {
    endpoint: subscription.endpoint,
    keys: { p256dh: keys.p256dh || '', auth: keys.auth || '' },
  };
  if (!sub.keys.p256dh || !sub.keys.auth) return 'Subscription keys tidak lengkap';

  try {
    await webpush.sendNotification(sub, JSON.stringify(payload));
    return null;
  } catch (err) {
    // 404/410 → subscription sudah tidak valid
    if (err?.statusCode === 404 || err?.statusCode === 410) return 'Subscription tidak valid lagi';
    return err?.message || 'Gagal mengirim push';
  }
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

/** Cari semua user yang punya permission notifications.view (Owner). */
export async function findOwnerUsers() {
  const { data: userRows } = await supabase
    .from('user_roles')
    .select('user_id, role:roles!inner(role_permissions!inner(permission:permissions!inner(code)))')
    .eq('role.role_permissions.permission.code', 'notifications.view');

  return [...new Set((userRows || []).map((ur) => ur.user_id).filter(Boolean))];
}

/** Kirim Web Push ke semua subscription milik para owner. */
async function sendToOwnersWebPush(recipients, title, body, payload) {
  let pushSent = 0;
  let pushFailed = 0;
  for (const userId of recipients) {
    const { data: subs } = await supabase
      .from('notification_subscriptions')
      .select('*')
      .eq('user_id', userId);

    for (const sub of subs || []) {
      const err = await sendWebPush(sub, { title, body, ...payload });
      if (err) {
        pushFailed += 1;
        await logNotification({ user_id: userId, type: 'SALE', title, body, payload: { ...payload, endpoint: sub.endpoint }, status: 'failed', error: String(err).slice(0, 500) });
      } else {
        pushSent += 1;
        await logNotification({ user_id: userId, type: 'SALE', title, body, payload, status: 'sent' });
      }
    }
  }
  return { pushSent, pushFailed };
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
      { type: 'test', at: Date.now() }
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
    const dateShort = new Date(sale.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    const smsMessage =
      `${sale.invoice_number} - ${customerName} - ` +
      `Rp${Number(sale.total || 0).toLocaleString('id-ID')} (${sale.payment_method || '-'}) ${dateShort}`;

    // Cari user yang punya permission notifications.view (Owner).
    // Semua level embebed pakai !inner agar filter benar-benar menyaring.
    const recipients = await findOwnerUsers();

    // 1) Web Push
    if (notifSettings.channels.web_push) {
      await sendToOwnersWebPush(recipients, title, body, payload);
    }

    // 2) SMS
    if (notifSettings.channels.sms) {
      const ownerPhone = notifSettings.owner_phone || env.SMS_TO;
      if (ownerPhone) {
        const smsErr = await sendSMS(smsMessage, { to: ownerPhone });
        await logNotification({
          user_id: recipients[0] || null,
          type: 'SALE_SMS',
          title: 'SMS',
          body: smsMessage,
          payload: { invoice_number: sale.invoice_number, sale_id: sale.id },
          status: smsErr ? 'failed' : 'sent',
          error: smsErr ? smsErr.slice(0, 500) : null,
        });
      }
    }

    // 3) Telegram
    if (notifSettings.channels.telegram) {
      const tgChatId = notifSettings.telegram_chat_id || env.TELEGRAM_CHAT_ID;
      if (tgChatId && env.TELEGRAM_BOT_TOKEN) {
        const tgErr = await sendTelegram(`${title}\n\n${body}`, tgChatId);
        await logNotification({
          user_id: recipients[0] || null,
          type: 'SALE_TG',
          title,
          body,
          payload,
          status: tgErr ? 'failed' : 'sent',
          error: tgErr ? tgErr.slice(0, 500) : null,
        });
      }
    }

    // 4) Hutang notification — catat di notification_logs bila ada shortfall
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
        `Tanggal: ${new Date(sale.created_at).toLocaleString('id-ID')}`;
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
