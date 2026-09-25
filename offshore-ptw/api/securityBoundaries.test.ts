import { createHmac, scryptSync } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const derivationStats = vi.hoisted(() => ({ active: 0, peak: 0 }));
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return {
    ...actual,
    scrypt: (pin: string, salt: Buffer, length: number,
      options: { N: number; r: number; p: number; maxmem: number },
      callback: (error: Error | null, derived: Buffer) => void) => {
      derivationStats.active += 1;
      derivationStats.peak = Math.max(derivationStats.peak, derivationStats.active);
      actual.scrypt(pin, salt, length, options, (error, derived) => {
        derivationStats.active -= 1;
        callback(error, derived);
      });
    },
  };
});

const sessionSecret = 'test-session-secret-with-at-least-32-characters';
const operatorPin = '24681357';
const salt = Buffer.alloc(16, 7);
const operatorHash = 'scrypt$v1$' + salt.toString('base64url') + '$' +
  scryptSync(operatorPin, salt, 32, { N: 131072, r: 8, p: 1, maxmem: 136 * 1024 * 1024 }).toString('base64url');

let handler: typeof import('./ptw').default;
let userRows: any[];
let permitRows: any[];
let transactions: Array<{ path: string; body: any }>;
let lockOnFailure = false;

beforeAll(async () => {
  vi.stubEnv('SUPABASE_URL', 'https://supabase.example.test');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key-with-enough-length');
  vi.stubEnv('PTW_SESSION_SECRET', sessionSecret);
  vi.stubEnv('PTW_AUDIT_SECRET', 'test-audit-secret-with-at-least-32-characters');
  handler = (await import('./ptw')).default;
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  derivationStats.active = 0;
  derivationStats.peak = 0;
  userRows = [
    { id: 'oim', username: 'oim', full_name: 'OIM', role: 'OIM', platform_code: 'MT1',
      pin_hash: operatorHash, active: true, session_version: 1, must_change_pin: false },
    { id: 'target', username: 'target', full_name: 'Target', role: 'FPS', platform_code: 'MT1',
      active: true, session_version: 1 },
  ];
  permitRows = [{ id: 'permit', version: 1, data: {
    id: 'permit', permitNumber: 'MT1-PTW-1', platformCode: 'MT1', status: 'DRAFT',
    gasTests: [], statusHistory: [], approvalChain: [], applicantUserId: 'target',
  } }];
  transactions = [];
  lockOnFailure = false;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname;
    if (path.includes('/rpc/')) {
      transactions.push({ path, body: JSON.parse(String(init?.body)) });
      return Response.json(lockOnFailure
        ? [{ failed_login_count: 5, locked_until: new Date(Date.now() + 60_000).toISOString() }]
        : []);
    }
    if (path.endsWith('/ptw_users')) {
      if (init?.method === 'POST') throw new Error('Unexpected bootstrap insert');
      const id = url.searchParams.get('id')?.slice(3);
      const username = url.searchParams.get('username')?.slice(3);
      return Response.json(userRows.filter((user) => (!id || user.id === id) && (!username || user.username === username)));
    }
    if (path.endsWith('/ptw_permits')) {
      const id = url.searchParams.get('id')?.slice(3);
      return Response.json(permitRows.filter((row) => !id || row.id === id));
    }
    if (path.endsWith('/ptw_notifications')) return Response.json([]);
    throw new Error('Unexpected database path: ' + path);
  }));
});

async function post(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  const payload = Buffer.from(JSON.stringify({ uid: 'oim', sv: 1, exp: Date.now() + 60_000 })).toString('base64url');
  const signature = createHmac('sha256', sessionSecret).update(payload).digest('base64url');
  let responseBody = '';
  const response = {
    statusCode: 0,
    setHeader: () => {},
    end: (value: string) => { responseBody = value; },
  };
  await handler({ method: 'POST', headers: { cookie: `ptw_session=${payload}.${signature}`, ...headers }, body }, response);
  return { status: response.statusCode, body: JSON.parse(responseBody) };
}

const readings = [
  { parameter: 'O2', value: 10 },
  { parameter: 'LEL', value: 0 },
  { parameter: 'H2S', value: 0 },
  { parameter: 'CO', value: 0 },
];

