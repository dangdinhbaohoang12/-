/**
 * ============================================================================
 * WORKFLOW STATE MACHINE – Bộ máy chuyển trạng thái PTW (enforce tập trung)
 * ----------------------------------------------------------------------------
 * Mọi chuyển đổi trạng thái đi qua đây. Frontend KHÔNG tự đổi status trực tiếp;
 * store gọi applyTransition() và engine trả về { ok, permit | error }.
 * Nguyên tắc chống bypass:
 *  - APPROVED chỉ đạt được khi TOÀN BỘ cấp required trong approvalChain đã DONE.
 *  - Quyết định chỉ hợp lệ ở đúng currentApprovalLevel của người ký.
 *  - Permit APPROVED rồi thì dữ liệu khóa cứng (isPermitFieldLocked).
 * ==========================================================================*/

import {
  ApprovalLevel,
  ApprovalStep,
  AuthorizationResult,
  Permit,
  PermitStatus,
  Role,
} from '../types/domain';
import { checkPermission } from './rbacMatrix';
import { hasValidGasTest } from './gasTestEngine';
import { buildApprovalChain, ApprovalRule } from './approvalRuleEngine';

export interface TransitionContext {
  role: Role;
  userId: string;
  userName: string;
  deviceIp: string;
  comment?: string;
  now?: Date;
}

export interface TransitionResult {
  ok: boolean;
  permit?: Permit;
  error?: string;
}

/** Map cấp duyệt -> vai trò hợp lệ được quyết cấp đó. */
export const LEVEL_TO_ROLE: Record<ApprovalLevel, Role> = {
  LINE_SUPERVISOR: 'LINE_SUPERVISOR',
  FPS: 'FPS',
  DEPUTY_OIM: 'DEPUTY_OIM',
  OIM: 'OIM',
};

/** Trạng thái workflow tương ứng với từng cấp đang chờ. */
export const LEVEL_TO_REVIEW_STATUS: Record<ApprovalLevel, PermitStatus> = {
  LINE_SUPERVISOR: 'LINE_SUPERVISOR_REVIEW',
  FPS: 'FPS_REVIEW',
  DEPUTY_OIM: 'DEPUTY_OIM_REVIEW',
  OIM: 'OIM_REVIEW',
};

const REVIEW_STATUS_TO_LEVEL: Partial<Record<PermitStatus, ApprovalLevel>> = {
  LINE_SUPERVISOR_REVIEW: 'LINE_SUPERVISOR',
  FPS_REVIEW: 'FPS',
  DEPUTY_OIM_REVIEW: 'DEPUTY_OIM',
  OIM_REVIEW: 'OIM',
};

/** Cấp duyệt mà một vai trò đảm nhiệm (OIM vừa duyệt vừa đóng). */
export function approvalLevelOfRole(role: Role): ApprovalLevel | null {
  switch (role) {
    case 'LINE_SUPERVISOR':
      return 'LINE_SUPERVISOR';
    case 'FPS':
      return 'FPS';
    case 'DEPUTY_OIM':
      return 'DEPUTY_OIM';
    case 'OIM':
      return 'OIM';
    default:
      return null;
  }
}

/** Sao chép sâu chuỗi duyệt để không mutate state cũ (bất biến cho React). */
export function cloneChain(chain: ApprovalStep[]): ApprovalStep[] {
  return chain.map((s) => ({ ...s }));
}

/** Cấp hiện tại còn required & PENDING. */
export function currentPendingLevel(permit: Permit): ApprovalLevel | null {
  const step = permit.approvalChain.find((s) => s.required && s.status === 'PENDING');
  return step ? step.level : null;
}

/** Trạng thái review kế tiếp sau khi hoàn tất các bước trung gian SUBMITTED. */
function syncReviewStatus(permit: Permit): void {
  const pending = currentPendingLevel(permit);
  if (pending) {
    permit.currentApprovalLevel = pending;
    permit.status = LEVEL_TO_REVIEW_STATUS[pending];
  }
}

