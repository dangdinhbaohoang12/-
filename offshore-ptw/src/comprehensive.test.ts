import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_APPROVAL_RULES,
  buildApprovalChain,
  isChainComplete,
  nextRequiredLevel,
  resolveApprovalRule,
} from './engine/approvalRuleEngine';
import {
  GAS_SPECS,
  REQUIRED_GAS_PARAMETERS,
  computeOverallResult,
  evaluateReading,
  hasAllRequiredParameters,
  hasValidGasTest,
  isDetectorCalibrationValid,
} from './engine/gasTestEngine';
import {
  ROLE_PERMISSION_MATRIX,
  SAFETY_CRITICAL_ACTIONS,
  checkPermission,
  listPermissionsOfRole,
  roleHasPermission,
} from './engine/rbacMatrix';
import {
  SIMOPS_MATRIX,
  conflictKey,
  detectSimopsConflicts,
  hasBlockingConflict,
  unacknowledgedBlockers,
} from './engine/simopsEngine';
import {
  LEVEL_TO_REVIEW_STATUS,
  LEVEL_TO_ROLE,
  approvalLevelOfRole,
  approveAtCurrentLevel,
  cancelPermit,
  cloneChain,
  closePermit,
  completeWork,
  currentPendingLevel,
  expireIfNeeded,
  isPermitFieldLocked,
  rejectAtCurrentLevel,
  rebuildChainForPermit,
  resumePermit,
  startWork,
  submitPermit,
  suspendPermit,
  returnToApplicant,
} from './engine/workflowStateMachine';
import {
  canPerform,
  canViewPermit,
  getAvailableActions,
} from './services/authorizationService';
import {
  AREAS,
  EQUIPMENT,
  EQUIPMENT_BY_AREA,
  PERMIT_TYPE_CATALOG,
  PERMIT_TYPE_CATALOG_MAP,
  PLATFORMS,
  SYSTEM_ACCOUNTS,
  findAccountByUsername,
  getPermitTypeMeta,
  hashPin,
  verifyPin,
} from './data/catalog';
import { cn, formatDate, formatTimestamp, minutesUntil, toLocalInputValue } from './lib/utils';
import { RISK_TONE, STATUS_META } from './lib/statusMeta';
import type {
  GasTestRecord,
  Permit,
  Role,
  UserAccount,
} from './types/domain';

const NOW = new Date('2026-09-26T10:00:00.000Z');
const FUTURE = new Date('2026-09-26T12:00:00.000Z');

function makePermit(overrides: Partial<Permit> = {}): Permit {
  const base = {
    id: 'P-001',
    permitNumber: 'MT1-PTW-2026-000001',
    revisionNo: 0,
    platformCode: 'MT1',
    permitType: 'COLD_WORK' as const,
    riskLevel: 'LOW' as const,
    workClassifications: ['ROUTINE' as const],
    criticalWork: false,
    areaId: 'MT1-CCR',
    areaCode: 'CCR',
    areaName: 'Central Control Room',
    equipmentTag: 'MT1-ESD-Valve HV-3301',
    workDescription: 'Routine maintenance',
    reasonForIssuing: 'Planned maintenance',
    contractorCompany: 'Test Contractor',
    companyDepartment: 'Maintenance',
    applicantUserId: 'U-APP',
    applicantName: 'Applicant',
    applicantRole: 'PERMIT_APPLICANT' as const,
    supervisorUserId: 'U-LINE',
    supervisorName: 'Supervisor',
    workOrderNo: 'WO-001',
    priority: 'MEDIUM' as const,
    plannedStart: '2026-09-26T08:00:00.000Z',
    plannedEnd: '2026-09-26T18:00:00.000Z',
    status: 'DRAFT' as const,
    currentApprovalLevel: null,
    requiresGasTest: false,
    safetyChecklistConfirmed: [],
    gasTests: [],
    riskAssessments: [],
    lotoRecords: [],
    simopsAssessments: [],
    acknowledgedConflictIds: [],
    statusHistory: [],
    revisions: [],
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    createdById: 'U-APP',
  };

  const merged = { ...base, ...overrides };
  const derivedChain = buildApprovalChain({
    permitType: merged.permitType,
    riskLevel: merged.riskLevel,
    areaHazardous: merged.workClassifications.includes('HIGH_RISK_AREA'),
    criticalWork: merged.criticalWork,
    workClassifications: merged.workClassifications,
  }).chain;

  return { ...merged, approvalChain: overrides.approvalChain ?? derivedChain } as Permit;
}

