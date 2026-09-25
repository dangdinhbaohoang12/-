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
      error: 'Thiếu biến môi trường máy chủ: SUPABASE_URL',
    });
  });
  it('does not require the audit secret for a request that does not sign audit data', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://supabase.example.test');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key-with-enough-length');
    vi.stubEnv('PTW_SESSION_SECRET', 'test-session-secret-with-at-least-32-characters');
    vi.stubEnv('PTW_AUDIT_SECRET', '');

    const response = await handler.fetch(
      new Request('https://example.com/api/ptw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: 'LOGOUT' }),
      }),
    );

    expect(response.status).toBe(200);
  });

  it('reports the missing server variable without exposing secret values', async () => {
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    vi.stubEnv('PTW_SESSION_SECRET', '');
    vi.stubEnv('PTW_AUDIT_SECRET', '');

    const response = await handler.fetch(
      new Request('https://example.com/api/ptw', { method: 'GET' }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'Thiếu biến môi trường máy chủ: SUPABASE_URL',
    });
  });

});
