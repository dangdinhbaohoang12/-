/**
 * ============================================================================
 * OFFSHORE PTW – Lõi định nghĩa miền nghiệp vụ (Domain Types) V1
 * Safety-Critical Permit To Work Management System
 * ============================================================================
 * Mọi enum / interface trong file này là "hợp đồng" giữa Frontend và Backend
 * (ASP.NET Core + SQL Server). Trạng thái workflow, vai trò RBAC và quyền
 * hành động được định nghĩa tập trung – KHÔNG hard-code phân tán.
 */

/* ---------------------------------------------------------------------------
 * 1. PHÂN QUYỀN (RBAC)
 * ------------------------------------------------------------------------- */

export type Role =
  | 'OIM' // Giàn trưởng – phê duyệt tối cao, quyền duy nhất cấp tài khoản
  | 'DEPUTY_OIM' // Giàn phó
  | 'FPS' // Field Production Supervisor
  | 'LINE_SUPERVISOR' // Giám sát trực tiếp
  | 'PERMIT_APPLICANT' // Người yêu cầu PTW
  | 'PERMIT_CONTROLLER' // PTW Coordinator
  | 'HSE' // An toàn – HSE
  | 'ADMINISTRATOR'; // Quản trị hệ thống – KHÔNG có quyền nghiệp vụ approval

export const ROLE_LABELS_VI: Record<Role, string> = {
  OIM: 'Giàn trưởng (OIM)',
  DEPUTY_OIM: 'Giàn phó (Deputy OIM)',
  FPS: 'Field Production Supervisor (FPS)',
  LINE_SUPERVISOR: 'Line Supervisor',
  PERMIT_APPLICANT: 'Người yêu cầu PTW',
  PERMIT_CONTROLLER: 'PTW Coordinator',
  HSE: 'An toàn (HSE)',
  ADMINISTRATOR: 'Quản trị hệ thống',
};

/** Các cấp duyệt tuần tự trong Approval Chain. */
export type ApprovalLevel = 'LINE_SUPERVISOR' | 'FPS' | 'DEPUTY_OIM' | 'OIM';

export const APPROVAL_LEVEL_ORDER: ApprovalLevel[] = [
  'LINE_SUPERVISOR',
  'FPS',
  'DEPUTY_OIM',
  'OIM',
];

export const APPROVAL_LEVEL_LABELS: Record<ApprovalLevel, string> = {
  LINE_SUPERVISOR: 'Line Supervisor',
  FPS: 'FPS',
  DEPUTY_OIM: 'Deputy OIM',
  OIM: 'OIM (Giàn trưởng)',
};

/** Hành động khả dụng trên một permit (động từ trong permission matrix). */
export type PermitAction =
  | 'CREATE'
  | 'EDIT_DRAFT'
  | 'DELETE_DRAFT'
  | 'SUBMIT'
  | 'REVIEW'
  | 'RECOMMEND_APPROVE'
  | 'APPROVE'
  | 'RETURN'
  | 'REJECT'
  | 'START_WORK'
  | 'COMPLETE_WORK'
  | 'SUSPEND'
  | 'RESUME'
  | 'CANCEL'
  | 'CLOSE'
  | 'EXPIRE'
  | 'REQUEST_REVISION'
  | 'ADD_GAS_TEST'
  | 'MANAGE_USERS'
  | 'CONFIGURE_WORKFLOW'
  | 'VIEW_AUDIT';

/* ---------------------------------------------------------------------------
 * 2. TRẠNG THÁI WORKFLOW
 * ------------------------------------------------------------------------- */

export type PermitStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'LINE_SUPERVISOR_REVIEW'
  | 'FPS_REVIEW'
  | 'DEPUTY_OIM_REVIEW'
  | 'OIM_REVIEW'
  | 'APPROVED'
  | 'WORK_IN_PROGRESS'
  | 'SUSPENDED'
  | 'RESUMED'
  | 'WORK_COMPLETED'
  | 'CLOSED'
  | 'REJECTED'
  | 'RETURNED'
  | 'CANCELLED'
  | 'EXPIRED';