function makeGasTest(overrides: Partial<GasTestRecord> = {}): GasTestRecord {
  const readings = [
    { parameter: 'O2' as const, value: 20.9, unit: '%v/v', min: 19.5, max: 23.5, result: 'PASS' as const },
    { parameter: 'LEL' as const, value: 0, unit: '%LEL', min: 0, max: 9.9, result: 'PASS' as const },
    { parameter: 'H2S' as const, value: 0, unit: 'ppm', min: 0, max: 4.9, result: 'PASS' as const },
    { parameter: 'CO' as const, value: 0, unit: 'ppm', min: 0, max: 24.9, result: 'PASS' as const },
  ];
  return {
    id: 'GT-001',
    sequenceNo: 1,
    readings,
    overallResult: 'PASS',
    gasDetectorId: 'GD-001',
    calibrationDueDate: '2026-09-26T10:30:00.000Z',
    testedByUserId: 'U-HSE',
    testedByName: 'HSE',
    testedAt: '2026-09-26T09:30:00.000Z',
    location: 'MT1-WHP',
    ...overrides,
  };
}

function makeUser(role: Role = 'PERMIT_APPLICANT', overrides: Partial<UserAccount> = {}): UserAccount {
  return {
    id: `U-${role}`,
    username: role.toLowerCase(),
    fullName: role,
    role,
    platformCode: 'MT1',
    pinHash: hashPin('1234'),
    active: true,
    mustChangePin: false,
    createdAt: NOW.toISOString(),
    createdByUserId: 'SYSTEM',
    ...overrides,
  };
}

function ctx(role: Role, userId = `U-${role}`, comment?: string) {
  return {
    role,
    userId,
    userName: role,
    deviceIp: '127.0.0.1',
    comment,
    now: NOW,
  };
}

describe('catalog invariants', () => {
  it('keeps platform, area and equipment references internally consistent', () => {
    const platformCodes = new Set(PLATFORMS.map((p) => p.code));
    expect(PLATFORMS).toHaveLength(3);
    expect(new Set(PLATFORMS.map((p) => p.code)).size).toBe(PLATFORMS.length);

    for (const area of AREAS) {
      expect(platformCodes.has(area.platformCode)).toBe(true);
      expect(area.id.startsWith(`${area.platformCode}-`)).toBe(true);
    }

    const areaIds = new Set(AREAS.map((a) => a.id));
    for (const equipment of EQUIPMENT) {
      expect(areaIds.has(equipment.areaId)).toBe(true);
    }

    for (const [areaId, equipment] of Object.entries(EQUIPMENT_BY_AREA)) {
      expect(areaIds.has(areaId)).toBe(true);
      expect(equipment.every((item) => item.areaId === areaId)).toBe(true);
    }
  });

  it('has one metadata record and map entry for every permit type', () => {
    expect(PERMIT_TYPE_CATALOG).toHaveLength(9);
    expect(new Set(PERMIT_TYPE_CATALOG.map((p) => p.code)).size).toBe(PERMIT_TYPE_CATALOG.length);

    for (const meta of PERMIT_TYPE_CATALOG) {
      expect(PERMIT_TYPE_CATALOG_MAP[meta.code]).toBe(meta);
      expect(meta.validityHours).toBeGreaterThan(0);
      expect(meta.checklist.length).toBeGreaterThan(0);
      expect(meta.checklist.some((item) => item.required)).toBe(true);
    }

    expect(getPermitTypeMeta('HOT_WORK').requiresGasTest).toBe(true);
    expect(getPermitTypeMeta('COLD_WORK').requiresGasTest).toBe(false);
    expect(() => getPermitTypeMeta('NOT_A_REAL_TYPE' as never)).toThrow();
  });

  it('finds accounts case-insensitively and preserves unique usernames', () => {
    const usernames = SYSTEM_ACCOUNTS.map((account) => account.username);
    expect(new Set(usernames).size).toBe(usernames.length);
    expect(findAccountByUsername('  TrAnVaNhUnG ')).toEqual(
      expect.objectContaining({ username: 'tranvanhung', role: 'OIM' }),
    );
    expect(findAccountByUsername('does-not-exist')).toBeUndefined();
  });

  it('uses deterministic salted PIN hashes and verifies only valid PIN formats', () => {
    expect(hashPin('1234')).toBe(hashPin('1234'));
    expect(hashPin('1234')).not.toBe(hashPin('12345'));

    const user = makeUser();
    expect(verifyPin(user, '1234')).toBe(true);
    expect(verifyPin(user, '9999')).toBe(false);
    expect(verifyPin(user, '123')).toBe(false);
    expect(verifyPin(user, '123456789')).toBe(false);
  });
});

