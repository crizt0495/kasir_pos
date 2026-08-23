import { Router } from 'express';
import * as purchase from '../controllers/purchase.controller.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createPurchaseSchema, updatePaymentStatusSchema } from '../validators/transaction.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();
router.use(requireAuth);

router.get('/purchases', requirePermission('purchases.view'), asyncHandler(purchase.listPurchases));
router.get('/purchases/:id', requirePermission('purchases.view'), asyncHandler(purchase.getPurchase));
router.post('/purchases', requirePermission('purchases.create'), validate(createPurchaseSchema), asyncHandler(purchase.createPurchase));
router.put('/purchases/:id', requirePermission('purchases.update'), validate(createPurchaseSchema), asyncHandler(purchase.updatePurchase));
router.post('/purchases/:id/receive', requirePermission('purchases.update'), asyncHandler(purchase.receivePurchase));
router.put('/purchases/:id/payment', requirePermission('purchases.update'), validate(updatePaymentStatusSchema), asyncHandler(purchase.updatePaymentStatus));
router.delete('/purchases/:id', requirePermission('purchases.delete'), asyncHandler(purchase.deletePurchase));

export default router;
