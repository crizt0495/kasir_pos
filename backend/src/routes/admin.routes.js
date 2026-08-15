import { Router } from 'express';
import * as audit from '../controllers/audit.controller.js';
import * as settings from '../controllers/settings.controller.js';
import * as search from '../controllers/search.controller.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { settingsUpdateSchema } from '../validators/admin.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();
router.use(requireAuth);

router.get('/audit-logs', requirePermission('audit.view'), asyncHandler(audit.listAuditLogs));

router.get('/settings', requirePermission('settings.view'), asyncHandler(settings.getSettingsAll));
router.put('/settings', requirePermission('settings.update'), validate(settingsUpdateSchema), asyncHandler(settings.updateSettings));

router.get('/search', asyncHandler(search.globalSearch));

export default router;