/** Cho phép sửa trường nghiệp vụ quan trọng? Chỉ khi DRAFT/RETURNED. */
export function isPermitFieldLocked(permit: Permit): boolean {
  return !['DRAFT', 'RETURNED'].includes(permit.status);
}

/** Tính lại toàn bộ chuỗi duyệt theo Approval Rule Engine hiện hành. */
export function rebuildChainForPermit(
  permit: Permit,
  rules?: ApprovalRule[]
): ApprovalStep[] {
  const hazardous = permit.workClassifications.includes('HIGH_RISK_AREA');
  const { chain } = buildApprovalChain(
    {
      permitType: permit.permitType,
      riskLevel: permit.riskLevel,
      areaHazardous: hazardous,
      criticalWork: permit.criticalWork,
      workClassifications: permit.workClassifications,
    },
    rules
  );
  return chain;
}

/* --------------------------------------------------------------------------
 * CÁC HÀM CHUYỂN ĐỔI
 * ----------------------------------------------------------------------- */

export function submitPermit(permit: Permit, ctx: TransitionContext): TransitionResult {
  if (!['DRAFT', 'RETURNED'].includes(permit.status)) {
    return { ok: false, error: `Chỉ permit ở trạng thái Nháp/Trả về mới được gửi. Hiện tại: ${permit.status}` };
  }
  const perm = checkPermission(ctx.role, 'SUBMIT');
  if (!perm.allowed) return { ok: false, error: perm.reason };

  const next: Permit = {
    ...permit,
    approvalChain: cloneChain(permit.approvalChain),
    statusHistory: [...permit.statusHistory],
    updatedAt: (ctx.now ?? new Date()).toISOString(),
  };
  // Chuỗi duyệt được TÍNH LẠI tại thời điểm submit theo rule hiện hành
  // (đề phòng Admin đổi matrix / phân loại công việc khi permit còn là bản nháp).
  next.approvalChain = rebuildChainForPermit(next);
  const first = currentPendingLevel(next);
  if (!first) return { ok: false, error: 'Chuỗi phê duyệt rỗng – kiểm tra lại Approval Rule Engine.' };
  next.currentApprovalLevel = first;
  next.status = LEVEL_TO_REVIEW_STATUS[first];
  next.statusHistory.push(
    historyEntry(next.statusHistory.length, permit.status, next.status, 'SUBMITTED', ctx, 'Gửi yêu cầu phê duyệt')
  );
  return { ok: true, permit: next };
}

/** Người dùng có đang ở đúng cấp & đúng vai trò để quyết không? */
function assertDecisionAuthority(
  permit: Permit,
  ctx: TransitionContext,
  action: 'APPROVE' | 'REJECT' | 'RETURN'
): AuthorizationResult & { level?: ApprovalLevel } {
  const level = REVIEW_STATUS_TO_LEVEL[permit.status];
  if (!level) {
    return { allowed: false, reason: `Permit không ở trạng thái chờ duyệt nào (hiện: ${permit.status}).` };
  }
  const perm = checkPermission(ctx.role, action);
  if (!perm.allowed) return perm;
  const roleLevel = approvalLevelOfRole(ctx.role);
  if (roleLevel !== level) {
    return {
      allowed: false,
      reason: `Hành động chỉ thuộc cấp ${level}. Vai trò ${ctx.role} không thể ${action} thay cấp khác (chống bypass).`,
    };
  }
  return { allowed: true, level };
}

