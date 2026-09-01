import { Router } from 'express';
import * as customerDebt from '../controllers/customerDebt.controller.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createDebtSchema, payDebtSchema } from '../validators/customerDebt.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();
router.use(requireAuth);

// Stats must come BEFORE :customer_id to avoid being shadowed
router.get('/customer-debts/stats/:customer_id', requirePermission('customers.view'), asyncHandler(customerDebt.getDebtStats));
router.get('/customer-debts', requirePermission('customers.view'), asyncHandler(customerDebt.listDebts));
router.get('/customer-debts/:customer_id', requirePermission('customers.view'), asyncHandler(customerDebt.listDebtsByCustomer));
router.get('/customer-debts/detail/:id', requirePermission('customers.view'), asyncHandler(customerDebt.getDebt));
router.post('/customer-debts', requirePermission('customers.create'), validate(createDebtSchema), asyncHandler(customerDebt.createDebt));
router.post('/customer-debts/:id/pay', requirePermission('customers.update'), validate(payDebtSchema), asyncHandler(customerDebt.payDebt));

export default router;