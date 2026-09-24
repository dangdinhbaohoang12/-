/**
 * ============================================================================
 * APP LAYOUT – Khung trang chuẩn (sidebar dieu huong + header phien truc)
 * ----------------------------------------------------------------------------
 * - Sidebar: Dashboard, Danh ba PTW, Tao moi PTW, Quan ly tai khoan (CHI OIM).
 * - Header: Role Simulator (chi doi GIAO DIEN xem), thong bao, QR, dang xuat.
 * ==========================================================================*/

import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { ROLE_LABELS_VI, Role } from '../../types/domain';
import { usePtwStore } from '../../store/ptwStore';
import { Badge } from '../ui/primitives';
import { cn } from '../../lib/utils';

const NAV = [
  { to: '/', label: 'Bảng điều khiển', icon: '📊', end: true },
  { to: '/permits', label: 'Danh bạ PTW', icon: '📒' },
  { to: '/permits/new', label: 'Tạo PTW mới', icon: '➕', createOnly: true },
  { to: '/users', label: 'Quản lý tài khoản', icon: '👥', oimOnly: true },
];

export function AppLayout() {
  const navigate = useNavigate();
  const currentUser = usePtwStore((s) => s.currentUser);
  const simulatedRole = usePtwStore((s) => s.simulatedRole);
  const setSimulatedRole = usePtwStore((s) => s.setSimulatedRole);
  const logout = usePtwStore((s) => s.logout);
  const notifications = usePtwStore((s) => s.notifications);
  const refreshExpiries = usePtwStore((s) => s.refreshExpiries);
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    refreshExpiries();
    const t = setInterval(() => refreshExpiries(), 30000);
    return () => clearInterval(t);
  }, [refreshExpiries]);

  if (!currentUser) return null;
  const unread = notifications.filter((n) => n.recipientUserId === currentUser.id && !n.readAt).length;
  const canCreate = currentUser.role !== 'ADMINISTRATOR';

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-border bg-card/60 ptw-grid-bg">
        <div className="border-b border-border px-5 py-5">
          <p className="text-lg font-black tracking-tight">🛢️ OFFSHORE <span className="text-primary">PTW</span></p>
          <p className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Permit To Work System</p>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV.filter((n) => !(n.oimOnly && currentUser.role !== 'OIM') && !(n.createOnly && !canCreate)).map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-primary/15 text-primary shadow-[inset_2px_0_0_var(--primary)]' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )
              }
            >
              <span aria-hidden>{n.icon}</span> {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-2 border-t border-border p-3">
          <label className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            🎭 Role Simulator (chỉ giao diện)
          </label>
          <select
            value={simulatedRole ?? ''}
            onChange={(e) => setSimulatedRole((e.target.value || null) as Role | null)}
            className="h-8 w-full rounded-lg border border-input bg-input/40 px-2 text-xs"
            title="Chế độ trình diễn phân quyền: chi an/hien nut bam theo matrix — KHONG the dung de ky duyet."
          >
            <option value="">— Vai trò thật: {ROLE_LABELS_VI[currentUser.role]} —</option>
            {(Object.keys(ROLE_LABELS_VI) as Role[]).filter((r) => r !== currentUser.role).map((r) => (
              <option key={r} value={r}>Xem như: {ROLE_LABELS_VI[r]}</option>
            ))}
          </select>
          {simulatedRole && (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-300">
              Đang mô phỏng vai trò {ROLE_LABELS_VI[simulatedRole]}. Chữ ký điện tử vẫn dùng tài khoản &amp; PIN thật.
            </p>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-4 border-b border-border bg-background/85 px-6 backdrop-blur">
          <div className="min-w-0 truncate text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{currentUser.fullName}</span>
            {' · '}<Badge tone={currentUser.role === 'OIM' ? 'success' : 'neutral'}>{ROLE_LABELS_VI[currentUser.role]}</Badge>
            {' · Giàn '}{currentUser.platformCode}
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setShowQr((v) => !v)} className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-muted" title="Mã QR phiên trực">
              🔳 QR phiên trực
            </button>
            <button type="button" onClick={() => navigate('/permits')} className="relative rounded-lg border border-border px-2 py-1 text-xs hover:bg-muted" title="Thông báo">
              🔔 {unread > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold text-white">{unread}</span>}
            </button>
            <button type="button" onClick={() => { logout(); navigate('/login'); }} className="rounded-lg bg-muted px-3 py-1 text-xs font-semibold hover:bg-border">
              Đăng xuất
            </button>
          </div>
        </header>
        {showQr && (
          <div className="fixed bottom-6 right-6 z-50 w-56 rounded-2xl border border-border bg-card p-4 shadow-2xl">
            <p className="mb-2 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Offshore PTW · Ca trực</p>
            <div className="flex justify-center rounded-xl bg-white p-2">
              <QRCodeSVG size={150} value={`OFFSHORE-PTW|SESSION|${currentUser.username}|${currentUser.platformCode}|${new Date().toISOString()}`} />
            </div>
            <p className="mt-2 break-all text-center font-mono text-[9px] text-muted-foreground">{currentUser.username} · {currentUser.platformCode}</p>
          </div>
        )}
        <main className="flex-1 overflow-x-hidden p-6">
          <Outlet />
        </main>
        <footer className="border-t border-border px-6 py-3 text-[10px] text-muted-foreground">
          OFFSHORE PTW v2.0 · Safety-Critical Permit To Work Management · Audit trail append-only.
        </footer>
      </div>
    </div>
  );
}
