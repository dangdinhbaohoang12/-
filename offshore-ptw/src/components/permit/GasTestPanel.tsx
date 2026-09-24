/**
 * ============================================================================
 * ADVANCED GAS TEST PANEL – Bảng đo khí định lượng kèm metadata kiểm định
 * ----------------------------------------------------------------------------
 * - Không có ô nhập PASS/FAIL thủ công: kết quả do Gas Test Engine tính từ
 *   ngưỡng chuẩn (O₂ 19.5–23.5%, LEL <10%, H₂S <5ppm, CO <25ppm).
 * - Ràng buộc: máy dò còn hạn hiệu chuẩn tại thời điểm đo, đủ 4 thông số,
 *   phép đo chỉ có giá trị phát hành trong 60 phút.
 * ==========================================================================*/

import { useMemo, useState } from 'react';
import { GasParameter, GasTestRecord, Permit } from '../../types/domain';
import { GAS_SPECS, REQUIRED_GAS_PARAMETERS, evaluateReading, isDetectorCalibrationValid } from '../../engine/gasTestEngine';
import { usePtwStore } from '../../store/ptwStore';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, FieldRow, inputClass, Modal } from '../ui/primitives';
import { formatTimestamp } from '../../lib/utils';
import { canPerform } from '../../services/authorizationService';

const PARAMS: GasParameter[] = REQUIRED_GAS_PARAMETERS;

interface DraftReadings {
  O2: string; LEL: string; H2S: string; CO: string;
}

function liveResult(p: GasParameter, raw: string): 'PASS' | 'FAIL' | 'EMPTY' {
  if (raw.trim() === '') return 'EMPTY';
  const v = Number(raw);
  if (!Number.isFinite(v)) return 'FAIL';
  return evaluateReading(p, v);
}