describe('gas test engine', () => {
  it('accepts and rejects every configured boundary correctly', () => {
    expect(REQUIRED_GAS_PARAMETERS).toEqual(['O2', 'LEL', 'H2S', 'CO']);

    expect(evaluateReading('O2', 19.5)).toBe('PASS');
    expect(evaluateReading('O2', 23.5)).toBe('PASS');
    expect(evaluateReading('O2', 19.49)).toBe('FAIL');
    expect(evaluateReading('O2', 23.51)).toBe('FAIL');

    expect(evaluateReading('LEL', 0)).toBe('PASS');
    expect(evaluateReading('LEL', 9.9)).toBe('PASS');
    expect(evaluateReading('LEL', 9.91)).toBe('FAIL');

    expect(evaluateReading('H2S', 0)).toBe('PASS');
    expect(evaluateReading('H2S', 4.9)).toBe('PASS');
    expect(evaluateReading('H2S', 5)).toBe('FAIL');

    expect(evaluateReading('CO', 24.9)).toBe('PASS');
    expect(evaluateReading('CO', 25)).toBe('FAIL');
    expect(evaluateReading('O2', Number.NaN)).toBe('FAIL');
    expect(evaluateReading('O2', Number.POSITIVE_INFINITY)).toBe('FAIL');

    expect(GAS_SPECS.O2.unit).toBe('%v/v');
    expect(GAS_SPECS.LEL.unit).toBe('%LEL');
    expect(GAS_SPECS.H2S.unit).toBe('ppm');
    expect(GAS_SPECS.CO.unit).toBe('ppm');
  });

  it('validates calibration dates including invalid timestamps', () => {
    expect(isDetectorCalibrationValid('2026-09-26T10:00:00.000Z', '2026-09-26T10:00:00.000Z')).toBe(true);
    expect(isDetectorCalibrationValid('2026-09-26T09:59:59.999Z', '2026-09-26T10:00:00.000Z')).toBe(false);
    expect(isDetectorCalibrationValid('not-a-date', NOW.toISOString())).toBe(false);
    expect(isDetectorCalibrationValid('2026-09-26T11:00:00.000Z', 'not-a-date')).toBe(false);
  });

  it('computes overall results from calibration and readings', () => {
    const valid = makeGasTest();
    expect(
      computeOverallResult({
        readings: valid.readings,
        calibrationDueDate: valid.calibrationDueDate,
        testedAt: valid.testedAt,
      }),
    ).toBe('PASS');

    expect(
      computeOverallResult({
        readings: [{ parameter: 'O2', value: 18 }],
        calibrationDueDate: valid.calibrationDueDate,
        testedAt: valid.testedAt,
      }),
    ).toBe('FAIL');

    expect(
      computeOverallResult({
        readings: [],
        calibrationDueDate: valid.calibrationDueDate,
        testedAt: valid.testedAt,
      }),
    ).toBe('FAIL');

    expect(
      computeOverallResult({
        readings: valid.readings,
        calibrationDueDate: '2026-09-26T09:00:00.000Z',
        testedAt: valid.testedAt,
      }),
    ).toBe('FAIL');
  });

  it('requires all four unique gas parameters', () => {
    expect(hasAllRequiredParameters(makeGasTest().readings)).toBe(true);
    expect(hasAllRequiredParameters(makeGasTest().readings.slice(0, 3))).toBe(false);
    expect(
      hasAllRequiredParameters([
        ...makeGasTest().readings,
        { parameter: 'O2', value: 21, unit: '%v/v' },
      ]),
    ).toBe(true);
  });

  it('handles permit-level valid gas-test checks', () => {
    const good = makeGasTest();
    const permit = { requiresGasTest: true, gasTests: [good] };
    expect(hasValidGasTest(permit, NOW)).toBe(true);
    expect(hasValidGasTest({ requiresGasTest: false, gasTests: [] }, NOW)).toBe(true);

    expect(hasValidGasTest(
      { requiresGasTest: true, gasTests: [makeGasTest({ overallResult: 'FAIL' })] },
      NOW,
    )).toBe(false);

    expect(hasValidGasTest(
      { requiresGasTest: true, gasTests: [makeGasTest({
        readings: makeGasTest().readings.slice(0, 3),
      })] },
      NOW,
    )).toBe(false);

    expect(hasValidGasTest(
      { requiresGasTest: true, gasTests: [makeGasTest({
        calibrationDueDate: '2026-09-26T09:00:00.000Z',
      })] },
      NOW,
    )).toBe(false);

    expect(hasValidGasTest(
      { requiresGasTest: true, gasTests: [makeGasTest({
        testedAt: '2026-09-26T08:59:00.000Z',
      })] },
      NOW,
    )).toBe(false);

    expect(hasValidGasTest(
      { requiresGasTest: true, gasTests: [makeGasTest({
        testedAt: '2026-09-26T10:01:00.000Z',
      })] },
      NOW,
    )).toBe(false);
  });
});

