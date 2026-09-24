import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

import { buildApprovalChain } from '../src/engine/approvalRuleEngine';
import {
  computeOverallResult,
  hasAllRequiredParameters,
  isDetectorCalibrationValid,
} from '../src/engine/gasTestEngine';
import { detectSimopsConflicts } from '../src/engine/simopsEngine';
import {
  approveAtCurrentLevel,
  cancelPermit,
  closePermit,
  completeWork,
  expireIfNeeded,
  rejectAtCurrentLevel,
  returnToApplicant,
  resumePermit,
  startWork,
  submitPermit,
  suspendPermit,
} from '../src/engine/workflowStateMachine';
import { checkPermission } from '../src/engine/rbacMatrix';
import {
  AREAS,
  EQUIPMENT,
  PLATFORMS,
  getPermitTypeMeta,
} from '../src/data/catalog';
import { TERMINAL_STATUSES } from '../src/types/domain';
import type {
  AppNotification,
  GasTestRecord,
  Permit,
  PermitStatus,
  Role,
  SimopsConflict,
  StatusHistoryEntry,
  UserAccount,
} from '../src/types/domain';

type AnyRequest = any;
type AnyResponse = any;

const SESSION_COOKIE = 'ptw_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MAX_LOGIN_FAILURES = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error('Missing required server environment variable: ' + name);
  return value;
}

/** Known .env.example placeholder sentinels – must never be accepted as real secrets. */
const PLACEHOLDER_SECRET_VALUES = new Set([
  'replace_with_a_long_random_session_secret',
  'replace_with_a_long_random_audit_secret',
  'replace_with_a_secret_service_role_key',
]);

function requiredSecret(name: string, minLength = 32): string {
  const value = requiredEnv(name);
  if (PLACEHOLDER_SECRET_VALUES.has(value) || value.length < minLength) {
    throw new Error(
      'Environment variable ' + name + ' is missing, a template placeholder, or too short (' +
      'min ' + minLength + ' chars). Generate and set a real random secret before deploying.'
    );
  }
  return value;
}

const SUPABASE_URL = requiredEnv('SUPABASE_URL').replace(/\/+$/, '');
const SUPABASE_SERVICE_ROLE_KEY = requiredSecret('SUPABASE_SERVICE_ROLE_KEY', 20);
const PTW_SESSION_SECRET = requiredSecret('PTW_SESSION_SECRET');
const PTW_AUDIT_SECRET = requiredSecret('PTW_AUDIT_SECRET');

function nowIso(): string {
  return new Date().toISOString();
}

