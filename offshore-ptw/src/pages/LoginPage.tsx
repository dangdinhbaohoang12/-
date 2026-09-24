/**
 * ============================================================================
 * LOGIN PAGE – Đăng nhập bằng Username + PIN điện tử (4–8 chữ số)
 * ----------------------------------------------------------------------------
 * Không có tài khoản demo; danh bạ tài khoản do OIM quản lý (UsersAdminPage).
 * ==========================================================================*/

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePtwStore } from '../store/ptwStore';
import { Button, FieldRow, inputClass } from '../components/ui/primitives';

export function LoginPage() {
  const login = usePtwStore((s) => s.login);
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = login(username, pin);
    if (!res.ok) { setError(res.error ?? 'Đăng nhập thất bại.'); return; }
    navigate('/', { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background ptw-grid-bg p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <p className="text-3xl font-black tracking-tight">🛢️ OFFSHORE <span className="text-primary">PTW</span></p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Safety-Critical Permit To Work System</p>
          <p className="mt-1 text-xs text-muted-foreground">Giàn MT1 · Biển Đông POC — chỉ thiết bị được ủy quyền trong LAN giàn</p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <FieldRow label="Username">
            <input autoFocus className={inputClass} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="vd: tranvanhung" autoComplete="username" />
          </FieldRow>
          <FieldRow label="Mã PIN điện tử" hint="4–8 chữ số">
            <input type="password" inputMode="numeric" maxLength={8} className={inputClass} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} autoComplete="current-password" />
          </FieldRow>
          {error && <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">⛔ {error}</p>}
          <Button type="submit" size="lg" className="w-full">🔐 Xác thực & vào ca trực</Button>
          <button type="button" onClick={() => setShowHint((v) => !v)} className="w-full text-center text-[10px] text-muted-foreground underline-offset-2 hover:underline">
            {showHint ? 'Ẩn danh sách tài khoản' : 'Quên tài khoản? Xem danh bạ được OIM phê chuẩn'}
          </button>
          {showHint && (
            <div className="max-h-44 overflow-y-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-[10px] leading-5 text-muted-foreground">
              <p><b className="text-foreground">tranvanhung</b> — OIM (Giàn trưởng)</p>
              <p><b className="text-foreground">phamvankhoa</b> — Deputy OIM</p>
              <p><b className="text-foreground">lethiquyen</b> — FPS</p>
              <p><b className="text-foreground">nguyenvana</b> — Line Supervisor</p>
              <p><b className="text-foreground">hoangminhtu</b> — Permit Applicant</p>
              <p><b className="text-foreground">vusithanh</b> — PTW Controller</p>
              <p><b className="text-foreground">dangbaocan</b> — HSE Officer</p>
              <p className="mt-1 italic">PIN cá nhân do Giàn trưởng cấp khi tạo tài khoản (không hiển thị trên hệ thống).</p>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