describe('approval rule engine', () => {
  it('selects the highest-priority matching rule', () => {
    const result = resolveApprovalRule({
      permitType: 'HOT_WORK',
      riskLevel: 'HIGH',
      areaHazardous: true,
      criticalWork: true,
      workClassifications: ['HOT_WORK', 'NON_ROUTINE', 'HIGH_RISK_AREA'],
    });
    expect(result.id).toBe('RULE-CRITICAL');
  });

  it('falls back safely when no rules exist', () => {
    const result = resolveApprovalRule({
      permitType: 'COLD_WORK',
      riskLevel: 'LOW',
      areaHazardous: false,
      criticalWork: false,
      workClassifications: ['ROUTINE'],
    }, []);
    expect(result.id).toBe('RULE-FALLBACK-SAFE');
    expect(result.require).toEqual(['LINE_SUPERVISOR', 'FPS', 'DEPUTY_OIM', 'OIM']);
  });

  it.each([
    ['LOW', ['LINE_SUPERVISOR', 'FPS'], 'ROUTINE-LOW'],
    ['MEDIUM', ['LINE_SUPERVISOR', 'FPS', 'DEPUTY_OIM'], 'MEDIUM'],
    ['HIGH', ['LINE_SUPERVISOR', 'FPS', 'DEPUTY_OIM', 'OIM'], 'HIGH-RISK'],
  ] as const)('builds the expected chain for %s risk', (riskLevel, expectedLevels) => {
    const { chain } = buildApprovalChain({
      permitType: 'COLD_WORK',
      riskLevel,
      areaHazardous: false,
      criticalWork: false,
      workClassifications: riskLevel === 'LOW' ? ['ROUTINE'] : ['NON_ROUTINE'],
    });
    expect(chain.filter((s) => s.required).map((s) => s.level)).toEqual(expectedLevels);
    expect(chain.filter((s) => s.required).every((s) => s.status === 'PENDING')).toBe(true);
    expect(chain.filter((s) => !s.required).every((s) => s.status === 'NOT_REQUIRED')).toBe(true);
  });

  it('handles the chain helpers and preserves required completion semantics', () => {
    const chain = buildApprovalChain({
      permitType: 'COLD_WORK',
      riskLevel: 'MEDIUM',
      areaHazardous: false,
      criticalWork: false,
      workClassifications: ['NON_ROUTINE'],
    }).chain;
    expect(nextRequiredLevel(chain)).toBe('LINE_SUPERVISOR');
    expect(isChainComplete(chain)).toBe(false);

    const done = chain.map((step) =>
      step.required ? { ...step, status: 'DONE' as const } : step,
    );
    expect(nextRequiredLevel(done)).toBeNull();
    expect(isChainComplete(done)).toBe(true);

    const rejected = chain.map((step) =>
      step.required ? { ...step, status: 'REJECTED' as const } : step,
    );
    expect(isChainComplete(rejected)).toBe(true);
  });
});

describe('RBAC permission matrix', () => {
  it('enforces key permissions for every operational role', () => {
    expect(roleHasPermission('OIM', 'MANAGE_USERS')).toBe(true);
    expect(roleHasPermission('DEPUTY_OIM', 'APPROVE')).toBe(true);
    expect(roleHasPermission('FPS', 'APPROVE')).toBe(true);
    expect(roleHasPermission('LINE_SUPERVISOR', 'RECOMMEND_APPROVE')).toBe(true);
    expect(roleHasPermission('LINE_SUPERVISOR', 'APPROVE')).toBe(false);
    expect(roleHasPermission('PERMIT_APPLICANT', 'DELETE_DRAFT')).toBe(true);
    expect(roleHasPermission('PERMIT_CONTROLLER', 'CLOSE')).toBe(true);
    expect(roleHasPermission('HSE', 'VIEW_AUDIT')).toBe(true);
  });

  it('keeps Administrator limited to configuration/audit and denies safety bypass', () => {
    expect(ROLE_PERMISSION_MATRIX.ADMINISTRATOR).toEqual(
      new Set(['CONFIGURE_WORKFLOW', 'VIEW_AUDIT']),
    );

    for (const action of SAFETY_CRITICAL_ACTIONS) {
      expect(checkPermission('ADMINISTRATOR', action).allowed).toBe(false);
    }

    expect(checkPermission('ADMINISTRATOR', 'MANAGE_USERS')).toEqual({
      allowed: false,
      reason: 'Chỉ Giàn trưởng (OIM) mới có quyền quản lý tài khoản người dùng.',
    });

    expect(checkPermission('NOT_A_ROLE' as Role, 'CREATE')).toEqual({
      allowed: false,
      reason: 'Vai trò không hợp lệ: NOT_A_ROLE',
    });
  });

  it('returns complete permission lists without duplicates', () => {
    for (const role of Object.keys(ROLE_PERMISSION_MATRIX) as Role[]) {
      const permissions = listPermissionsOfRole(role);
      expect(new Set(permissions).size).toBe(permissions.length);
    }
    expect(listPermissionsOfRole('ADMINISTRATOR')).toEqual(['CONFIGURE_WORKFLOW', 'VIEW_AUDIT']);
  });
});