function newId(prefix = 'ID'): string {
  return prefix + '-' + Date.now().toString(36) + '-' + randomBytes(6).toString('hex');
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function validPin(pin: string): boolean {
  return /^\d{4,8}$/.test(pin);
}

/**
 * scrypt cost for hashing PINs. The key space of a 4–8 digit PIN is only
 * 10^4–10^8, so if pin_hash ever leaks, offline cracking is bounded almost
 * entirely by per-guess cost. N=2^17 with r=8 (~128 MiB per guess) keeps a
 * single verification well under a serverless request budget while making
 * bulk offline cracking meaningfully more expensive than the previous
 * N=2^14 (~16 MiB).
 */
const SCRYPT_N = 131072;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 136 * 1024 * 1024;

function hashPinServer(pin: string): string {
  if (!validPin(pin)) throw new Error('PIN phải là 4–8 chữ số.');
  const salt = randomBytes(16);
  const derived = scryptSync(pin, salt, 32, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
  return 'scrypt$v1$' + salt.toString('base64url') + '$' + derived.toString('base64url');
}

function verifyPinHash(pin: string, encoded: string): boolean {
  if (!validPin(pin) || !encoded.startsWith('scrypt$v1$')) return false;
  const parts = encoded.split('$');
  if (parts.length !== 4) return false;
  try {
    const salt = Buffer.from(parts[2], 'base64url');
    const expected = Buffer.from(parts[3], 'base64url');
    const actual = scryptSync(pin, salt, expected.length || 32, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
      maxmem: SCRYPT_MAXMEM,
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function base64urlJson(value: object): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function signSession(userId: string, sessionVersion: number): string {
  const payload = base64urlJson({
    uid: userId,
    sv: sessionVersion,
    exp: Date.now() + SESSION_TTL_MS,
  });
  const sig = createHmac('sha256', PTW_SESSION_SECRET).update(payload).digest('base64url');
  return payload + '.' + sig;
}

function verifySessionToken(token: string): { uid: string; sv: number; exp: number } | null {
  const pieces = token.split('.');
  if (pieces.length !== 2) return null;
  const payload = pieces[0];
  const expectedSig = createHmac('sha256', PTW_SESSION_SECRET).update(payload).digest('base64url');
  const left = Buffer.from(pieces[1]);
  const right = Buffer.from(expectedSig);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!parsed.uid || !Number.isInteger(parsed.sv) || !parsed.exp || parsed.exp <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return cookies;
}

function setSessionCookie(res: AnyResponse, userId: string, sessionVersion: number): void {
  const token = signSession(userId, sessionVersion);
  const secure = process.env.NODE_ENV === 'development' ? '' : '; Secure';
  res.setHeader(
    'Set-Cookie',
    SESSION_COOKIE + '=' + encodeURIComponent(token) +
    '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + String(Math.floor(SESSION_TTL_MS / 1000)) + secure
  );
}

function clearSessionCookie(res: AnyResponse): void {
  res.setHeader(
    'Set-Cookie',
    SESSION_COOKIE + '=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
  );
}

function deviceIpFor(req: AnyRequest): string {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0].trim();
  const real = req.headers?.['x-real-ip'];
  if (typeof real === 'string' && real.trim()) return real.trim();
  return 'UNKNOWN';
}

async function supabase(path: string, init: RequestInit = {}): Promise<any> {
  const headers = new Headers(init.headers);
  headers.set('apikey', SUPABASE_SERVICE_ROLE_KEY);
  headers.set('Authorization', 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY);
  headers.set('Content-Type', 'application/json');
  if (!headers.has('Prefer')) headers.set('Prefer', 'return=representation');
  const response = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    ...init,
    headers,
  });
  const text = await response.text();
  let body: any = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!response.ok) {
    const message = typeof body === 'object' && body?.message ? body.message : String(body ?? response.statusText);
    const error = new Error(message);
    (error as any).status = response.status;
    throw error;
  }
  return body;
}

async function rpc(name: string, args: Record<string, unknown>): Promise<any> {
  return supabase('rpc/' + name, {
    method: 'POST',
    body: JSON.stringify(args),
  });
}

async function getUserById(id: string): Promise<any | null> {
  const rows = await supabase('ptw_users?select=*&id=eq.' + encodeURIComponent(id) + '&limit=1');
  return rows?.[0] ?? null;
}

async function getUserByUsername(username: string): Promise<any | null> {
  const rows = await supabase('ptw_users?select=*&username=eq.' + encodeURIComponent(username) + '&limit=1');
  return rows?.[0] ?? null;
}

async function getAllUserRows(): Promise<any[]> {
  return (await supabase('ptw_users?select=*&order=username.asc')) ?? [];
}

async function insertUser(row: Record<string, unknown>): Promise<any> {
  const rows = await supabase('ptw_users', {
    method: 'POST',
    body: JSON.stringify(row),
  });
  return rows?.[0] ?? row;
}

async function updateUser(id: string, patch: Record<string, unknown>): Promise<any> {
  const rows = await supabase('ptw_users?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return rows?.[0] ?? null;
}

/** Commits a user create/update and its audit-log entry in a single PostgreSQL transaction. */
async function applyUserTransaction(
  operation: 'insert' | 'update',
  userRow: Record<string, unknown>,
  audit: Record<string, unknown>,
): Promise<any> {
  return rpc('ptw_apply_user_transaction', {
    p_operation: operation,
    p_user: userRow,
    p_audit: audit,
  });
}

function accountAudit(
  actor: any,
  action: string,
  deviceIp: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return {
    id: newId('AUDIT'),
    permitId: null,
    permitNumber: null,
    actorUserId: actor.id,
    actorRole: actor.role,
    eventType: 'UPDATED',
    action,
    fromStatus: null,
    toStatus: null,
    deviceIp,
    payload,
    occurredAt: nowIso(),
  };
}

async function getAllPermitRows(): Promise<any[]> {
  return (await supabase('ptw_permits?select=*&order=updated_at.desc')) ?? [];
}

async function getPermitRow(id: string): Promise<any | null> {
  const rows = await supabase('ptw_permits?select=*&id=eq.' + encodeURIComponent(id) + '&limit=1');
  return rows?.[0] ?? null;
}

async function getNotificationRows(userId: string): Promise<any[]> {
  return (
    await supabase(
      'ptw_notifications?select=*&recipient_user_id=eq.' +
      encodeURIComponent(userId) +
      '&order=created_at.desc&limit=300'
    )
  ) ?? [];
}

function rowUser(row: any): UserAccount {
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    role: row.role,
    platformCode: row.platform_code,
    organization: row.organization ?? undefined,
    certificationNumber: row.certification_number ?? undefined,
    pinHash: '',
    active: Boolean(row.active),
    mustChangePin: Boolean(row.must_change_pin),
    createdAt: row.created_at,
    createdByUserId: row.created_by_user_id ?? 'SYSTEM-BOOTSTRAP',
    lastLoginAt: row.last_login_at ?? undefined,
  };
}

/** Adds contact fields (email/phone) – only for OIM user administration, never broadcast to the whole directory. */
function rowUserWithContact(row: any): UserAccount {
  return {
    ...rowUser(row),
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
  };
}

function rowPermit(row: any): Permit {
  const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
  return {
    ...data,
    updatedAt: data.updatedAt ?? row.updated_at,
  } as Permit;
}

function rowNotification(row: any): AppNotification {
  const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
  return {
    ...data,
    readAt: row.read_at ?? data.readAt,
  } as AppNotification;
}

function filterVisiblePermits(user: any, permits: Permit[]): Permit[] {
  if (!user) return [];
  if (user.role === 'ADMINISTRATOR') return [];
  if (user.role === 'LINE_SUPERVISOR' || user.role === 'PERMIT_APPLICANT') {
    return permits.filter((permit) => permit.platformCode === user.platform_code);
  }
  return permits;
}

async function publicState(userRow: any | null): Promise<Record<string, unknown>> {
  if (!userRow) {
    return { permits: [], users: [], currentUser: null, notifications: [] };
  }

  const userRows = await getAllUserRows();
  const users = userRow.role === 'OIM' ? userRows.map(rowUserWithContact) : userRows.map(rowUser);
  const permitRows = await getAllPermitRows();
  const permits = filterVisiblePermits(userRow, permitRows.map(rowPermit));
  const notifications = (await getNotificationRows(userRow.id)).map(rowNotification);
  return {
    permits,
    users,
    currentUser: rowUserWithContact(userRow),
    notifications,
  };
}

async function ensureBootstrapUser(): Promise<void> {
  const existing = await supabase('ptw_users?select=id&limit=1');
  if (existing?.length) return;

  const username = normalizeUsername(process.env.BOOTSTRAP_OIM_USERNAME ?? '');
  const pin = process.env.BOOTSTRAP_OIM_PIN ?? '';
  const fullName = process.env.BOOTSTRAP_OIM_FULL_NAME ?? '';
  const platformCode = process.env.BOOTSTRAP_OIM_PLATFORM_CODE ?? '';
  if (!username || !validPin(pin) || !fullName || !platformCode) {
    throw new Error('No users exist. Configure the bootstrap OIM environment variables on the server.');
  }

  try {
    await insertUser({
      id: 'U-OIM-BOOTSTRAP',
      username,
      full_name: fullName,
      role: 'OIM',
      platform_code: platformCode,
      email: process.env.BOOTSTRAP_OIM_EMAIL || null,
      phone: process.env.BOOTSTRAP_OIM_PHONE || null,
      pin_hash: hashPinServer(pin),
      active: true,
      must_change_pin: true,
      created_at: nowIso(),
      created_by_user_id: 'SYSTEM-BOOTSTRAP',
      failed_login_count: 0,
      locked_until: null,
      session_version: 1,
    });
  } catch (error) {
    if ((error as any)?.status !== 409) throw error;
  }
}

async function authenticatedUser(req: AnyRequest): Promise<any | null> {
  const token = parseCookies(req.headers?.cookie)[SESSION_COOKIE];
  if (!token) return null;
  const session = verifySessionToken(token);
  if (!session) return null;
  const user = await getUserById(session.uid);
  if (!user || !user.active || Number(user.session_version) !== session.sv) return null;
  if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) return null;
  return user;
}

function operationalUser(user: any): void {
  if (user.must_change_pin) {
    const error = new Error('Bạn phải đổi PIN trước khi thực hiện thao tác nghiệp vụ.');
    (error as any).status = 403;
    throw error;
  }
}

function authFailure(message = 'Phiên làm việc chưa xác thực.'): never {
  const error = new Error(message);
  (error as any).status = 401;
  throw error;
}

/** Validation / business-rule failure caused by the request itself – must surface as 4xx, never the generic 500. */
function badRequest(message: string): never {
  const error = new Error(message);
  (error as any).status = 400;
  throw error;
}

function forbidden(message: string): never {
  const error = new Error(message);
  (error as any).status = 403;
  throw error;
}

function notFound(message: string): never {
  const error = new Error(message);
  (error as any).status = 404;
  throw error;
}

function conflictError(message: string): never {
  const error = new Error(message);
  (error as any).status = 409;
  throw error;
}

function ensurePermission(role: Role, action: any): void {
  const result = checkPermission(role, action);
  if (!result.allowed) {
    const error = new Error(result.reason ?? 'Không có quyền thực hiện hành động.');
    (error as any).status = 403;
    throw error;
  }
}

/**
 * Atomically increments the failure counter (and locks the account past the
 * threshold) in PostgreSQL so concurrent bad attempts can't race the
 * read-modify-write and bypass the lockout.
 */
async function recordAuthFailure(userId: string): Promise<{ failedLoginCount: number; lockedUntil: string | null }> {
  const rows = await rpc('ptw_record_auth_failure', {
    p_user_id: userId,
    p_max_failures: MAX_LOGIN_FAILURES,
    p_lock_ms: LOGIN_LOCK_MS,
  });
  const row = rows?.[0] ?? {};
  return {
    failedLoginCount: Number(row.failed_login_count ?? 0),
    lockedUntil: row.locked_until ?? null,
  };
}

