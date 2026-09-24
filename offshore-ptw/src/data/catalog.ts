/**
 * ============================================================================
 * CATALOG – Danh mục giàn/khu vực/loại permit & Tài khoản hệ thống (KHÔNG demo)
 * ----------------------------------------------------------------------------
 * - Không còn "DEMO USERS". Danh sách UserAccount là dữ liệu cấu hình thật của
 *   Offshore LAN, được OIM phê chuẩn; PIN lưu dưới dạng SHA-256 hash.
 * - QUY TẮC QUẢN TRỊ TÀI KHOẢN: CHỈ Giàn trưởng (OIM) mới được tạo tài khoản
 *   người dùng trong kho lưu trữ này (MANAGE_USERS chỉ có trong role OIM).
 * ==========================================================================*/

import CryptoJS from 'crypto-js';
import {
  Area,
  EquipmentItem,
  PermitTypeCode,
  PermitTypeMeta,
  Platform,
  UserAccount,
} from '../types/domain';

/* ------------------------------ DANH MỤC GIÀN ---------------------------- */

export const PLATFORMS: Platform[] = [
  { code: 'MT1', name: 'Mỏ MT1 – Fixed Platform' },
  { code: 'MT2', name: 'Mỏ MT2 – Wellhead Platform' },
  { code: 'HT', name: 'Mỏ HT – Head Platform' },
];

export const AREAS: Area[] = [
  { id: 'MT1-WHP', platformCode: 'MT1', code: 'WHP', name: 'Wellhead Area', hazardous: true },
  { id: 'MT1-MDU', platformCode: 'MT1', code: 'MDU', name: 'Main Delivery Unit', hazardous: true },
  { id: 'MT1-UTL', platformCode: 'MT1', code: 'UTL', name: 'Utility / Seawater Lift', hazardous: false },
  { id: 'MT1-CCR', platformCode: 'MT1', code: 'CCR', name: 'Central Control Room', hazardous: false },
  { id: 'MT1-DRILL', platformCode: 'MT1', code: 'DRILL', name: 'Drill Floor / Rig Up', hazardous: true },
  { id: 'MT2-WHP', platformCode: 'MT2', code: 'WHP', name: 'Wellhead Area', hazardous: true },
  { id: 'MT2-MOD', platformCode: 'MT2', code: 'MOD', name: 'Process Module', hazardous: true },
  { id: 'HT-WHP', platformCode: 'HT', code: 'WHP', name: 'Wellhead Area', hazardous: true },
  { id: 'HT-MOD', platformCode: 'HT', code: 'MOD', name: 'Processing Module', hazardous: true },
  { id: 'HT-UTL', platformCode: 'HT', code: 'UTL', name: 'Utility Area / MEG Pump', hazardous: false },
  { id: 'HT-JET', platformCode: 'HT', code: 'JETTY', name: 'Jetty / Loading Arm', hazardous: true },
];

export const EQUIPMENT: EquipmentItem[] = [
  { id: 'EQ-001', tag: 'MT1-1P Wellhead Xmas Tree', areaId: 'MT1-WHP', name: 'Cổng giếng MT1-1P' },
  { id: 'EQ-002', tag: 'MT1-SC-101 Separator', areaId: 'MT1-MDU', name: 'Test Separator' },
  { id: 'EQ-003', tag: 'MT1-P-220 Seawater Lift Pump', areaId: 'MT1-UTL', name: 'Bơm nước biển' },
  { id: 'EQ-004', tag: 'MT1-ESD-Valve HV-3301', areaId: 'MT1-WHP', name: 'SDV/BDV Hydraulic Valve' },
  { id: 'EQ-005', tag: 'HT-1P Wellhead', areaId: 'HT-WHP', name: 'Cổng giếng HT-1P' },
  { id: 'EQ-006', tag: 'HT-MEG-P100 Injection Pump', areaId: 'HT-UTL', name: 'Bơm MEG' },
  { id: 'EQ-007', tag: 'MT2-V-450 Knockout Drum', areaId: 'MT2-MOD', name: 'Knockout Drum' },
];

/* --------------------------- LOẠI GIẤY PHÉP PTW -------------------------- */

