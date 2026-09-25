import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getStateMock, postMock } = vi.hoisted(() => ({ getStateMock: vi.fn(), postMock: vi.fn() }));
vi.mock('./apiClient', () => ({ post: postMock, getState: getStateMock, toActionKind: vi.fn() }));

import { usePtwStore } from './ptwStore';

beforeEach(() => {
  postMock.mockReset();
  getStateMock.mockReset();
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
  it('applies a mutation response when a newer refresh fails', async () => {
    let resolveMutation!: (value: unknown) => void;
    const mutation = new Promise((resolve) => { resolveMutation = resolve; });
    postMock.mockImplementation((operation: string) =>
      operation === 'UPDATE_DRAFT' ? mutation : Promise.reject(new Error('offline'))
    );

    const update = usePtwStore.getState().updateDraftPermit('permit', {}, '1234');
    await usePtwStore.getState().refreshExpiries();
    resolveMutation({ state: { permits: [{ id: 'updated' }], users: [],
      approverCertifications: {}, currentUser: { id: 'operator' }, notifications: [] } });
    expect((await update).ok).toBe(true);
    expect(usePtwStore.getState().permits[0]?.id).toBe('updated');
  });

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

  it('keeps local state logged out when a pending login responds after logout', async () => {
    let resolveLogin!: (value: unknown) => void;
    let resolveLogout!: (value: unknown) => void;
    const loginState = { permits: [{ id: 'stale' }], users: [],
      approverCertifications: {}, currentUser: { id: 'operator' }, notifications: [] };
    const loginRequest = new Promise((resolve) => { resolveLogin = resolve; });
    const logoutRequest = new Promise((resolve) => { resolveLogout = resolve; });
    postMock.mockImplementation((operation: string) => {
      if (operation === 'LOGIN') return loginRequest;
      if (operation === 'LOGOUT') return logoutRequest;
      return Promise.resolve({ ok: true });
    });

    const login = usePtwStore.getState().login('operator', '1234');
    const logout = usePtwStore.getState().logout();
    expect(postMock.mock.calls.map(([operation]) => operation)).toEqual(['LOGIN', 'LOGOUT']);

    resolveLogout({ ok: true });
    await logout;
    expect(usePtwStore.getState().currentUser).toBeNull();

    resolveLogin({ mustChangePin: false, state: loginState });
    await login;

    expect(usePtwStore.getState().currentUser).toBeNull();
    expect(usePtwStore.getState().permits).toEqual([]);
  });
});