function lockoutError(): never {
  const error = new Error('Tài khoản tạm khóa do có quá nhiều lần xác thực thất bại.');
  (error as any).status = 429;
  throw error;
}

/** Operational PIN check – failures are counted/locked the same way as LOGIN failures. */
async function ensurePin(user: any, pin: string): Promise<void> {
  if (verifyPinHash(pin, user.pin_hash)) return;
  const { lockedUntil } = await recordAuthFailure(user.id);
  if (lockedUntil && new Date(lockedUntil).getTime() > Date.now()) lockoutError();
  const error = new Error('PIN điện tử không đúng.');
  (error as any).status = 403;
  throw error;
}

async function authenticateLogin(usernameInput: string, pin: string): Promise<any> {
  await ensureBootstrapUser();
  const username = normalizeUsername(usernameInput);
  const user = await getUserByUsername(username);
  const now = Date.now();

  if (!user) return null;

  if (user.locked_until && new Date(user.locked_until).getTime() > now) {
    lockoutError();
  }

  if (!user.active || !verifyPinHash(pin, user.pin_hash)) {
    const { lockedUntil } = await recordAuthFailure(user.id);
    if (lockedUntil && new Date(lockedUntil).getTime() > now) lockoutError();
    const error = new Error('Username hoặc PIN không đúng.');
    (error as any).status = 401;
    throw error;
  }

  return await updateUser(user.id, {
    failed_login_count: 0,
    locked_until: null,
    last_login_at: nowIso(),
  }) ?? user;
}

async function parseBody(req: AnyRequest): Promise<any> {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) resolve({});
      else {
        try { resolve(JSON.parse(raw)); } catch { resolve({}); }
      }
    });
  });
}