describe('SIMOPS conflict engine', () => {
  it('generates order-independent conflict keys', () => {
    expect(conflictKey({ id: 'A' }, { id: 'B' })).toBe('SIMOPS-A-B');
    expect(conflictKey({ id: 'B' }, { id: 'A' })).toBe('SIMOPS-A-B');
  });

  it('detects only active, same-platform, same-area, overlapping conflicts', () => {
    const candidate = makePermit({
      id: 'P-CANDIDATE',
      permitNumber: 'CAND',
      permitType: 'HOT_WORK',
      riskLevel: 'HIGH',
      workClassifications: ['HOT_WORK', 'NON_ROUTINE'],
      areaCode: 'WHP',
      areaId: 'MT1-WHP',
      areaName: 'Wellhead Area',
      status: 'DRAFT',
      platformCode: 'MT1',
      plannedStart: '2026-09-26T09:00:00.000Z',
      plannedEnd: '2026-09-26T12:00:00.000Z',
      requiresGasTest: true,
    });

    const blocker = makePermit({
      id: 'P-BLOCK',
      permitNumber: 'BLOCK',
      permitType: 'CONFINED_SPACE',
      areaCode: 'WHP',
      areaId: 'MT1-WHP',
      areaName: 'Wellhead Area',
      platformCode: 'MT1',
      status: 'APPROVED',
      plannedStart: '2026-09-26T10:00:00.000Z',
      plannedEnd: '2026-09-26T11:00:00.000Z',
      requiresGasTest: true,
    });

    const warning = makePermit({
      id: 'P-WARN',
      permitNumber: 'WARN',
      permitType: 'ELECTRICAL',
      areaCode: 'WHP',
      areaId: 'MT1-WHP',
      areaName: 'Wellhead Area',
      platformCode: 'MT1',
      status: 'WORK_IN_PROGRESS',
      plannedStart: '2026-09-26T09:30:00.000Z',
      plannedEnd: '2026-09-26T13:00:00.000Z',
    });

    const ignoredInactive = makePermit({
      id: 'P-INACTIVE',
      permitType: 'RADIOGRAPHY',
      areaCode: 'WHP',
      platformCode: 'MT1',
      status: 'CLOSED',
      plannedStart: '2026-09-26T09:00:00.000Z',
      plannedEnd: '2026-09-26T11:00:00.000Z',
    });

    const ignoredPlatform = makePermit({
      id: 'P-PLATFORM',
      permitType: 'CONFINED_SPACE',
      areaCode: 'WHP',
      platformCode: 'MT2',
      status: 'APPROVED',
      plannedStart: '2026-09-26T10:00:00.000Z',
      plannedEnd: '2026-09-26T11:00:00.000Z',
    });

    const ignoredArea = makePermit({
      id: 'P-AREA',
      permitType: 'CONFINED_SPACE',
      areaCode: 'CCR',
      platformCode: 'MT1',
      status: 'APPROVED',
      plannedStart: '2026-09-26T10:00:00.000Z',
      plannedEnd: '2026-09-26T11:00:00.000Z',
    });

    const ignoredNoOverlap = makePermit({
      id: 'P-TIME',
      permitType: 'CONFINED_SPACE',
      areaCode: 'WHP',
      platformCode: 'MT1',
      status: 'APPROVED',
      plannedStart: '2026-09-26T12:00:00.000Z',
      plannedEnd: '2026-09-26T13:00:00.000Z',
    });

    const ignoredSuperseded = makePermit({
      id: 'P-SUPERSEDED',
      permitType: 'CONFINED_SPACE',
      areaCode: 'WHP',
      platformCode: 'MT1',
      status: 'APPROVED',
      supersededByPermitId: 'P-NEW',
      plannedStart: '2026-09-26T10:00:00.000Z',
      plannedEnd: '2026-09-26T11:00:00.000Z',
    });

    const conflicts = detectSimopsConflicts(candidate, [
      candidate,
      blocker,
      warning,
      ignoredInactive,
      ignoredPlatform,
      ignoredArea,
      ignoredNoOverlap,
      ignoredSuperseded,
    ]);

    expect(conflicts).toHaveLength(2);
    expect(conflicts[0].level).toBe('BLOCK');
    expect(conflicts[1].level).toBe('WARNING');
    expect(conflicts[0].conflictId).toBe(conflictKey(candidate, blocker));
    expect(hasBlockingConflict(conflicts)).toBe(true);
    expect(unacknowledgedBlockers(conflicts, [conflicts[0].conflictId])).toEqual([]);
  });

  it('skips NONE matrix entries while accepting documented combinations', () => {
    expect(SIMOPS_MATRIX.COLD_WORK.COLD_WORK).toBe('NONE');
    const a = makePermit({ id: 'A', permitType: 'COLD_WORK', areaCode: 'CCR', status: 'APPROVED' });
    const b = makePermit({ id: 'B', permitType: 'COLD_WORK', areaCode: 'CCR', status: 'APPROVED' });
    expect(detectSimopsConflicts(a, [b])).toEqual([]);
    expect(SIMOPS_MATRIX.HOT_WORK.CONFINED_SPACE).toBe('BLOCK');
    expect(SIMOPS_MATRIX.HOT_WORK.ELECTRICAL).toBe('WARNING');
  });
});