export function approveAtCurrentLevel(permit: Permit, ctx: TransitionContext): TransitionResult {
  const auth = assertDecisionAuthority(permit, ctx, 'APPROVE');
  if (!auth.allowed || !auth.level) return { ok: false, error: auth.reason };
  const level = auth.level;

  const next: Permit = {
    ...permit,
    approvalChain: cloneChain(permit.approvalChain),
    statusHistory: [...permit.statusHistory],
  };
  const step = next.approvalChain.find((s) => s.level === level);
  if (!step || !step.required || step.status !== 'PENDING') {
    return { ok: false, error: 'Cấp duyệt không ở trạng thái chờ quyết.' };
  }
  step.status = 'DONE';
  step.decidedByUserId = ctx.userId;
  step.decidedByName = ctx.userName;
  step.decidedByRole = ctx.role;
  step.decision = 'APPROVE';
  step.comment = ctx.comment;
  step.decidedAt = (ctx.now ?? new Date()).toISOString();
  step.deviceIp = ctx.deviceIp;

  next.statusHistory.push(
    historyEntry(next.statusHistory.length, permit.status, permit.status, 'APPROVAL_DECISION', ctx, `${level} APPROVE`)
  );

  const stillPending = currentPendingLevel(next);
  if (stillPending) {
    syncReviewStatus(next);
  } else {
    // TOÀN BỘ cấp required đã DONE → chỉ khi đó mới được APPROVED/ISSUED.
    if (!hasValidGasTest(next, ctx.now ?? new Date())) {
      // Không cho phát hành nếu gas test hết hiệu lực / chưa đạt.
      step.status = 'PENDING';
      delete step.decidedByUserId;
      delete step.decidedByName;
      delete step.decidedByRole;
      delete step.decision;
      delete step.decidedAt;
      delete step.deviceIp;
      next.approvalChain = cloneChain(permit.approvalChain);
      next.statusHistory = [...permit.statusHistory];
      return {
        ok: false,
        error: 'Chưa có Gas Test PASS hợp lệ (đủ 4 thông số, máy còn hạn hiệu chuẩn, đo trong 60 phút) để phát hành permit.',
      };
    }
    next.currentApprovalLevel = null;
    next.status = 'APPROVED';
    next.approvedAt = (ctx.now ?? new Date()).toISOString();
    next.validUntil = next.plannedEnd;
    next.statusHistory.push(
      historyEntry(next.statusHistory.length, permit.status, 'APPROVED', 'ISSUED', ctx, 'Hoàn tất chuỗi duyệt – phát hành permit')
    );
  }
  next.updatedAt = (ctx.now ?? new Date()).toISOString();
  return { ok: true, permit: next };
}

export function rejectAtCurrentLevel(permit: Permit, ctx: TransitionContext): TransitionResult {
  const auth = assertDecisionAuthority(permit, ctx, 'REJECT');
  if (!auth.allowed || !auth.level) return { ok: false, error: auth.reason };
  const level = auth.level;
  const next: Permit = {
    ...permit,
    approvalChain: cloneChain(permit.approvalChain),
    statusHistory: [...permit.statusHistory],
  };
  const step = next.approvalChain.find((s) => s.level === level)!;
  step.status = 'REJECTED';
  step.decidedByUserId = ctx.userId;
  step.decidedByName = ctx.userName;
  step.decidedByRole = ctx.role;
  step.decision = 'REJECT';
  step.comment = ctx.comment ?? '';
  step.decidedAt = (ctx.now ?? new Date()).toISOString();
  step.deviceIp = ctx.deviceIp;
  next.currentApprovalLevel = null;
  next.status = 'REJECTED';
  next.updatedAt = (ctx.now ?? new Date()).toISOString();
  next.statusHistory.push(
    historyEntry(next.statusHistory.length, permit.status, 'REJECTED', 'REJECTED', ctx, `${level} REJECT – kết thúc luồng`)
  );
  return { ok: true, permit: next };
}

export function returnToApplicant(permit: Permit, ctx: TransitionContext): TransitionResult {
  const auth = assertDecisionAuthority(permit, ctx, 'RETURN');
  if (!auth.allowed) return { ok: false, error: auth.reason };
  const next: Permit = {
    ...permit,
    // RETURN: giữ nguyên các quyết định đã có; các cấp CHƯA duyệt (PENDING)
    // được reset để tính lại toàn bộ chuỗi khi applicant resubmit.
    approvalChain: cloneChain(permit.approvalChain),
    statusHistory: [...permit.statusHistory],
  };
  next.currentApprovalLevel = null;
  next.status = 'RETURNED';
  next.updatedAt = (ctx.now ?? new Date()).toISOString();
  next.statusHistory.push(
    historyEntry(next.statusHistory.length, permit.status, 'RETURNED', 'RETURNED', ctx, 'Trả về người yêu cầu bổ sung')
  );
  return { ok: true, permit: next };
}

