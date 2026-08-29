import { Router } from 'express';
import * as auth from '../controllers/auth.controller.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { loginLimiter } from '../middleware/rateLimiter.js';
import { loginSchema, changePasswordSchema } from '../validators/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.post('/login', loginLimiter, validate(loginSchema), asyncHandler(auth.login));
router.post('/logout', requireAuth, asyncHandler(auth.logout));
router.get('/me', optionalAuth, asyncHandler(auth.me));
router.post('/change-password', requireAuth, validate(changePasswordSchema), asyncHandler(auth.changePassword));

export default router;