export function GasTestPanel({ permit }: { permit: Permit }) {
  const currentUser = usePtwStore((s) => s.currentUser);
  const addGasTest = usePtwStore((s) => s.addGasTest);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [detectorId, setDetectorId] = useState('');
  const [calDue, setCalDue] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [readings, setReadings] = useState<DraftReadings>({ O2: '', LEL: '', H2S: '', CO: '' });
  const [submitting, setSubmitting] = useState(false);

  const canAdd = useMemo(
    () => (currentUser ? canPerform(currentUser, permit, 'ADD_GAS_TEST').allowed : false),
    [currentUser, permit]
  );

  const allFilled = PARAMS.every((p) => readings[p].trim() !== '');
  const draftAllPass = PARAMS.every((p) => liveResult(p, readings[p]) === 'PASS');

  const submit = async () => {
    if (submitting) return;
    setError(null);
    if (!currentUser) return;
    if (!detectorId.trim() || !calDue || !location.trim()) {
      setError('Bắt buộc: Mã máy dò, Hạn hiệu chuẩn, Vị trí đo.');
      return;
    }
    if (!allFilled) { setError('Phải đo đủ 4 thông số O₂ / LEL / H₂S / CO.'); return; }
    const testedAt = new Date().toISOString();
    if (!isDetectorCalibrationValid(new Date(calDue).toISOString(), testedAt)) {
      setError('Máy dò đã hết hạn hiệu chuẩn – phép đo không có giá trị pháp lý.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await addGasTest(
        permit.id,
        {
          readings: PARAMS.map((p) => ({
            parameter: p,
            value: Number(readings[p]),
            unit: GAS_SPECS[p].unit,
            min: GAS_SPECS[p].min,
            max: GAS_SPECS[p].max,
            result: evaluateReading(p, Number(readings[p])),
          })),
          gasDetectorId: detectorId.trim().toUpperCase(),
          calibrationDueDate: new Date(calDue).toISOString(),
          testedByUserId: currentUser.id,
          testedByName: currentUser.fullName,
          testedAt,
          location: location.trim(),
          notes: notes.trim() || undefined,
        },
        pin
      );
      if (!res.ok) { setError(res.error ?? 'Không ghi nhận được Gas Test.'); return; }
      setPin(''); setDetectorId(''); setCalDue(''); setLocation(''); setNotes('');
      setReadings({ O2: '', LEL: '', H2S: '', CO: '' });
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Module đo khí độc lập · Gas Testing</CardTitle>
          <p className="text-xs text-muted-foreground">
            Kết quả do engine tính theo ngưỡng chuẩn – không nhập PASS/FAIL thủ công. Giá trị phát hành: phép đo PASS ≤ 60 phút.
          </p>
        </div>
        <Button size="sm" variant={canAdd ? 'primary' : 'outline'} disabled={!canAdd} onClick={() => setOpen(true)}>
          + Ghi nhận lần đo
        </Button>
      </CardHeader>
      <CardContent>
        {!permit.requiresGasTest && (
          <p className="mb-3 rounded-lg border border-sky-500/20 bg-sky-500/5 px-3 py-2 text-[11px] text-sky-300">
            ℹ️ Loại permit này không bắt buộc gas test theo danh mục cấu hình. Việc đo vẫn được ghi nhận để tham chiếu.
          </p>
        )}
        {permit.gasTests.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            Chưa có lần đo nào được ghi nhận.
            {permit.requiresGasTest && <span className="text-amber-400"> Permit yêu cầu gas test PASS hợp lệ trước khi phát hành / tiếp tục thi công.</span>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                  <th className="py-2 pr-3">#</th>
                  {PARAMS.map((p) => (
                    <th key={p} className="py-2 pr-3">
                      {GAS_SPECS[p].label}
                      <span className="block font-normal normal-case text-muted-foreground/60">
                        {GAS_SPECS[p].unit} · [{GAS_SPECS[p].min}–{GAS_SPECS[p].max}]
                      </span>
                    </th>
                  ))}
                  <th className="py-2 pr-3">Tổng hợp</th>
                  <th className="py-2 pr-3">Máy dò / Hiệu chuẩn</th>
                  <th className="py-2 pr-3">Người đo</th>
                  <th className="py-2">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {[...permit.gasTests].reverse().map((gt) => (
                  <tr key={gt.id} className="border-b border-border/50 align-top hover:bg-muted/30">
                    <td className="py-2.5 pr-3 font-mono text-xs text-muted-foreground">{gt.sequenceNo}</td>
                    {PARAMS.map((p) => {
                      const r = gt.readings.find((x) => x.parameter === p);
                      return (
                        <td key={p} className="py-2.5 pr-3">
                          <span className={`font-mono text-sm font-semibold ${r?.result === 'PASS' ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {r ? r.value : '—'}
                          </span>
                          <span className={`ml-1 text-[10px] font-bold ${r?.result === 'PASS' ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {r?.result === 'PASS' ? 'PASS' : 'FAIL'}
                          </span>
                        </td>
                      );
                    })}
                    <td className="py-2.5 pr-3">
                      <Badge tone={gt.overallResult === 'PASS' ? 'success' : 'danger'}>{gt.overallResult}</Badge>
                    </td>
                    <td className="py-2.5 pr-3 text-xs">
                      <span className="font-mono text-foreground">{gt.gasDetectorId}</span>
                      <span className="block text-muted-foreground">Cal due: {formatTimestamp(gt.calibrationDueDate)}</span>
                    </td>
                    <td className="py-2.5 pr-3 text-xs">
                      {gt.testedByName}
                      <span className="block text-muted-foreground">{gt.location}</span>
                    </td>
                    <td className="py-2.5 font-mono text-xs text-muted-foreground">{formatTimestamp(gt.testedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <Modal open={open} onClose={() => setOpen(false)} title="Ghi nhận Gas Test" subtitle={`${permit.permitNumber} · Rev ${permit.revisionNo} — PIN xác thực người đo là bắt buộc`}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {PARAMS.map((p) => {
              const st = liveResult(p, readings[p]);
              return (
                <FieldRow key={p} label={`${GAS_SPECS[p].label} (${GAS_SPECS[p].unit})`} hint={`Chuẩn: ${GAS_SPECS[p].min} – ${GAS_SPECS[p].max}`}>
                  <div className="flex items-center gap-2">
                    <input
                      type="number" step="0.1" inputMode="decimal" className={inputClass}
                      value={readings[p]}
                      onChange={(e) => setReadings((r) => ({ ...r, [p]: e.target.value }))}
                    />
                    <span className={`w-12 shrink-0 text-center text-[10px] font-bold ${st === 'PASS' ? 'text-emerald-400' : st === 'FAIL' ? 'text-rose-400' : 'text-muted-foreground'}`}>
                      {st === 'EMPTY' ? '—' : st}
                    </span>
                  </div>
                </FieldRow>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="Mã máy dò khí (Gas Detector ID)"><input className={inputClass} placeholder="VD: MSA-4X-0771" value={detectorId} onChange={(e) => setDetectorId(e.target.value)} /></FieldRow>
            <FieldRow label="Hạn hiệu chuẩn (Calibration Due)"><input type="date" className={inputClass} value={calDue} onChange={(e) => setCalDue(e.target.value)} /></FieldRow>
            <FieldRow label="Vị trí đo"><input className={inputClass} placeholder="VD: Wellhead deck, EL +12.5m" value={location} onChange={(e) => setLocation(e.target.value)} /></FieldRow>
            <FieldRow label="PIN điện tử của người đo"><input type="password" maxLength={8} inputMode="numeric" className={inputClass} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} /></FieldRow>
          </div>
          <FieldRow label="Ghi chú (tùy chọn)"><input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} /></FieldRow>
          {error && <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">⛔ {error}</p>}
          <div className="flex items-center justify-between">
            <p className={`text-[11px] font-semibold ${draftAllPass && allFilled ? 'text-emerald-400' : 'text-amber-400'}`}>
              {allFilled ? (draftAllPass ? 'Engine dự kiến: PASS' : 'Engine dự kiến: FAIL — có chỉ số ngoài ngưỡng') : 'Chưa đủ 4 thông số'}
            </p>
            <Button variant="success" onClick={submit} disabled={submitting}>{submitting ? 'Đang gửi…' : 'Ký & gửi kết quả đo'}</Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}