describe('workflow state machine', () => {
  beforeEach(() => {
    // Keep this suite deterministic: all transition timestamps are pinned to NOW.
  });

  it('maps approval levels to roles and review statuses', () => {
    expect(approvalLevelOfRole('LINE_SUPERVISOR')).toBe('LINE_SUPERVISOR');
    expect(approvalLevelOfRole('FPS')).toBe('FPS');
    expect(approvalLevelOfRole('DEPUTY_OIM')).toBe('DEPUTY_OIM');
    expect(approvalLevelOfRole('OIM')).toBe('OIM');
    expect(approvalLevelOfRole('HSE')).toBeNull();

    expect(LEVEL_TO_ROLE.OIM).toBe('OIM');
    expect(LEVEL_TO_REVIEW_STATUS.OIM).toBe('OIM_REVIEW');
  });

  it('submits only draft/returned permits and rebuilds the approval chain', () => {
    const permit = makePermit();
    const result = submitPermit(permit, ctx('PERMIT_APPLICANT'));
    expect(result.ok).toBe(true);
    expect(result.permit?.status).toBe('LINE_SUPERVISOR_REVIEW');
    expect(result.permit?.currentApprovalLevel).toBe('LINE_SUPERVISOR');
    expect(result.permit?.statusHistory.at(-1)?.eventType).toBe('SUBMITTED');
    expect(permit.status).toBe('DRAFT');

    expect(submitPermit(makePermit({ status: 'APPROVED' }), ctx('PERMIT_APPLICANT')).ok).toBe(false);
    expect(submitPermit(makePermit(), ctx('ADMINISTRATOR')).ok).toBe(false);
  });

  it('rejects an approval from the wrong level and accepts the correct level', () => {
    const permit = submitPermit(makePermit({ riskLevel: 'MEDIUM', workClassifications: ['NON_ROUTINE'] }), ctx('PERMIT_APPLICANT')).permit!;
    const wrong = approveAtCurrentLevel(permit, ctx('FPS'));
    expect(wrong.ok).toBe(false);
    expect(wrong.error).toContain('chống bypass');

    const right = approveAtCurrentLevel(permit, ctx('LINE_SUPERVISOR', 'U-LINE', 'Looks good'));
    expect(right.ok).toBe(true);
    expect(right.permit?.status).toBe('FPS_REVIEW');
    expect(right.permit?.currentApprovalLevel).toBe('FPS');
    expect(right.permit?.approvalChain[0].status).toBe('DONE');
    expect(right.permit?.approvalChain[0].decision).toBe('APPROVE');
  });

  it('requires a valid gas test before final approval and then issues correctly', () => {
    const submitted = submitPermit(
      makePermit({
        permitType: 'HOT_WORK',
        riskLevel: 'HIGH',
        workClassifications: ['HOT_WORK', 'NON_ROUTINE', 'HIGH_RISK_AREA'],
        criticalWork: true,
        requiresGasTest: true,
      }),
      ctx('PERMIT_APPLICANT'),
    ).permit!;

    let current = submitted;
    for (const role of ['LINE_SUPERVISOR', 'FPS', 'DEPUTY_OIM'] as const) {
      current = approveAtCurrentLevel(current, ctx(role)).permit!;
    }
    expect(current.status).toBe('OIM_REVIEW');

    const withoutGas = approveAtCurrentLevel(current, ctx('OIM'));
    expect(withoutGas.ok).toBe(false);
    expect(withoutGas.error).toContain('Gas Test PASS');
    expect(withoutGas.permit).toBeUndefined();

    const withGas = approveAtCurrentLevel(
      { ...current, gasTests: [makeGasTest()] },
      ctx('OIM'),
    );
    expect(withGas.ok).toBe(true);
    expect(withGas.permit?.status).toBe('APPROVED');
    expect(withGas.permit?.currentApprovalLevel).toBeNull();
    expect(withGas.permit?.approvedAt).toBe(NOW.toISOString());
    expect(withGas.permit?.validUntil).toBe('2026-09-26T18:00:00.000Z');
  });

  it('handles return, reject and immutable-field rules', () => {
    const submitted = submitPermit(makePermit(), ctx('PERMIT_APPLICANT')).permit!;

    const returned = returnToApplicant(submitted, ctx('LINE_SUPERVISOR', 'U-LINE', 'Need more detail'));
    expect(returned.ok).toBe(true);
    expect(returned.permit?.status).toBe('RETURNED');
    expect(returned.permit?.currentApprovalLevel).toBeNull();
    expect(returned.permit?.statusHistory.at(-1)?.eventType).toBe('RETURNED');

    const rejected = rejectAtCurrentLevel(submitted, ctx('LINE_SUPERVISOR', 'U-LINE', 'Unsafe'));
    expect(rejected.ok).toBe(true);
    expect(rejected.permit?.status).toBe('REJECTED');
    expect(rejected.permit?.currentApprovalLevel).toBeNull();

    expect(isPermitFieldLocked(submitted)).toBe(true);
    expect(isPermitFieldLocked(makePermit())).toBe(false);
    expect(isPermitFieldLocked(makePermit({ status: 'RETURNED' })).toBe(false);
  });

  it('supports work lifecycle transitions with permission checks', () => {
    const approved = makePermit({
      status: 'APPROVED',
      validUntil: '2026-09-26T11:00:00.000Z',
      approvedAt: NOW.toISOString(),
    });

    const started = startWork(approved, ctx('PERMIT_CONTROLLER'));
    expect(started.ok).toBe(true);
    expect(started.permit?.status).toBe('WORK_IN_PROGRESS');
    expect(started.permit?.actualStart).toBe(NOW.toISOString());

    const wrongStart = startWork(approved, ctx('ADMINISTRATOR'));
    expect(wrongStart.ok).toBe(false);

    const suspended = suspendPermit(started.permit!, ctx('PERMIT_CONTROLLER', 'U-PC', 'Gas alarm'));
    expect(suspended.ok).toBe(true);
    expect(suspended.permit?.status).toBe('SUSPENDED');
    expect(suspended.permit?.suspensionReason).toBe('Gas alarm');

    const resumed = resumePermit(suspended.permit!, ctx('PERMIT_CONTROLLER'));
    expect(resumed.ok).toBe(true);
    expect(resumed.permit?.status).toBe('WORK_IN_PROGRESS');

    const completed = completeWork(resumed.permit!, ctx('OIM'));
    expect(completed.ok).toBe(true);
    expect(completed.permit?.status).toBe('WORK_COMPLETED');
    expect(completed.permit?.actualEnd).toBe(NOW.toISOString());

    const closed = closePermit(completed.permit!, ctx('OIM', 'U-OIM', 'All documents archived'));
    expect(closed.ok).toBe(true);
    expect(closed.permit?.status).toBe('CLOSED');
    expect(closed.permit?.closureNotes).toBe('All documents archived');

    expect(resumePermit(makePermit({ status: 'DRAFT' }), ctx('PERMIT_CONTROLLER')).ok).toBe(false);
    expect(closePermit(makePermit({ status: 'APPROVED' }), ctx('OIM')).ok).toBe(false);
  });

  it('requires gas before resuming gas-test permits and enforces expiration/cancel rules', () => {
    const suspendedGasPermit = makePermit({
      status: 'SUSPENDED',
      requiresGasTest: true,
      permitType: 'HOT_WORK',
      riskLevel: 'HIGH',
      workClassifications: ['HOT_WORK', 'NON_ROUTINE', 'HIGH_RISK_AREA'],
      gasTests: [],
    });

    const withoutGas = resumePermit(suspendedGasPermit, ctx('PERMIT_CONTROLLER'));
    expect(withoutGas.ok).toBe(false);
    expect(withoutGas.error).toContain('Gas Test PASS');

    const withGas = resumePermit(
      { ...suspendedGasPermit, gasTests: [makeGasTest()] },
      ctx('PERMIT_CONTROLLER'),
    );
    expect(withGas.ok).toBe(true);
    expect(withGas.permit?.status).toBe('WORK_IN_PROGRESS');

    const expiring = makePermit({
      status: 'APPROVED',
      validUntil: NOW.toISOString(),
    });
    const expired = expireIfNeeded(expiring, NOW);
    expect(expired.ok).toBe(true);
    expect(expired.permit?.status).toBe('EXPIRED');

    const notExpired = expireIfNeeded(
      makePermit({ status: 'APPROVED', validUntil: FUTURE.toISOString() }),
      NOW,
    );
    expect(notExpired.permit?.status).toBe('APPROVED');

    expect(cancelPermit(makePermit({ status: 'APPROVED' }), ctx('OIM')).permit?.status).toBe('CANCELLED');
    expect(cancelPermit(makePermit({ status: 'CLOSED' }), ctx('OIM')).ok).toBe(false);
  });

  it('clones approval chains without mutating the source and rebuilds from permit risk/area classification', () => {
    const permit = makePermit({
      permitType: 'COLD_WORK',
      riskLevel: 'LOW',
      workClassifications: ['ROUTINE', 'HIGH_RISK_AREA'],
      criticalWork: false,
    });
    const clone = cloneChain(permit.approvalChain);
    clone[0].status = 'DONE';
    expect(permit.approvalChain[0].status).toBe('PENDING');

    const rebuilt = rebuildChainForPermit(permit);
    expect(rebuilt.every((step) => step.required)).toBe(true);
  });

  it('blocks start when validity has elapsed and keeps status transitions explicit', () => {
    const expiredApproved = makePermit({
      status: 'APPROVED',
      validUntil: '2026-09-26T09:59:59.999Z',
    });
    const result = startWork(expiredApproved, ctx('OIM'));
    expect(result.ok).toBe(false);
    expect(result.error).toContain('chuyển EXPIRED');
    expect(result.permit).toBeUndefined();
  });
});

describe('authorization service', () => {
  it('filters available actions by role, workflow state and SIMOPS blockers', () => {
    const applicant = makeUser('PERMIT_APPLICANT');
    const permit = makePermit();
    const available = getAvailableActions(applicant, permit);
    expect(available.find((a) => a.action === 'SUBMIT')).toMatchObject({ allowed: true });

    const blocker = {
      conflictId: 'SIMOPS-X',
      permitA: { id: permit.id, permitNumber: permit.permitNumber, permitType: permit.permitType },
      permitB: { id: 'OTHER', permitNumber: 'OTHER', permitType: 'CONFINED_SPACE' as const },
      areaCode: permit.areaCode,
      overlapFrom: '2026-09-26T10:00:00.000Z',
      overlapTo: '2026-09-26T11:00:00.000Z',
      level: 'BLOCK' as const,
      reason: 'block',
    };

    const blocked = getAvailableActions(applicant, {
      ...permit,
      acknowledgedConflictIds: [],
    }, [blocker]);
    expect(blocked.find((a) => a.action === 'SUBMIT')).toMatchObject({
      allowed: false,
      reason: 'Phải đánh giá & ghi nhận xung đột SIMOPS mức BLOCK trước khi gửi.',
    });

    const acknowledged = getAvailableActions(applicant, {
      ...permit,
      acknowledgedConflictIds: ['SIMOPS-X'],
    }, [blocker]);
    expect(acknowledged.find((a) => a.action === 'SUBMIT')?.allowed).toBe(true);
  });

  it('only exposes approval actions to the current approval level', () => {
    const submitted = submitPermit(makePermit({ riskLevel: 'MEDIUM', workClassifications: ['NON_ROUTINE'] }), ctx('PERMIT_APPLICANT')).permit!;
    const line = makeUser('LINE_SUPERVISOR');
    const fps = makeUser('FPS');

    expect(canPerform(line, submitted, 'APPROVE').allowed).toBe(true);
    expect(canPerform(fps, submitted, 'APPROVE').allowed).toBe(false);
    expect(canPerform(line, submitted, 'REJECT').allowed).toBe(true);

    const afterLine = approveAtCurrentLevel(submitted, ctx('LINE_SUPERVISOR')).permit!;
    expect(canPerform(fps, afterLine, 'APPROVE').allowed).toBe(true);
  });

  it('handles visibility rules and single-action fallback checks', () => {
    const mt1Permit = makePermit({ platformCode: 'MT1' });
    const mt2Permit = makePermit({ platformCode: 'MT2' });

    expect(canViewPermit(makeUser('ADMINISTRATOR'), mt1Permit)).toBe(false);
    expect(canViewPermit(makeUser('PERMIT_APPLICANT'), mt1Permit)).toBe(true);
    expect(canViewPermit(makeUser('PERMIT_APPLICANT'), mt2Permit)).toBe(false);
    expect(canViewPermit(makeUser('HSE'), mt2Permit)).toBe(true);

    const administrator = makeUser('ADMINISTRATOR');
    expect(canPerform(administrator, mt1Permit, 'CREATE')).toEqual({
      allowed: false,
      reason: 'Vai trò ADMINISTRATOR không có quyền CREATE trong phân quyền.',
    });
  });
});

describe('utility and status metadata', () => {
  it('formats timestamps and dates safely', () => {
    expect(formatTimestamp(undefined)).toBe('—');
    expect(formatTimestamp('not-a-date')).toBe('—');
    expect(formatDate(null)).toBe('—');

    const date = new Date('2026-09-26T10:05:00.000Z');
    expect(formatDate(date.toISOString())).toBe(
      `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/2026`,
    );
    expect(formatTimestamp(date.toISOString())).toBe(
      `${String(date.getDate()).padStart(2, '0')}-Sep-2026 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`,
    );
  });

  it('calculates relative minutes and local input values deterministically', () => {
    expect(minutesUntil('2026-09-26T10:30:00.000Z', NOW)).toBe(30);
    expect(minutesUntil('2026-09-26T09:30:00.000Z', NOW)).toBe(-30);
    expect(toLocalInputValue(undefined)).toBe('');
    expect(toLocalInputValue('not-a-date')).toBe('');

    const d = new Date('2026-09-26T10:05:00.000Z');
    expect(toLocalInputValue(d.toISOString())).toBe(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
    );
  });

  it('merges Tailwind utility classes and keeps status metadata complete', () => {
    expect(cn('px-2 py-2', 'px-4', false && 'hidden')).toContain('px-4');
    expect(cn('text-red-500', 'text-blue-500')).toContain('text-blue-500');

    const statuses = [
      'DRAFT','SUBMITTED','LINE_SUPERVISOR_REVIEW','FPS_REVIEW','DEPUTY_OIM_REVIEW','OIM_REVIEW',
      'APPROVED','WORK_IN_PROGRESS','SUSPENDED','RESUMED','WORK_COMPLETED','CLOSED','REJECTED','RETURNED',
      'CANCELLED','EXPIRED',
    ] as const;
    for (const status of statuses) {
      expect(STATUS_META[status]).toBeDefined();
      expect(STATUS_META[status].tone).toBeTruthy();
      expect(STATUS_META[status].glyph).toBeTruthy();
    }

    expect(RISK_TONE.LOW).toBe('success');
    expect(RISK_TONE.MEDIUM).toBe('warning');
    expect(RISK_TONE.HIGH).toBe('danger');
    expect(RISK_TONE.CRITICAL).toBe('critical');
  });
});