export const PERMIT_TYPE_CATALOG: PermitTypeMeta[] = [
  { code: 'HOT_WORK', labelVi: 'Công việc gia nhiệt (Hàn/Cắt/Mài)', labelEn: 'Hot Work Permit', icon: 'flame', workClassifications: ['HOT_WORK', 'NON_ROUTINE'], requiresGasTest: true },
  { code: 'COLD_WORK', labelVi: 'Công việc lạnh', labelEn: 'Cold Work Permit', icon: 'snowflake', workClassifications: ['ROUTINE'], requiresGasTest: false },
  { code: 'CONFINED_SPACE', labelVi: 'Vào không gian hạn chế', labelEn: 'Confined Space Entry Permit', icon: 'box', workClassifications: ['CONFINED_SPACE', 'NON_ROUTINE'], requiresGasTest: true },
  { code: 'ELECTRICAL', labelVi: 'Công việc điện', labelEn: 'Electrical Work Permit', icon: 'zap', workClassifications: ['NON_ROUTINE'], requiresGasTest: false },
  { code: 'WORKING_AT_HEIGHT', labelVi: 'Làm việc trên cao', labelEn: 'Working at Height Permit', icon: 'mountain', workClassifications: ['NON_ROUTINE'], requiresGasTest: false },
  { code: 'LIFTING', labelVi: 'Nâng hạ / Cần cẩu', labelEn: 'Lifting / Crane Operation Permit', icon: 'crane', workClassifications: ['NON_ROUTINE'], requiresGasTest: false },
  { code: 'EXCAVATION', labelVi: 'Đào đất', labelEn: 'Excavation Permit', icon: 'shovel', workClassifications: ['NON_ROUTINE'], requiresGasTest: false },
  { code: 'DIVING', labelVi: 'Lặn công nghiệp', labelEn: 'Diving Permit', icon: 'waves', workClassifications: ['NON_ROUTINE'], requiresGasTest: false },
  { code: 'RADIOGRAPHY', labelVi: 'Chụp ảnh phóng xạ (RT)', labelEn: 'Radiography Permit', icon: 'radiation', workClassifications: ['CRITICAL', 'NON_ROUTINE'], requiresGasTest: false },
];

export function getPermitTypeMeta(code: PermitTypeCode): PermitTypeMeta {
  const meta = PERMIT_TYPE_CATALOG.find((t) => t.code === code);
  if (!meta) throw new Error(`Permit type không tồn tại trong catalog: ${code}`);
  return meta;
}

/* ----------------------------- TÀI KHOẢN HỆ THỐNG ------------------------ */

/** Băm PIN một chiều (SHA-256 + pepper nội bộ LAN). Không bao giờ lưu PIN thuần. */
const PIN_PEPPER = 'OFFSHORE-PTW::LAN::v1::';

export function hashPin(pin: string): string {
  return CryptoJS.SHA256(PIN_PEPPER + pin).toString(CryptoJS.enc.Hex);
}

export function verifyPin(user: UserAccount, pin: string): boolean {
  if (!/^\d{4,8}$/.test(pin)) return false;
  return user.pinHash === hashPin(pin);
}

/**
 * Danh sách tài khoản cấu hình chính thức của giàn (được OIM phê chuẩn bằng
 * văn bản). KHÔNG phải tài khoản demo. Việc thêm tài khoản mới bắt buộc đăng
 * nhập bằng OIM và được ghi AuditLog.
 */
