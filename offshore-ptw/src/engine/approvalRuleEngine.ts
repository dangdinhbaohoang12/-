/**
 * ============================================================================
 * APPROVAL RULE ENGINE – Sinh chuỗi phê duyệt theo cấu hình (KHÔNG hard-code 4 cấp)
 * ----------------------------------------------------------------------------
 * Chuỗi duyệt được tính từ: Permit Type + Risk Level + Area + Work Classification.
 * Admin có thể thay đổi ApprovalRuleConfig mà không sửa code nghiệp vụ.
 *
 * Luật mặc định (có thể ghi đè bằng rule động trong DB):
 *   IF Permit.Type = HOT_WORK / CONFINED_SPACE OR RiskLevel in (HIGH, CRITICAL)
 *      OR CriticalWork OR High-Voltage Electrical
 *      THEN REQUIRE [LINE_SUPERVISOR, FPS, DEPUTY_OIM, OIM]
 *   IF RiskLevel = MEDIUM THEN REQUIRE [LINE_SUPERVISOR, FPS, DEPUTY_OIM]
 *   IF Routine Low Risk   THEN REQUIRE [LINE_SUPERVISOR, FPS]
 * Các cấp không nằm trong chain sẽ hiển thị N/A (NOT_REQUIRED).
 * ==========================================================================*/

import {
  ApprovalLevel,
  ApprovalStep,
  PermitTypeCode,
  RiskLevel,
  WorkClassification,
} from '../types/domain';

export interface ApprovalRuleContext {
  permitType: PermitTypeCode;
  riskLevel: RiskLevel;
  areaHazardous: boolean;
  criticalWork: boolean;
  /** Phân loại bổ sung do người lập khai báo / hệ thống suy diễn. */
  workClassifications: WorkClassification[];
  /** Bù nhìn điện cao thế (>=1kV) – bắt buộc OIM theo quy chế vận hành. */
  highVoltageElectrical?: boolean;
}

export interface ApprovalRule {
  id: string;
  description: string;
  priority: number; // Số lớn hơn thắng khi nhiều rule cùng khớp
  when: Partial<{
    permitTypes: PermitTypeCode[];
    riskLevels: RiskLevel[];
    hazardousArea: boolean;
    criticalWork: boolean;
    classifications: WorkClassification[];
    highVoltageElectrical: boolean;
  }>;
  require: ApprovalLevel[];
}

/** Bộ luật mặc định của hệ thống – lưu bản copy trong SystemSettings để Admin chỉnh. */
export const DEFAULT_APPROVAL_RULES: ApprovalRule[] = [
  {
    id: 'RULE-CRITICAL',
    description: 'Critical Work / khu vực nguy hiểm cấp cao – đủ 4 cấp duyệt.',
    priority: 100,
    when: { criticalWork: true },
    require: ['LINE_SUPERVISOR', 'FPS', 'DEPUTY_OIM', 'OIM'],
  },
  {
    id: 'RULE-HIGH-RISK',
    description: 'Rủi ro HIGH/CRITICAL – đủ 4 cấp duyệt.',
    priority: 90,
    when: { riskLevels: ['HIGH', 'CRITICAL'] },
    require: ['LINE_SUPERVISOR', 'FPS', 'DEPUTY_OIM', 'OIM'],
  },
  {
    id: 'RULE-HOT-WORK',
    description: 'Hot Work – bắt buộc OIM (trừ khi Routine & khu vực an toàn).',
    priority: 85,
    when: { permitTypes: ['HOT_WORK'] },
    require: ['LINE_SUPERVISOR', 'FPS', 'DEPUTY_OIM', 'OIM'],
  },
  {
    id: 'RULE-CONFINED',
    description: 'Confined Space Entry – bắt buộc đủ 4 cấp.',
    priority: 85,
    when: { permitTypes: ['CONFINED_SPACE'] },
    require: ['LINE_SUPERVISOR', 'FPS', 'DEPUTY_OIM', 'OIM'],
  },
  {
    id: 'RULE-RADIOGRAPHY',
    description: 'Radiography – nguồn phóng xạ, đủ 4 cấp.',
    priority: 85,
    when: { permitTypes: ['RADIOGRAPHY'] },
    require: ['LINE_SUPERVISOR', 'FPS', 'DEPUTY_OIM', 'OIM'],
  },
  {
    id: 'RULE-DIVING',
    description: 'Diving – công việc dưới nước, đủ 4 cấp.',
    priority: 80,
    when: { permitTypes: ['DIVING'] },
    require: ['LINE_SUPERVISOR', 'FPS', 'DEPUTY_OIM', 'OIM'],
  },
  {
    id: 'RULE-HIGH-VOLTAGE',
    description: 'Điện cao thế (>=1kV) – đủ 4 cấp.',
    priority: 80,
    when: { highVoltageElectrical: true },
    require: ['LINE_SUPERVISOR', 'FPS', 'DEPUTY_OIM', 'OIM'],
  },
  {
    id: 'RULE-HAZARDOUS-AREA',
    description: 'Làm việc tại khu vực nguy hiểm (Zone 1/2) – đủ 4 cấp.',
    priority: 75,
    when: { hazardousArea: true },
    require: ['LINE_SUPERVISOR', 'FPS', 'DEPUTY_OIM', 'OIM'],
  },
  {
    id: 'RULE-MEDIUM',
    description: 'Rủi ro trung bình – Line → FPS → Deputy OIM.',
    priority: 50,
    when: { riskLevels: ['MEDIUM'] },
    require: ['LINE_SUPERVISOR', 'FPS', 'DEPUTY_OIM'],
  },
  {
    id: 'RULE-ROUTINE-LOW',
    description: 'Routine Low Risk – Line → FPS (Deputy/OIM hiển thị N/A).',
    priority: 10,
    when: { riskLevels: ['LOW'] },
    require: ['LINE_SUPERVISOR', 'FPS'],
  },
];