export const STATUS_LABELS_VI: Record<PermitStatus, string> = {
  DRAFT: 'Bản nháp',
  SUBMITTED: 'Đã gửi',
  LINE_SUPERVISOR_REVIEW: 'Chờ Line Supervisor',
  FPS_REVIEW: 'Chờ FPS',
  DEPUTY_OIM_REVIEW: 'Chờ Deputy OIM',
  OIM_REVIEW: 'Chờ OIM phê duyệt',
  APPROVED: 'Đã phê duyệt / Phát hành',
  WORK_IN_PROGRESS: 'Đang thi công',
  SUSPENDED: 'Đình chỉ',
  RESUMED: 'Tiếp tục thi công',
  WORK_COMPLETED: 'Hoàn thành công việc',
  CLOSED: 'Đã đóng',
  REJECTED: 'Từ chối',
  RETURNED: 'Trả về người yêu cầu',
  CANCELLED: 'Hủy bỏ',
  EXPIRED: 'Hết hiệu lực',
};

export const STATUS_LABELS_EN: Record<PermitStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  LINE_SUPERVISOR_REVIEW: 'Line Supervisor Review',
  FPS_REVIEW: 'FPS Review',
  DEPUTY_OIM_REVIEW: 'Deputy OIM Review',
  OIM_REVIEW: 'OIM Approval',
  APPROVED: 'Approved / Issued',
  WORK_IN_PROGRESS: 'Work In Progress',
  SUSPENDED: 'Suspended',
  RESUMED: 'Resumed',
  WORK_COMPLETED: 'Work Completed',
  CLOSED: 'Closed',
  REJECTED: 'Rejected',
  RETURNED: 'Returned to Applicant',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
};

/** Trạng thái "kết thúc" – không còn thao tác nghiệp vụ nào ngoài xem/truy vết. */
export const TERMINAL_STATUSES: PermitStatus[] = ['CLOSED', 'CANCELLED', 'REJECTED', 'EXPIRED'];

/** Cho phép sửa lý lịch permit (phải qua Revision Request sau khi APPROVED). */
export const EDITABLE_STATUSES: PermitStatus[] = ['DRAFT', 'RETURNED'];

/** Permit đang "sống" – được tính vào dashboard, SIMOPS, cảnh báo hết hạn. */
export const ACTIVE_LIFECYCLE_STATUSES: PermitStatus[] = [
  'SUBMITTED',
  'LINE_SUPERVISOR_REVIEW',
  'FPS_REVIEW',
  'DEPUTY_OIM_REVIEW',
  'OIM_REVIEW',
  'APPROVED',
  'WORK_IN_PROGRESS',
  'SUSPENDED',
  'RESUMED',
  'WORK_COMPLETED',
];

/* ---------------------------------------------------------------------------
 * 3. DANH MỤC GIÀN / LOẠI CÔNG VIỆC / RỦI RO
 * ------------------------------------------------------------------------- */

export type PermitTypeCode =
  | 'HOT_WORK'
  | 'COLD_WORK'
  | 'CONFINED_SPACE'
  | 'ELECTRICAL'
  | 'WORKING_AT_HEIGHT'
  | 'LIFTING'
  | 'EXCAVATION'
  | 'DIVING'
  | 'RADIOGRAPHY';

export interface PermitTypeMeta {
  code: PermitTypeCode;
  labelVi: string;
  labelEn: string;
  icon: string;
  /** Nhóm phân loại công việc phục vụ Approval Rule Engine. */
  workClassifications: WorkClassification[];
  /** Loại permit bắt buộc đo khí trước khi phát hành / tái phát hành. */
  requiresGasTest: boolean;
}

export type WorkClassification =
  | 'ROUTINE'
  | 'NON_ROUTINE'
  | 'HOT_WORK'
  | 'CONFINED_SPACE'
  | 'CRITICAL'
  | 'HIGH_RISK_AREA';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export const RISK_LABELS_VI: Record<RiskLevel, string> = {
  LOW: 'Thấp (Routine)',
  MEDIUM: 'Trung bình',
  HIGH: 'Cao',
  CRITICAL: 'Đặc biệt nghiêm trọng',
};

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY';

