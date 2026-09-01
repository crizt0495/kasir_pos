import { api } from './client.js';

// ---------- AUTH ----------
export const authApi = {
  login: (payload) => api.post('/auth/login', payload).then((r) => r.data),
  logout: () => api.post('/auth/logout').then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data),
  changePassword: (payload) => api.post('/auth/change-password', payload).then((r) => r.data),
};

// ---------- DASHBOARD ----------
export const dashboardApi = {
  summary: () => api.get('/dashboard/summary').then((r) => r.data),
  charts: () => api.get('/dashboard/charts').then((r) => r.data),
};

// ---------- PRODUCTS & CATEGORIES ----------
export const productsApi = {
  list: (params) => api.get('/products', { params }).then((r) => r.data),
  get: (id) => api.get(`/products/${id}`).then((r) => r.data),
  byBarcode: (barcode) => api.get(`/products/barcode/${encodeURIComponent(barcode)}`).then((r) => r.data),
  create: (payload) => api.post('/products', payload).then((r) => r.data),
  update: (id, payload) => api.put(`/products/${id}`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/products/${id}`).then((r) => r.data),
};

export const categoriesApi = {
  list: (params) => api.get('/categories', { params }).then((r) => r.data),
  create: (payload) => api.post('/categories', payload).then((r) => r.data),
  update: (id, payload) => api.put(`/categories/${id}`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/categories/${id}`).then((r) => r.data),
};

export const unitsApi = {
  list: () => api.get('/units').then((r) => r.data),
  create: (payload) => api.post('/units', payload).then((r) => r.data),
};

// ---------- CUSTOMERS & SUPPLIERS ----------
export const customersApi = {
  list: (params) => api.get('/customers', { params }).then((r) => r.data),
  get: (id) => api.get(`/customers/${id}`).then((r) => r.data),
  create: (payload) => api.post('/customers', payload).then((r) => r.data),
  update: (id, payload) => api.put(`/customers/${id}`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/customers/${id}`).then((r) => r.data),
  debtStats: (id) => api.get(`/customer-debts/stats/${id}`).then((r) => r.data),
  listDebts: (params) => api.get('/customer-debts', { params }).then((r) => r.data),
  createDebt: (payload) => api.post('/customer-debts', payload).then((r) => r.data),
  payDebt: (id, payload) => api.post(`/customer-debts/${id}/pay`, payload).then((r) => r.data),
};

export const suppliersApi = {
  list: (params) => api.get('/suppliers', { params }).then((r) => r.data),
  get: (id) => api.get(`/suppliers/${id}`).then((r) => r.data),
  create: (payload) => api.post('/suppliers', payload).then((r) => r.data),
  update: (id, payload) => api.put(`/suppliers/${id}`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/suppliers/${id}`).then((r) => r.data),
};

// ---------- INVENTORY ----------
export const inventoryApi = {
  list: (params) => api.get('/inventory', { params }).then((r) => r.data),
  movements: (params) => api.get('/inventory/movements', { params }).then((r) => r.data),
  adjust: (payload) => api.post('/inventory/adjust', payload).then((r) => r.data),
  opnames: (params) => api.get('/stock-opnames', { params }).then((r) => r.data),
  opname: (id) => api.get(`/stock-opnames/${id}`).then((r) => r.data),
  createOpname: (payload) => api.post('/stock-opnames', payload).then((r) => r.data),
  updateOpname: (id, payload) => api.put(`/stock-opnames/${id}`, payload).then((r) => r.data),
  completeOpname: (id) => api.post(`/stock-opnames/${id}/complete`).then((r) => r.data),
  cancelOpname: (id) => api.post(`/stock-opnames/${id}/cancel`).then((r) => r.data),
  deleteOpname: (id) => api.delete(`/stock-opnames/${id}`).then((r) => r.data),
};

// ---------- SALES & RETURNS ----------
export const salesApi = {
  list: (params) => api.get('/sales', { params }).then((r) => r.data),
  get: (id) => api.get(`/sales/${id}`).then((r) => r.data),
  create: (payload) => api.post('/sales', payload).then((r) => r.data),
  refund: (id, payload) => api.post(`/sales/${id}/refund`, payload).then((r) => r.data),
};

export const returnsApi = {
  list: (params) => api.get('/returns', { params }).then((r) => r.data),
  get: (id) => api.get(`/returns/${id}`).then((r) => r.data),
};

