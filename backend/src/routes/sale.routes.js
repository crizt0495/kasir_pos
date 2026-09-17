import { Router } from 'express';
import * as sale from '../controllers/sale.controller.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createSaleSchema, editSaleSchema, cancelSaleDebtSchema, refundSaleSchema, syncOfflineTransactionsSchema } from '../validators/transaction.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();
router.use(requireAuth);

router.get('/sales', requirePermission('sales.view'), asyncHandler(sale.listSales));
router.get('/sales/:id', requirePermission('sales.view'), asyncHandler(sale.getSale));
router.post('/sales', requirePermission('sales.create'), validate(createSaleSchema), asyncHandler(sale.createSale));
router.put('/sales/:id/edit', requirePermission('sales.refund'), validate(editSaleSchema), asyncHandler(sale.editSale));
router.post('/sales/:id/cancel-debt', requirePermission('sales.refund'), validate(cancelSaleDebtSchema), asyncHandler(sale.cancelSaleDebt));
router.post('/sales/:id/refund', requirePermission('sales.refund'), validate(refundSaleSchema), asyncHandler(sale.refundSale));
// Sinkronisasi antrian transaksi offline (dikirim kasir saat internet kembali)
router.post('/sync-offline-transactions', requirePermission('sales.create'), validate(syncOfflineTransactionsSchema), asyncHandler(sale.syncOfflineTransactions));

router.get('/returns', requirePermission('returns.view'), asyncHandler(sale.listReturns));
router.get('/returns/:id', requirePermission('returns.view'), asyncHandler(sale.getReturn));

export default router;
