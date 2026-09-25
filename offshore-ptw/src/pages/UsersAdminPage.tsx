/**
 * ============================================================================
 * USERS ADMIN PAGE – Quản lý danh bạ tài khoản (CHỈ OIM được cấp quyền)
 * ----------------------------------------------------------------------------
 * - Form tạo tài khoản: họ tên, username, vai trò, đơn vị, chứng chỉ, PIN.
 * - Khóa/mở khóa tài khoản + đổi PIN. Mọi thao tác ghi audit toàn hệ thống.
 * ==========================================================================*/

import { useMemo, useRef, useState } from 'react';
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
  const [operatorPin, setOperatorPin] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pinTarget, setPinTarget] = useState<User | null>(null);
  const [newPin, setNewPin] = useState('');
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const [savingPin, setSavingPin] = useState(false);
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);

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

  const submit = async () => {
    if (creatingRef.current) return;
    setMsg(null);
    creatingRef.current = true;
    setCreating(true);
    try {
      const res = await createUser(
        { fullName: fullName.trim(), username: username.trim().toLowerCase(), role, platformCode: currentUser.platformCode, organization: org.trim(), certificationNumber: cert.trim(), initialPin: pin },
        operatorPin
      );
      if (!res.ok) { setMsg({ ok: false, text: res.error ?? 'Tạo tài khoản thất bại.' }); return; }
      setMsg({ ok: true, text: `Đã tạo tài khoản ${res.user!.username} (${ROLE_LABELS_VI[res.user!.role]}).` });
      setFullName(''); setUsername(''); setOrg(''); setCert(''); setPin('');
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  };

  const savePin = async () => {
    if (!pinTarget || savingPin) return;
    // Capture the target being submitted so cleanup only touches this
    // request's modal – not a different one the operator opened afterwards.
    const target = pinTarget;
    setSavingPin(true);
    try {
      const res = await changePin(target.id, newPin, operatorPin);
      setMsg(res.ok ? { ok: true, text: `Đã cập nhật PIN cho ${target.username}.` } : { ok: false, text: res.error ?? 'Lỗi.' });
      if (res.ok) {
        let stillSameTarget = false;
        setPinTarget((current) => {
          stillSameTarget = current?.id === target.id;
          return stillSameTarget ? null : current;
        });
        if (stillSameTarget) setNewPin('');
      }
    } finally {
      setSavingPin(false);
    }
  };

  const toggleActive = async (u: User) => {
    if (togglingUserId) return;
    setTogglingUserId(u.id);
    try {
      const res = await toggleUserActive(u.id, !u.active, operatorPin);
      setMsg(res.ok ? { ok: true, text: `Đã ${u.active ? 'khóa' : 'mở khóa'} tài khoản ${u.username}.` } : { ok: false, text: res.error ?? 'Lỗi.' });
    } finally {
      setTogglingUserId(null);
    }
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
            <FieldRow label="PIN xác thực của Giàn trưởng (bắt buộc)" hint="Chữ ký điện tử của chính bạn để ủy quyền thao tác"><input type="password" inputMode="numeric" maxLength={8} className={inputClass} value={operatorPin} onChange={(e) => setOperatorPin(e.target.value.replace(/\D/g, ''))} /></FieldRow>
            {msg && <p className={`rounded-lg border px-3 py-2 text-xs ${msg.ok ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-rose-500/40 bg-rose-500/10 text-rose-300'}`}>{msg.ok ? '✅' : '⛔'} {msg.text}</p>}
            <Button variant="success" className="w-full" onClick={submit} disabled={creating}>{creating ? 'Đang tạo…' : '➕ Tạo tài khoản'}</Button>
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
                    <td className="py-2.5 pr-3">{u.active ? <Badge tone="info">Hoạt động</Badge> : <Badge tone="danger">Khóa</Badge>}</td>
                    <td className="py-2.5">
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPinTarget(u)}
                          disabled={togglingUserId === u.id || u.id === currentUser.id}
                          title={u.id === currentUser.id ? 'Không thể cấp lại PIN cho chính tài khoản đang đăng nhập — phiên sẽ bị vô hiệu ngay lập tức. Hãy dùng chức năng tự đổi PIN.' : undefined}
                        >
                          Đổi PIN
                        </Button>
                        <Button size="sm" variant={u.active ? 'danger' : 'success'} disabled={u.id === currentUser.id || togglingUserId === u.id} onClick={() => toggleActive(u)}>
                          {togglingUserId === u.id ? 'Đang xử lý…' : u.active ? 'Khóa' : 'Mở khóa'}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => { if (!savingPin) setPinTarget(null); }}>
          <div className="ptw-modal-in w-full max-w-sm rounded-2xl border border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
            <p className="mb-3 text-sm font-bold">Cấp lại PIN cho @{pinTarget.username}</p>
            <input type="password" inputMode="numeric" maxLength={8} autoFocus className={inputClass} value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))} placeholder="PIN mới 4–8 chữ số" disabled={savingPin} />
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPinTarget(null)} disabled={savingPin}>Hủy</Button>
              <Button variant="primary" onClick={savePin} disabled={newPin.length < 4 || savingPin}>{savingPin ? 'Đang lưu…' : 'Xác nhận'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
