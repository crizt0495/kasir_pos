import { Router } from 'express';
import * as cashier from '../controllers/cashier.controller.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  openSessionSchema,
  closeSessionSchema,
  cashTransactionSchema,
  expenseSchema,
} from '../validators/cashier.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();
router.use(requireAuth);

// Sesi kas
router.get('/cash-sessions', requirePermission('cashier.view'), asyncHandler(cashier.listSessions));
router.get('/cash-sessions/open', requirePermission('cashier.open'), asyncHandler(cashier.getOpenSession));
router.post('/cash-sessions', requirePermission('cashier.open'), validate(openSessionSchema), asyncHandler(cashier.openSession));
router.post('/cash-sessions/:id/close', requirePermission('cashier.close'), validate(closeSessionSchema), asyncHandler(cashier.closeSession));

// Transaksi kas
router.get('/cash-transactions', requirePermission('cashier.view'), asyncHandler(cashier.listTransactions));
router.post('/cash-transactions', requirePermission('cashier.open'), validate(cashTransactionSchema), asyncHandler(cashier.addTransaction));

// Pengeluaran
router.get('/expenses', requirePermission('expenses.view'), asyncHandler(cashier.listExpenses));
router.post('/expenses', requirePermission('expenses.create'), validate(expenseSchema), asyncHandler(cashier.createExpense));
router.put('/expenses/:id', requirePermission('expenses.update'), validate(expenseSchema), asyncHandler(cashier.updateExpense));
router.delete('/expenses/:id', requirePermission('expenses.delete'), asyncHandler(cashier.deleteExpense));

export default router;
