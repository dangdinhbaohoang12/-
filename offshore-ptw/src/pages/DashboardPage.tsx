/**
 * ============================================================================
 * DASHBOARD PAGE – Trung tâm chỉ huy ca trực (OIM Console)
 * ----------------------------------------------------------------------------
 * - KPI cards: Active permits, chờ phê duyệt, gas test bất thường, SIMOPS.
 * - Bảng "ACTIVE PERMITS" với màu trạng thái chuẩn công nghiệp:
 *   APPROVED/WORK_IN_PROGRESS = Emerald · đang duyệt = Amber nhấp nháy ·
 *   SUSPENDED/REJECTED/EXPIRED = Crimson.
 * ==========================================================================*/

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { ROLE_LABELS_VI, STATUS_LABELS_EN, Permit, PermitStatus } from '../types/domain';
import { usePtwStore } from '../store/ptwStore';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, inputClass } from '../components/ui/primitives';
import { STATUS_META, RISK_TONE } from '../lib/statusMeta';
import { formatDate, formatTimestamp, minutesUntil } from '../lib/utils';
import { hasValidGasTest } from '../engine/gasTestEngine';
import { detectSimopsConflicts } from '../engine/simopsEngine';

const PENDING_STATUSES: PermitStatus[] = ['SUBMITTED', 'LINE_SUPERVISOR_REVIEW', 'FPS_REVIEW', 'DEPUTY_OIM_REVIEW', 'OIM_REVIEW'];
const ACTIVE_STATUSES: PermitStatus[] = ['APPROVED', 'WORK_IN_PROGRESS', 'SUSPENDED', 'RESUMED', 'WORK_COMPLETED'];