function ruleMatches(rule: ApprovalRule, ctx: ApprovalRuleContext): boolean {
  const w = rule.when;
  if (w.permitTypes && !w.permitTypes.includes(ctx.permitType)) return false;
  if (w.riskLevels && !w.riskLevels.includes(ctx.riskLevel)) return false;
  if (w.hazardousArea !== undefined && w.hazardousArea !== ctx.areaHazardous) return false;
  if (w.criticalWork !== undefined && w.criticalWork !== ctx.criticalWork) return false;
  if (w.highVoltageElectrical !== undefined && w.highVoltageElectrical !== !!ctx.highVoltageElectrical)
    return false;
  if (w.classifications) {
    const hasAll = w.classifications.every((c) => ctx.workClassifications.includes(c));
    if (!hasAll) return false;
  }
  return true;
}

/** Chọn rule chiến thắng (priority cao nhất trong các rule khớp). */
export function resolveApprovalRule(
  ctx: ApprovalRuleContext,
  rules: ApprovalRule[] = DEFAULT_APPROVAL_RULES
): ApprovalRule {
  const matched = rules
    .filter((r) => ruleMatches(r, ctx))
    .sort((a, b) => b.priority - a.priority);
  if (matched.length === 0) {
    // Safety fallback: không khớp luật nào -> yêu cầu cấp duyệt CAO NHẤT có thể.
    return {
      id: 'RULE-FALLBACK-SAFE',
      description: 'Fallback an toàn: không khớp luật cấu hình nào, áp dụng đủ 4 cấp.',
      priority: Number.MAX_SAFE_INTEGER,
      when: {},
      require: ['LINE_SUPERVISOR', 'FPS', 'DEPUTY_OIM', 'OIM'],
    };
  }
  return matched[0];
}

/** Sinh chuỗi duyệt: các cấp required = PENDING, các cấp còn lại = NOT_REQUIRED (N/A). */
export function buildApprovalChain(
  ctx: ApprovalRuleContext,
  rules: ApprovalRule[] = DEFAULT_APPROVAL_RULES
): { chain: ApprovalStep[]; appliedRuleId: string } {
  const rule = resolveApprovalRule(ctx, rules);
  const ALL_LEVELS: ApprovalLevel[] = ['LINE_SUPERVISOR', 'FPS', 'DEPUTY_OIM', 'OIM'];
  const chain: ApprovalStep[] = ALL_LEVELS.map((level) => ({
    level,
    required: rule.require.includes(level),
    status: rule.require.includes(level) ? 'PENDING' : 'NOT_REQUIRED',
  }));
  return { chain, appliedRuleId: rule.id };
}

/** Cấp đầu tiên còn required và chưa quyết – chính là currentApprovalLevel. */
export function nextRequiredLevel(chain: ApprovalStep[]): ApprovalLevel | null {
  const step = chain.find((s) => s.required && s.status === 'PENDING');
  return step ? step.level : null;
}

/** Toàn bộ cấp required đã quyết xong? (điều kiện chuyển sang APPROVED/ISSUED) */
export function isChainComplete(chain: ApprovalStep[]): boolean {
  return chain
    .filter((s) => s.required)
    .every((s) => s.status === 'DONE' || s.status === 'REJECTED');
}
