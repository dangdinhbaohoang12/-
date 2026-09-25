/**
 * ============================================================================
 * APP ROOT – Protected router của hệ thống OFFSHORE PTW
 * ==========================================================================*/

import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { usePtwStore } from './store/ptwStore';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { PermitListPage } from './pages/PermitListPage';
import { PermitFormPage } from './pages/PermitFormPage';
import { PermitDetailPage } from './pages/PermitDetailPage';
import { UsersAdminPage } from './pages/UsersAdminPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const currentUser = usePtwStore((s) => s.currentUser);
  const authReady = usePtwStore((s) => s.authReady);
  if (!authReady) return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Đang xác thực phiên…</div>;
  if (!currentUser) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireOim({ children }: { children: React.ReactNode }) {
  const currentUser = usePtwStore((s) => s.currentUser);
  if (!currentUser) return <Navigate to="/login" replace />;
  if (currentUser.role !== 'OIM') return <UsersAdminPage />; // trang tự hiển thị cảnh báo cấm
  return <>{children}</>;
}

export default function App() {
  const hydrate = usePtwStore((s) => s.hydrate);
  useEffect(() => { void hydrate(); }, [hydrate]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={<DashboardPage />} />
        <Route path="permits" element={<PermitListPage />} />
        <Route path="permits/new" element={<PermitFormPage />} />
        <Route path="permits/:id" element={<PermitDetailPage />} />
        <Route path="users" element={<RequireOim><UsersAdminPage /></RequireOim>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
