/**
 * ============================================================================
 * PERMIT LIST PAGE – Danh bạ PTW (all statuses) + bộ lọc nhanh.
 * ==========================================================================*/

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { STATUS_LABELS_EN, PermitStatus } from '../types/domain';
import { usePtwStore } from '../store/ptwStore';
import { Badge, Card, CardContent, CardHeader, CardTitle, inputClass } from '../components/ui/primitives';
import { STATUS_META, RISK_TONE } from '../lib/statusMeta';
import { formatTimestamp } from '../lib/utils';

export const FILTERS: ('ALL' | PermitStatus)[] = [
  'ALL',
  ...(Object.keys(STATUS_LABELS_EN) as PermitStatus[]),
];

export function PermitListPage() {
  const navigate = useNavigate();
  const permits = usePtwStore((s) => s.permits);
  const [status, setStatus] = useState<(typeof FILTERS)[number]>('ALL');
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    let list = permits;
    if (status !== 'ALL') list = list.filter((p) => p.status === status);
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter((p) => `${p.permitNumber} ${p.areaName} ${p.equipmentTag} ${p.workDescription} ${p.applicantName}`.toLowerCase().includes(s));
    }
    return [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [permits, status, q]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Danh bạ giấy phép PTW</h1>
          <p className="text-sm text-muted-foreground">Toàn bộ vòng đời permit trên giàn — bấm vào dòng để mở hồ sơ chi tiết.</p>
        </div>
        <input className={`${inputClass} w-64`} placeholder="🔍 Tìm kiếm…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setStatus(f)}
            className={`rounded-lg border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors ${status === f ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>
            {f === 'ALL' ? 'Tất cả' : STATUS_LABELS_EN[f]}
          </button>
        ))}
      </div>
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Kết quả: {rows.length} permit</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                  <th className="py-2 pr-3">Permit No.</th>
                  <th className="py-2 pr-3">Loại công việc</th>
                  <th className="py-2 pr-3">Khu vực / Thiết bị</th>
                  <th className="py-2 pr-3">Hiệu lực</th>
                  <th className="py-2 pr-3">Rủi ro</th>
                  <th className="py-2">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const meta = STATUS_META[p.status];
                  return (
                    <tr key={p.id} onClick={() => navigate(`/permits/${p.id}`)} className="cursor-pointer border-b border-border/50 hover:bg-muted/40">
                      <td className="py-2.5 pr-3 font-mono font-bold">{p.permitNumber}<span className="ml-1 text-[9px] font-normal text-muted-foreground">Rev {p.revisionNo}</span></td>
                      <td className="py-2.5 pr-3 text-xs">{p.permitType.replace(/_/g, ' ')}</td>
                      <td className="py-2.5 pr-3 text-xs">{p.areaCode} · <span className="font-mono">{p.equipmentTag}</span></td>
                      <td className="py-2.5 pr-3 font-mono text-[11px] text-muted-foreground">{formatTimestamp(p.plannedStart)} → {formatTimestamp(p.validUntil ?? p.plannedEnd)}</td>
                      <td className="py-2.5 pr-3"><Badge tone={RISK_TONE[p.riskLevel]}>{p.riskLevel}</Badge></td>
                      <td className="py-2.5"><span className={`inline-flex items-center gap-2 text-xs font-bold ${meta.text}`}><span className={`h-2 w-2 rounded-full ${meta.dot}`} />{STATUS_LABELS_EN[p.status]}</span></td>
                    </tr>
                  );
                })}
                {rows.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-xs text-muted-foreground">Không tìm thấy permit nào khớp bộ lọc.</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
