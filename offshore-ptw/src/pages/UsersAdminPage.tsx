/**
 * ============================================================================
 * USERS ADMIN PAGE – Quản lý danh bạ tài khoản (CHỈ OIM được cấp quyền)
 * ----------------------------------------------------------------------------
 * - Form tạo tài khoản: họ tên, username, vai trò, đơn vị, chứng chỉ, PIN.
 * - Khóa/mở khóa tài khoản + đổi PIN. Mọi thao tác ghi audit toàn hệ thống.
 * ==========================================================================*/

import { useMemo, useState } from 'react';
import { Role, ROLE_LABELS_VI, User } from '../types/domain';
import { usePtwStore } from '../store/ptwStore';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, FieldRow, inputClass, Select } from '../components/ui/primitives';

const ROLES: Role[] = ['OIM', 'DEPUTY_OIM', 'FPS', 'LINE_SUPERVISOR', 'PERMIT_APPLICANT', 'PERMIT_CONTROLLER', 'HSE', 'ADMINISTRATOR'];

export function UsersAdminPage() {
  const currentUser = usePtwStore((s) => s.currentUser);
  const users = usePtwStore((s) => s.users);
  const createUser = usePtwStore((s) => s.createUser);
  const toggleUserActive = usePtwStore((s) => s.toggleUserActive);
  const changePin = usePtwStore((s) => s.changePin);

  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<Role>('PERMIT_APPLICANT');
  const [org, setOrg] = useState('');
  const [cert, setCert] = useState('');
  const [pin, setPin] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pinTarget, setPinTarget] = useState<User | null>(null);
  const [newPin, setNewPin] = useState('');

  const ordered = useMemo(() => [...users].sort((a, b) => a.role.localeCompare(b.role) || a.fullName.localeCompare(b.fullName)), [users]);

  if (!currentUser || currentUser.role !== 'OIM') {
    return (
      <Card className="mx-auto max-w-lg">
        <CardContent className="p-10 text-center">
          <p className="text-4xl">🚫</p>
          <p className="mt-3 text-lg font-bold">Cánh cửa này dành riêng cho Giàn trưởng (OIM)</p>
          <p className="mt-1 text-sm text-muted-foreground">Chức năng quản lý tài khoản bị chặn ở tầng service — không phải giao diện.</p>
        </CardContent>
      </Card>
    );
  }

  const submit = () => {
    setMsg(null);
    const res = createUser({ fullName: fullName.trim(), username: username.trim().toLowerCase(), role, organization: org.trim(), certificationNumber: cert.trim(), pin });
    if (!res.ok) { setMsg({ ok: false, text: res.error ?? 'Tạo tài khoản thất bại.' }); return; }
    setMsg({ ok: true, text: `Đã tạo tài khoản ${res.user!.username} (${ROLE_LABELS_VI[res.user!.role]}).` });
    setFullName(''); setUsername(''); setOrg(''); setCert(''); setPin('');
  };

  const savePin = () => {
    if (!pinTarget) return;
    const res = changePin(pinTarget.id, newPin);
    setMsg(res.ok ? { ok: true, text: `Đã cập nhật PIN cho ${pinTarget.username}.` } : { ok: false, text: res.error ?? 'Lỗi.' });
    setPinTarget(null); setNewPin('');
  };

  return (
    <div className="space-y-5 pb-8">
      <div>
        <h1 className="text-2xl font-black tracking-tight">👥 Quản lý tài khoản người dùng</h1>
        <p className="text-sm text-muted-foreground">Chỉ Giàn trưởng được cấp phép vận hành danh bạ truy cập hệ thống.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Form tạo tài khoản mới</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <FieldRow label="Họ và tên"><input className={inputClass} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nguyễn Văn A" /></FieldRow>
            <FieldRow label="Username (duy nhất)"><input className={`${inputClass} font-mono`} value={username} onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))} placeholder="nguyenvana" /></FieldRow>
            <FieldRow label="Vai trò hệ thống">
              <Select value={role} onChange={(v) => setRole(v as Role)}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS_VI[r]}</option>)}</Select>
            </FieldRow>
            <FieldRow label="Đơn vị công tác"><input className={inputClass} value={org} onChange={(e) => setOrg(e.target.value)} placeholder="VD: Tổ Cơ khí — PPOI MT1" /></FieldRow>
            <FieldRow label="Số chứng chỉ an toàn"><input className={`${inputClass} font-mono`} value={cert} onChange={(e) => setCert(e.target.value)} placeholder="P-2026-0000" /></FieldRow>
            <FieldRow label="PIN khởi tạo (4–8 chữ số)" hint="Người dùng tự đổi sau lần đăng nhập đầu"><input type="password" inputMode="numeric" maxLength={8} className={inputClass} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} /></FieldRow>
            {msg && <p className={`rounded-lg border px-3 py-2 text-xs ${msg.ok ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-rose-500/40 bg-rose-500/10 text-rose-300'}`}>{msg.ok ? '✅' : '⛔'} {msg.text}</p>}
            <Button variant="success" className="w-full" onClick={submit}>➕ Tạo tài khoản</Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Danh bạ ({users.length})</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                  <th className="py-2 pr-3">Người dùng</th><th className="py-2 pr-3">Vai trò</th><th className="py-2 pr-3">Chứng chỉ</th><th className="py-2 pr-3">Trạng thái</th><th className="py-2">Hành động</th>
                </tr>
              </thead>
              <tbody>
                {ordered.map((u) => (
                  <tr key={u.id} className="border-b border-border/50">
                    <td className="py-2.5 pr-3"><span className="font-semibold">{u.fullName}</span><span className="block font-mono text-[10px] text-muted-foreground">@{u.username} · {u.organization}</span></td>
                    <td className="py-2.5 pr-3"><Badge tone={u.role === 'OIM' ? 'success' : u.role === 'ADMINISTRATOR' ? 'critical' : 'neutral'}>{ROLE_LABELS_VI[u.role]}</Badge></td>
                    <td className="py-2.5 pr-3 font-mono text-xs">{u.certificationNumber}</td>
                    <td className="py-2.5 pr-3">{u.isActive ? <Badge tone="info">Hoạt động</Badge> : <Badge tone="danger">Khóa</Badge>}</td>
                    <td className="py-2.5">
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => setPinTarget(u)}>Đổi PIN</Button>
                        <Button size="sm" variant={u.isActive ? 'danger' : 'success'} disabled={u.id === currentUser.id} onClick={() => toggleUserActive(u.id)}>
                          {u.isActive ? 'Khóa' : 'Mở khóa'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {pinTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setPinTarget(null)}>
          <div className="ptw-modal-in w-full max-w-sm rounded-2xl border border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
            <p className="mb-3 text-sm font-bold">Cấp lại PIN cho @{pinTarget.username}</p>
            <input type="password" inputMode="numeric" maxLength={8} autoFocus className={inputClass} value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))} placeholder="PIN mới 4–8 chữ số" />
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPinTarget(null)}>Hủy</Button>
              <Button variant="primary" onClick={savePin} disabled={newPin.length < 4}>Xác nhận</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
