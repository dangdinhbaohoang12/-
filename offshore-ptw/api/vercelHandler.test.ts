import { describe, expect, it, vi } from 'vitest';
import handler from './ptw';

describe('Vercel PTW handler contract', () => {
  it('exports the Web Standard fetch handler', () => {
    expect(typeof handler.fetch).toBe('function');
  });

  it('returns a structured response when server configuration is missing', async () => {
    vi.stubEnv('SUPABASE_URL', '');

    const response = await handler.fetch(
      new Request('https://example.com/api/ptw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'LOGIN',
          username: 'test',
          pin: '1234',
        }),
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'Backend chưa được cấu hình đầy đủ trên Vercel.',
    });
  });
});
