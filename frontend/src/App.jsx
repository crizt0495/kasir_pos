import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore.js';
import { RequireAuth, RequirePermission } from './components/ProtectedRoute.jsx';
import AppLayout from './components/layout/AppLayout.jsx';
import { Toaster, Skeleton } from './components/ui/Feedback.jsx';

// Lazy loading + code splitting
const Login = lazy(() => import('./pages/Login.jsx'));
const ChangePassword = lazy(() => import('./pages/ChangePassword.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const POS = lazy(() => import('./pages/POS.jsx'));
const Products = lazy(() => import('./pages/Products.jsx'));
const ProductForm = lazy(() => import('./pages/ProductForm.jsx'));
const Categories = lazy(() => import('./pages/Categories.jsx'));
const Customers = lazy(() => import('./pages/Customers.jsx'));
const CustomerDetail = lazy(() => import('./pages/CustomerDetail.jsx'));
const Suppliers = lazy(() => import('./pages/Suppliers.jsx'));
const Inventory = lazy(() => import('./pages/Inventory.jsx'));
const Movements = lazy(() => import('./pages/Movements.jsx'));
const Opnames = lazy(() => import('./pages/Opnames.jsx'));
const OpnameForm = lazy(() => import('./pages/OpnameForm.jsx'));
const Purchases = lazy(() => import('./pages/Purchases.jsx'));
const PurchaseForm = lazy(() => import('./pages/PurchaseForm.jsx'));
const PurchaseDetail = lazy(() => import('./pages/PurchaseDetail.jsx'));
const Sales = lazy(() => import('./pages/Sales.jsx'));
const SaleDetail = lazy(() => import('./pages/SaleDetail.jsx'));
const Returns = lazy(() => import('./pages/Returns.jsx'));
const Debts = lazy(() => import('./pages/Debts.jsx'));
const Cashier = lazy(() => import('./pages/Cashier.jsx'));
const Expenses = lazy(() => import('./pages/Expenses.jsx'));
const Reports = lazy(() => import('./pages/Reports.jsx'));
const ProfitSharing = lazy(() => import('./pages/ProfitSharing.jsx'));
const Users = lazy(() => import('./pages/Users.jsx'));
const UserForm = lazy(() => import('./pages/UserForm.jsx'));
const Roles = lazy(() => import('./pages/Roles.jsx'));
const Permissions = lazy(() => import('./pages/Permissions.jsx'));
const AuditLogs = lazy(() => import('./pages/AuditLogs.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));
const Forbidden = lazy(() => import('./pages/Forbidden.jsx'));

function PageFallback() {
  return (
    <div className="space-y-4 p-1" aria-hidden="true">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}

// Arahkan index "/" ke halaman yang sesuai hak akses:
// kasir tanpa dashboard.view langsung ke /pos, bukan /dashboard.
function HomeRedirect() {
  const can = useAuthStore((s) => s.can);
  return <Navigate to={can('dashboard.view') ? '/dashboard' : '/pos'} replace />;
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          path="/"
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route index element={<HomeRedirect />} />
        <Route path="change-password" element={<ChangePassword />} />
          <Route path="forbidden" element={<Forbidden />} />
        <Route
          path="dashboard"
          element={
            <RequirePermission permission="dashboard.view" fallback="/pos">
              <Dashboard />
            </RequirePermission>
          }
        />
          <Route path="pos" element={<RequirePermission permission="pos.access"><POS /></RequirePermission>} />
          <Route path="products" element={<RequirePermission permission="products.view"><Products /></RequirePermission>} />
          <Route path="products/new" element={<RequirePermission permission="products.create"><ProductForm /></RequirePermission>} />
          <Route path="products/:id/edit" element={<RequirePermission permission="products.update"><ProductForm /></RequirePermission>} />
          <Route path="categories" element={<RequirePermission permission="categories.view"><Categories /></RequirePermission>} />
          <Route path="customers" element={<RequirePermission permission="customers.view"><Customers /></RequirePermission>} />
          <Route path="customers/:id" element={<RequirePermission permission="customers.view"><CustomerDetail /></RequirePermission>} />
          <Route path="suppliers" element={<RequirePermission permission="suppliers.view"><Suppliers /></RequirePermission>} />
          <Route path="inventory" element={<RequirePermission permission="inventory.view"><Inventory /></RequirePermission>} />
          <Route path="inventory/movements" element={<RequirePermission permission="inventory.view"><Movements /></RequirePermission>} />
          <Route path="inventory/opname" element={<RequirePermission permission="stock_opname.view"><Opnames /></RequirePermission>} />
          <Route path="inventory/opname/new" element={<RequirePermission permission="stock_opname.create"><OpnameForm /></RequirePermission>} />
          <Route path="inventory/opname/:id" element={<RequirePermission permission="stock_opname.view"><OpnameForm /></RequirePermission>} />
          <Route path="purchases" element={<RequirePermission permission="purchases.view"><Purchases /></RequirePermission>} />
          <Route path="purchases/new" element={<RequirePermission permission="purchases.create"><PurchaseForm /></RequirePermission>} />
          <Route path="purchases/:id" element={<RequirePermission permission="purchases.view"><PurchaseDetail /></RequirePermission>} />
          <Route path="purchases/:id/edit" element={<RequirePermission permission="purchases.update"><PurchaseForm /></RequirePermission>} />
          <Route path="sales" element={<RequirePermission permission="sales.view"><Sales /></RequirePermission>} />
          <Route path="sales/:id" element={<RequirePermission permission="sales.view"><SaleDetail /></RequirePermission>} />
          <Route path="returns" element={<RequirePermission permission="returns.view"><Returns /></RequirePermission>} />
          <Route path="debts" element={<RequirePermission permission="customers.view"><Debts /></RequirePermission>} />
          <Route path="cashier" element={<RequirePermission permission={['cashier.view', 'cashier.open']} fallback="/pos"><Cashier /></RequirePermission>} />
          <Route path="expenses" element={<RequirePermission permission="expenses.view"><Expenses /></RequirePermission>} />
          <Route path="reports" element={<RequirePermission permission="reports.view"><Reports /></RequirePermission>} />
          <Route path="profit-sharing" element={<RequirePermission permission="profit.view"><ProfitSharing /></RequirePermission>} />
          <Route path="users" element={<RequirePermission permission="users.view"><Users /></RequirePermission>} />
          <Route path="users/new" element={<RequirePermission permission="users.create"><UserForm /></RequirePermission>} />
          <Route path="users/:id/edit" element={<RequirePermission permission="users.update"><UserForm /></RequirePermission>} />
          <Route path="roles" element={<RequirePermission permission="roles.view"><Roles /></RequirePermission>} />
          <Route path="permissions" element={<RequirePermission permission="permissions.view"><Permissions /></RequirePermission>} />
          <Route path="audit-logs" element={<RequirePermission permission="audit.view"><AuditLogs /></RequirePermission>} />
          <Route path="settings" element={<RequirePermission permission="settings.view"><Settings /></RequirePermission>} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export default function App() {
  const bootstrap = useAuthStore((s) => s.bootstrap);

  useEffect(() => {
    // Jangan probe /auth/me di halaman publik (login/ubah password) — jaga agar
    // tidak ada 401 console noise saat belum login. Untuk route lain, bootstrap
    // memulihkan sesi (cookie httpOnly terkirim otomatis ke backend).
    const path = window.location.pathname;
    if (path === '/login' || path === '/change-password') {
      useAuthStore.getState().setLoading(false);
      return;
    }
    bootstrap();
  }, [bootstrap]);

  return (
    <BrowserRouter>
      <AppRoutes />
      <Toaster />
    </BrowserRouter>
  );
}
