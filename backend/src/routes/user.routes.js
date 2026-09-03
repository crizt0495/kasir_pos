import { Router } from 'express';
import * as users from '../controllers/users.controller.js';
import * as roles from '../controllers/roles.controller.js';
import * as permissions from '../controllers/permissions.controller.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  createUserSchema,
  updateUserSchema,
  createRoleSchema,
  updateRoleSchema,
  setPermissionsSchema,
} from '../validators/admin.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.use(requireAuth);

// Users
router.get('/users', requirePermission('users.view'), asyncHandler(users.listUsers));
router.get('/users/:id', requirePermission('users.view'), asyncHandler(users.getUser));
router.post('/users', requirePermission('users.create'), validate(createUserSchema), asyncHandler(users.createUser));
router.put('/users/:id', requirePermission('users.update'), validate(updateUserSchema), asyncHandler(users.updateUser));
router.delete('/users/:id', requirePermission('users.delete'), asyncHandler(users.deleteUser));

// Roles
router.get('/roles', requirePermission('roles.view'), asyncHandler(roles.listRoles));
router.get('/roles/:id', requirePermission('roles.view'), asyncHandler(roles.getRole));
router.post('/roles', requirePermission('roles.create'), validate(createRoleSchema), asyncHandler(roles.createRole));
router.put('/roles/:id', requirePermission('roles.update'), validate(updateRoleSchema), asyncHandler(roles.updateRole));
router.put('/roles/:id/permissions', requirePermission('roles.update'), validate(setPermissionsSchema), asyncHandler(roles.setRolePermissions));
router.delete('/roles/:id', requirePermission('roles.delete'), asyncHandler(roles.deleteRole));

// Permissions
router.get('/permissions', requirePermission('permissions.view'), asyncHandler(permissions.listPermissions));
router.get('/permissions/matrix', requirePermission('permissions.view'), asyncHandler(permissions.getPermissionMatrix));

export default router;
