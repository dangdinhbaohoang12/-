import { beforeEach, describe, expect, it, vi } from 'vitest';

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));
vi.mock('./apiClient', () => ({ post: postMock, getState: vi.fn(), toActionKind: vi.fn() }));

import { usePtwStore } from './ptwStore';

beforeEach(() => {
  postMock.mockReset();
  usePtwStore.setState({
    permits: [], users: [], approverCertifications: {}, notifications: [], currentUser: null,
  });
});

describe('state response ordering', () => {
  it('applies a successful mutation when a newer refresh fails', async () => {
    let resolveMutation!: (value: unknown) => void;
    let rejectRefresh!: (error: Error) => void;
    const mutationRequest = new Promise((resolve) => { resolveMutation = resolve; });
    const refreshRequest = new Promise((_, reject) => { rejectRefresh = reject; });
    postMock.mockImplementation((operation: string) =>
      operation === 'UPDATE_DRAFT' ? mutationRequest : refreshRequest
    );

    const mutation = usePtwStore.getState().updateDraftPermit('permit', {}, '1234');
    const refresh = usePtwStore.getState().refreshExpiries();
    rejectRefresh(new Error('offline'));
    await refresh;
    resolveMutation({ state: {
      permits: [], users: [], approverCertifications: {}, notifications: [], currentUser: { id: 'updated' },
    } });

    expect((await mutation).ok).toBe(true);
    expect(usePtwStore.getState().currentUser?.id).toBe('updated');
  });

  it('ignores an older response after a newer state has been applied', async () => {
    let resolveOlder!: (value: unknown) => void;
    let resolveNewer!: (value: unknown) => void;
    postMock
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOlder = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveNewer = resolve; }));

    const older = usePtwStore.getState().updateDraftPermit('permit', {}, '1234');
    const newer = usePtwStore.getState().updateDraftPermit('permit', {}, '1234');
    const state = (id: string) => ({ state: {
      permits: [], users: [], approverCertifications: {}, notifications: [], currentUser: { id },
    } });
    resolveNewer(state('newer'));
    await newer;
    resolveOlder(state('older'));
    await older;

    expect(usePtwStore.getState().currentUser?.id).toBe('newer');
  });

  it('keeps logout state when a pending mutation finishes', async () => {
    let resolveMutation!: (value: unknown) => void;
    postMock.mockImplementation((operation: string) =>
      operation === 'UPDATE_DRAFT'
        ? new Promise((resolve) => { resolveMutation = resolve; })
        : Promise.resolve({ ok: true })
    );

    const mutation = usePtwStore.getState().updateDraftPermit('permit', {}, '1234');
    await usePtwStore.getState().logout();
    resolveMutation({ state: {
      permits: [], users: [], approverCertifications: {}, notifications: [], currentUser: { id: 'stale' },
    } });
    await mutation;

    expect(usePtwStore.getState().currentUser).toBeNull();
  });

  it('keeps an authentication failure cleared when a pending mutation finishes', async () => {
    let resolveMutation!: (value: unknown) => void;
    postMock.mockImplementation((operation: string) =>
      operation === 'UPDATE_DRAFT'
        ? new Promise((resolve) => { resolveMutation = resolve; })
        : Promise.reject(Object.assign(new Error('expired'), { status: 401 }))
    );
    usePtwStore.setState({ currentUser: { id: 'signed-in' } as ReturnType<typeof usePtwStore.getState>['currentUser'] });

    const mutation = usePtwStore.getState().updateDraftPermit('permit', {}, '1234');
    await usePtwStore.getState().refreshExpiries();
    resolveMutation({ state: {
      permits: [], users: [], approverCertifications: {}, notifications: [], currentUser: { id: 'stale' },
    } });
    await mutation;

    expect(usePtwStore.getState().currentUser).toBeNull();
  });
});

describe('login after logout', () => {
  it.each(['success', 'failure'])('waits for a %s logout request to settle', async (outcome) => {
    let settleLogout!: () => void;
    const logoutRequest = new Promise((resolve, reject) => {
      settleLogout = () => outcome === 'success' ? resolve({ ok: true }) : reject(new Error('offline'));
    });
    const state = {
      permits: [], users: [], approverCertifications: {}, notifications: [],
      currentUser: { id: 'new-user' },
    };
    postMock.mockImplementation((operation: string) =>
      operation === 'LOGOUT' ? logoutRequest : Promise.resolve({ ok: true, mustChangePin: false, state })
    );

    const logout = usePtwStore.getState().logout();
    const login = usePtwStore.getState().login('new-user', '1234');
    expect(postMock.mock.calls.map(([operation]) => operation)).toEqual(['LOGOUT']);

    settleLogout();
    await logout;
    expect((await login).ok).toBe(true);
    expect(postMock.mock.calls.map(([operation]) => operation)).toEqual(['LOGOUT', 'LOGIN']);
    expect(usePtwStore.getState().currentUser?.id).toBe('new-user');
  });
});

describe('state response ordering', () => {
  it('drops an older mutation response after a newer refresh applies', async () => {
    let resolveMutation!: (value: unknown) => void;
    const mutation = new Promise((resolve) => { resolveMutation = resolve; });
    postMock.mockImplementation((operation: string) => operation === 'UPDATE_DRAFT'
      ? mutation
      : Promise.resolve({ state: { permits: [{ id: 'newer' }], users: [],
        approverCertifications: {}, currentUser: { id: 'operator' }, notifications: [] } }));

    const update = usePtwStore.getState().updateDraftPermit('permit', {}, '1234');
    await usePtwStore.getState().refreshExpiries();
    resolveMutation({ state: { permits: [{ id: 'older' }], users: [],
      approverCertifications: {}, currentUser: { id: 'operator' }, notifications: [] } });
    await update;
    expect(usePtwStore.getState().permits[0]?.id).toBe('newer');
  });

  it('keeps logout clear when a pending response arrives afterward', async () => {
    let resolveLogin!: (value: unknown) => void;
    const loginRequest = new Promise((resolve) => { resolveLogin = resolve; });
    postMock.mockImplementation((operation: string) =>
      operation === 'LOGIN' ? loginRequest : Promise.resolve({ ok: true })
    );

    const login = usePtwStore.getState().login('operator', '1234');
    await usePtwStore.getState().logout();
    resolveLogin({ mustChangePin: false, state: { permits: [{ id: 'stale' }], users: [],
      approverCertifications: {}, currentUser: { id: 'operator' }, notifications: [] } });
    await login;
    expect(usePtwStore.getState().currentUser).toBeNull();
    expect(usePtwStore.getState().permits).toEqual([]);
  });
});
