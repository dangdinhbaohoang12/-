/**
 * ============================================================================
 * PERMIT FORM PAGE – Khởi tạo / chỉnh sửa PTW Draft (chức năng 1)
 * ----------------------------------------------------------------------------
 * - Sinh số tự động MT1-PTW-YYYY-NNNNN (khóa, chống trùng).
 * - Cấu phần checklist theo loại permit + cảnh báo SIMOPS thời gian thực.
 * ==========================================================================*/

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PermitTypeCode, RiskLevel, ROLE_LABELS_VI } from '../types/domain';
import { AREAS, EQUIPMENT_BY_AREA, PERMIT_TYPE_CATALOG_MAP, PLATFORMS } from '../data/catalog';
import { usePtwStore } from '../store/ptwStore';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, FieldRow, inputClass, Select } from '../components/ui/primitives';
import { SimopsBanner } from '../components/permit/SimopsBanner';
import { detectSimopsConflicts } from '../engine/simopsEngine';
import { toLocalInputValue } from '../lib/utils';

const RISK_OPTIONS: RiskLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export function PermitFormPage() {
  const navigate = useNavigate();
  const currentUser = usePtwStore((s) => s.currentUser);
  const simulatedRole = usePtwStore((s) => s.simulatedRole);
  const createDraft = usePtwStore((s) => s.createDraft);
  const permits = usePtwStore((s) => s.permits);

  const [permitType, setPermitType] = useState<PermitTypeCode>('HOT_WORK');
  const [platform, setPlatform] = useState('MT1');
  const [areaCode, setAreaCode] = useState(AREAS.find((a) => a.platformCode === 'MT1')?.code ?? '');

  const nextNumber = useMemo(() => {
    const year = new Date().getFullYear();
    const nums = permits.filter((p) => p.platformCode === platform && p.permitNumber.startsWith(`${platform}-PTW-${year}-`)).map((p) => Number(p.permitNumber.split('-').pop())).filter(Number.isFinite);
    return `${platform}-PTW-${year}-${String(Math.max(0, ...nums) + 1).padStart(5, '0')}`;
  }, [permits, platform]);
  const [equipmentTag, setEquipmentTag] = useState('');
  const [description, setDescription] = useState('');
  const [reason, setReason] = useState('');
  const [start, setStart] = useState(toLocalInputValue(new Date(Date.now() + 3600_000).toISOString()));
  const [end, setEnd] = useState(toLocalInputValue(new Date(Date.now() + 9 * 3600_000).toISOString()));
  const [risk, setRisk] = useState<RiskLevel>('MEDIUM');
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!currentUser) return null;
  const catalog = PERMIT_TYPE_CATALOG_MAP[permitType];
  const areas = AREAS.filter((a) => a.platformCode === platform);
  const currentAreaForView = areas.find((a) => a.code === areaCode);
  const equipmentList = currentAreaForView ? (EQUIPMENT_BY_AREA[currentAreaForView.id] ?? []) : [];
  const effectiveRole = simulatedRole ?? currentUser.role;
  void effectiveRole;

  // Preview xung đột SIMOPS theo thời gian thực từ thông tin đang nhập.
  const previewConflicts = useMemo(() => {
    if (!start || !end) return [];
    const dummy = {
      id: '__preview__', permitNumber: nextNumber, platformCode: platform, areaCode,
      plannedStart: new Date(start).toISOString(), plannedEnd: new Date(end).toISOString(),
    };
    return detectSimopsConflicts(dummy as never, permits);
  }, [start, end, areaCode, platform, permits, nextNumber]);

  const submit = () => {
    setError(null);
    if (!description.trim() || description.trim().length < 20) { setError('Nội dung công việc tối thiểu 20 ký tự.'); return; }
    if (!reason.trim()) { setError('Lý do phát sinh công việc là bắt buộc.'); return; }
    if (!start || !end || new Date(end) <= new Date(start)) { setError('Khung thời gian không hợp lệ.'); return; }
    const unchecked = catalog.checklist.filter((c) => c.required && !checked[c.id]);
    if (unchecked.length > 0) { setError(`Còn ${unchecked.length} cấu phần an toàn BẮT BUỘC chưa xác nhận.`); return; }
    if (!pin.trim()) { setError('PIN điện tử xác thực người khởi tạo là bắt buộc.'); return; }
    const currentArea = areas.find((a) => a.code === areaCode);
    const res = createDraft(
      {
        permitType,
        areaId: currentArea?.id,
        equipmentTag: equipmentTag || 'N/A',
        workDescription: description.trim(), reasonForIssuing: reason.trim(),
        plannedStart: new Date(start).toISOString(), plannedEnd: new Date(end).toISOString(),
        riskLevel: risk,
        riskLevelAssessed: risk,
        areaCode,
        platformCode: platform,
        safetyChecklistConfirmed: catalog.checklist.map((c) => ({ itemId: c.id, labelVi: c.labelVi, confirmed: !!checked[c.id] })),
      },
      pin,
    );
    if (!res.ok) { setError(res.error ?? 'Không tạo được draft.'); return; }
    navigate(`/permits/${res.permit!.id}`);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-black tracking-tight">➕ Khởi tạo giấy phép công tác (PTW)</h1>
        <p className="text-sm text-muted-foreground">Người khởi tạo: {currentUser.fullName} — {ROLE_LABELS_VI[effectiveRole]} · Số permit cấp tự động, không thể trùng.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Thông tin định danh</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <FieldRow label="Số permit (tự sinh)" hint="Định dạng MT1-PTW-YYYY-NNNNN — khóa cứng, chống trùng">
              <input className={`${inputClass} font-mono`} value={nextNumber} readOnly disabled />
            </FieldRow>
            <FieldRow label="Loại giấy phép">
              <Select value={permitType} onChange={(v) => { setPermitType(v as PermitTypeCode); setChecked({}); }}>
                {Object.entries(PERMIT_TYPE_CATALOG_MAP).map(([code, meta]) => (
                  <option key={code} value={code}>{meta.labelVi} ({meta.code})</option>
                ))}
              </Select>
            </FieldRow>
            <FieldRow label="Giàn / Công trình">
              <Select value={platform} onChange={(nextPlatform) => {
                setPlatform(nextPlatform);
                setAreaCode(AREAS.find((a) => a.platformCode === nextPlatform)?.code ?? '');
                setEquipmentTag('');
              }}>
                {PLATFORMS.map((p) => <option key={p.code} value={p.code}>{p.name} ({p.code})</option>)}
              </Select>
            </FieldRow>
            <FieldRow label="Khu vực làm việc">
              <Select value={areaCode} onChange={setAreaCode}>
                {areas.map((a) => <option key={a.code} value={a.code}>{a.name} ({a.code})</option>)}
              </Select>
            </FieldRow>
            <FieldRow label="Thiết bị cô lập (tag)">
              <Select value={equipmentTag} onChange={setEquipmentTag} placeholder="— Không gắn thiết bị cụ thể —">
                {equipmentList.map((e) => <option key={e.tag} value={e.tag}>{e.name} · {e.tag}</option>)}
              </Select>
            </FieldRow>
            <FieldRow label="Mức độ rủi ro tiên đoán">
              <Select value={risk} onChange={(v) => setRisk(v as RiskLevel)}>
                {RISK_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </Select>
            </FieldRow>
            <FieldRow label="Bắt đầu ca (dự kiến)">
              <input type="datetime-local" className={inputClass} value={start} onChange={(e) => setStart(e.target.value)} />
            </FieldRow>
            <FieldRow label="Kết thúc (dự kiến)" hint={`Hiệu lực tối đa loại này: ${catalog.validityHours}h`}>
              <input type="datetime-local" className={inputClass} value={end} onChange={(e) => setEnd(e.target.value)} />
            </FieldRow>
          </div>
          <FieldRow label="Nội dung công việc (bắt buộc ≥20 ký tự)">
            <textarea rows={3} className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="VD: Hàn kết cấu sàn trực thăng tại MH-DECK, cắt gọt dầm phụ..." />
          </FieldRow>
          <FieldRow label="Lý do phát sinh công việc">
            <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="VD: Bảo trì theo kế hoạch PM-2026-118" />
          </FieldRow>
          <FieldRow label="PIN điện tử xác thực (bắt buộc)" hint="Chữ ký số của người khởi tạo cho bản nháp này">
            <input type="password" maxLength={8} inputMode="numeric" className={inputClass} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
          </FieldRow>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>✅ Checklist cấu phần an toàn — {catalog.labelVi}</CardTitle>
            <p className="text-xs text-muted-foreground">Toàn bộ mục đánh dấu BẮT BUỘC phải được xác nhận trước khi lưu draft.</p>
          </div>
          <Badge tone={catalog.requiresGasTest ? 'warning' : 'neutral'}>{catalog.requiresGasTest ? 'Yêu cầu Gas Test' : 'Không yêu cầu Gas Test'}</Badge>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2">
          {catalog.checklist.map((c) => (
            <label key={c.id} className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ${checked[c.id] ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-border hover:bg-muted/40'}`}>
              <input type="checkbox" className="mt-0.5 accent-emerald-500" checked={!!checked[c.id]} onChange={(e) => setChecked((s) => ({ ...s, [c.id]: e.target.checked }))} />
              <span>
                {c.labelVi}
                <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">{c.labelEn}{c.required ? ' · BẮT BUỘC' : ''}</span>
              </span>
            </label>
          ))}
        </CardContent>
      </Card>

      <SimopsBanner permit={{ acknowledgedConflictIds: [] } as never} conflicts={previewConflicts} />

      {error && <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">⛔ {error}</p>}

      <div className="flex justify-end gap-2 pb-8">
        <Button variant="ghost" onClick={() => navigate(-1)}>Hủy</Button>
        <Button size="lg" variant="success" onClick={submit}>💾 Lưu nháp & mở hồ sơ</Button>
      </div>
    </div>
  );
}
