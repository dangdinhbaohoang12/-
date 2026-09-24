/**
 * ============================================================================
 * PERMIT DETAIL PAGE – Hồ sơ chi tiết permit (chức năng 2 & 3)
 * ----------------------------------------------------------------------------
 * - Visual Lifecycle Stepper + Locked Details View (không thể sửa sau duyệt).
 * - Advanced Gas Test Panel · Sign-off (PIN + Comment) · Role Simulator matrix.
 * - QR góc trang · Audit Trail append-only · SIMOPS banner.
 * ==========================================================================*/

import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { ROLE_LABELS_VI, STATUS_LABELS_EN, User } from '../types/domain';
import { PERMIT_TYPE_CATALOG } from '../data/catalog';
import { usePtwStore } from '../store/ptwStore';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, FieldRow, inputClass, Modal } from '../components/ui/primitives';
import { ApprovalStepper } from '../components/permit/ApprovalStepper';
import { GasTestPanel } from '../components/permit/GasTestPanel';
import { AuditTrail } from '../components/permit/AuditTrail';
import { SimopsBanner } from '../components/permit/SimopsBanner';
import { STATUS_META, RISK_TONE } from '../lib/statusMeta';
import { canPerform } from '../services/authorizationService';
import { detectSimopsConflicts } from '../engine/simopsEngine';
import { Action } from '../store/ptwStore';
import { formatTimestamp, minutesUntil } from '../lib/utils';

interface PendingAction {
  action: Action;
  label: string;
  tone: 'primary' | 'success' | 'danger' | 'warning' | 'critical' | 'outline';
}

