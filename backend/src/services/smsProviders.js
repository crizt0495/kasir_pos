/**
 * SMS Provider Adapters
 *
 * Mendukung dua provider:
 * - Twilio (internasional): butuh SMS_ACCOUNT_SID + SMS_AUTH_TOKEN + SMS_FROM + SMS_TO
 * - Fonnte (Indonesia, gratis): butuh SMS_API_TOKEN + SMS_TO
 *
 * Set SMS_PROVIDER='twilio' atau 'fonnte' di .env.
 * Jika tidak diset, otomatis deteksi berdasarkan env vars yang ada.
 */

export const providers = {
  /**
   * Twilio — REST API v2010
   * Docs: https://www.twilio.com/docs/messaging/api/message-resource
   */
  twilio: {
    name: 'Twilio',
    isConfigured: (env) => !!(env.SMS_ACCOUNT_SID && env.SMS_AUTH_TOKEN && env.SMS_FROM && env.SMS_TO),
    send: async (message, env) => {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${env.SMS_ACCOUNT_SID}/Messages.json`;
      const auth = Buffer.from(`${env.SMS_ACCOUNT_SID}:${env.SMS_AUTH_TOKEN}`).toString('base64');
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${auth}`,
        },
        body: new URLSearchParams({ To: env.SMS_TO, From: env.SMS_FROM, Body: message }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Twilio HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
    },
  },

  /**
   * Fonnte — API Indonesia, gratis tier tersedia
   * Docs: https://docs.fonnte.com/
   */
  fonnte: {
    name: 'Fonnte',
    isConfigured: (env) => !!(env.SMS_API_TOKEN && env.SMS_TO),
    send: async (message, env) => {
      const res = await fetch('https://api.fonnte.com/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: env.SMS_API_TOKEN,
        },
        body: JSON.stringify({ target: env.SMS_TO, message }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Fonnte HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
    },
  },
};

/**
 * Deteksi provider aktif berdasarkan env vars.
 * Jika SMS_PROVIDER diset, pakai itu. Kalau tidak, auto-detect.
 * @returns {{ name: string, send: Function } | null}
 */
export function resolveProvider(env) {
  const configured = env.SMS_PROVIDER?.toLowerCase();
  if (configured && providers[configured]) return providers[configured];
  // Auto-detect: cek mana yang sudah terkonfigurasi
  for (const key of Object.keys(providers)) {
    if (providers[key].isConfigured(env)) return providers[key];
  }
  return null;
}
