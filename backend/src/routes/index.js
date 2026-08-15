import { Router } from 'express';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import masterDataRoutes from './masterData.routes.js';
import inventoryRoutes from './inventory.routes.js';
import saleRoutes from './sale.routes.js';
import purchaseRoutes from './purchase.routes.js';
import cashierRoutes from './cashier.routes.js';
import reportRoutes from './report.routes.js';
import adminRoutes from './admin.routes.js';
import profitRoutes from './profit.routes.js';

const router = Router();

router.get('/health', (req, res) => res.json({ success: true, message: 'OK', data: { uptime: process.uptime() } }));

router.use('/auth', authRoutes);
router.use('/', userRoutes);
router.use('/', masterDataRoutes);
router.use('/', inventoryRoutes);
router.use('/', saleRoutes);
router.use('/', purchaseRoutes);
router.use('/', cashierRoutes);
router.use('/', reportRoutes);
router.use('/', adminRoutes);
router.use('/', profitRoutes);

export default router;