export function startWork(permit: Permit, ctx: TransitionContext): TransitionResult {
  if (permit.status !== 'APPROVED') {
    return { ok: false, error: 'Chỉ permit APPROVED/ISSUED mới được bắt đầu thi công.' };
  }
  const perm = checkPermission(ctx.role, 'START_WORK');
  if (!perm.allowed) return { ok: false, error: perm.reason };
  const now = (ctx.now ?? new Date()).toISOString();
  if (new Date(now).getTime() > new Date(permit.plannedEnd).getTime()) {
    return { ok: false, error: 'Permit đã quá thời hạn hiệu lực – không thể bắt đầu thi công (chuyển EXPIRED).' };
  }
  const next: Permit = {
    ...permit,
    status: 'WORK_IN_PROGRESS',
    actualStart: now,
    updatedAt: now,
    statusHistory: [
      ...permit.statusHistory,
      historyEntry(permit.statusHistory.length, permit.status, 'WORK_IN_PROGRESS', 'WORK_STARTED', ctx, 'Bắt đầu thi công'),
    ],
  };
  return { ok: true, permit: next };
}

export function suspendPermit(permit: Permit, ctx: TransitionContext): TransitionResult {
  if (!['WORK_IN_PROGRESS', 'RESUMED', 'APPROVED'].includes(permit.status)) {
    return { ok: false, error: `Không thể đình chỉ permit ở trạng thái ${permit.status}.` };
  }
  const perm = checkPermission(ctx.role, 'SUSPEND');
  if (!perm.allowed) return { ok: false, error: perm.reason };
  const next: Permit = {
    ...permit,
    status: 'SUSPENDED',
    suspensionReason: ctx.comment ?? 'Không nêu lý do',
    updatedAt: (ctx.now ?? new Date()).toISOString(),
    statusHistory: [
      ...permit.statusHistory,
      historyEntry(permit.statusHistory.length, permit.status, 'SUSPENDED', 'SUSPENDED', ctx, ctx.comment ?? 'Đình chỉ công việc'),
    ],
  };
  return { ok: true, permit: next };
}

export function resumePermit(permit: Permit, ctx: TransitionContext): TransitionResult {
  if (permit.status !== 'SUSPENDED') {
    return { ok: false, error: 'Chỉ permit đang SUSPENDED mới được tiếp tục.' };
  }
  const perm = checkPermission(ctx.role, 'RESUME');
  if (!perm.allowed) return { ok: false, error: perm.reason };
  // An toàn: phải có gas test hợp lệ mới được tái khởi động đối với permit yêu cầu đo khí.
  if (!hasValidGasTest(permit, ctx.now ?? new Date())) {
    return { ok: false, error: 'Cần Gas Test PASS hợp lệ trước khi tiếp tục thi công.' };
  }
  const next: Permit = {
    ...permit,
    status: 'WORK_IN_PROGRESS',
    updatedAt: (ctx.now ?? new Date()).toISOString(),
    statusHistory: [
      ...permit.statusHistory,
      historyEntry(permit.statusHistory.length, permit.status, 'WORK_IN_PROGRESS', 'RESUMED', ctx, 'Tiếp tục thi công sau đình chỉ'),
    ],
  };
  return { ok: true, permit: next };
}

export function completeWork(permit: Permit, ctx: TransitionContext): TransitionResult {
  if (!['WORK_IN_PROGRESS', 'RESUMED'].includes(permit.status)) {
    return { ok: false, error: 'Chỉ permit đang thi công mới được xác nhận hoàn thành.' };
  }
  const perm = checkPermission(ctx.role, 'COMPLETE_WORK');
  if (!perm.allowed) return { ok: false, error: perm.reason };
  const next: Permit = {
    ...permit,
    status: 'WORK_COMPLETED',
    actualEnd: (ctx.now ?? new Date()).toISOString(),
    updatedAt: (ctx.now ?? new Date()).toISOString(),
    statusHistory: [
      ...permit.statusHistory,
      historyEntry(permit.statusHistory.length, permit.status, 'WORK_COMPLETED', 'WORK_COMPLETED', ctx, 'Công việc hoàn thành – chờ đóng permit'),
    ],
  };
  return { ok: true, permit: next };
}