describe('server controlled security evidence', () => {
  it('limits concurrent PIN derivations to one', async () => {
    const responses = await Promise.all([
      post({ operation: 'CHANGE_OWN_PIN', currentPin: '0000', newPin: '87654321' }),
      post({ operation: 'CHANGE_OWN_PIN', currentPin: '1111', newPin: '87654321' }),
    ]);
    expect(responses.map(({ status }) => status)).toEqual([403, 403]);
    expect(derivationStats.peak).toBe(1);
  });

  it('counts an incorrect current PIN toward account lockout', async () => {
    const response = await post({ operation: 'CHANGE_OWN_PIN', currentPin: '0000', newPin: '87654321' });
    expect(response.status).toBe(403);
    expect(transactions).toContainEqual({
      path: '/rest/v1/rpc/ptw_record_auth_failure',
      body: { p_user_id: 'oim', p_max_failures: 5, p_lock_ms: 900000 },
    });
  });

  it('returns lockout when an incorrect current PIN reaches the threshold', async () => {
    lockOnFailure = true;
    const response = await post({ operation: 'CHANGE_OWN_PIN', currentPin: '0000', newPin: '87654321' });
    expect(response.status).toBe(429);
    expect(transactions[0].path).toBe('/rest/v1/rpc/ptw_record_auth_failure');
  });

  it('rejects reusing the current PIN without recording an authentication failure', async () => {
    const response = await post({ operation: 'CHANGE_OWN_PIN', currentPin: operatorPin, newPin: operatorPin });
    expect(response.status).toBe(400);
    expect(transactions).toHaveLength(0);
  });

  it('recomputes gas reading metadata and results from server specifications', async () => {
    const response = await post({ operation: 'ADD_GAS_TEST', permitId: 'permit', pin: operatorPin,
      record: { gasDetectorId: 'D1', calibrationDueDate: new Date(Date.now() + 86_400_000).toISOString(),
        location: 'WHP', readings: readings.map((reading) => ({ ...reading, unit: 'forged', min: -999,
          max: 999, result: 'PASS' })) } });
    expect(response.status).toBe(200);
    const gasTest = transactions[0].body.p_changes[0].data.gasTests[0];
    expect(gasTest.readings[0]).toEqual({ parameter: 'O2', value: 10, unit: '%v/v', min: 19.5,
      max: 23.5, result: 'FAIL' });
    expect(gasTest.overallResult).toBe('FAIL');
  });

  it.each([{ parameter: '__proto__', value: 0 }, null])('rejects an extra gas reading without a specification', async (extra) => {
    const response = await post({ operation: 'ADD_GAS_TEST', permitId: 'permit', pin: operatorPin,
      record: { gasDetectorId: 'D1', calibrationDueDate: new Date(Date.now() + 86_400_000).toISOString(),
        location: 'WHP', readings: [...readings, extra] } });
    expect(response.status).toBe(400);
    expect(transactions).toHaveLength(0);
  });

  it.each(['13579246', '123456'])('rejects sample bootstrap PIN %s before insert', async (pin) => {
    userRows = [];
    vi.stubEnv('BOOTSTRAP_OIM_USERNAME', 'bootstrap');
    vi.stubEnv('BOOTSTRAP_OIM_PIN', pin);
    vi.stubEnv('BOOTSTRAP_OIM_FULL_NAME', 'Bootstrap OIM');
    vi.stubEnv('BOOTSTRAP_OIM_PLATFORM_CODE', 'MT1');
    const response = await post({ operation: 'LOGIN', username: 'bootstrap', pin });
    expect(response.status).toBe(500);
    expect(vi.mocked(fetch).mock.calls.some(([input, init]) =>
      String(input).includes('/ptw_users') && init?.method === 'POST')).toBe(false);
  });

  it.each([
    ['CREATE_USER', { operatorPin, input: { username: 'newuser', initialPin: '87654321', fullName: 'New', role: 'FPS' } }],
    ['CHANGE_USER_PIN', { operatorPin, userId: 'target', newPin: '87654321' }],
  ])('records request IP for %s audit', async (operation, input) => {
    const response = await post({ operation, ...input }, { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' });
    expect(response.status).toBe(200);
    expect(transactions[0].body.p_audit.deviceIp).toBe('203.0.113.7');
  });
});