export function PermitDetailPage() {
  const { id } = useParamsId();
  const navigate = useNavigate();
  const permits = usePtwStore((s) => s.permits);
  const currentUser = usePtwStore((s) => s.currentUser);
  const simulatedRole = usePtwStore((s) => s.simulatedRole);
  const users = usePtwStore((s) => s.users);
  const perform = usePtwStore((s) => s.perform);
  const [signoff, setSignoff] = useState<PendingAction | null>(null);

  const permit = permits.find((p) => p.id === id || p.permitNumber === id);

  const actions = useMemo<PendingAction[]>(() => {
    if (!permit || !currentUser) return [];
    const list: PendingAction[] = [];
    const check = (action: Action, label: string, tone: PendingAction['tone']) => {
      // QUY TẮC BẤT DI BẤT DỊCH: quyền ký duyệt LUÔN tính bằng role THẬT.
      if (canPerform(currentUser, permit, action).allowed) list.push({ action, label, tone });
    };
    check('SUBMIT', '📤 Trình ký chuỗi phê duyệt', 'primary');
    check('APPROVE_LINE_SUPERVISOR', '✔ Duyệt — Line Supervisor', 'success');
    check('APPROVE_FPS', '✔ Duyệt — FPS', 'success');
    check('APPROVE_DEPUTY_OIM', '✔ Duyệt — Deputy OIM', 'success');
    check('APPROVE_OIM', '🔑 PHÁT HÀNH PTW — OIM', 'success');
    check('REJECT', '❌ Từ chối permit', 'danger');
    check('RETURN_FOR_CLARIFICATION', '↩️ Trả về làm rõ', 'warning');
    check('START_WORK', '▶️ Bắt đầu thi công', 'primary');
    check('SUSPEND', '⛔ Đình chỉ khẩn cấp', 'critical');
    if (simulatedRole && canPerform({ ...currentUser, role: simulatedRole } as User, permit, 'RESUME').allowed) {
      list.push({ action: 'RESUME', label: `▶️ Tiếp tục (mô phỏng ${ROLE_LABELS_VI[simulatedRole]})`, tone: 'outline' });
    }
    check('COMPLETE_WORK', '🏁 Hoàn thành thi công', 'primary');
    check('CLOSE', '🗄️ Đóng permit', 'success');
    check('CREATE_REVISION', '📝 Lập bản sửa đổi mới', 'primary');
    return list;
  }, [permit, currentUser, simulatedRole]);

  if (!permit) {
    return (
      <div className="py-20 text-center">
        <p className="text-lg font-bold">Không tìm thấy hồ sơ permit.</p>
        <Link to="/permits" className="text-sm text-primary underline">← Về danh bạ PTW</Link>
      </div>
    );
  }

  const meta = STATUS_META[permit.status];
  const catalog = PERMIT_TYPE_CATALOG[permit.permitType];
  const conflicts = detectSimopsConflicts(permit, permits);
  const mins = minutesUntil(permit.plannedEnd);
  const locked = !['DRAFT', 'RETURNED'].includes(permit.status);
  const approverOf = (userId?: string) => users.find((u) => u.id === userId);

  const runAction = (pin: string, comment: string) => {
    if (!signoff) return;
    const res = perform(signoff.action, { id: permit.id }, pin, comment);
    if (!res.ok) return false;
    setSignoff(null);
    return true;
  };

  return (
    <div className="space-y-5 pb-10">
      {/* ============================ HEADER + QR GÓC TRANG ============================ */}
      <Card className={`relative overflow-hidden border-2 ${permit.status === 'APPROVED' || permit.status === 'WORK_IN_PROGRESS' ? 'border-emerald-500/40' : ['REJECTED', 'EXPIRED', 'SUSPENDED'].includes(permit.status) ? 'border-rose-600/50' : 'border-border'}`}>
        <div className={`absolute inset-x-0 top-0 h-1.5 ${meta.dot}`} />
        <CardContent className="flex flex-wrap items-start justify-between gap-6 p-6">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-mono text-2xl font-black tracking-tight">{permit.permitNumber}</h1>
              <Badge tone="neutral">Rev {permit.revisionNo}</Badge>
              <span className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1 text-xs font-black uppercase tracking-widest ${meta.text} border-current/30 bg-current/5`}>
                <span className={`h-2 w-2 rounded-full ${meta.dot} ${['SUBMITTED','LINE_SUPERVISOR_REVIEW','FPS_REVIEW','DEPUTY_OIM_REVIEW','OIM_REVIEW'].includes(permit.status) ? 'ptw-pending-dot' : ''}`} />
                {STATUS_LABELS_EN[permit.status]}
              </span>
              <Badge tone={RISK_TONE[permit.riskLevelAssessed]}>Risk: {permit.riskLevelAssessed}</Badge>
              {mins <= 0 && <Badge tone="danger">⌛ HẾT HIỆU LỰC</Badge>}
              {mins > 0 && mins <= 60 && <Badge tone="warning">⏰ Còn {mins} phút</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">
              {catalog.labelVi} · Khu vực <b className="text-foreground">{permit.areaCode} — {permit.areaName}</b> · Thiết bị <span className="font-mono">{permit.equipmentTag}</span>
            </p>
            <p className="max-w-2xl text-sm">{permit.workDescription}</p>
            <p className="font-mono text-[11px] text-muted-foreground">
              Hiệu lực: {formatTimestamp(permit.plannedStart)} → {formatTimestamp(permit.plannedEnd)} · Applicant: {permit.applicantName} ({ROLE_LABELS_VI[permit.applicantRole]})
            </p>
          </div>
          <div className="shrink-0 text-center">
            <div className="rounded-xl bg-white p-2.5 shadow-lg">
              <QRCodeSVG size={116} value={`PTW|${permit.permitNumber}|REV${permit.revisionNo}|${permit.status}|${permit.areaCode}|${permit.plannedEnd}`} />
            </div>
            <p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">QR xác thực permit</p>
          </div>
        </CardContent>
      </Card>

      {/* ================================ SIMOPS ================================= */}
      <SimopsBanner permit={permit} conflicts={conflicts} />

      {/* ============================ LIFECYCLE STEPPER =========================== */}
      <Card>
        <CardHeader><CardTitle>🔄 Visual Lifecycle Stepper — Chuỗi ký duyệt điện tử</CardTitle></CardHeader>
        <CardContent><ApprovalStepper chain={permit.approvalChain} /></CardContent>
      </Card>

      {/* ============================== SIGN-OFF BAR ============================== */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>✍️ Hành động theo phân quyền</CardTitle>
            <p className="text-xs text-muted-foreground">
              Tài khoản thật: <b>{currentUser?.fullName}</b> ({currentUser ? ROLE_LABELS_VI[currentUser.role] : ''})
              {simulatedRole && <> · 🎭 Đang mô phỏng giao diện: <b className="text-amber-400">{ROLE_LABELS_VI[simulatedRole]}</b> — nút mô phỏng chỉ hiển thị, không thể ký.</>}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/permits')}>← Danh bạ</Button>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {actions.length === 0 && <p className="text-xs text-muted-foreground">Tài khoản của bạn không có hành động khả dụng ở trạng thái này (ma trận RBAC).</p>}
          {actions.map((a) => (
            <Button key={a.action} variant={a.tone} size="sm" onClick={() => setSignoff(a)} disabled={a.tone === 'outline'}>
              {a.label}{a.tone === 'outline' && ' (demo)'}
            </Button>
          ))}
        </CardContent>
      </Card>

      {/* ============================ GAS TEST PANEL ============================== */}
      <GasTestPanel permit={permit} />

      {/* ===================== LOCKED DETAILS / REVISION VIEW ===================== */}
      <Card className={locked ? 'opacity-95' : ''}>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>🗂️ Bản {permit.revisionNo === 0 ? 'gốc' : `sửa đổi Rev ${permit.revisionNo}`} — Chi tiết hồ sơ</CardTitle>
            <p className="text-xs text-muted-foreground">{locked ? 'Chế độ READ-ONLY: nội dung đã khóa cứng sau khi trình ký — mọi thay đổi phải qua quy trình Revision.' : 'Draft đang mở — applicant có thể chỉnh sửa trước khi trình ký.'}</p>
          </div>
          {locked && <Badge tone="critical">🔒 LOCKED — KHÔNG THỂ CHỈNH SỬA</Badge>}
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <DetailField label="Lý do phát hành" value={permit.reasonForIssuing} />
          <DetailField label="Nội dung công việc" value={permit.workDescription} />
          <DetailField label="Người khởi tạo" value={`${permit.applicantName} · ${formatTimestamp(permit.createdAt)}`} />
          {permit.approvedAt && <DetailField label="Thời điểm OIM phát hành" value={formatTimestamp(permit.approvedAt)} />}
          {permit.validUntil && <DetailField label="Hiệu lực đến" value={formatTimestamp(permit.validUntil)} />}
          {permit.suspensionReason && <DetailField label="Lý do đình chỉ" value={permit.suspensionReason} />}
          {permit.closureNotes && <DetailField label="Ghi chú đóng permit" value={permit.closureNotes} />}
          {permit.revisionReason && <DetailField label="Lý do revision" value={permit.revisionReason} />}
          {permit.previousRevisionOfPermitId && (
            <DetailField label="Thay thế cho bản" value={<Link className="text-primary underline" to={`/permits/${permit.previousRevisionOfPermitId}`}>Bản trước đã thu hồi ↗</Link>} />
          )}
        </CardContent>
        <CardContent>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Chữ ký số trong bản này</p>
          <div className="grid gap-2 md:grid-cols-2">
            {permit.approvalChain.filter((s) => s.status === 'DONE').map((s) => {
              const u = approverOf(s.decidedByUserId);
              return (
                <div key={s.level} className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2 font-mono text-[11px]">
                  <span className="font-bold text-emerald-400">✅ {s.level}</span> — {s.decidedByName} ({u?.certificationNumber ?? 'N/A'})
                  <span className="block text-muted-foreground">{formatTimestamp(s.decidedAt)} · SIG:{s.signatureHash}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* =============================== AUDIT TRAIL ============================== */}
      <AuditTrail entries={permit.statusHistory} />

      {/* ============================== SIGN-OFF MODAL ============================ */}
      <SignoffModal pending={signoff} onClose={() => setSignoff(null)} onConfirm={runAction} permitNumber={permit.permitNumber} />
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm">{value}</p>
    </div>
  );
}

function SignoffModal({ pending, onClose, onConfirm, permitNumber }: {
  pending: PendingAction | null;
  onClose: () => void;
  onConfirm: (pin: string, comment: string) => boolean;
  permitNumber: string;
}) {
  const currentUser = usePtwStore((s) => s.currentUser);
  const [pin, setPin] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const needsComment = !!pending && (pending.action === 'REJECT' || pending.action === 'RETURN_FOR_CLARIFICATION' || pending.action === 'SUSPEND' || pending.action === 'CREATE_REVISION');

  const confirm = () => {
    setError(null);
    if (needsComment && !comment.trim()) { setError('Hành động này bắt buộc nhập lý do / bình luận.'); return; }
    const ok = onConfirm(pin, comment.trim());
    if (!ok) return;
    setPin(''); setComment('');
    onClose();
  };

  return (
    <Modal open={!!pending} onClose={onClose} title={pending?.label ?? ''} subtitle={`${permitNumber} · Xác thực chữ ký điện tử`}>
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
          Người ký: <b>{currentUser?.fullName}</b> · {currentUser ? ROLE_LABELS_VI[currentUser.role] : ''} · Chứng chỉ <span className="font-mono">{currentUser?.certificationNumber}</span>
        </div>
        <FieldRow label="Mã PIN điện tử (bắt buộc)" hint="Chữ ký SHA-256 được tạo từ username + vai trò + timestamp + PIN">
          <input type="password" autoFocus maxLength={8} inputMode="numeric" className={inputClass} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
        </FieldRow>
        <FieldRow label={needsComment ? 'Lý do / bình luận (BẮT BUỘC)' : 'Bình luận (tùy chọn)'}>
          <textarea rows={3} className={inputClass} value={comment} onChange={(e) => setComment(e.target.value)} />
        </FieldRow>
        {error && <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">⛔ {error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Hủy</Button>
          <Button variant={pending?.tone === 'danger' || pending?.tone === 'critical' ? 'danger' : 'success'} onClick={confirm} disabled={!pin}>🖊 Ký & xác nhận</Button>
        </div>
      </div>
    </Modal>
  );
}

function useParamsId() {
  return useParams<{ id: string }>();
}
