import { Permit, PermitType, SimOpsConflict, ConflictLevel } from '../types';

/**
 * Định nghĩa ma trận xung đột SIMOPS
 * Các công việc không thể diễn ra đồng thời tại cùng khu vực
 */
export const SIMOPS_MATRIX: Record<string, Record<string, ConflictLevel>> = {
  HOT_WORK: {
    HOT_WORK: 'WARNING',
    COLD_WORK: 'NONE',
    CONFINED_SPACE: 'BLOCK',
    RADIOGRAPHY: 'BLOCK',
    ELECTRICAL: 'WARNING'
  },
  COLD_WORK: {
    HOT_WORK: 'NONE',
    COLD_WORK: 'NONE',
    CONFINED_SPACE: 'WARNING',
    RADIOGRAPHY: 'WARNING',
    ELECTRICAL: 'NONE'
  },
  CONFINED_SPACE: {
    HOT_WORK: 'BLOCK',
    COLD_WORK: 'WARNING',
    CONFINED_SPACE: 'BLOCK',
    RADIOGRAPHY: 'BLOCK',
    ELECTRICAL: 'WARNING'
  },
  RADIOGRAPHY: {
    HOT_WORK: 'BLOCK',
    COLD_WORK: 'WARNING',
    CONFINED_SPACE: 'BLOCK',
    RADIOGRAPHY: 'BLOCK',
    ELECTRICAL: 'WARNING'
  },
  ELECTRICAL: {
    HOT_WORK: 'WARNING',
    COLD_WORK: 'NONE',
    CONFINED_SPACE: 'WARNING',
    RADIOGRAPHY: 'WARNING',
    ELECTRICAL: 'WARNING'
  }
};

/**
 * Kiểm tra xung đột SIMOPS giữa hai permit
 */
export function checkSimOpsConflict(
  permit1: Permit,
  permit2: Permit
): SimOpsConflict | null {
  // Không kiểm tra nếu cùng một permit
  if (permit1.id === permit2.id) {
    return null;
  }

  // Không kiểm tra nếu khác khu vực
  if (permit1.locationTag !== permit2.locationTag) {
    return null;
  }

  // Không kiểm tra nếu khoảng thời gian không trùng nhau
  const isTimeOverlap = 
    new Date(permit1.startTime) < new Date(permit2.endTime) &&
    new Date(permit2.startTime) < new Date(permit1.endTime);

  if (!isTimeOverlap) {
    return null;
  }

  // Chỉ kiểm tra các permit đang hoạt động
  const activeStatuses = ['SUBMITTED', 'VERIFIED_ISOLATED', 'REVIEWED', 'ISSUED', 'REVALIDATED'];
  if (!activeStatuses.includes(permit1.status) || !activeStatuses.includes(permit2.status)) {
    return null;
  }

  const conflictLevel = SIMOPS_MATRIX[permit1.type]?.[permit2.type] || 'NONE';

  if (conflictLevel === 'NONE') {
    return null;
  }

  const reason = getConflictReason(permit1.type, permit2.type, conflictLevel);

  return {
    permit1,
    permit2,
    conflictLevel,
    reason
  };
}

/**
 * Kiểm tra xung đột SIMOPS cho một permit với tất cả các permit khác
 */
export function checkSimOpsForPermit(
  permit: Permit,
  allPermits: Permit[]
): SimOpsConflict[] {
  const conflicts: SimOpsConflict[] = [];

  for (const otherPermit of allPermits) {
    const conflict = checkSimOpsConflict(permit, otherPermit);
    if (conflict) {
      // Tránh trùng lặp
      const exists = conflicts.some(
        c => (c.permit1.id === conflict.permit1.id && c.permit2.id === conflict.permit2.id) ||
             (c.permit1.id === conflict.permit2.id && c.permit2.id === conflict.permit1.id)
      );
      if (!exists) {
        conflicts.push(conflict);
      }
    }
  }

  return conflicts;
}

/**
 * Lấy mô tả lý do xung đột
 */
function getConflictReason(
  type1: PermitType,
  type2: PermitType,
  level: ConflictLevel
): string {
  const typeNames: Record<PermitType, string> = {
    HOT_WORK: 'Hot Work (Hàn cắt)',
    COLD_WORK: 'Cold Work (Công việc lạnh)',
    CONFINED_SPACE: 'Confined Space (Không gian kín)',
    RADIOGRAPHY: 'Radiography (Chụp ảnh phóng xạ)',
    ELECTRICAL: 'Electrical Work (Điện)'
  };

  if (level === 'BLOCK') {
    return `NGHIÊM CẤM: ${typeNames[type1]} và ${typeNames[type2]} không thể diễn ra đồng thời tại cùng khu vực.`;
  } else if (level === 'WARNING') {
    return `CẢNH BÁO: ${typeNames[type1]} và ${typeNames[type2]} cần biện pháp an toàn đặc biệt khi diễn ra đồng thời.`;
  }
  return '';
}

/**
 * Đánh giá mức độ ưu tiên dựa trên loại công việc và xung đột
 */
export function calculatePriority(
  permitType: PermitType,
  hasConflicts: boolean,
  isConfinedSpace: boolean,
  isHotWork: boolean
): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  if (isConfinedSpace && isHotWork) {
    return 'CRITICAL';
  }
  if (hasConflicts) {
    return 'HIGH';
  }
  if (permitType === 'HOT_WORK' || permitType === 'CONFINED_SPACE' || permitType === 'RADIOGRAPHY') {
    return 'HIGH';
  }
  if (permitType === 'ELECTRICAL') {
    return 'MEDIUM';
  }
  return 'LOW';
}