export interface Platform {
  code: string; // MT1 | MT2 | HT
  name: string;
}

export interface Area {
  id: string;
  platformCode: string;
  code: string; // WHP | MODULE | UTILITY | CCR ...
  name: string;
  /** Khu vực nguy hiểm – nâng classification lên HIGH_RISK_AREA. */
  hazardous: boolean;
}

export interface EquipmentItem {
  id: string;
  tag: string; // VD: HT-1P Wellhead
  areaId: string;
  name: string;
}

/* ---------------------------------------------------------------------------
 * 4. PERMIT & REVISION
 * ------------------------------------------------------------------------- */

export type GasParameter = 'O2' | 'LEL' | 'H2S' | 'CO';

export type TestResult = 'PASS' | 'FAIL';

/** Một lần đo khí đầy đủ metadata – KHÔNG dùng ô nhập PASS/FAIL thô sơ. */
export interface GasTestRecord {
  id: string;
  sequenceNo: number;
  readings: Array<{
    parameter: GasParameter;
    value: number;
    unit: string;
    min?: number;
    max?: number;
    result: TestResult;
  }>;
  overallResult: TestResult;
  gasDetectorId: string;
  calibrationDueDate: string; // ISO date
  testedByUserId: string;
  testedByName: string;
  testedAt: string; // ISO timestamp
  location: string;
  notes?: string;
}

export interface RiskAssessmentRef {
  id: string;
  code: string; // RA-2026-00521
  kind: 'JSA' | 'JHA' | 'RA' | 'METHOD_STATEMENT' | 'TOOLBOX_TALK';
  title: string;
  link: string;
}

export interface LotoRef {
  id: string;
  code: string; // LOTO-2026-00123
  equipmentTags: string[];
  isolationCertificateCode?: string;
  appliedBy: string;
  verifiedBy?: string;
}

export interface SimopsRef {
  id: string;
  code: string;
  assessmentSummary: string;
  decision: 'PROCEED_WITH_CONTROLS' | 'DEFER' | 'REJECT';
  decidedByUserId: string;
  decidedAt: string;
}

export type ApprovalDecision =
  | 'RECOMMEND_APPROVE'
  | 'APPROVE'
  | 'RETURN'
  | 'REJECT'
  | 'N_A';

export type StepStatus = 'PENDING' | 'CURRENT' | 'DONE' | 'REJECTED' | 'NOT_REQUIRED';

/** Một bước trong chuỗi phê duyệt sinh ra từ Approval Rule Engine. */
export interface ApprovalStep {
  level: ApprovalLevel;
  status: StepStatus;
  required: boolean;
  decidedByUserId?: string;
  decidedByName?: string;
  decidedByRole?: Role;
  decision?: ApprovalDecision;
  comment?: string;
  signatureHash?: string;
  decidedAt?: string;
  deviceIp?: string;
}

export type WorkflowEventType =
  | 'CREATED'
  | 'UPDATED'
  | 'SUBMITTED'
  | 'APPROVAL_DECISION'
  | 'STEP_SKIPPED'
  | 'ISSUED'
  | 'WORK_STARTED'
  | 'SUSPENDED'
  | 'RESUMED'
  | 'WORK_COMPLETED'
  | 'CLOSED'
  | 'REJECTED'
  | 'RETURNED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'GAS_TEST_ADDED'
  | 'SIMOPS_CONFLICT_ACK'
  | 'REVISION_REQUESTED'
  | 'REVISION_CREATED';

/** Bản ghi bất biến của trạng thái (PermitStatusHistory + AuditLog hợp nhất UI). */
export interface StatusHistoryEntry {
  id: string;
  sequence: number;
  fromStatus: PermitStatus | null;
  toStatus: PermitStatus;
  eventType: WorkflowEventType;
  userId: string;
  userName: string;
  userRole: Role;
  action: string;
  comment?: string;
  deviceIp: string;
  oldValues?: Record<string, string>;
  newValues?: Record<string, string>;
  timestamp: string;
}

