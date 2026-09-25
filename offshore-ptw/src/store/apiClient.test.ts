import { afterEach, describe, expect, it, vi } from 'vitest';
import { getState } from './apiClient';

afterEach(() => vi.unstubAllGlobals());

describe('PTW API responses', () => {
  it('preserves successful JSON response parsing', async () => {
    const state = {
      permits: [], users: [], approverCertifications: {}, currentUser: null, notifications: [],
    };
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: true, state })));

    await expect(getState()).resolves.toEqual(state);
  });

  it.each(['', '<html>unavailable</html>', 'null'])(
    'rejects an invalid successful response body (%s) with its HTTP status',
    async (body) => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 200 })));

      await expect(getState()).rejects.toMatchObject({
        message: expect.stringContaining('HTTP 200'),
        status: 200,
      });
    },
  );

  it('maps response body read failures to the connection error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => { throw new Error('body stream failed'); },
    }) as unknown as Response));

    await expect(getState()).rejects.toMatchObject({ status: 0 });
  });
});