function sendJson(res: AnyResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function errorStatus(error: unknown): number {
  const status = Number((error as any)?.status);
  if (Number.isInteger(status) && status >= 400) return status;
  const message = String((error as any)?.message ?? '');
  if (message.includes('PTW_VERSION_CONFLICT') || message.includes('duplicate key')) return 409;
  return 500;
}

function sendError(res: AnyResponse, error: unknown): void {
  const status = errorStatus(error);
  sendJson(res, status, {
    ok: false,
    error: status === 500 ? 'Lỗi máy chủ – kiểm tra cấu hình backend/database.' : String((error as any)?.message ?? 'Yêu cầu thất bại.'),
  });
}

function serverAudit(permit: Permit, entry: StatusHistoryEntry): Record<string, unknown> {
  return {
    id: newId('AUDIT'),
    permitId: permit.id,
    permitNumber: permit.permitNumber,
    actorUserId: entry.userId,
    actorRole: entry.userRole,
    eventType: entry.eventType,
    action: entry.action,
    fromStatus: entry.fromStatus ?? '',
    toStatus: entry.toStatus,
    deviceIp: entry.deviceIp,
    payload: {
      comment: entry.comment,
      oldValues: entry.oldValues,
      newValues: entry.newValues,
      sequence: entry.sequence,
    },
    occurredAt: entry.timestamp,
  };
}

function historyAuditEntries(before: Permit, after: Permit): Record<string, unknown>[] {
  return after.statusHistory.slice(before.statusHistory.length).map((entry) => serverAudit(after, entry));
}

function signApproval(permit: Permit, actor: any, action: string, decidedAt: string): string {
  return createHmac('sha256', PTW_AUDIT_SECRET)
    .update(
      permit.id + '|' + permit.permitNumber + '|Rev' + String(permit.revisionNo) +
      '|' + action + '|' + actor.id + '|' + decidedAt
    )
    .digest('hex');
}

function makeHistory(
  permit: Permit,
  fromStatus: PermitStatus,
  toStatus: PermitStatus,
  entry: Omit<StatusHistoryEntry, 'id' | 'sequence' | 'fromStatus' | 'toStatus'>,
): StatusHistoryEntry {
  return {
    id: newId('H'),
    sequence: permit.statusHistory.length,
    fromStatus,
    toStatus,
    ...entry,
  };
}

function notify(
  permit: Permit,
  event: AppNotification['event'],
  message: string,
  severity: AppNotification['severity'],
  recipients: string[],
): AppNotification[] {
  return recipients.map((recipientUserId) => ({
    id: newId('N'),
    recipientUserId,
    permitId: permit.id,
    permitNumber: permit.permitNumber,
    event,
    message,
    severity,
    createdAt: nowIso(),
  }));
}

function approverIdsForLevel(chainRole: Role, users: any[]): string[] {
  return users.filter((user) => user.role === chainRole && user.active).map((user) => user.id);
}

async function persistPermitTransaction(
  changes: Record<string, unknown>[],
  audits: Record<string, unknown>[],
  notifications: AppNotification[],
): Promise<void> {
  await rpc('ptw_apply_permit_transaction', {
    p_changes: changes,
    p_audits: audits,
    p_notifications: notifications,
  });
}

function dbPermitChange(row: any, data: Permit): Record<string, unknown> {
  return {
    operation: 'update',
    id: row.id,
    expectedVersion: Number(row.version),
    data,
  };
}

function dbPermitInsert(data: Permit): Record<string, unknown> {
  return { operation: 'insert', data };
}

async function requirePermit(id: string): Promise<{ row: any; permit: Permit }> {
  const row = await getPermitRow(id);
  if (!row) {
    const error = new Error('Không tìm thấy permit.');
    (error as any).status = 404;
    throw error;
  }
  return { row, permit: rowPermit(row) };
}

function ensurePermitVisibleToUser(user: any, permit: Permit): void {
  if (user.role === 'ADMINISTRATOR') {
    const error = new Error('Bạn không có quyền xem hồ sơ permit này.');
    (error as any).status = 403;
    throw error;
  }
  if (
    (user.role === 'LINE_SUPERVISOR' || user.role === 'PERMIT_APPLICANT') &&
    permit.platformCode !== user.platform_code
  ) {
    const error = new Error('Permit không thuộc phạm vi giàn của tài khoản.');
    (error as any).status = 403;
    throw error;
  }
}

function validateChecklist(permitType: string, confirmed: unknown): void {
  const meta = getPermitTypeMeta(permitType as any);
  const values = Array.isArray(confirmed)
    ? confirmed as Array<{ itemId: string; confirmed: boolean }>
    : [];
  const map = new Map(values.map((item) => [item.itemId, Boolean(item.confirmed)]));
  const missing = meta.checklist.filter((item) => item.required && !map.get(item.id));
  if (missing.length) {
    const error = new Error('Còn ' + missing.length + ' cấu phần an toàn bắt buộc chưa được xác nhận.');
    (error as any).status = 400;
    throw error;
  }
}

async function createDraft(user: any, body: any, req: AnyRequest): Promise<string> {
  operationalUser(user);
  ensurePermission(user.role as Role, 'CREATE');
  await ensurePin(user, String(body.pin ?? ''));

  const data = body.data ?? {};
  if (!String(data.workDescription ?? '').trim()) badRequest('Mô tả công việc là bắt buộc.');
  if (!data.areaId) badRequest('Khu vực (Area) là bắt buộc.');
  if (!data.plannedStart || !data.plannedEnd) badRequest('Thời gian bắt đầu/kết thúc dự kiến là bắt buộc.');

  const plannedStart = new Date(data.plannedStart);
  const plannedEnd = new Date(data.plannedEnd);
  if (!Number.isFinite(plannedStart.getTime()) || !Number.isFinite(plannedEnd.getTime()) || plannedEnd.getTime() <= plannedStart.getTime()) {
    badRequest('Khung thời gian không hợp lệ.');
  }

  const area = AREAS.find((item) => item.id === data.areaId);
  if (!area) badRequest('Khu vực không tồn tại trong danh mục giàn.');
  if (data.platformCode && data.platformCode !== area.platformCode) badRequest('Khu vực không thuộc đúng giàn đã chọn.');
  if (data.equipmentTag && data.equipmentTag !== 'N/A') {
    const equipment = EQUIPMENT.find((item) => item.tag === data.equipmentTag);
    if (!equipment || equipment.areaId !== area.id) badRequest('Thiết bị không thuộc khu vực đã chọn.');
  }
  if (!PLATFORMS.some((platform) => platform.code === area.platformCode)) badRequest('Giàn không hợp lệ.');

  const permitType = data.permitType ?? 'COLD_WORK';
  validateChecklist(permitType, data.safetyChecklistConfirmed);
  const typeMeta = getPermitTypeMeta(permitType);

  const existingRows = await getAllPermitRows();
  const year = new Date().getFullYear();
  const prefix = area.platformCode + '-PTW-' + String(year) + '-';
  const nums = existingRows
    .map((row) => String(row.permit_number))
    .filter((number) => number.startsWith(prefix))
    .map((number) => Number(number.slice(prefix.length)))
    .filter((number) => Number.isFinite(number));
  const nextSeq = Math.max(0, ...nums) + 1;
  const permitNumber = prefix + String(nextSeq).padStart(6, '0');

  const classifications = Array.from(new Set([
    ...typeMeta.workClassifications,
    ...(area.hazardous ? ['HIGH_RISK_AREA'] : []),
    ...(data.criticalWork ? ['CRITICAL'] : []),
  ])) as Permit['workClassifications'];

  const chain = buildApprovalChain({
    permitType,
    riskLevel: data.riskLevel ?? 'LOW',
    areaHazardous: area.hazardous,
    criticalWork: Boolean(data.criticalWork),
    workClassifications: classifications as any,
  }).chain;

  const createdAt = nowIso();
  const permit: Permit = {
    id: newId('P'),
    permitNumber,
    revisionNo: 0,
    platformCode: area.platformCode,
    permitType,
    riskLevel: data.riskLevel ?? 'LOW',
    workClassifications: classifications,
    criticalWork: Boolean(data.criticalWork),
    areaId: area.id,
    areaCode: area.code,
    areaName: area.name,
    equipmentTag: data.equipmentTag ?? 'N/A',
    workDescription: String(data.workDescription).trim(),
    reasonForIssuing: String(data.reasonForIssuing ?? '').trim() || undefined,
    contractorCompany: data.contractorCompany ?? 'Nội bộ Vận hành',
    companyDepartment: data.companyDepartment ?? 'Operations',
    applicantUserId: user.id,
    applicantName: user.full_name,
    applicantRole: user.role,
    supervisorUserId: data.supervisorUserId ?? user.id,
    supervisorName: data.supervisorName ?? user.full_name,
    workOrderNo: data.workOrderNo ?? '',
    priority: data.priority ?? 'MEDIUM',
    plannedStart: plannedStart.toISOString(),
    plannedEnd: plannedEnd.toISOString(),
    status: 'DRAFT',
    currentApprovalLevel: null,
    approvalChain: chain,
    requiresGasTest: typeMeta.requiresGasTest,
    safetyChecklistConfirmed: Array.isArray(data.safetyChecklistConfirmed) ? data.safetyChecklistConfirmed : [],
    gasTests: [],
    riskAssessments: [],
    lotoRecords: [],
    simopsAssessments: [],
    acknowledgedConflictIds: [],
    statusHistory: [{
      id: newId('H'),
      sequence: 0,
      fromStatus: null,
      toStatus: 'DRAFT',
      eventType: 'CREATED',
      userId: user.id,
      userName: user.full_name,
      userRole: user.role,
      action: 'Tạo mới PTW ' + permitNumber + ' (chuỗi duyệt sinh bởi Rule Engine)',
      deviceIp: deviceIpFor(req),
      newValues: {
        status: 'DRAFT',
        rule: chain.filter((step) => step.required).map((step) => step.level).join(' → '),
      },
      timestamp: createdAt,
    }],
    revisions: [],
    createdAt,
    updatedAt: createdAt,
    createdById: user.id,
  };

  try {
    await persistPermitTransaction(
      [dbPermitInsert(permit)],
      historyAuditEntries({ ...permit, statusHistory: [] }, permit),
      []
    );
  } catch (error) {
    if (errorStatus(error) !== 409) throw error;
    const retryRows = await getAllPermitRows();
    const retryNums = retryRows
      .map((row) => String(row.permit_number))
      .filter((number) => number.startsWith(prefix))
      .map((number) => Number(number.slice(prefix.length)))
      .filter((number) => Number.isFinite(number));
    const retryNumber = prefix + String(Math.max(0, ...retryNums) + 1).padStart(6, '0');
    permit.permitNumber = retryNumber;
    permit.statusHistory[0].action = 'Tạo mới PTW ' + retryNumber + ' (chuỗi duyệt sinh bởi Rule Engine)';
    await persistPermitTransaction(
      [dbPermitInsert(permit)],
      historyAuditEntries({ ...permit, statusHistory: [] }, permit),
      []
    );
  }
  return permit.id;
}

/** Editable business fields for a draft. Workflow evidence (gasTests, status, approvalChain, acknowledgedConflictIds, ...) is never accepted from the client. */
const DRAFT_EDITABLE_FIELDS = [
  'permitType', 'riskLevel', 'areaId', 'equipmentTag', 'workDescription',
  'reasonForIssuing', 'contractorCompany', 'companyDepartment',
  'supervisorUserId', 'supervisorName', 'workOrderNo', 'priority',
  'plannedStart', 'plannedEnd', 'criticalWork', 'safetyChecklistConfirmed',
] as const;

async function updateDraft(user: any, body: any, req: AnyRequest): Promise<void> {
  operationalUser(user);
  await ensurePin(user, String(body.pin ?? ''));
  const current = await requirePermit(String(body.permitId ?? ''));
  ensurePermitVisibleToUser(user, current.permit);

  if (!['DRAFT', 'RETURNED'].includes(current.permit.status)) badRequest('Permit đã gửi/duyệt – dữ liệu bị khóa. Hãy dùng Request Revision.');
  if (current.permit.applicantUserId !== user.id && user.role !== 'PERMIT_CONTROLLER') forbidden('Chỉ người yêu cầu hoặc PTW Controller được sửa bản nháp này.');

  const rawPatch = body.patch ?? {};
  const patch: Record<string, unknown> = {};
  for (const key of DRAFT_EDITABLE_FIELDS) {
    if (rawPatch[key] !== undefined) patch[key] = rawPatch[key];
  }

  const candidateArea = AREAS.find((area) => area.id === (patch.areaId ?? current.permit.areaId));
  if (!candidateArea) badRequest('Khu vực không tồn tại trong danh mục giàn.');
  const candidatePermitType = (patch.permitType ?? current.permit.permitType) as string;
  const candidateCriticalWork = Boolean(patch.criticalWork ?? current.permit.criticalWork);
  const candidateEquipmentTag = (patch.equipmentTag ?? current.permit.equipmentTag) as string;
  if (candidateEquipmentTag && candidateEquipmentTag !== 'N/A') {
    const equipment = EQUIPMENT.find((item) => item.tag === candidateEquipmentTag);
    if (!equipment || equipment.areaId !== candidateArea.id) badRequest('Thiết bị không thuộc khu vực đã chọn.');
  }

  const candidatePlannedStart = new Date((patch.plannedStart ?? current.permit.plannedStart) as string);
  const candidatePlannedEnd = new Date((patch.plannedEnd ?? current.permit.plannedEnd) as string);
  if (
    !Number.isFinite(candidatePlannedStart.getTime()) ||
    !Number.isFinite(candidatePlannedEnd.getTime()) ||
    candidatePlannedEnd.getTime() <= candidatePlannedStart.getTime()
  ) {
    badRequest('Khung thời gian không hợp lệ.');
  }

  const candidateMeta = getPermitTypeMeta(candidatePermitType as any);
  const candidateChecklist = patch.safetyChecklistConfirmed ?? current.permit.safetyChecklistConfirmed;
  validateChecklist(candidatePermitType, candidateChecklist);
  const candidateClassifications = Array.from(new Set([
    ...candidateMeta.workClassifications,
    ...(candidateArea.hazardous ? ['HIGH_RISK_AREA'] : []),
    ...(candidateCriticalWork ? ['CRITICAL'] : []),
  ])) as Permit['workClassifications'];

  const updated: Permit = {
    ...current.permit,
    ...patch,
    permitType: candidatePermitType as Permit['permitType'],
    platformCode: candidateArea.platformCode,
    areaId: candidateArea.id,
    areaCode: candidateArea.code,
    areaName: candidateArea.name,
    equipmentTag: candidateEquipmentTag,
    criticalWork: candidateCriticalWork,
    workClassifications: candidateClassifications,
    requiresGasTest: candidateMeta.requiresGasTest,
    plannedStart: candidatePlannedStart.toISOString(),
    plannedEnd: candidatePlannedEnd.toISOString(),
    safetyChecklistConfirmed: candidateChecklist as Permit['safetyChecklistConfirmed'],
    updatedAt: nowIso(),
    statusHistory: [...current.permit.statusHistory],
  };

  updated.statusHistory.push(makeHistory(
    current.permit,
    current.permit.status,
    current.permit.status,
    {
      eventType: 'UPDATED',
      userId: user.id,
      userName: user.full_name,
      userRole: user.role,
      action: 'Cập nhật nội dung bản nháp',
      deviceIp: deviceIpFor(req),
      oldValues: { description: current.permit.workDescription },
      newValues: { description: String(patch.workDescription ?? current.permit.workDescription) },
      timestamp: nowIso(),
    }
  ));

  await persistPermitTransaction(
    [dbPermitChange(current.row, updated)],
    historyAuditEntries(current.permit, updated),
    []
  );
}

async function transition(user: any, body: any, req: AnyRequest): Promise<void> {
  operationalUser(user);
  const current = await requirePermit(String(body.permitId ?? ''));
  ensurePermitVisibleToUser(user, current.permit);

  const kind = String(body.kind ?? '');
  if (!['SUBMIT','APPROVE','REJECT','RETURN','START_WORK','SUSPEND','RESUME','COMPLETE_WORK','CLOSE','CANCEL'].includes(kind)) {
    badRequest('Hành động không được hỗ trợ.');
  }
  ensurePermission(user.role as Role, kind === 'SUBMIT' ? 'SUBMIT' : kind);
  await ensurePin(user, String(body.pin ?? ''));

  const ctx = {
    role: user.role as Role,
    userId: user.id,
    userName: user.full_name,
    deviceIp: deviceIpFor(req),
    comment: String(body.comment ?? '').trim() || undefined,
  };

  let result: any;
  switch (kind) {
    case 'SUBMIT': {
      const conflicts = detectSimopsConflicts(current.permit, (await getAllPermitRows()).map(rowPermit));
      const blockers = conflicts.filter(
        (conflict) => conflict.level === 'BLOCK' && !current.permit.acknowledgedConflictIds.includes(conflict.conflictId)
      );
      if (blockers.length) badRequest('Xung đột SIMOPS mức BLOCK chưa được đánh giá & ghi nhận quyết định.');
      result = submitPermit(current.permit, ctx);
      break;
    }
    case 'APPROVE': result = approveAtCurrentLevel(current.permit, ctx); break;
    case 'REJECT': result = rejectAtCurrentLevel(current.permit, ctx); break;
    case 'RETURN': result = returnToApplicant(current.permit, ctx); break;
    case 'START_WORK': result = startWork(current.permit, ctx); break;
    case 'SUSPEND': result = suspendPermit(current.permit, ctx); break;
    case 'RESUME': result = resumePermit(current.permit, ctx); break;
    case 'COMPLETE_WORK': result = completeWork(current.permit, ctx); break;
    case 'CLOSE': result = closePermit(current.permit, ctx); break;
    case 'CANCEL': result = cancelPermit(current.permit, ctx); break;
    default: badRequest('Hành động không được hỗ trợ.');
  }

  if (!result?.ok || !result.permit) badRequest(result?.error ?? 'Transition thất bại.');
  const after = result.permit as Permit;

  if (kind === 'APPROVE') {
    const latestDone = [...after.approvalChain]
      .filter((step) => step.decidedByUserId === user.id && step.decidedAt)
      .sort((a, b) => String(a.decidedAt).localeCompare(String(b.decidedAt)))
      .pop();
    if (latestDone?.decidedAt) {
      latestDone.signatureHash = signApproval(after, user, 'APPROVE', latestDone.decidedAt);
    }
  }

  const users = await getAllUserRows();
  const notifications: AppNotification[] = [];
  switch (after.status) {
    case 'LINE_SUPERVISOR_REVIEW':
    case 'FPS_REVIEW':
    case 'DEPUTY_OIM_REVIEW':
    case 'OIM_REVIEW': {
      const level = after.currentApprovalLevel!;
      const roleMap: Record<string, Role> = {
        LINE_SUPERVISOR: 'LINE_SUPERVISOR',
        FPS: 'FPS',
        DEPUTY_OIM: 'DEPUTY_OIM',
        OIM: 'OIM',
      };
      notifications.push(...notify(
        after,
        'WAITING_FOR_YOUR_APPROVAL',
        after.permitNumber + ' đang chờ phê duyệt cấp ' + level + '.',
        'WARNING',
        approverIdsForLevel(roleMap[level], users)
      ));
      break;
    }
    case 'APPROVED':
      notifications.push(...notify(
        after,
        'PTW_APPROVED',
        after.permitNumber + ' đã được phát hành (ISSUED).',
        'INFO',
        [after.applicantUserId, ...approverIdsForLevel('PERMIT_CONTROLLER', users)]
      ));
      break;
    case 'REJECTED':
      notifications.push(...notify(
        after,
        'PTW_REJECTED',
        current.permit.permitNumber + ' bị từ chối ở cấp ' + String(current.permit.currentApprovalLevel ?? '') + '.',
        'CRITICAL',
        [after.applicantUserId]
      ));
      break;
    case 'RETURNED':
      notifications.push(...notify(after, 'PTW_RETURNED', after.permitNumber + ' được trả về để bổ sung.', 'WARNING', [after.applicantUserId]));
      break;
    case 'SUSPENDED':
      notifications.push(...notify(after, 'PTW_SUSPENDED', after.permitNumber + ' bị đình chỉ.', 'CRITICAL', [after.applicantUserId]));
      break;
    case 'WORK_IN_PROGRESS':
      if (current.permit.status === 'SUSPENDED') {
        notifications.push(...notify(after, 'PTW_RESUMED', after.permitNumber + ' được tiếp tục thi công.', 'INFO', [after.applicantUserId]));
      }
      break;
    case 'WORK_COMPLETED':
      notifications.push(...notify(after, 'PTW_WORK_COMPLETED', after.permitNumber + ': công việc hoàn thành, chờ đóng permit.', 'INFO', approverIdsForLevel('PERMIT_CONTROLLER', users)));
      break;
    case 'CLOSED':
      notifications.push(...notify(after, 'PTW_CLOSED', after.permitNumber + ' đã đóng.', 'INFO', [after.applicantUserId]));
      break;
    case 'CANCELLED':
      notifications.push(...notify(after, 'PTW_CANCELLED', after.permitNumber + ' đã bị hủy.', 'WARNING', [after.applicantUserId]));
      break;
    default:
      break;
  }

  const changes: Record<string, unknown>[] = [dbPermitChange(current.row, after)];
  let audits = historyAuditEntries(current.permit, after);

  if (after.status === 'APPROVED' && after.parentPermitId) {
    const parent = await requirePermit(after.parentPermitId);
    if (!parent.permit.supersededByPermitId) {
      const changedParent: Permit = {
        ...parent.permit,
        supersededByPermitId: after.id,
        statusHistory: [...parent.permit.statusHistory],
        updatedAt: nowIso(),
      };
      changedParent.statusHistory.push({
        id: newId('H'),
        sequence: parent.permit.statusHistory.length,
        fromStatus: parent.permit.status,
        toStatus: parent.permit.status,
        eventType: 'REVISION_CREATED',
        userId: after.createdById,
        userName: after.applicantName,
        userRole: 'PERMIT_CONTROLLER',
        action: 'Bản permit này đã được thay thế bởi Revision mới đã phát hành',
        deviceIp: deviceIpFor(req),
        newValues: { supersededByPermitId: after.id },
        timestamp: nowIso(),
      });
      changes.push(dbPermitChange(parent.row, changedParent));
      audits = audits.concat(historyAuditEntries(parent.permit, changedParent));
    }
  }

  await persistPermitTransaction(changes, audits, notifications);
}

async function addGasTest(user: any, body: any, req: AnyRequest): Promise<void> {
  operationalUser(user);
  const current = await requirePermit(String(body.permitId ?? ''));
  ensurePermitVisibleToUser(user, current.permit);
  ensurePermission(user.role as Role, 'ADD_GAS_TEST');
  await ensurePin(user, String(body.pin ?? ''));

  if (TERMINAL_STATUSES.includes(current.permit.status)) {
    badRequest('Permit đã ở trạng thái kết thúc – không thể ghi nhận gas test.');
  }

  const input = body.record ?? {};
  if (!input.gasDetectorId || !input.calibrationDueDate || !input.location) {
    badRequest('Bắt buộc: Mã máy dò, Hạn hiệu chuẩn, Vị trí đo.');
  }
  if (!hasAllRequiredParameters(input.readings ?? [])) {
    badRequest('Phải đo đủ 4 thông số O₂ / LEL / H₂S / CO.');
  }
  const testedAt = nowIso();
  const calibrationDate = new Date(input.calibrationDueDate);
  if (!Number.isFinite(calibrationDate.getTime()) || !isDetectorCalibrationValid(calibrationDate.toISOString(), testedAt)) {
    badRequest('Máy dò đã hết hạn hiệu chuẩn – phép đo không có giá trị pháp lý.');
  }

  const rawReadings: any[] = Array.isArray(input.readings) ? input.readings : [];
  const readings = rawReadings.map((reading: any) => ({
    parameter: reading.parameter,
    value: Number(reading.value),
    unit: reading.unit,
    min: reading.min,
    max: reading.max,
    result: reading.result,
  })) as GasTestRecord['readings'];

  const overall = computeOverallResult({
    readings,
    calibrationDueDate: calibrationDate.toISOString(),
    testedAt,
  });

  const gasTest: GasTestRecord = {
    id: newId('GT'),
    sequenceNo: current.permit.gasTests.length + 1,
    readings,
    overallResult: overall,
    gasDetectorId: String(input.gasDetectorId).trim().toUpperCase(),
    calibrationDueDate: calibrationDate.toISOString(),
    testedByUserId: user.id,
    testedByName: user.full_name,
    testedAt,
    location: String(input.location).trim(),
    notes: String(input.notes ?? '').trim() || undefined,
  };

  const updated: Permit = {
    ...current.permit,
    gasTests: [...current.permit.gasTests, gasTest],
    updatedAt: testedAt,
    statusHistory: [...current.permit.statusHistory],
  };
  updated.statusHistory.push(makeHistory(
    current.permit,
    current.permit.status,
    current.permit.status,
    {
      eventType: 'GAS_TEST_ADDED',
      userId: user.id,
      userName: user.full_name,
      userRole: user.role,
      action: 'Ghi nhận Gas Test #' + String(gasTest.sequenceNo) + ' (' + overall + ') – detector ' + gasTest.gasDetectorId,
      deviceIp: deviceIpFor(req),
      newValues: { result: overall, detector: gasTest.gasDetectorId },
      timestamp: testedAt,
    }
  ));

  const notifications = overall === 'FAIL'
    ? notify(updated, 'GAS_TEST_FAIL', 'Gas test FAIL trên ' + updated.permitNumber + ' – dừng ngay công việc liên quan.', 'CRITICAL', [updated.applicantUserId])
    : [];

  await persistPermitTransaction(
    [dbPermitChange(current.row, updated)],
    historyAuditEntries(current.permit, updated),
    notifications
  );
}

async function acknowledgeSimops(user: any, body: any, req: AnyRequest): Promise<void> {
  operationalUser(user);
  if (!['OIM', 'DEPUTY_OIM', 'FPS'].includes(user.role)) {
    forbidden('Chỉ FPS / Deputy OIM / OIM được ghi nhận quyết định xử lý xung đột SIMOPS.');
  }
  ensurePermission(user.role as Role, 'REVIEW');
  await ensurePin(user, String(body.pin ?? ''));

  const current = await requirePermit(String(body.permitId ?? ''));
  ensurePermitVisibleToUser(user, current.permit);
  const allPermits = (await getAllPermitRows()).map(rowPermit);
  const conflicts = detectSimopsConflicts(current.permit, allPermits);
  const conflictId = String(body.conflictId ?? '');
  const conflict: SimopsConflict | undefined = conflicts.find((item) => item.conflictId === conflictId);
  if (!conflict) badRequest('Xung đột SIMOPS không còn tồn tại hoặc không hợp lệ.');
  if (current.permit.acknowledgedConflictIds.includes(conflictId)) return;

  const note = String(body.decisionNote ?? '').trim();
  if (!note) badRequest('Kết luận xử lý xung đột là bắt buộc.');
  const timestamp = nowIso();
  const updated: Permit = {
    ...current.permit,
    acknowledgedConflictIds: [...current.permit.acknowledgedConflictIds, conflictId],
    simopsAssessments: [
      ...current.permit.simopsAssessments,
      {
        id: newId('SIMOPS'),
        code: conflictId,
        assessmentSummary: note,
        decision: 'PROCEED_WITH_CONTROLS',
        decidedByUserId: user.id,
        decidedAt: timestamp,
      },
    ],
    statusHistory: [...current.permit.statusHistory],
    updatedAt: timestamp,
  };
  updated.statusHistory.push(makeHistory(
    current.permit,
    current.permit.status,
    current.permit.status,
    {
      eventType: 'SIMOPS_CONFLICT_ACK',
      userId: user.id,
      userName: user.full_name,
      userRole: user.role,
      action: 'Ghi nhận đánh giá xung đột SIMOPS ' + conflictId,
      comment: note,
      deviceIp: deviceIpFor(req),
      timestamp,
    }
  ));

  await persistPermitTransaction(
    [dbPermitChange(current.row, updated)],
    historyAuditEntries(current.permit, updated),
    []
  );
}

async function requestRevision(user: any, body: any, req: AnyRequest): Promise<string> {
  operationalUser(user);
  ensurePermission(user.role as Role, 'REQUEST_REVISION');
  await ensurePin(user, String(body.pin ?? ''));
  const current = await requirePermit(String(body.permitId ?? ''));
  ensurePermitVisibleToUser(user, current.permit);

  if (!['APPROVED', 'WORK_IN_PROGRESS', 'SUSPENDED', 'RESUMED', 'WORK_COMPLETED'].includes(current.permit.status)) {
    badRequest('Chỉ permit đã phát hành mới cần tạo Revision.');
  }

  const reason = String(body.reason ?? '').trim();
  if (!reason) badRequest('Lý do revision là bắt buộc.');

  const snapshot: Permit = JSON.parse(JSON.stringify(current.permit));
  const createdAt = nowIso();
  const newPermit: Permit = {
    ...snapshot,
    id: newId('P'),
    revisionNo: current.permit.revisionNo + 1,
    parentPermitId: current.permit.id,
    previousRevisionOfPermitId: current.permit.id,
    revisionReason: reason,
    status: 'DRAFT',
    supersededByPermitId: undefined,
    actualStart: undefined,
    actualEnd: undefined,
    approvedAt: undefined,
    validUntil: undefined,
    suspensionReason: undefined,
    closureNotes: undefined,
    currentApprovalLevel: null,
    approvalChain: buildApprovalChain({
      permitType: current.permit.permitType,
      riskLevel: current.permit.riskLevel,
      areaHazardous: current.permit.workClassifications.includes('HIGH_RISK_AREA'),
      criticalWork: current.permit.criticalWork,
      workClassifications: current.permit.workClassifications,
    }).chain,
    gasTests: [],
    acknowledgedConflictIds: [],
    statusHistory: [],
    revisions: [],
    createdAt,
    updatedAt: createdAt,
    createdById: user.id,
  };

  newPermit.statusHistory.push({
    id: newId('H'),
    sequence: 0,
    fromStatus: current.permit.status,
    toStatus: 'DRAFT',
    eventType: 'REVISION_CREATED',
    userId: user.id,
    userName: user.full_name,
    userRole: user.role,
    action: 'Tạo Rev ' + String(newPermit.revisionNo) + ' từ ' + current.permit.permitNumber + ' Rev ' + String(current.permit.revisionNo) + ' – yêu cầu phê duyệt lại toàn bộ chuỗi',
    comment: reason,
    deviceIp: deviceIpFor(req),
    oldValues: { revision: 'Rev ' + String(current.permit.revisionNo) },
    newValues: { revision: 'Rev ' + String(newPermit.revisionNo) },
    timestamp: createdAt,
  });

  const archived: Permit = {
    ...current.permit,
    revisions: [
      ...current.permit.revisions,
      {
        revisionNo: current.permit.revisionNo,
        createdAt: nowIso(),
        createdByUserId: user.id,
        reason,
        snapshot,
      },
    ],
    statusHistory: [...current.permit.statusHistory],
    updatedAt: nowIso(),
  };

  archived.statusHistory.push(makeHistory(
    current.permit,
    current.permit.status,
    current.permit.status,
    {
      eventType: 'REVISION_REQUESTED',
      userId: user.id,
      userName: user.full_name,
      userRole: user.role,
      action: 'Yêu cầu Revision → ' + current.permit.permitNumber + ' Rev ' + String(current.permit.revisionNo + 1),
      comment: reason,
      deviceIp: deviceIpFor(req),
      timestamp: nowIso(),
    }
  ));

  await persistPermitTransaction(
    [
      dbPermitChange(current.row, archived),
      dbPermitInsert(newPermit),
    ],
    historyAuditEntries(current.permit, archived).concat(
      historyAuditEntries({ ...newPermit, statusHistory: [] }, newPermit)
    ),
    []
  );
  return newPermit.id;
}

async function changeOwnPin(user: any, body: any, res: AnyResponse): Promise<any> {
  const currentPin = String(body.currentPin ?? '');
  const newPin = String(body.newPin ?? '');
  if (!validPin(newPin)) badRequest('PIN mới phải là 4–8 chữ số.');
  if (!verifyPinHash(currentPin, user.pin_hash)) forbidden('PIN hiện tại không đúng.');
  if (verifyPinHash(newPin, user.pin_hash)) badRequest('PIN mới phải khác PIN hiện tại.');

  const sessionVersion = Number(user.session_version) + 1;
  const updated = await updateUser(user.id, {
    pin_hash: hashPinServer(newPin),
    must_change_pin: false,
    failed_login_count: 0,
    locked_until: null,
    session_version: sessionVersion,
  });
  setSessionCookie(res, user.id, sessionVersion);
  return updated ?? user;
}

async function createUserAccount(user: any, body: any): Promise<void> {
  operationalUser(user);
  ensurePermission(user.role as Role, 'MANAGE_USERS');
  await ensurePin(user, String(body.operatorPin ?? ''));

  const input = body.input ?? {};
  const username = normalizeUsername(String(input.username ?? ''));
  const initialPin = String(input.initialPin ?? '');
  if (!/^[a-z][a-z0-9._-]{2,29}$/.test(username)) badRequest('Username không hợp lệ (3–30 ký tự, bắt đầu bằng chữ).');
  if (!validPin(initialPin)) badRequest('PIN khởi tạo phải là 4–8 chữ số.');
  if (username === normalizeUsername(user.username)) badRequest('Không thể tạo lại chính tài khoản của bạn.');
  if (await getUserByUsername(username)) conflictError('Username đã tồn tại trong danh bạ hệ thống.');

  const newUserId = newId('U');
  const created = await applyUserTransaction(
    'insert',
    {
      id: newUserId,
      username,
      full_name: String(input.fullName ?? '').trim(),
      role: input.role,
      platform_code: input.platformCode ?? user.platform_code,
      email: input.email || null,
      phone: input.phone || null,
      organization: input.organization || null,
      certification_number: input.certificationNumber || null,
      pin_hash: hashPinServer(initialPin),
      active: true,
      must_change_pin: true,
      created_at: nowIso(),
      created_by_user_id: user.id,
      failed_login_count: 0,
      locked_until: null,
      session_version: 1,
    },
    accountAudit(user, 'Tạo tài khoản người dùng ' + username, 'SERVER', { targetUserId: newUserId, targetRole: input.role }),
  );
  void created;
}

async function changeUserPin(user: any, body: any): Promise<void> {
  operationalUser(user);
  ensurePermission(user.role as Role, 'MANAGE_USERS');
  await ensurePin(user, String(body.operatorPin ?? ''));
  const userId = String(body.userId ?? '');
  const newPin = String(body.newPin ?? '');
  if (!validPin(newPin)) badRequest('PIN mới phải là 4–8 chữ số.');
  const target = await getUserById(userId);
  if (!target) notFound('Không tìm thấy tài khoản đích.');

  await applyUserTransaction(
    'update',
    {
      id: target.id,
      pin_hash: hashPinServer(newPin),
      must_change_pin: true,
      failed_login_count: 0,
      locked_until: '',
      session_version: Number(target.session_version) + 1,
    },
    accountAudit(user, 'Cấp lại PIN tài khoản ' + target.username, 'SERVER', { targetUserId: target.id }),
  );
}

async function toggleUserActive(user: any, body: any, req: AnyRequest): Promise<void> {
  operationalUser(user);
  ensurePermission(user.role as Role, 'MANAGE_USERS');
  await ensurePin(user, String(body.operatorPin ?? ''));
  const userId = String(body.userId ?? '');
  if (userId === user.id) badRequest('Không thể khóa chính tài khoản đang đăng nhập.');
  const target = await getUserById(userId);
  if (!target) notFound('Không tìm thấy tài khoản đích.');

  const active = Boolean(body.active);
  await applyUserTransaction(
    'update',
    {
      id: target.id,
      active,
      session_version: Number(target.session_version) + 1,
      // Re-activating a locked account also clears the lockout so the admin's
      // unlock takes effect immediately instead of leaving the user 429'd
      // until the original lock window expires.
      ...(active ? { locked_until: '', failed_login_count: 0 } : {}),
    },
    accountAudit(user, (active ? 'Mở khóa' : 'Khóa') + ' tài khoản ' + target.username, deviceIpFor(req), { targetUserId: target.id, active }),
  );
}

async function markNotificationRead(user: any, body: any): Promise<void> {
  const id = String(body.id ?? '');
  const rows = await supabase(
    'ptw_notifications?select=id&recipient_user_id=eq.' +
    encodeURIComponent(user.id) +
    '&id=eq.' + encodeURIComponent(id) + '&limit=1'
  );
  if (!rows?.[0]) notFound('Thông báo không tồn tại hoặc không thuộc phiên của bạn.');

  const timestamp = nowIso();
  const existing = await supabase(
    'ptw_notifications?select=data&recipient_user_id=eq.' +
    encodeURIComponent(user.id) +
    '&id=eq.' + encodeURIComponent(id) + '&limit=1'
  );
  const data = existing?.[0]?.data ? { ...existing[0].data, readAt: timestamp } : { readAt: timestamp };

  await supabase('ptw_notifications?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH',
    body: JSON.stringify({
      read_at: timestamp,
      data,
    }),
  });
}

