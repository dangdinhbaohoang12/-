/**
 * ============================================================================
 * SIMOPS (SIMultaneous OPerations) CONFLICT ENGINE
 * ----------------------------------------------------------------------------
 * Phát hiện xung đột công việc đồng thời theo: Area + khoảng thời gian hiệu lực
 * + ma trận tương thích loại permit. Xung đột BLOCK phải được người có thẩm
 * quyền đánh giá & ghi nhận quyết định (acknowledge) trước khi submit.
 * ==========================================================================*/

import { Permit, PermitTypeCode, SimopsConflict } from '../types/domain';
import { ACTIVE_LIFECYCLE_STATUSES } from '../types/domain';

/** Ma trận tương thích SIMOPS: NONE < INFO < WARNING < BLOCK. */
export const SIMOPS_MATRIX: Record<PermitTypeCode, Partial<Record<PermitTypeCode, 'NONE' | 'INFO' | 'WARNING' | 'BLOCK'>>> = {
  HOT_WORK: { CONFINED_SPACE: 'BLOCK', RADIOGRAPHY: 'BLOCK', DIVING: 'BLOCK', ELECTRICAL: 'WARNING', LIFTING: 'WARNING', EXCAVATION: 'WARNING', HOT_WORK: 'WARNING', COLD_WORK: 'INFO', WORKING_AT_HEIGHT: 'WARNING' },
  CONFINED_SPACE: { HOT_WORK: 'BLOCK', RADIOGRAPHY: 'BLOCK', ELECTRICAL: 'WARNING', LIFTING: 'WARNING', CONFINED_SPACE: 'WARNING', EXCAVATION: 'WARNING', COLD_WORK: 'INFO', WORKING_AT_HEIGHT: 'INFO', DIVING: 'INFO' },
  RADIOGRAPHY: { HOT_WORK: 'BLOCK', CONFINED_SPACE: 'BLOCK', DIVING: 'BLOCK', WORKING_AT_HEIGHT: 'WARNING', ELECTRICAL: 'WARNING', LIFTING: 'WARNING', COLD_WORK: 'WARNING', EXCAVATION: 'WARNING', RADIOGRAPHY: 'WARNING' },
  ELECTRICAL: { HOT_WORK: 'WARNING', CONFINED_SPACE: 'WARNING', LIFTING: 'WARNING', EXCAVATION: 'WARNING', RADIOGRAPHY: 'WARNING', ELECTRICAL: 'INFO', COLD_WORK: 'INFO', WORKING_AT_HEIGHT: 'INFO', DIVING: 'INFO' },
  LIFTING: { HOT_WORK: 'WARNING', CONFINED_SPACE: 'WARNING', ELECTRICAL: 'WARNING', EXCAVATION: 'WARNING', RADIOGRAPHY: 'WARNING', WORKING_AT_HEIGHT: 'WARNING', LIFTING: 'WARNING', COLD_WORK: 'INFO', DIVING: 'INFO' },
  WORKING_AT_HEIGHT: { LIFTING: 'WARNING', HOT_WORK: 'WARNING', RADIOGRAPHY: 'WARNING', ELECTRICAL: 'INFO', EXCAVATION: 'INFO', COLD_WORK: 'INFO', CONFINED_SPACE: 'INFO', DIVING: 'INFO', WORKING_AT_HEIGHT: 'INFO' },
  EXCAVATION: { HOT_WORK: 'WARNING', CONFINED_SPACE: 'WARNING', ELECTRICAL: 'WARNING', LIFTING: 'WARNING', RADIOGRAPHY: 'WARNING', EXCAVATION: 'INFO', COLD_WORK: 'INFO', WORKING_AT_HEIGHT: 'INFO', DIVING: 'INFO' },
  DIVING: { HOT_WORK: 'BLOCK', RADIOGRAPHY: 'BLOCK', LIFTING: 'INFO', CONFINED_SPACE: 'INFO', ELECTRICAL: 'INFO', COLD_WORK: 'INFO', WORKING_AT_HEIGHT: 'INFO', EXCAVATION: 'INFO', DIVING: 'WARNING' },
  COLD_WORK: { RADIOGRAPHY: 'WARNING', HOT_WORK: 'INFO', CONFINED_SPACE: 'INFO', ELECTRICAL: 'INFO', LIFTING: 'INFO', WORKING_AT_HEIGHT: 'INFO', EXCAVATION: 'INFO', DIVING: 'INFO', COLD_WORK: 'NONE' },
};

function timeOverlap(a: Permit, b: Permit): { from: string; to: string } | null {
  const startA = new Date(a.plannedStart).getTime();
  const endA = new Date(a.plannedEnd).getTime();
  const startB = new Date(b.plannedStart).getTime();
  const endB = new Date(b.plannedEnd).getTime();
  const from = Math.max(startA, startB);
  const to = Math.min(endA, endB);
  if (from >= to) return null;
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
}

/**
 * Sinh mã xung đột tất định (deterministic) để phục vụ acknowledge:
 * cặp permit + khu vực, không phụ thuộc thứ tự truy vấn.
 */
export function conflictKey(a: Pick<Permit, 'id'>, b: Pick<Permit, 'id'>): string {
  const [x, y] = [a.id, b.id].sort();
  return `SIMOPS-${x}-${y}`;
}

const LEVEL_RANK: Record<'NONE' | 'INFO' | 'WARNING' | 'BLOCK', number> = {
  NONE: 0,
  INFO: 1,
  WARNING: 2,
  BLOCK: 3,
};

/** Tìm mọi xung đột SIMOPS của một permit ứng viên với các permit đang hoạt động. */
export function detectSimopsConflicts(candidate: Permit, allPermits: Permit[]): SimopsConflict[] {
  const conflicts: SimopsConflict[] = [];
  for (const other of allPermits) {
    if (other.id === candidate.id) continue;
    if (!ACTIVE_LIFECYCLE_STATUSES.includes(other.status)) continue;
    if (other.supersededByPermitId) continue;
    if (other.areaCode !== candidate.areaCode) continue;
    if (other.platformCode !== candidate.platformCode) continue;
    const overlap = timeOverlap(candidate, other);
    if (!overlap) continue;
    const level = SIMOPS_MATRIX[candidate.permitType]?.[other.permitType] ?? 'NONE';
    if (level === 'NONE') continue;
    conflicts.push({
      conflictId: conflictKey(candidate, other),
      permitA: { id: candidate.id, permitNumber: candidate.permitNumber, permitType: candidate.permitType },
      permitB: { id: other.id, permitNumber: other.permitNumber, permitType: other.permitType },
      areaCode: candidate.areaCode,
      overlapFrom: overlap.from,
      overlapTo: overlap.to,
      level,
      reason: `${candidate.permitType} ⚡ ${other.permitType} đồng thời tại ${candidate.areaName} (${other.permitNumber}) – mức ${level}.`,
    });
  }
  return conflicts.sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level]);
}

export function hasBlockingConflict(conflicts: SimopsConflict[]): boolean {
  return conflicts.some((c) => c.level === 'BLOCK');
}

/** Các xung đột BLOCK chưa được ghi nhận đánh giá bởi người có thẩm quyền. */
export function unacknowledgedBlockers(
  conflicts: SimopsConflict[],
  acknowledgedIds: string[]
): SimopsConflict[] {
  return conflicts.filter((c) => c.level === 'BLOCK' && !acknowledgedIds.includes(c.conflictId));
}
