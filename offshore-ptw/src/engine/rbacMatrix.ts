/**
 * ============================================================================
 * RBAC PERMISSION MATRIX ENGINE
 * ----------------------------------------------------------------------------
 * Nguồn chân lý duy nhất (single source of truth) cho phân quyền.
 * Nguyên tắc an toàn (Safety-Critical Design):
 *  - DEFAULT DENY: hành động không được khai báo trong ma trận => bị từ chối.
 *  - ADMINISTRATOR tuyệt đối KHÔNG có quyền nghiệp vụ approval (không bypass).
 *  - Line Supervisor chỉ RECOMMEND, không APPROVE thay cấp trên.
 *  - Phê duyệt còn phải thỏa điều kiện workflow (xem authorizationService.ts).
 * ==========================================================================*/

import { AuthorizationResult, PermitAction, Role } from '../types/domain';

/** Ma trận vai trò -> tập hành động được phép. */
export const ROLE_PERMISSION_MATRIX: Readonly<Record<Role, ReadonlySet<PermitAction>>> = {
  OIM: new Set<PermitAction>([
    'CREATE',
    'EDIT_DRAFT',
    'DELETE_DRAFT',
    'SUBMIT',
    'REVIEW',
    'APPROVE',
    'RETURN',
    'REJECT',
    'START_WORK',
    'COMPLETE_WORK',
    'SUSPEND',
    'RESUME',
    'CANCEL',
    'CLOSE',
    'EXPIRE',
    'REQUEST_REVISION',
    'ADD_GAS_TEST',
    'MANAGE_USERS', // GIÀN TRƯỞNG là vai trò duy nhất được tạo tài khoản người dùng
    'VIEW_AUDIT',
  ]),

  DEPUTY_OIM: new Set<PermitAction>([
    'CREATE',
    'EDIT_DRAFT',
    'SUBMIT',
    'REVIEW',
    'APPROVE',
    'RETURN',
    'REJECT',
    'START_WORK',
    'COMPLETE_WORK',
    'SUSPEND',
    'CANCEL',
    'REQUEST_REVISION',
    'ADD_GAS_TEST',
    'VIEW_AUDIT',
  ]),

  FPS: new Set<PermitAction>([
    'CREATE',
    'EDIT_DRAFT',
    'SUBMIT',
    'REVIEW',
    'APPROVE',
    'RETURN',
    'REJECT',
    'START_WORK',
    'SUSPEND',
    'REQUEST_REVISION',
    'ADD_GAS_TEST',
    'VIEW_AUDIT',
  ]),

  LINE_SUPERVISOR: new Set<PermitAction>([
    'CREATE',
    'EDIT_DRAFT',
    'SUBMIT',
    'REVIEW',
    'RECOMMEND_APPROVE', // Chỉ khuyến nghị – không phải quyền Approve
    'RETURN',
    'REJECT',
    'START_WORK',
    'COMPLETE_WORK',
    'REQUEST_REVISION',
    'ADD_GAS_TEST',
  ]),

  PERMIT_APPLICANT: new Set<PermitAction>([
    'CREATE',
    'EDIT_DRAFT',
    'DELETE_DRAFT',
    'SUBMIT',
    'REQUEST_REVISION',
    'ADD_GAS_TEST',
  ]),

  PERMIT_CONTROLLER: new Set<PermitAction>([
    'CREATE',
    'EDIT_DRAFT',
    'SUBMIT',
    'REVIEW',
    'START_WORK',
    'COMPLETE_WORK',
    'SUSPEND',
    'RESUME',
    'CANCEL',
    'CLOSE',
    'EXPIRE',
    'REQUEST_REVISION',
    'ADD_GAS_TEST',
    'VIEW_AUDIT',
  ]),

  HSE: new Set<PermitAction>([
    'CREATE',
    'EDIT_DRAFT',
    'SUBMIT',
    'REVIEW',
    'SUSPEND',
    'REQUEST_REVISION',
    'ADD_GAS_TEST',
    'VIEW_AUDIT',
  ]),

  /**
   * Administrator: CHỈ cấu hình hệ thống.
   * Không CREATE/APPROVE/REJECT/SUSPEND/CANCEL/CLOSE – chống bypass workflow.
   */
  ADMINISTRATOR: new Set<PermitAction>(['CONFIGURE_WORKFLOW', 'VIEW_AUDIT']),
};

/** Những hành động mang tính "phê duyệt an toàn" – Admin không bao giờ có. */
export const SAFETY_CRITICAL_ACTIONS: ReadonlySet<PermitAction> = new Set<PermitAction>([
  'APPROVE',
  'REJECT',
  'RETURN',
  'RECOMMEND_APPROVE',
  'SUSPEND',
  'RESUME',
  'CANCEL',
  'CLOSE',
  'START_WORK',
  'COMPLETE_WORK',
]);

/** Tra cứu nhanh: vai trò có được phép thực hiện hành động (về mặt ma trận)? */
export function roleHasPermission(role: Role, action: PermitAction): boolean {
  return ROLE_PERMISSION_MATRIX[role]?.has(action) ?? false;
}

/** Kiểm tra và trả về kết quả kèm lý do phục vụ hiển thị UI / audit. */
export function checkPermission(role: Role, action: PermitAction): AuthorizationResult {
  if (!ROLE_PERMISSION_MATRIX[role]) {
    return { allowed: false, reason: `Vai trò không hợp lệ: ${role}` };
  }
  if (roleHasPermission(role, action)) {
    return { allowed: true };
  }
  if (action === 'MANAGE_USERS') {
    return {
      allowed: false,
      reason: 'Chỉ Giàn trưởng (OIM) mới có quyền quản lý tài khoản người dùng.',
    };
  }
  if (SAFETY_CRITICAL_ACTIONS.has(action) && role === 'ADMINISTRATOR') {
    return {
      allowed: false,
      reason:
        'Administrator bị cấm tham gia workflow phê duyệt an toàn (chống bypass theo thiết kế).',
    };
  }
  return { allowed: false, reason: `Vai trò ${role} không có quyền ${action} trong phân quyền.` };
}

/** Liệt kê toàn bộ quyền của một vai trò (dùng cho trang Admin xem ma trận). */
export function listPermissionsOfRole(role: Role): PermitAction[] {
  return Array.from(ROLE_PERMISSION_MATRIX[role] ?? []);
}