// ---------- PURCHASES ----------
export const purchasesApi = {
  list: (params) => api.get('/purchases', { params }).then((r) => r.data),
  get: (id) => api.get(`/purchases/${id}`).then((r) => r.data),
  create: (payload) => api.post('/purchases', payload).then((r) => r.data),
  update: (id, payload) => api.put(`/purchases/${id}`, payload).then((r) => r.data),
  receive: (id) => api.post(`/purchases/${id}/receive`).then((r) => r.data),
  payment: (id, payload) => api.put(`/purchases/${id}/payment`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/purchases/${id}`).then((r) => r.data),
};

// ---------- CASHIER ----------
export const cashierApi = {
  sessions: (params) => api.get('/cash-sessions', { params }).then((r) => r.data),
  openSession: () => api.get('/cash-sessions/open').then((r) => r.data),
  open: (payload) => api.post('/cash-sessions', payload).then((r) => r.data),
  close: (id, payload) => api.post(`/cash-sessions/${id}/close`, payload).then((r) => r.data),
  transactions: (params) => api.get('/cash-transactions', { params }).then((r) => r.data),
  addTransaction: (payload) => api.post('/cash-transactions', payload).then((r) => r.data),
};

export const expensesApi = {
  list: (params) => api.get('/expenses', { params }).then((r) => r.data),
  create: (payload) => api.post('/expenses', payload).then((r) => r.data),
  update: (id, payload) => api.put(`/expenses/${id}`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/expenses/${id}`).then((r) => r.data),
};

// ---------- USERS, ROLES, PERMISSIONS ----------
export const usersApi = {
  list: (params) => api.get('/users', { params }).then((r) => r.data),
  get: (id) => api.get(`/users/${id}`).then((r) => r.data),
  create: (payload) => api.post('/users', payload).then((r) => r.data),
  update: (id, payload) => api.put(`/users/${id}`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/users/${id}`).then((r) => r.data),
};

export const rolesApi = {
  list: (params) => api.get('/roles', { params }).then((r) => r.data),
  get: (id) => api.get(`/roles/${id}`).then((r) => r.data),
  create: (payload) => api.post('/roles', payload).then((r) => r.data),
  update: (id, payload) => api.put(`/roles/${id}`, payload).then((r) => r.data),
  setPermissions: (id, payload) => api.put(`/roles/${id}/permissions`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/roles/${id}`).then((r) => r.data),
};

export const permissionsApi = {
  list: () => api.get('/permissions').then((r) => r.data),
};

// ---------- REPORTS ----------
export const reportsApi = {
  sales: (params) => api.get('/reports/sales', { params }).then((r) => r.data),
  profit: (params) => api.get('/reports/profit', { params }).then((r) => r.data),
  products: (params) => api.get('/reports/products', { params }).then((r) => r.data),
  inventory: (params) => api.get('/reports/inventory', { params }).then((r) => r.data),
  cashier: (params) => api.get('/reports/cashier', { params }).then((r) => r.data),
  purchases: (params) => api.get('/reports/purchases', { params }).then((r) => r.data),
  /** Unduh laporan sebagai CSV (butuh permission reports.export) */
  exportCsv: async (path, params, filename) => {
    const res = await api.get(path, { params: { ...params, export: 'csv' }, responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  exportExcel: async (path, params, filename) => {
    const res = await api.get(path, { params: { ...params, export: 'xlsx' }, responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  exportPdf: async (path, params, filename) => {
    const res = await api.get(path, { params: { ...params, export: 'pdf' }, responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

// ---------- BAGI HASIL 2,5% ----------
export const profitApi = {
  periods: () => api.get('/profit/periods').then((r) => r.data),
  createPeriod: (year) => api.post('/profit/periods', { year }).then((r) => r.data),
  updatePeriod: (id, status) => api.put(`/profit/periods/${id}`, { status }).then((r) => r.data),
  shares: (params) => api.get('/profit/shares', { params }).then((r) => r.data),
  distributions: (params) => api.get('/profit/distributions', { params }).then((r) => r.data),
  distribute: (payload) => api.post('/profit/distribute', payload).then((r) => r.data),
};

// ---------- NOTIFIKASI PENJUALAN ----------
export const notificationsApi = {
  list: (params) => api.get('/notifications', { params }).then((r) => r.data),
  readAll: () => api.post('/notifications/read-all').then((r) => r.data),
  subscribe: (payload) => api.post('/notifications/subscribe', payload).then((r) => r.data),
  unsubscribe: (payload) => api.post('/notifications/unsubscribe', payload).then((r) => r.data),
};

// ---------- AUDIT & SETTINGS & SEARCH ----------
export const auditApi = {
  list: (params) => api.get('/audit-logs', { params }).then((r) => r.data),
};

export const settingsApi = {
  get: () => api.get('/settings').then((r) => r.data),
  update: (payload) => api.put('/settings', payload).then((r) => r.data),
};

export const searchApi = {
  all: (q) => api.get('/search', { params: { q } }).then((r) => r.data),
};
