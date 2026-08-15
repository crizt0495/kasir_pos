import { supabase } from '../config/supabase.js';
import { writeAudit } from '../services/auditService.js';
import { getSettings, invalidateSettingsCache } from '../services/settingsService.js';
import { ok } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const getSettingsAll = asyncHandler(async (req, res) => {
  const settings = await getSettings(true);
  return ok(res, settings);
});

export const updateSettings = asyncHandler(async (req, res) => {
  const entries = req.body; // [{ key, value }]
  const updated = {};

  for (const { key, value } of entries) {
    const { data: existing } = await supabase.from('settings').select('value').eq('key', key).maybeSingle();

    const { data, error } = await supabase
      .from('settings')
      .upsert({ key, value, updated_by: req.user.id }, { onConflict: 'key' })
      .select('key, value')
      .single();
    if (error) throw error;
    updated[key] = { old: existing?.value || null, new: data.value };

    await writeAudit({
      user: req.user,
      action: 'SETTINGS_UPDATED',
      module: 'settings',
      recordId: null,
      oldData: { key, value: existing?.value || null },
      newData: { key, value },
      req,
    });
  }

  invalidateSettingsCache();
  return ok(res, updated, 'Pengaturan berhasil disimpan');
});
