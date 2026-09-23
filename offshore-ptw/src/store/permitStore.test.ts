import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Permit } from '../types';
import { savePermitOffline } from '../db/offlineDb';
import { DEMO_USERS, usePermitStore } from './permitStore';

vi.mock('../db/offlineDb', () => ({
  db: {},
  savePermitOffline: vi.fn(),
  getAllPermitsOffline: vi.fn(),
  isOnline: vi.fn(() => true)
}));

const savePermitOfflineMock = vi.mocked(savePermitOffline);

afterEach(() => {
  vi.unstubAllGlobals();
});

function createPermit(overrides: Partial<Permit> = {}): Permit {
  return {
    id: 'permit-1',
    permitNumber: 'PTW-2609-0001',
    type: 'COLD_WORK',
    status: 'DRAFT',
    title: 'Maintenance',
    location: 'Pump room',
    locationTag: 'P-101',
    deck: 'Main Deck',
    startTime: '2026-09-23T08:00:00.000Z',
    endTime: '2026-09-23T16:00:00.000Z',
    requesterId: '4',
    workers: [],
    ppe: [],
    jsaData: [],
    isolations: [],
    gasTestPassed: false,
    electricalIsolated: false,
    pressureIsolated: false,
    approvals: [],
    createdAt: '2026-09-23T07:00:00.000Z',
    updatedAt: '2026-09-23T07:00:00.000Z',
    priority: 'LOW',
    ...overrides
  };
}

function resetStore(permits: Permit[] = [], currentUser = DEMO_USERS[3]) {
  usePermitStore.setState({
    permits,
    currentUser,
    selectedPermit: null,
    simopsConflicts: []
  });
}

describe('permitStore persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    savePermitOfflineMock.mockReset();
    savePermitOfflineMock.mockResolvedValue();
    resetStore();
    vi.stubGlobal('alert', vi.fn());
  });

  it('propagates createPermit offline persistence failures', async () => {
    const failure = new Error('IndexedDB unavailable');
    savePermitOfflineMock.mockRejectedValueOnce(failure);

    await expect(usePermitStore.getState().createPermit({ title: 'New permit' })).rejects.toBe(failure);
  });

  it('propagates updatePermit offline persistence failures', async () => {
    const failure = new Error('IndexedDB unavailable');
    savePermitOfflineMock.mockRejectedValueOnce(failure);
    resetStore([createPermit()]);

    await expect(usePermitStore.getState().updatePermit('permit-1', { title: 'Updated' })).rejects.toBe(failure);
  });

  it('persists the submitted revision before reporting success', async () => {
    const permit = createPermit();
    resetStore([permit]);

    await expect(usePermitStore.getState().submitPermit(permit.id, '0004')).resolves.toBe(true);

    expect(savePermitOfflineMock).toHaveBeenCalledOnce();
    const persistedPermit = savePermitOfflineMock.mock.calls[0][0] as Permit;
    expect(persistedPermit).toMatchObject({ id: permit.id, status: 'SUBMITTED' });
    expect(persistedPermit.updatedAt).not.toBe(permit.updatedAt);
    expect(persistedPermit.approvals).toHaveLength(1);
    expect(persistedPermit.approvals[0].action).toBe('SUBMIT');
    expect(usePermitStore.getState().permits[0]).toEqual(persistedPermit);
  });

  it('propagates submission persistence failures without changing the permit', async () => {
    const permit = createPermit();
    const failure = new Error('IndexedDB unavailable');
    savePermitOfflineMock.mockRejectedValueOnce(failure);
    resetStore([permit]);

    await expect(usePermitStore.getState().submitPermit(permit.id, '0004')).rejects.toBe(failure);
    expect(usePermitStore.getState().permits[0]).toEqual(permit);
  });

  it('persists permits without PIN-bearing current-user data', () => {
    resetStore([createPermit()]);

    const stored = JSON.parse(localStorage.getItem('offshore-ptw-storage') ?? '{}');
    expect(stored.state.permits).toHaveLength(1);
    expect(stored.state.currentUser).toBeNull();
  });

  it('forces login when merging previously persisted user data', () => {
    const options = usePermitStore.persist.getOptions();
    const merged = options.merge?.(
      { permits: [createPermit()], currentUser: DEMO_USERS[0] },
      usePermitStore.getState()
    ) as ReturnType<typeof usePermitStore.getState>;

    expect(merged.currentUser).toBeNull();
    expect(merged.permits).toHaveLength(1);
  });
});

