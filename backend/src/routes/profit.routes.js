import { Router } from 'express';
import * as profit from '../controllers/profit.controller.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  createPeriodSchema,
  updatePeriodSchema,
  distributeSchema,
  subscribeSchema,
  unsubscribeSchema,
} from '../validators/profit.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();
router.use(requireAuth);

// ---- BAGI HASIL 2,5% (Owner) ----
router.get('/profit/periods', requirePermission('profit.view'), asyncHandler(profit.listPeriods));
router.post('/profit/periods', requirePermission('profit.distribute'), validate(createPeriodSchema), asyncHandler(profit.createPeriod));
router.put('/profit/periods/:id', requirePermission('profit.distribute'), validate(updatePeriodSchema), asyncHandler(profit.updatePeriod));
router.get('/profit/shares', requirePermission('profit.view'), asyncHandler(profit.listShares));
router.get('/profit/distributions', requirePermission('profit.view'), asyncHandler(profit.listDistributions));
router.post('/profit/distribute', requirePermission('profit.distribute'), validate(distributeSchema), asyncHandler(profit.distributeProfit));

// ---- NOTIFIKASI ----
router.get('/notifications', requirePermission('notifications.view'), asyncHandler(profit.listNotifications));
router.post('/notifications/read-all', requirePermission('notifications.view'), asyncHandler(profit.markNotificationsRead));
router.post('/notifications/subscribe', validate(subscribeSchema), asyncHandler(profit.subscribePush));
router.post('/notifications/unsubscribe', validate(unsubscribeSchema), asyncHandler(profit.unsubscribePush));

export default router;
