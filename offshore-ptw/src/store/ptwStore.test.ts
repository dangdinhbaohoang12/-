import { beforeEach, describe, expect, it, vi } from 'vitest';

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));
vi.mock('./apiClient', () => ({ post: postMock, getState: vi.fn(), toActionKind: vi.fn() }));

import { usePtwStore } from './ptwStore';

beforeEach(() => {
  postMock.mockReset();
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
