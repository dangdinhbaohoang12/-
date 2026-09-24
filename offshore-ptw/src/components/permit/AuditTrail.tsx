/**
 * ============================================================================
 * AUDIT TRAIL – Nhật ký kiểm toán APPEND-ONLY (bất biến)
 * ----------------------------------------------------------------------------
 * - Không có bất kỳ control nào để sửa/xóa bản ghi.
 * - Hiển thị: Timestamp · User(role) · Hành động · Thiết bị/IP · Old → New.
 * ==========================================================================*/

import { StatusHistoryEntry } from '../../types/domain';
import { ROLE_LABELS_VI, STATUS_LABELS_EN } from '../../types/domain';
import { Card, CardContent, CardHeader, CardTitle, Badge } from '../ui/primitives';
import { formatTimestamp } from '../../lib/utils';

export function AuditTrail({ entries }: { entries: StatusHistoryEntry[] }) {
  const ordered = [...entries].sort((a, b) => b.sequence - a.sequence);
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Nhật ký Audit Trail</CardTitle>
          <p className="text-xs text-muted-foreground">Bản ghi bất biến · chỉ thêm mới · phục vụ điều tra sự cố & audit HSE.</p>
        </div>
        <Badge tone="info">APPEND-ONLY 🔒</Badge>
      </CardHeader>
      <CardContent>
        <ol className="relative space-y-4 border-l border-border pl-5">
          {ordered.map((e) => (
            <li key={e.id} className="relative">
              <span className="absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-background" />
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <time className="font-mono text-xs text-muted-foreground">{formatTimestamp(e.timestamp)}</time>
                <span className="text-sm font-semibold text-foreground">{e.userName}</span>
                <span className="text-[10px] uppercase tracking-wider text-primary">{ROLE_LABELS_VI[e.userRole]}</span>
                <Badge tone={e.toStatus === 'REJECTED' ? 'danger' : e.eventType === 'GAS_TEST_ADDED' ? 'info' : 'neutral'}>
                  {e.action.length > 90 ? `${e.action.slice(0, 90)}…` : e.action}
                </Badge>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground">
                <span>IP/Device: <span className="font-mono">{e.deviceIp}</span></span>
                {e.fromStatus !== e.toStatus && (
                  <span>
                    Trạng thái: <span className="font-mono">{STATUS_LABELS_EN[e.fromStatus ?? 'DRAFT']}</span>
                    {' → '}<span className="font-mono text-foreground">{STATUS_LABELS_EN[e.toStatus]}</span>
                  </span>
                )}
                {e.comment && <span className="italic">“{e.comment}”</span>}
              </div>
              {(e.oldValues || e.newValues) && (
                <div className="mt-1 rounded-lg border border-border/60 bg-muted/30 px-3 py-1.5 font-mono text-[10px] text-muted-foreground">
                  {Object.entries(e.newValues ?? {}).map(([k, v]) => (
                    <div key={k}>
                      <span className="text-rose-400 line-through">{e.oldValues?.[k] ?? '∅'}</span>
                      {' → '}
                      <span className="text-emerald-400">{String(v)}</span>
                      <span className="ml-2 opacity-60">[{k}]</span>
                    </div>
                  ))}
                </div>
              )}
            </li>
          ))}
          {ordered.length === 0 && <li className="text-xs text-muted-foreground">Chưa có bản ghi.</li>}
        </ol>
      </CardContent>
    </Card>
  );
}