function KpiCard({ label, value, sub, tone }: { label: string; value: number | string; sub?: string; tone: string }) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-5">
        <div className={`absolute inset-x-0 top-0 h-1 ${tone}`} />
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
        <p className="mt-2 text-3xl font-black tabular-nums">{value}</p>
        {sub && <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const currentUser = usePtwStore((s) => s.currentUser);
  const simulatedRole = usePtwStore((s) => s.simulatedRole);
  const permits = usePtwStore((s) => s.permits);
  const refreshExpiries = usePtwStore((s) => s.refreshExpiries);
  const [query, setQuery] = useState('');

  useEffect(() => {
    refreshExpiries();
    const t = setInterval(() => refreshExpiries(), 30000);
    return () => clearInterval(t);
  }, [refreshExpiries]);

  const visible = useMemo(() => {
    if (!currentUser) return [];
    let list = permits;
    if (currentUser.role === 'LINE_SUPERVISOR' || currentUser.role === 'PERMIT_APPLICANT') {
      list = list.filter((p) => p.platformCode === currentUser.platformCode);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((p) => `${p.permitNumber} ${p.areaName} ${p.equipmentTag} ${p.workDescription}`.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [permits, currentUser, query]);

  const active = visible.filter((p) => ACTIVE_STATUSES.includes(p.status));
  const pending = visible.filter((p) => PENDING_STATUSES.includes(p.status));
  const gasAbnormal = visible.filter((p) => p.gasTests.some((g) => g.overallResult === 'FAIL'));
  const simops = visible.filter((p) => detectSimopsConflicts(p, permits).length > 0);
  const expiringSoon = active.filter((p) => {
    const m = minutesUntil(p.plannedEnd);
    return m > 0 && m <= 60;
  });

  if (!currentUser) return null;

  return (
    <div className="space-y-6">
      {/* ------------------------------- OIM HEADER ------------------------------ */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Bảng điều khiển an ninh giàn</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Xin chào <span className="font-semibold text-foreground">{currentUser.fullName}</span> — {ROLE_LABELS_VI[currentUser.role]} · Giàn {currentUser.platformCode}
            {simulatedRole && <span className="ml-2 rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-300">🎭 ĐANG MÔ PHỎNG GIAO DIỆN: {ROLE_LABELS_VI[simulatedRole]}</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input className={`${inputClass} w-56`} placeholder="🔍 Tìm PTW / khu vực / thiết bị…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <Link to="/permits/new"><Button variant="success">➕ Tạo PTW mới</Button></Link>
        </div>
      </div>

      {/* ---------------------------------- KPIs --------------------------------- */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard label="Active Permits" value={active.length} sub="Đang hiệu lực trên giàn" tone="bg-emerald-500" />
        <KpiCard label="Chờ phê duyệt" value={pending.length} sub="Trong chuỗi ký duyệt" tone="bg-amber-400" />
        <KpiCard label="Sắp hết hạn ≤60'" value={expiringSoon.length} sub="Cần gia hạn / đóng permit" tone="bg-orange-500" />
        <KpiCard label="Gas Test FAIL" value={gasAbnormal.length} sub="Phát hiện khí bất thường" tone="bg-rose-600" />
        <KpiCard label="SIMOPS Conflict" value={simops.length} sub="Công việc chồng lấn" tone="bg-red-500" />
      </div>

      {/* ----------------------------- ACTIVE PERMITS ---------------------------- */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>📒 Active Permits — Giấy phép đang hiệu lực</CardTitle>
            <p className="text-xs text-muted-foreground">Màu trạng thái chuẩn công nghiệp: Emerald = an toàn · Amber nhấp nháy = đang chờ · Crimson = nguy hiểm/khóa.</p>
          </div>
          <Badge tone="info">{active.length} permit</Badge>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                  <th className="py-2 pr-3">Permit No. / Rev</th>
                  <th className="py-2 pr-3">Loại / Khu vực</th>
                  <th className="py-2 pr-3">Nội dung công việc</th>
                  <th className="py-2 pr-3">Applicant</th>
                  <th className="py-2 pr-3">Hiệu lực đến</th>
                  <th className="py-2 pr-3">Rủi ro</th>
                  <th className="py-2 pr-3">Gas</th>
                  <th className="py-2">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {[...active, ...pending].map((p) => (
                  <PermitRow key={`${p.id}`} permit={p} allPermits={permits} onOpen={() => navigate(`/permits/${p.id}`)} />
                ))}
                {active.length + pending.length === 0 && (
                  <tr><td colSpan={8} className="py-10 text-center text-xs text-muted-foreground">Chưa có permit nào đang hoạt động hoặc chờ phê duyệt.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* --------------------------- RECENT AUDIT SNAPSHOT ------------------------ */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Hoạt động gần đây (Audit)</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {visible.flatMap((p) => p.statusHistory.slice(-2).map((h) => ({ h, p }))).sort((a, b) => b.h.timestamp.localeCompare(a.h.timestamp)).slice(0, 8).map(({ h, p }) => (
              <button key={h.id} onClick={() => navigate(`/permits/${p.id}`)} className="flex w-full items-baseline gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-left text-xs hover:bg-muted/50">
                <time className="shrink-0 font-mono text-[10px] text-muted-foreground">{formatTimestamp(h.timestamp)}</time>
                <span className="shrink-0 font-mono font-bold text-primary">{p.permitNumber}</span>
                <span className="truncate text-muted-foreground">{h.action} — {h.userName}</span>
              </button>
            ))}
            {visible.length === 0 && <p className="text-xs text-muted-foreground">Nhật ký trống — hệ thống vừa khởi tạo.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>QR kiểm tra hiện trường</CardTitle></CardHeader>
          <CardContent className="flex flex-col items-center gap-2">
            <div className="rounded-xl bg-white p-3">
              <QRCodeSVG size={140} value={`OFFSHORE-PTW|DASHBOARD|${currentUser.platformCode}|${new Date().toISOString().slice(0, 10)}`} />
            </div>
            <p className="text-center text-[10px] text-muted-foreground">Scan khi bắt đầu ca trực để đối chiếu danh bạ PTW của giàn {currentUser.platformCode} — {formatDate(new Date().toISOString())}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PermitRow({ permit: p, allPermits, onOpen }: { permit: Permit; allPermits: Permit[]; onOpen: () => void }) {
  const meta = STATUS_META[p.status];
  const mins = minutesUntil(p.plannedEnd);
  const conflicts = detectSimopsConflicts(p, allPermits);
  const gasOk = hasValidGasTest(p);
  return (
    <tr className="cursor-pointer border-b border-border/50 transition-colors hover:bg-muted/40" onClick={onOpen}>
      <td className="py-2.5 pr-3">
        <span className="font-mono text-sm font-bold text-foreground">{p.permitNumber}</span>
        <span className="ml-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">Rev {p.revisionNo}</span>
      </td>
      <td className="py-2.5 pr-3 text-xs">
        <span className="font-semibold">{p.permitType.replace(/_/g, ' ')}</span>
        <span className="block text-muted-foreground">{p.areaCode} · {p.areaName}</span>
      </td>
      <td className="max-w-[260px] py-2.5 pr-3 text-xs"><span className="line-clamp-2">{p.workDescription}</span></td>
      <td className="py-2.5 pr-3 text-xs">{p.applicantName}</td>
      <td className="py-2.5 pr-3 font-mono text-xs">
        {formatTimestamp(p.plannedEnd)}
        {mins > 0 && mins <= 60 && <span className="block font-bold text-orange-400">⏰ còn {mins}'</span>}
        {mins <= 0 && <span className="block font-bold text-rose-400">HẾT HẠN</span>}
      </td>
      <td className="py-2.5 pr-3"><Badge tone={RISK_TONE[p.riskLevel]}>{p.riskLevel}</Badge></td>
      <td className="py-2.5 pr-3 text-xs">
        {!p.requiresGasTest ? <span className="text-muted-foreground">N/A</span>
          : gasOk ? <span className="font-bold text-emerald-400">OK</span>
          : <span className="animate-pulse font-bold text-rose-400">!</span>}
      </td>
      <td className="py-2.5">
        <span className="inline-flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${meta.dot} ${PENDING_STATUSES.includes(p.status) ? 'ptw-pending-dot' : ''}`} />
          <span className={`text-xs font-bold uppercase tracking-wide ${meta.text}`}>{STATUS_LABELS_EN[p.status]}</span>
          {conflicts.length > 0 && <span title="Xung đột SIMOPS">⚠️</span>}
        </span>
      </td>
    </tr>
  );
}
