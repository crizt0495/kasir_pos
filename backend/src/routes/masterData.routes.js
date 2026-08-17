import { Router } from 'express';
import * as product from '../controllers/product.controller.js';
import * as customer from '../controllers/customer.controller.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { productSchema, categorySchema, unitSchema, customerSchema, supplierSchema } from '../validators/masterData.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();
router.use(requireAuth);

// Products
router.get('/products', requirePermission('products.view'), asyncHandler(product.listProducts));
router.get('/products/barcode/:barcode', requirePermission('products.view'), asyncHandler(product.getProductByBarcode));
router.get('/products/:id', requirePermission('products.view'), asyncHandler(product.getProduct));
router.post('/products', requirePermission('products.create'), validate(productSchema), asyncHandler(product.createProduct));
router.put('/products/:id', requirePermission('products.update'), validate(productSchema), asyncHandler(product.updateProduct));
router.delete('/products/:id', requirePermission('products.delete'), asyncHandler(product.deleteProduct));

// Units (satuan produk)
router.get('/units', requirePermission('products.view'), asyncHandler(product.listUnits));
router.post('/units', requirePermission('products.create'), validate(unitSchema), asyncHandler(product.createUnit));

// Categories
router.get('/categories', requirePermission('categories.view'), asyncHandler(product.listCategories));
router.post('/categories', requirePermission('categories.create'), validate(categorySchema), asyncHandler(product.createCategory));
router.put('/categories/:id', requirePermission('categories.update'), validate(categorySchema), asyncHandler(product.updateCategory));
router.delete('/categories/:id', requirePermission('categories.delete'), asyncHandler(product.deleteCategory));

// Customers
router.get('/customers', requirePermission('customers.view'), asyncHandler(customer.listCustomers));
router.get('/customers/:id', requirePermission('customers.view'), asyncHandler(customer.getCustomer));
router.post('/customers', requirePermission('customers.create'), validate(customerSchema), asyncHandler(customer.createCustomer));
router.put('/customers/:id', requirePermission('customers.update'), validate(customerSchema), asyncHandler(customer.updateCustomer));
router.delete('/customers/:id', requirePermission('customers.delete'), asyncHandler(customer.deleteCustomer));

// Suppliers
router.get('/suppliers', requirePermission('suppliers.view'), asyncHandler(customer.listSuppliers));
router.get('/suppliers/:id', requirePermission('suppliers.view'), asyncHandler(customer.getSupplier));
router.post('/suppliers', requirePermission('suppliers.create'), validate(supplierSchema), asyncHandler(customer.createSupplier));
router.put('/suppliers/:id', requirePermission('suppliers.update'), validate(supplierSchema), asyncHandler(customer.updateSupplier));
router.delete('/suppliers/:id', requirePermission('suppliers.delete'), asyncHandler(customer.deleteSupplier));

export default router;
