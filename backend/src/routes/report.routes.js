import { Router } from 'express';
import * as report from '../controllers/report.controller.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();
router.use(requireAuth);

/** Export (CSV/Excel/PDF) hanya untuk yang punya reports.export */
const requireExport = (req, res, next) => {
  const fmt = req.query.export;
  if (fmt && !['csv', 'xlsx', 'pdf'].includes(fmt)) return next();
  if (fmt && !req.user.permissions.has('reports.export')) {
    return res.status(403).json({ success: false, message: 'Anda tidak memiliki akses export', code: 'FORBIDDEN' });
  }
  return next();
};

router.get('/reports/sales', requirePermission('reports.view'), requireExport, asyncHandler(report.salesReport));
router.get('/reports/profit', requirePermission('reports.view'), requireExport, asyncHandler(report.profitReport));
router.get('/reports/products', requirePermission('reports.view'), requireExport, asyncHandler(report.productsReport));
router.get('/reports/inventory', requirePermission('reports.view'), requireExport, asyncHandler(report.inventoryReport));
router.get('/reports/cashier', requirePermission('reports.view'), requireExport, asyncHandler(report.cashierReport));
router.get('/reports/purchases', requirePermission('reports.view'), requireExport, asyncHandler(report.purchasesReport));

router.get('/dashboard/summary', requirePermission('dashboard.view'), asyncHandler(report.dashboardSummary));
router.get('/dashboard/charts', requirePermission('dashboard.view'), asyncHandler(report.dashboardCharts));

export default router;
