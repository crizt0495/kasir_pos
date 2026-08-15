import { Router } from 'express';
import * as inventory from '../controllers/inventory.controller.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { adjustStockSchema, opnameCreateSchema, opnameUpdateSchema } from '../validators/inventory.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();
router.use(requireAuth);

router.get('/inventory', requirePermission('inventory.view'), asyncHandler(inventory.listInventory));
router.get('/inventory/movements', requirePermission('inventory.view'), asyncHandler(inventory.listMovements));
router.post('/inventory/adjust', requirePermission('inventory.adjust'), validate(adjustStockSchema), asyncHandler(inventory.adjustStock));

router.get('/stock-opnames', requirePermission('stock_opname.view'), asyncHandler(inventory.listOpnames));
router.get('/stock-opnames/:id', requirePermission('stock_opname.view'), asyncHandler(inventory.getOpname));
router.post('/stock-opnames', requirePermission('stock_opname.create'), validate(opnameCreateSchema), asyncHandler(inventory.createOpname));
router.put('/stock-opnames/:id', requirePermission('stock_opname.update'), validate(opnameUpdateSchema), asyncHandler(inventory.updateOpname));
router.post('/stock-opnames/:id/complete', requirePermission('stock_opname.update'), asyncHandler(inventory.completeOpname));
router.post('/stock-opnames/:id/cancel', requirePermission('stock_opname.update'), asyncHandler(inventory.cancelOpname));
router.delete('/stock-opnames/:id', requirePermission('stock_opname.delete'), asyncHandler(inventory.deleteOpname));

export default router;
