/**
 * ============================================================================
 * SIMOPS CONFLICT BANNER – Cảnh báo công việc đồng thời theo Area + Time
 * ----------------------------------------------------------------------------
 * Xung đột mức BLOCK bắt buộc FPS/Deputy OIM/OIM đánh giá & ký ghi nhận quyết
 * định thì Applicant mới được Submit permit.
 * ==========================================================================*/

import { useState } from 'react';
import { Permit, SimopsConflict } from '../../types/domain';
import { usePtwStore } from '../../store/ptwStore';
import { Badge, Button, FieldRow, inputClass, Modal } from '../ui/primitives';
import { formatTimestamp } from '../../lib/utils';

const LEVEL_STYLE: Record<SimopsConflict['level'], string> = {
  BLOCK: 'border-red-500/50 bg-red-600/15 text-red-300',
  WARNING: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  INFO: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
};

export function SimopsBanner({ permit, conflicts }: { permit: Permit; conflicts: SimopsConflict[] }) {
  const currentUser = usePtwStore((s) => s.currentUser);
  const acknowledge = usePtwStore((s) => s.acknowledgeSimopsConflict);
  const [target, setTarget] = useState<SimopsConflict | null>(null);
  const [note, setNote] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (conflicts.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-2.5 text-xs text-emerald-300">
        ✅ Không phát hiện xung đột SIMOPS trong cùng khu vực & khung thời gian.
      </div>
    );
  }

  const canAck = !!currentUser && ['FPS', 'DEPUTY_OIM', 'OIM'].includes(currentUser.role);

  const submitAck = async () => {
    setError(null);
    if (!target) return;
    const res = await acknowledge(permit.id, target.conflictId, note.trim(), pin);
    if (!res.ok) { setError(res.error ?? 'Không ghi nhận được.'); return; }
    setTarget(null); setNote(''); setPin('');
  };

  return (
    <div className="space-y-2">
      {conflicts.map((c) => {
        const acked = permit.acknowledgedConflictIds.includes(c.conflictId);
        return (
          <div key={c.conflictId} className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${LEVEL_STYLE[c.level]}`}>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-widest">
                {c.level === 'BLOCK' ? '⚠️ Potential SIMOPS Conflict — BLOCK' : c.level === 'WARNING' ? '⚠️ SIMOPS Warning' : 'ℹ️ SIMOPS Info'}
              </p>
              <p className="truncate font-mono text-xs">{c.reason}</p>
              <p className="text-[11px] opacity-80">
                Chồng lấn: {formatTimestamp(c.overlapFrom)} → {formatTimestamp(c.overlapTo)} · Khu vực {c.areaCode}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {acked ? (
                <Badge tone="success">Đã đánh giá & ghi nhận ✔</Badge>
              ) : (
                <Button size="sm" variant={c.level === 'BLOCK' ? 'danger' : 'outline'} disabled={!canAck} onClick={() => setTarget(c)}>
                  {canAck ? 'Ký ghi nhận quyết định' : 'Chờ FPS/OIM đánh giá'}
                </Button>
              )}
            </div>
          </div>
        );
      })}

      <Modal open={!!target} onClose={() => setTarget(null)} title="Ghi nhận đánh giá xung đột SIMOPS" subtitle={target?.reason}>
        <div className="space-y-4">
          <FieldRow label="Kết luận của người có thẩm quyền (bắt buộc)">
            <textarea className={inputClass} rows={3} placeholder="VD: Bố trí barrier cứng, giãn khung thời gian, cử standby man – cho phép triển khai với biện pháp bổ sung." value={note} onChange={(e) => setNote(e.target.value)} />
          </FieldRow>
          <FieldRow label="PIN điện tử xác nhận"><input type="password" maxLength={8} className={inputClass} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} /></FieldRow>
          {error && <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">⛔ {error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setTarget(null)}>Hủy</Button>
            <Button variant="danger" onClick={submitAck} disabled={!note.trim()}>Ký & ghi nhận</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