export function closePermit(permit: Permit, ctx: TransitionContext): TransitionResult {
  if (permit.status !== 'WORK_COMPLETED') {
    return { ok: false, error: 'Chỉ permit WORK_COMPLETED mới được đóng (Close).' };
  }
  const perm = checkPermission(ctx.role, 'CLOSE');
  if (!perm.allowed) return { ok: false, error: perm.reason };
  const next: Permit = {
    ...permit,
    status: 'CLOSED',
    closureNotes: ctx.comment ?? 'Đóng permit theo quy trình',
    updatedAt: (ctx.now ?? new Date()).toISOString(),
    statusHistory: [
      ...permit.statusHistory,
      historyEntry(permit.statusHistory.length, permit.status, 'CLOSED', 'CLOSED', ctx, 'Đóng permit, thu hồi cách ly, bàn giao mặt bằng'),
    ],
  };
  return { ok: true, permit: next };
}

export function cancelPermit(permit: Permit, ctx: TransitionContext): TransitionResult {
  if (['CLOSED', 'CANCELLED', 'EXPIRED', 'REJECTED'].includes(permit.status)) {
    return { ok: false, error: 'Permit đã ở trạng thái kết thúc – không thể hủy.' };
  }
  const perm = checkPermission(ctx.role, 'CANCEL');
  if (!perm.allowed) return { ok: false, error: perm.reason };
  const next: Permit = {
    ...permit,
    status: 'CANCELLED',
    currentApprovalLevel: null,
    updatedAt: (ctx.now ?? new Date()).toISOString(),
    statusHistory: [
      ...permit.statusHistory,
      historyEntry(permit.statusHistory.length, permit.status, 'CANCELLED', 'CANCELLED', ctx, ctx.comment ?? 'Hủy permit'),
    ],
  };
  return { ok: true, permit: next };
}

/** Hệ thống tự động (hoặc controller manual): permit quá plannedEnd → EXPIRED. */
export function expireIfNeeded(permit: Permit, now: Date): TransitionResult {
  const liveForExpiry: PermitStatus[] = ['APPROVED', 'WORK_IN_PROGRESS', 'SUSPENDED', 'RESUMED'];
  if (!liveForExpiry.includes(permit.status)) return { ok: true, permit };
  if (new Date(permit.plannedEnd).getTime() > now.getTime()) return { ok: true, permit };
  const systemCtx: TransitionContext = {
    role: 'PERMIT_CONTROLLER',
    userId: 'SYSTEM',
    userName: 'Hệ thống (Auto-expire job)',
    deviceIp: '127.0.0.1',
    comment: 'Tự động hết hiệu lực theo Planned End Time',
    now,
  };
  const next: Permit = {
    ...permit,
    status: 'EXPIRED',
    updatedAt: now.toISOString(),
    statusHistory: [
      ...permit.statusHistory,
      historyEntry(permit.statusHistory.length, permit.status, 'EXPIRED', 'EXPIRED', systemCtx, 'Permit hết hiệu lực'),
    ],
  };
  return { ok: true, permit: next };
}

function historyEntry(
  sequence: number,
  fromStatus: PermitStatus,
  toStatus: PermitStatus,
  eventType: import('../types/domain').WorkflowEventType,
  ctx: TransitionContext,
  action: string
): import('../types/domain').StatusHistoryEntry {
  return {
    id: `H-${sequence}-${Date.now().toString(36)}`,
    sequence,
    fromStatus,
    toStatus,
    eventType,
    userId: ctx.userId,
    userName: ctx.userName,
    userRole: ctx.role,
    action,
    comment: ctx.comment,
    deviceIp: ctx.deviceIp,
    timestamp: (ctx.now ?? new Date()).toISOString(),
  };
}