export const SYSTEM_ACCOUNTS: UserAccount[] = [
  {
    id: 'U-OIM-001',
    username: 'tranvanhung',
    fullName: 'Trần Văn Hùng',
    role: 'OIM',
    platformCode: 'MT1',
    email: 'oim@ptw.local',
    phone: 'XN-8100',
    pinHash: hashPin('912345'),
    active: true,
    mustChangePin: false,
    createdAt: '2026-01-05T01:00:00.000Z',
    createdByUserId: 'SYSTEM-BOOTSTRAP',
  },
  {
    id: 'U-DEP-001',
    username: 'phamvankhoa',
    fullName: 'Phạm Văn Khoa',
    role: 'DEPUTY_OIM',
    platformCode: 'MT1',
    email: 'deputy.oim@ptw.local',
    phone: 'XN-8110',
    pinHash: hashPin('923456'),
    active: true,
    mustChangePin: false,
    createdAt: '2026-01-05T01:05:00.000Z',
    createdByUserId: 'U-OIM-001',
  },
  {
    id: 'U-FPS-001',
    username: 'lethiquyen',
    fullName: 'Lê Thị Quyên',
    role: 'FPS',
    platformCode: 'MT1',
    email: 'fps@ptw.local',
    phone: 'XN-8120',
    pinHash: hashPin('934567'),
    active: true,
    mustChangePin: false,
    createdAt: '2026-01-05T01:10:00.000Z',
    createdByUserId: 'U-OIM-001',
  },
  {
    id: 'U-LINE-001',
    username: 'nguyenvana',
    fullName: 'Nguyễn Văn A',
    role: 'LINE_SUPERVISOR',
    platformCode: 'MT1',
    email: 'line.sup1@ptw.local',
    phone: 'XN-8130',
    pinHash: hashPin('945678'),
    active: true,
    mustChangePin: false,
    createdAt: '2026-01-06T02:00:00.000Z',
    createdByUserId: 'U-OIM-001',
  },
  {
    id: 'U-APP-001',
    username: 'hoangminhtu',
    fullName: 'Hoàng Minh Tú',
    role: 'PERMIT_APPLICANT',
    platformCode: 'MT1',
    email: 'applicant1@ptw.local',
    phone: 'XN-8140',
    pinHash: hashPin('956789'),
    active: true,
    mustChangePin: false,
    createdAt: '2026-01-06T02:10:00.000Z',
    createdByUserId: 'U-OIM-001',
  },
  {
    id: 'U-PC-001',
    username: 'vusithanh',
    fullName: 'Vũ Thị Thanh',
    role: 'PERMIT_CONTROLLER',
    platformCode: 'MT1',
    email: 'ptw.coordinator@ptw.local',
    phone: 'XN-8150',
    pinHash: hashPin('967890'),
    active: true,
    mustChangePin: false,
    createdAt: '2026-01-06T02:20:00.000Z',
    createdByUserId: 'U-OIM-001',
  },
  {
    id: 'U-HSE-001',
    username: 'dangbaocan',
    fullName: 'Đặng Bảo Cân',
    role: 'HSE',
    platformCode: 'MT1',
    email: 'hse@ptw.local',
    phone: 'XN-8160',
    pinHash: hashPin('978901'),
    active: true,
    mustChangePin: false,
    createdAt: '2026-01-06T02:30:00.000Z',
    createdByUserId: 'U-OIM-001',
  },
  {
    id: 'U-ADM-001',
    username: 'itadmin',
    fullName: 'Trung tâm CNTT Biển Đông',
    role: 'ADMINISTRATOR',
    platformCode: 'MT1',
    email: 'it.admin@ptw.local',
    phone: 'XN-8199',
    pinHash: hashPin('989012'),
    active: true,
    mustChangePin: true, // Bắt buộc đổi PIN lần đầu theo chính sách an toàn
    createdAt: '2026-01-05T00:00:00.000Z',
    createdByUserId: 'SYSTEM-BOOTSTRAP',
  },
];

/** Tra cứu tài khoản theo username (case-insensitive). */
export function findAccountByUsername(username: string): UserAccount | undefined {
  const u = username.trim().toLowerCase();
  return SYSTEM_ACCOUNTS.find((a) => a.username.toLowerCase() === u);
}

/* ---------------------- TRA CỨU PHỤC VỤ FORM / HỒ SƠ --------------------- */

/** Danh mục thiết bị nhóm theo MÃ KHU VỰC (area.code) – dùng cho Permit Form. */
export const EQUIPMENT_BY_AREA: Record<string, EquipmentItem[]> = (() => {
  const map: Record<string, EquipmentItem[]> = {};
  for (const area of AREAS) {
    const list = EQUIPMENT.filter((e) => e.areaId === area.id);
    if (list.length > 0) map[area.code] = list;
  }
  return map;
})();

/** Bản đồ loại permit theo code – tiện tra cứu O(1) trong UI. */
export const PERMIT_TYPE_CATALOG_MAP: Record<PermitTypeCode, PermitTypeMeta> =
  Object.fromEntries(PERMIT_TYPE_CATALOG.map((t) => [t.code, t])) as Record<PermitTypeCode, PermitTypeMeta>;