async function refreshExpiries(): Promise<void> {
  const rows = await getAllPermitRows();
  const changes: Record<string, unknown>[] = [];
  const audits: Record<string, unknown>[] = [];

  for (const row of rows) {
    const permit = rowPermit(row);
    const result = expireIfNeeded(permit, new Date());
    if (!result.permit || JSON.stringify(result.permit) === JSON.stringify(permit)) continue;
    const after = result.permit;
    changes.push(dbPermitChange(row, after));
    audits.push(...historyAuditEntries(permit, after));
  }

  if (changes.length) await persistPermitTransaction(changes, audits, []);
}

async function handleGet(req: AnyRequest, res: AnyResponse): Promise<void> {
  const user = await authenticatedUser(req);
  if (!user) {
    sendJson(res, 200, {
      ok: true,
      state: { permits: [], users: [], currentUser: null, notifications: [] },
    });
    return;
  }
  sendJson(res, 200, { ok: true, state: await publicState(user) });
}

async function handlePost(req: AnyRequest, res: AnyResponse): Promise<void> {
  const body = await parseBody(req);
  const operation = String(body.operation ?? '');

  if (operation === 'LOGIN') {
    const user = await authenticateLogin(String(body.username ?? ''), String(body.pin ?? ''));
    if (!user) authFailure('Username hoặc PIN không đúng.');
    setSessionCookie(res, user.id, Number(user.session_version));
    sendJson(res, 200, {
      ok: true,
      mustChangePin: Boolean(user.must_change_pin),
      state: await publicState(user),
    });
    return;
  }

  if (operation === 'LOGOUT') {
    clearSessionCookie(res);
    sendJson(res, 200, { ok: true });
    return;
  }

  const user = await authenticatedUser(req);
  if (!user) authFailure();

  switch (operation) {
    case 'CHANGE_OWN_PIN': {
      const updated = await changeOwnPin(user, body, res);
      sendJson(res, 200, { ok: true, state: await publicState(updated) });
      return;
    }
    case 'CREATE_USER':
      await createUserAccount(user, body);
      sendJson(res, 200, { ok: true, state: await publicState(user) });
      return;
    case 'CHANGE_USER_PIN':
      await changeUserPin(user, body);
      sendJson(res, 200, { ok: true, state: await publicState(user) });
      return;
    case 'TOGGLE_USER_ACTIVE':
      await toggleUserActive(user, body, req);
      sendJson(res, 200, { ok: true, state: await publicState(user) });
      return;
    case 'CREATE_DRAFT': {
      const newPermitId = await createDraft(user, body, req);
      sendJson(res, 200, {
        ok: true,
        permitId: newPermitId,
        state: await publicState(user),
      });
      return;
    }
    case 'UPDATE_DRAFT':
      await updateDraft(user, body, req);
      sendJson(res, 200, { ok: true, state: await publicState(user) });
      return;
    case 'TRANSITION':
      await transition(user, body, req);
      sendJson(res, 200, { ok: true, state: await publicState(user) });
      return;
    case 'ADD_GAS_TEST':
      await addGasTest(user, body, req);
      sendJson(res, 200, { ok: true, state: await publicState(user) });
      return;
    case 'ACK_SIMOPS':
      await acknowledgeSimops(user, body, req);
      sendJson(res, 200, { ok: true, state: await publicState(user) });
      return;
    case 'REQUEST_REVISION': {
      const newPermitId = await requestRevision(user, body, req);
      sendJson(res, 200, { ok: true, newPermitId, state: await publicState(user) });
      return;
    }
    case 'MARK_NOTIFICATION_READ':
      await markNotificationRead(user, body);
      sendJson(res, 200, { ok: true, state: await publicState(user) });
      return;
    case 'REFRESH_EXPIRIES':
      await refreshExpiries();
      sendJson(res, 200, { ok: true, state: await publicState(user) });
      return;
    default:
      sendJson(res, 400, { ok: false, error: 'Operation không được hỗ trợ.' });
  }
}

export default async function handler(req: AnyRequest, res: AnyResponse): Promise<void> {
  try {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'GET') {
      await handleGet(req, res);
      return;
    }
    if (req.method === 'POST') {
      await handlePost(req, res);
      return;
    }
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }
    sendJson(res, 405, { ok: false, error: 'Method không được hỗ trợ.' });
  } catch (error) {
    sendError(res, error);
  }
}