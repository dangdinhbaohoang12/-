/**
 * ============================================================================
 * APP ROOT – Protected router của hệ thống OFFSHORE PTW
 * ==========================================================================*/

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
