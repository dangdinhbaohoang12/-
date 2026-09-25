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

  it('rejects a successful GET response without a valid state envelope', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: true }, { status: 200 })));

    await expect(getState()).rejects.toMatchObject({
      message: 'Máy chủ PTW trả về phản hồi không hợp lệ (HTTP 200).',
      status: 200,
    });
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

  it.each([404, 500])(
    'surfaces the deployment fallback message for a non-JSON %s response',
    async (status) => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>unavailable</html>', { status })));

      await expect(getState()).rejects.toMatchObject({
        message: expect.stringContaining('Kiểm tra API /api/ptw và biến môi trường Vercel.'),
        status,
      });
    },
  );

  it('preserves structured errors from unsuccessful responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(
      { ok: false, error: 'Backend chưa được cấu hình đầy đủ trên Vercel.' },
      { status: 503 },
    )));

    await expect(getState()).rejects.toMatchObject({
      message: 'Backend chưa được cấu hình đầy đủ trên Vercel.',
      status: 503,
    });
  });

  it('uses the status fallback for a non-JSON unsuccessful response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => (
      new Response('<html>unavailable</html>', { status: 503 })
    )));

    await expect(getState()).rejects.toMatchObject({
      message: 'Máy chủ PTW không phản hồi đúng định dạng. Kiểm tra API /api/ptw và biến môi trường Vercel.',
      status: 503,
    });
  });

  it('maps response body read failures to the connection error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => { throw new Error('body stream failed'); },
    }) as unknown as Response));

    await expect(getState()).rejects.toMatchObject({ status: 0 });
  });
});
