import { createHmac } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const sessionSecret = 'test-session-secret-with-at-least-32-characters';
const users = [
  { id: 'oim', username: 'oim', full_name: 'OIM', role: 'OIM', platform_code: 'MT1', active: true, session_version: 1, email: 'oim@example.test', phone: '111', certification_number: 'CERT-OIM' },
  { id: 'applicant', username: 'applicant', full_name: 'Applicant', role: 'PERMIT_APPLICANT', platform_code: 'MT1', active: true, session_version: 1, email: 'applicant@example.test', phone: '222' },
  { id: 'supervisor', username: 'supervisor', full_name: 'Supervisor', role: 'LINE_SUPERVISOR', platform_code: 'MT1', active: true, session_version: 1, email: 'supervisor@example.test', phone: '333', certification_number: 'CERT-SUPERVISOR' },
  { id: 'other', username: 'other', full_name: 'Other', role: 'LINE_SUPERVISOR', platform_code: 'MT2', active: true, session_version: 1, email: 'other@example.test', phone: '444', certification_number: 'CERT-OTHER' },
];
const permits = [
  { data: { id: 'visible', platformCode: 'MT1', approvalChain: [{ status: 'DONE', decidedByUserId: 'supervisor' }] } },
  { data: { id: 'hidden', platformCode: 'MT2', approvalChain: [{ status: 'DONE', decidedByUserId: 'other' }] } },
];

let handler: typeof import('./ptw').default;

beforeAll(async () => {
  vi.stubEnv('SUPABASE_URL', 'https://supabase.example.test');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key-with-enough-length');
  vi.stubEnv('PTW_SESSION_SECRET', sessionSecret);
  vi.stubEnv('PTW_AUDIT_SECRET', 'test-audit-secret-with-at-least-32-characters');
  handler = (await import('./ptw')).default;
});

afterAll(() => vi.unstubAllEnvs());

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const path = url.pathname;
    let rows: unknown[];
    if (path.endsWith('/ptw_users')) {
      const id = url.searchParams.get('id');
      rows = id ? users.filter((user) => user.id === id.slice(3)) : users;
    } else if (path.endsWith('/ptw_permits')) {
      rows = permits;
    } else if (path.endsWith('/ptw_notifications')) {
      rows = [];
    } else {
      throw new Error(`Unexpected database path: ${path}`);
    }
    return Response.json(rows);
  }));
});

afterEach(() => vi.unstubAllGlobals());

async function getState(userId: string) {
  const payload = Buffer.from(JSON.stringify({ uid: userId, sv: 1, exp: Date.now() + 60_000 })).toString('base64url');
  const signature = createHmac('sha256', sessionSecret).update(payload).digest('base64url');
  let responseBody = '';
  const response = {
    statusCode: 0,
    setHeader: () => {},
    end: (body: string) => { responseBody = body; },
  };
  await handler({ method: 'GET', headers: { cookie: `ptw_session=${payload}.${signature}` } }, response);
  expect(response.statusCode).toBe(200);
  return JSON.parse(responseBody).state;
}

async function post(body: Record<string, unknown>) {
  let responseBody = '';
  const response = {
    statusCode: 0,
    setHeader: () => {},
    end: (body: string) => { responseBody = body; },
  };
  await handler({ method: 'POST', headers: {}, body }, response);
  return { status: response.statusCode, body: JSON.parse(responseBody) };
}

describe('public state user data', () => {
  it('maps Supabase transport failures to a structured 503 response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('connect ECONNREFUSED');
    }));

    const response = await post({ operation: 'LOGIN', username: 'applicant', pin: '1234' });
    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      ok: false,
      error: 'Máy chủ PTW không thể kết nối tới backend/database. Kiểm tra Supabase và biến môi trường Vercel.',
    });
  });

  it.each([
    'https://supabase.example.test?mode=test',
    'https://supabase.example.test#fragment',
  ])('returns a 503 configuration error for SUPABASE_URL with query/fragment: %s', async (url) => {
    vi.stubEnv('SUPABASE_URL', url);
    try {
      const response = await post({ operation: 'LOGIN', username: 'applicant', pin: '1234' });
      expect(response.status).toBe(503);
      expect(response.body).toEqual({ ok: false, error: 'Backend chưa được cấu hình đầy đủ trên Vercel.' });
    } finally {
      vi.stubEnv('SUPABASE_URL', 'https://supabase.example.test');
    }
  });

  it.each(['not a URL', 'ftp://supabase.example.test'])('returns a 503 configuration error for invalid SUPABASE_URL: %s', async (url) => {
    vi.stubEnv('SUPABASE_URL', url);
    try {
      const response = await post({ operation: 'LOGIN', username: 'applicant', pin: '1234' });

      expect(response.status).toBe(503);
      expect(response.body).toEqual({ ok: false, error: 'Backend chưa được cấu hình đầy đủ trên Vercel.' });
    } finally {
      vi.stubEnv('SUPABASE_URL', 'https://supabase.example.test');
    }
  });

  it('limits a non-manager to their own contact details and certificates on visible permits', async () => {
    const state = await getState('applicant');
    expect(state.users).toEqual([]);
    expect(state.currentUser.email).toBe('applicant@example.test');
    expect(state.approverCertifications).toEqual({ supervisor: 'CERT-SUPERVISOR' });
  });

  it('provides the full account list to a user with MANAGE_USERS', async () => {
    const state = await getState('oim');
    expect(state.users).toHaveLength(users.length);
    expect(state.users.find((user: { id: string }) => user.id === 'other').email).toBe('other@example.test');
  });
});
