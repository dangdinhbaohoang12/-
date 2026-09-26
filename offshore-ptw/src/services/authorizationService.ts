/**
 * ============================================================================
 * AUTHORIZATION SERVICE – Hợp nhất RBAC matrix + Workflow context cho UI/Store
 * ----------------------------------------------------------------------------
 * Trả về danh sách hành động KHẢ DỤNG THỰC TẾ cho (user, permit) hiện tại.
 * Component Sign-off chỉ cần render theo kết quả này => không thể có lỗi
 * "nút bấm sai quyền" ở frontend. Backend ASP.NET Core dùng lại đúng logic
 * chuyển đổi trong workflowStateMachine để enforce lần nữa (defense-in-depth).
 * ==========================================================================*/

import { AuthorizationResult, Permit, PermitAction, UserAccount } from '../types/domain';
import { checkPermission } from '../engine/rbacMatrix';
import {
  approvalLevelOfRole,
  currentPendingLevel,
} from '../engine/workflowStateMachine';
import { unacknowledgedBlockers } from '../engine/simopsEngine';
import { SimopsConflict } from '../types/domain';
import { canRecordGasTest } from '../engine/gasTestEngine';

export interface ActionAvailability {
  action: PermitAction;
  allowed: boolean;
  reason?: string;
}

const REVIEW_STATUSES = [
  'LINE_SUPERVISOR_REVIEW',
  'FPS_REVIEW',
  'DEPUTY_OIM_REVIEW',
  'OIM_REVIEW',
] as const;

/** Danh sách hành động khả dụng trên một permit với người dùng hiện tại. */
export function getAvailableActions(
  user: UserAccount,
  permit: Permit,
  conflicts: SimopsConflict[] = []
): ActionAvailability[] {
  const actions: PermitAction[] = [];

  // 1. Quyền nền tảng theo ma trận RBAC.
  const baseActions: PermitAction[] = [
    'SUBMIT',
    'APPROVE',
    'REJECT',
    'RETURN',
    'START_WORK',
    'SUSPEND',
    'RESUME',
    'COMPLETE_WORK',
    'CANCEL',
    'CLOSE',
    'REQUEST_REVISION',
    'ADD_GAS_TEST',
  ];
  for (const a of baseActions) {
    if (checkPermission(user.role, a).allowed) actions.push(a);
  }

  const results: ActionAvailability[] = actions.map((action) => ({
    action,
    allowed: false,
    reason: 'Không khả dụng ở trạng thái hiện tại.',
  }));

  const setAvail = (action: PermitAction, allowed: boolean, reason?: string) => {
    const item = results.find((r) => r.action === action);
    if (item) {
      item.allowed = allowed;
      item.reason = reason;
    }
  };

  const pending = currentPendingLevel(permit);
  const roleLevel = approvalLevelOfRole(user.role);
  const isUnderReview = (REVIEW_STATUSES as readonly string[]).includes(permit.status);

  // 2. Điều kiện workflow từng hành động.
  setAvail('SUBMIT', ['DRAFT', 'RETURNED'].includes(permit.status), 'Chỉ gửi được từ bản Nháp hoặc khi bị trả về.');
  if (['DRAFT', 'RETURNED'].includes(permit.status)) {
    setAvail('SUBMIT', true);
    if (unacknowledgedBlockers(conflicts, permit.acknowledgedConflictIds).length > 0) {
      setAvail('SUBMIT', false, 'Phải đánh giá & ghi nhận xung đột SIMOPS mức BLOCK trước khi gửi.');
    }
  }

  const decisionAllowed = isUnderReview && roleLevel !== null && roleLevel === pending;
  const decisionReason = !isUnderReview
    ? 'Permit không ở trạng thái chờ duyệt.'
    : roleLevel !== pending
      ? `Đang chờ cấp ${pending ?? '—'}. Vai trò của bạn không phải cấp quyết hiện tại (chống bypass).`
      : undefined;
  setAvail('APPROVE', decisionAllowed, decisionReason);
  setAvail('REJECT', decisionAllowed, decisionReason);
  setAvail('RETURN', decisionAllowed, decisionReason);

  setAvail('START_WORK', permit.status === 'APPROVED', 'Chỉ bắt đầu thi công khi permit đã APPROVED/ISSUED.');
  setAvail('SUSPEND', ['APPROVED', 'WORK_IN_PROGRESS', 'RESUMED'].includes(permit.status));
  setAvail('RESUME', permit.status === 'SUSPENDED');
  setAvail('COMPLETE_WORK', ['WORK_IN_PROGRESS', 'RESUMED'].includes(permit.status));
  setAvail('CLOSE', permit.status === 'WORK_COMPLETED');
  setAvail(
    'CANCEL',
    !['CLOSED', 'CANCELLED', 'EXPIRED', 'REJECTED'].includes(permit.status) &&
      (user.role === 'OIM' || user.role === 'DEPUTY_OIM' || user.role === 'PERMIT_CONTROLLER')
  );
  setAvail(
    'REQUEST_REVISION',
    ['APPROVED', 'WORK_IN_PROGRESS', 'SUSPENDED', 'RESUMED', 'WORK_COMPLETED'].includes(permit.status),
    'Chỉ permit đã phát hành mới cần Request Revision.'
  );
  // Gas Test is valid as a reference measurement even when the permit type
  // does not require it; terminal permits remain blocked.
  setAvail('ADD_GAS_TEST', canRecordGasTest(permit));

  return results;
}

/** Kiểm tra nhanh một hành động đơn lẻ (dùng trước khi gọi transition). */
export function canPerform(
  user: UserAccount,
  permit: Permit,
  action: PermitAction,
  conflicts: SimopsConflict[] = []
): AuthorizationResult {
  const found = getAvailableActions(user, permit, conflicts).find((a) => a.action === action);
  if (!found) {
    return checkPermission(user.role, action);
  }
  return { allowed: found.allowed, reason: found.reason };
}

/** Permit chỉ hiển thị toàn quyền cho các vai trò liên quan trực tiếp? 
 *  (Line Supervisor không thấy permit nhạy cảm ngoài phạm vi – lọc theo platform). */
export function canViewPermit(user: UserAccount, permit: Permit): boolean {
  if (user.role === 'ADMINISTRATOR') return false; // Admin không xem dữ liệu nghiệp vụ an toàn
  if (user.role === 'LINE_SUPERVISOR' || user.role === 'PERMIT_APPLICANT') {
    return permit.platformCode === user.platformCode;
  }
  return true;
}