describe('permitStore workflow guards', () => {
  beforeEach(() => {
    localStorage.clear();
    savePermitOfflineMock.mockReset();
    savePermitOfflineMock.mockResolvedValue();
    vi.stubGlobal('alert', vi.fn());
  });

  it('rejects submission unless the permit is a draft', async () => {
    const permit = createPermit({ status: 'SUBMITTED' });
    resetStore([permit]);

    await expect(usePermitStore.getState().submitPermit(permit.id, '0004')).resolves.toBe(false);
    expect(savePermitOfflineMock).not.toHaveBeenCalled();
    expect(usePermitStore.getState().permits[0]).toEqual(permit);
  });

  it('checks SIMOPS using the SUBMITTED candidate status', async () => {
    const draftHotWork = createPermit({ type: 'HOT_WORK' });
    const activeConfinedSpace = createPermit({
      id: 'permit-2',
      permitNumber: 'PTW-2609-0002',
      type: 'CONFINED_SPACE',
      status: 'ISSUED'
    });
    resetStore([draftHotWork, activeConfinedSpace]);

    await expect(usePermitStore.getState().submitPermit('permit-1', '0004')).resolves.toBe(false);
    expect(usePermitStore.getState().permits[0].status).toBe('DRAFT');
    expect(usePermitStore.getState().permits[0].approvals).toHaveLength(0);
  });

  it('rejects APPROVE for a SUBMITTED permit without creating an approval', () => {
    resetStore([createPermit({ status: 'SUBMITTED' })], DEMO_USERS[1]);

    expect(usePermitStore.getState().approvePermit('permit-1', 'APPROVE', '', '0002')).toBe(false);
    expect(usePermitStore.getState().permits[0].status).toBe('SUBMITTED');
    expect(usePermitStore.getState().permits[0].approvals).toHaveLength(0);
  });

  it('rejects APPROVE for a closed-out permit without creating an approval', () => {
    resetStore([createPermit({ status: 'CLOSED_OUT' })], DEMO_USERS[0]);

    expect(usePermitStore.getState().approvePermit('permit-1', 'APPROVE', '', '0001')).toBe(false);
    expect(usePermitStore.getState().permits[0].status).toBe('CLOSED_OUT');
    expect(usePermitStore.getState().permits[0].approvals).toHaveLength(0);
  });

  it('allows only DEPUTY_OIM to advance VERIFIED_ISOLATED to REVIEWED', () => {
    resetStore([createPermit({ status: 'VERIFIED_ISOLATED' })], DEMO_USERS[0]);
    expect(usePermitStore.getState().approvePermit('permit-1', 'APPROVE', '', '0001')).toBe(false);
    expect(usePermitStore.getState().permits[0].approvals).toHaveLength(0);

    usePermitStore.setState({ currentUser: DEMO_USERS[1] });
    expect(usePermitStore.getState().approvePermit('permit-1', 'APPROVE', '', '0002')).toBe(true);
    expect(usePermitStore.getState().permits[0].status).toBe('REVIEWED');
  });

  it('allows only OIM to advance REVIEWED to ISSUED', () => {
    resetStore([createPermit({ status: 'REVIEWED' })], DEMO_USERS[1]);
    expect(usePermitStore.getState().approvePermit('permit-1', 'APPROVE', '', '0002')).toBe(false);
    expect(usePermitStore.getState().permits[0].approvals).toHaveLength(0);

    usePermitStore.setState({ currentUser: DEMO_USERS[0] });
    expect(usePermitStore.getState().approvePermit('permit-1', 'APPROVE', '', '0001')).toBe(true);
    expect(usePermitStore.getState().permits[0].status).toBe('ISSUED');
  });
});