/** Revision snapshot – lưu nguyên vẹn Rev 0, Rev 1, Rev 2... khi re-approve. */
export interface PermitRevision {
  revisionNo: number; // 0, 1, 2...
  createdAt: string;
  createdByUserId: string;
  reason: string;
  snapshot: Permit;
}

export interface Permit {
  id: string;
  /** Mã duy nhất do hệ thống sinh: MT1-PTW-2026-000123. User KHÔNG được sửa. */
  permitNumber: string;
  revisionNo: number;
  parentPermitId?: string;
  revisionReason?: string;

  platformCode: string;
  permitType: PermitTypeCode;
  riskLevel: RiskLevel;
  workClassifications: WorkClassification[];
  criticalWork: boolean;

  areaId: string;
  areaCode: string;
  areaName: string;
  equipmentTag: string;
  workDescription: string;

  contractorCompany: string;
  companyDepartment: string;
  applicantUserId: string;
  applicantName: string;
  supervisorUserId: string;
  supervisorName: string;

  workOrderNo: string;
  priority: Priority;
  plannedStart: string;
  plannedEnd: string;
  actualStart?: string;
  actualEnd?: string;

  status: PermitStatus;
  currentApprovalLevel: ApprovalLevel | null;
  approvalChain: ApprovalStep[];

  requiresGasTest: boolean;
  gasTests: GasTestRecord[];
  riskAssessments: RiskAssessmentRef[];
  lotoRecords: LotoRef[];
  simopsAssessments: SimopsRef[];

  acknowledgedConflictIds: string[];
  statusHistory: StatusHistoryEntry[];
  revisions: PermitRevision[];

  createdAt: string;
  updatedAt: string;
  createdById: string;
}

/* ---------------------------------------------------------------------------
 * 5. NGƯỜI DÙNG / TÀI KHOẢN
 * ------------------------------------------------------------------------- */

export interface UserAccount {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  platformCode: string;
  email?: string;
  phone?: string;
  /** SHA-256 hex của PIN – hệ thống không bao giờ lưu PIN dạng thuần. */
  pinHash: string;
  active: boolean;
  mustChangePin: boolean;
  createdAt: string;
  createdByUserId: string;
  lastLoginAt?: string;
}

/* ---------------------------------------------------------------------------
 * 6. THÔNG BÁO
 * ------------------------------------------------------------------------- */

export type NotificationEvent =
  | 'NEW_PTW_SUBMITTED'
  | 'WAITING_FOR_YOUR_APPROVAL'
  | 'PTW_RETURNED'
  | 'PTW_REJECTED'
  | 'PTW_APPROVED'
  | 'PTW_EXPIRING_1H'
  | 'PTW_EXPIRED'
  | 'PTW_SUSPENDED'
  | 'PTW_RESUMED'
  | 'PTW_CANCELLED'
  | 'PTW_WORK_COMPLETED'
  | 'PTW_CLOSED'
  | 'SIMOPS_CONFLICT'
  | 'GAS_TEST_FAIL'
  | 'CALIBRATION_DUE';

export interface AppNotification {
  id: string;
  recipientUserId: string;
  permitId: string;
  permitNumber: string;
  event: NotificationEvent;
  message: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  createdAt: string;
  readAt?: string;
}

/* ---------------------------------------------------------------------------
 * 7. KẾT QUẢ ENGINE (không phải dữ liệu lưu trữ)
 * ------------------------------------------------------------------------- */

export interface AuthorizationResult {
  allowed: boolean;
  reason?: string;
}

export interface SimopsConflict {
  conflictId: string;
  permitA: Pick<Permit, 'id' | 'permitNumber' | 'permitType'>;
  permitB: Pick<Permit, 'id' | 'permitNumber' | 'permitType'>;
  areaCode: string;
  overlapFrom: string;
  overlapTo: string;
  level: 'BLOCK' | 'WARNING' | 'INFO';
  reason: string;
}
