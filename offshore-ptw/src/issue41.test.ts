import { describe, expect, it } from 'vitest';
import { canRecordGasTest } from './engine/gasTestEngine';
import { buildApprovalChain } from './engine/approvalRuleEngine';
import { getAvailableActions } from './services/authorizationService';
import { countUnreadNotifications, getUserNotifications } from './services/notificationService';
import { FILTERS } from './pages/PermitListPage';
import { STATUS_LABELS_EN, type AppNotification, type Permit, type UserAccount } from './types/domain';

function makePermit(overrides: Partial<Permit> = {}): Permit {
  return {
    id: 'P1',
    permitNumber: 'MT1-PTW-2026-000001',
    revisionNo: 0,
    platformCode: 'MT1',
    areaId: 'MT1-WHP',
    areaCode: 'WHP',
    areaName: 'Wellhead',
    permitType: 'COLD_WORK',
    riskLevel: 'LOW',
    workClassifications: ['ROUTINE'],
    criticalWork: false,
    equipmentTag: 'EQ-1',
    workDescription: 'Test',
    reasonForIssuing: 'Test',
    contractorCompany: 'Test',
    companyDepartment: 'Ops',
    applicantUserId: 'U1',
    applicantName: 'Applicant',
    supervisorUserId: 'U2',
    supervisorName: 'Supervisor',
    workOrderNo: '',
    priority: 'MEDIUM',
    plannedStart: '2026-09-26T08:00:00.000Z',
    plannedEnd: '2026-09-26T18:00:00.000Z',
    status: 'DRAFT',
    currentApprovalLevel: null,
    approvalChain: buildApprovalChain({
      permitType: 'COLD_WORK',
      riskLevel: 'LOW',
      areaHazardous: false,
      criticalWork: false,
      workClassifications: ['ROUTINE'],
    }).chain,
    requiresGasTest: false,
    gasTests: [],
    riskAssessments: [],
    lotoRecords: [],
    simopsAssessments: [],
    acknowledgedConflictIds: [],
    statusHistory: [],
    revisions: [],
    createdAt: '2026-09-26T08:00:00.000Z',
    updatedAt: '2026-09-26T08:00:00.000Z',
    createdById: 'U1',
    ...overrides,
  };
}

function makeUser(role: UserAccount['role']): UserAccount {
  return {
    id: 'U-' + role,
    username: role.toLowerCase(),
    fullName: role,
    role,
    platformCode: 'MT1',
    pinHash: '',
    active: true,
    mustChangePin: false,
    createdAt: '2026-09-26T08:00:00.000Z',
    createdByUserId: 'SYSTEM',
  };
}

function notification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: 'N1',
    recipientUserId: 'U1',
    permitId: 'P1',
    permitNumber: 'MT1-PTW-2026-000001',
    event: 'PTW_APPROVED',
    message: 'Permit đã được phát hành.',
    severity: 'INFO',
    createdAt: '2026-09-26T09:00:00.000Z',
    ...overrides,
  };
}

describe('Issue #41 UI/workflow synchronization regressions', () => {
  it('allows reference Gas Tests on non-required permits but never on terminal permits', () => {
    expect(canRecordGasTest(makePermit({ status: 'DRAFT' }))).toBe(true);
    expect(canRecordGasTest(makePermit({ status: 'APPROVED' }))).toBe(true);
    expect(canRecordGasTest(makePermit({ status: 'CANCELLED' }))).toBe(false);
    expect(canRecordGasTest(makePermit({ status: 'CLOSED' }))).toBe(false);
  });

  it('exposes CANCEL to an authorized role while preserving terminal-state denial', () => {
    const user = makeUser('OIM');
    expect(getAvailableActions(user, makePermit({ status: 'DRAFT' })).find((a) => a.action === 'CANCEL')).toMatchObject({ allowed: true });
    expect(getAvailableActions(user, makePermit({ status: 'CANCELLED' })).find((a) => a.action === 'CANCEL')).toMatchObject({ allowed: false });
  });

  it('includes every PermitStatus in the list filter', () => {
    const statuses = Object.keys(STATUS_LABELS_EN);
    expect(FILTERS).toHaveLength(statuses.length + 1);
    expect(FILTERS[0]).toBe('ALL');
    expect(new Set(FILTERS.slice(1))).toEqual(new Set(statuses));
  });

  it('shows only the current user notifications, newest first, with read state reflected', () => {
    const items = [
      notification({ id: 'N-old', createdAt: '2026-09-26T08:00:00.000Z', readAt: '2026-09-26T08:05:00.000Z' }),
      notification({ id: 'N-new', createdAt: '2026-09-26T10:00:00.000Z' }),
      notification({ id: 'N-other', recipientUserId: 'U2', createdAt: '2026-09-26T11:00:00.000Z' }),
    ];
    const mine = getUserNotifications(items, 'U1');
    expect(mine.map((item) => item.id)).toEqual(['N-new', 'N-old']);
    expect(countUnreadNotifications(mine)).toBe(1);
  });
});
