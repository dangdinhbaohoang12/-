import { create } from 'zustand';
import { detectSimopsConflicts } from '../engine/simopsEngine';
import { canViewPermit } from '../services/authorizationService';
import type {
  AppNotification,
  GasTestRecord,
  Permit,
  Role,
  SimopsConflict,
  UserAccount,
  ACTIVE_LIFECYCLE_STATUSES,
} from '../types/domain';
import {
  getState,
  post,
  toActionKind,
  type Action,
  type ActionResult,
  type DraftPermitInput,
  type RemoteState,
} from './apiClient';

export type { Action, ActionResult };

interface PtwState {
  permits: Permit[];
  users: UserAccount[];
  currentUser: UserAccount | null;
  notifications: AppNotification[];
  selectedPermitId: string | null;
  simulatedRole: Role | null;
  sessionDeviceIp: string | null;
  authReady: boolean;

  hydrate: () => Promise<void>;
  login: (username: string, pin: string, deviceIp?: string) => Promise<ActionResult & { mustChangePin?: boolean }>;
  changeOwnPin: (newPin: string, currentPin: string) => Promise<ActionResult>;
  logout: () => Promise<ActionResult>;

  createUserAccount: (
    input: Pick<UserAccount, 'username' | 'fullName' | 'role' | 'platformCode'> & {
      initialPin: string;
      email?: string;
      phone?: string;
      organization?: string;
      certificationNumber?: string;
    },
    operatorPin: string
  ) => Promise<ActionResult & { user?: UserAccount }>;
  createUser: PtwState['createUserAccount'];
  toggleUserActive: (userId: string, active: boolean, operatorPin: string) => Promise<ActionResult>;
  changePin: (userId: string, newPin: string, operatorPin: string) => Promise<ActionResult>;

  createDraftPermit: (data: DraftPermitInput, operatorPin: string) =>
    Promise<ActionResult & { permitNumber?: string; permit?: Permit }>;
  createDraft: PtwState['createDraftPermit'];
  updateDraftPermit: (permitId: string, patch: Partial<Permit>, pin: string) => Promise<ActionResult>;
  runTransition: (
    permitId: string,
    kind:
      | 'SUBMIT' | 'APPROVE' | 'REJECT' | 'RETURN'
      | 'START_WORK' | 'SUSPEND' | 'RESUME'
      | 'COMPLETE_WORK' | 'CLOSE' | 'CANCEL',
    pin: string,
    comment?: string
  ) => Promise<ActionResult>;
  perform: (
    action: Action,
    target: { id: string },
    pin: string,
    comment?: string
  ) => Promise<ActionResult>;
  addGasTest: (
    permitId: string,
    record: Omit<GasTestRecord, 'id' | 'sequenceNo' | 'overallResult'>,
    pin: string
  ) => Promise<ActionResult>;
  acknowledgeSimopsConflict: (
    permitId: string,
    conflictId: string,
    decisionNote: string,
    pin: string
  ) => Promise<ActionResult>;
  requestRevision: (
    permitId: string,
    reason: string,
    pin: string
  ) => Promise<ActionResult & { newPermitId?: string }>;

  selectPermit: (permitId: string | null) => void;
  markNotificationRead: (id: string) => Promise<ActionResult>;
  refreshExpiries: () => Promise<void>;
  getVisiblePermits: (user: UserAccount) => Permit[];
  conflictsFor: (permit: Permit) => SimopsConflict[];
  effectiveUser: () => UserAccount | null;
  setSimulatedRole: (role: Role | null) => void;
}

function failed(error: unknown): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : 'Yêu cầu thất bại.' };
}

function isAuthError(error: unknown): boolean {
  const status = Number((error as { status?: number } | null)?.status);
  return status === 401 || status === 403;
}

/**
 * Every server round-trip that replaces the full permits/users/notifications
 * snapshot is tagged with a monotonically increasing token. If a slower
 * request resolves after a newer one already landed, its (stale) snapshot is
 * dropped instead of reverting the UI to older data.
 */
let latestStateToken = 0;
function nextStateToken(): number {
  latestStateToken += 1;
  return latestStateToken;
}

function applyState(
  set: (state: Partial<PtwState>) => void,
  token: number,
  state: {
    permits: Permit[];
    users: UserAccount[];
    currentUser: UserAccount | null;
    notifications: AppNotification[];
  },
): void {
  if (token !== latestStateToken) return;
  set({
    permits: state.permits,
    users: state.users,
    currentUser: state.currentUser,
    notifications: state.notifications,
  });
}

export const usePtwStore = create<PtwState>((set, get) => ({
  permits: [],
  users: [],
  currentUser: null,
  notifications: [],
  selectedPermitId: null,
  simulatedRole: null,
  sessionDeviceIp: null,
  authReady: false,

  hydrate: async () => {
    const token = nextStateToken();
    try {
      const state = await getState();
      // A concurrent login may have completed while this GET was in flight;
      // don't let the stale unauthenticated hydration response clobber it.
      if (!get().currentUser) applyState(set, token, state);
    } catch {
      // Expired session / network outage: degrade to the login redirect
      // handled by RequireAuth instead of rejecting on every page load.
    } finally {
      set({ authReady: true });
/** Áp dụng kết quả transition vào mảng permits + bắn notification tương ứng. */
function applyTransitionResult(
  get: () => PtwState,
  set: (partial: Partial<PtwState>) => void,
  permitId: string,
  result: ReturnType<typeof approveAtCurrentLevel>,
  before: Permit,
  actor: UserAccount
): ActionResult {
  if (!result.ok || !result.permit) return { ok: false, error: result.error };
  const after = result.permit;
  const state = get();
  let permits = state.permits.map((p) => (p.id === permitId ? after : p));
  if (after.status === 'APPROVED' && after.parentPermitId) {
    const previous = permits.find((p) => p.id === after.parentPermitId);
    if (previous && !previous.supersededByPermitId) {
      const now = nowIso();
      permits = permits.map((p) => {
        if (p.id !== previous.id) return p;
        if (!ACTIVE_LIFECYCLE_STATUSES.includes(p.status)) {
          return { ...p, supersededByPermitId: after.id, updatedAt: now };
        }
        return {
          ...p,
          supersededByPermitId: after.id,
          status: 'CANCELLED',
          currentApprovalLevel: null,
          statusHistory: [...p.statusHistory, {
            id: newId(), sequence: p.statusHistory.length,
            fromStatus: p.status, toStatus: 'CANCELLED',
            eventType: 'REVISION_CREATED',
            userId: actor.id, userName: actor.fullName,
            userRole: actor.role,
            action: 'Bản permit này đã được thay thế bởi Revision mới đã phát hành',
            deviceIp: state.sessionDeviceIp ?? DEFAULT_IP,
            newValues: { supersededByPermitId: after.id }, timestamp: now,
          }],
          updatedAt: now,
        };
      });
    }
  },

  login: async (username, pin) => {
    const token = nextStateToken();
    try {
      const result = await post<{
        ok: true;
        mustChangePin: boolean;
        state: {
          permits: Permit[];
          users: UserAccount[];
          currentUser: UserAccount;
          notifications: AppNotification[];
        };
      }>('LOGIN', { username, pin });
      applyState(set, token, result.state);
      set({ selectedPermitId: null, simulatedRole: null });
      return { ok: true, mustChangePin: result.mustChangePin };
    } catch (error) {
      return failed(error);
    }
  },

  changeOwnPin: async (newPin, currentPin) => {
    const token = nextStateToken();
    try {
      const result = await post<{ state: RemoteState }>('CHANGE_OWN_PIN', { newPin, currentPin });
      applyState(set, token, result.state);
      return { ok: true };
    } catch (error) {
      return failed(error);
    }
  },

  logout: async () => {
    // Bump the token so any state snapshot already in flight (hydrate/login)
    // is dropped instead of clobbering the cleared state set below.
    nextStateToken();
    // Clear local state immediately so any navigation that happens right
    // after calling logout() (e.g. AppLayout's `void logout(); navigate(...)`)
    // never renders the previous session's dashboard while the LOGOUT
    // request is still in flight. The HttpOnly cookie itself is only
    // invalidated by the server call below.
    set({
      currentUser: null,
      permits: [],
      users: [],
      notifications: [],
      selectedPermitId: null,
      simulatedRole: null,
      sessionDeviceIp: null,
    });
    try {
      await post('LOGOUT');
    } catch (error) {
      // The HttpOnly session cookie may still be valid if the server call
      // failed (network error or rejection). The caller is expected to
      // retry; local state stays cleared regardless so Back/forward can't
      // resurrect the previous session's UI.
      return failed(error);
    }
    return { ok: true };
  },

  createUserAccount: async (input, operatorPin) => {
    const token = nextStateToken();
    try {
      const result = await post<{ state: RemoteState }>('CREATE_USER', { input, operatorPin });
      applyState(set, token, result.state);
      const created = result.state.users.find((u) => u.username === input.username);
      return { ok: true, user: created };
    } catch (error) {
      return failed(error);
    }
  },

  createUser: async (input, operatorPin) => get().createUserAccount(input, operatorPin),

  toggleUserActive: async (userId, active, operatorPin) => {
    const token = nextStateToken();
    try {
      const result = await post<{ state: RemoteState }>('TOGGLE_USER_ACTIVE', { userId, active, operatorPin });
      applyState(set, token, result.state);
      return { ok: true };
    } catch (error) {
      return failed(error);
    }
  },

  changePin: async (userId, newPin, operatorPin) => {
    const token = nextStateToken();
    try {
      const result = await post<{ state: RemoteState }>('CHANGE_USER_PIN', { userId, newPin, operatorPin });
      applyState(set, token, result.state);
      return { ok: true };
    } catch (error) {
      return failed(error);
    }
  },

  createDraftPermit: async (data, operatorPin) => {
    const token = nextStateToken();
    try {
      const result = await post<{
        state: RemoteState;
        permitId: string;
      }>('CREATE_DRAFT', { data, pin: operatorPin });
      applyState(set, token, result.state);
      const permit = result.state.permits.find((p) => p.id === result.permitId);
      return { ok: true, permitNumber: permit?.permitNumber, permit };
    } catch (error) {
      return failed(error);
    }
  },

  createDraft: async (data, operatorPin) => get().createDraftPermit(data, operatorPin),

  updateDraftPermit: async (permitId, patch, pin) => {
    const token = nextStateToken();
    try {
      const result = await post<{ state: RemoteState }>('UPDATE_DRAFT', { permitId, patch, pin });
      applyState(set, token, result.state);
      return { ok: true };
    } catch (error) {
      return failed(error);
    }
  },

  runTransition: async (permitId, kind, pin, comment) => {
    const token = nextStateToken();
    try {
      const result = await post<{ state: RemoteState }>('TRANSITION', {
        permitId,
        kind,
        pin,
        comment,
      });
      applyState(set, token, result.state);
      return { ok: true };
    } catch (error) {
      return failed(error);
    }
  },

  perform: async (action, target, pin, comment) => {
    if (action === 'CREATE_REVISION') {
      return get().requestRevision(target.id, comment ?? '', pin);
    }
    return get().runTransition(target.id, toActionKind(action), pin, comment);
  },

  addGasTest: async (permitId, record, pin) => {
    const token = nextStateToken();
    try {
      const result = await post<{ state: RemoteState }>('ADD_GAS_TEST', {
        permitId,
        record,
        pin,
      });
      applyState(set, token, result.state);
      return { ok: true };
    } catch (error) {
      return failed(error);
    }
  },

  acknowledgeSimopsConflict: async (permitId, conflictId, decisionNote, pin) => {
    const token = nextStateToken();
    try {
      const result = await post<{ state: RemoteState }>('ACK_SIMOPS', {
        permitId,
        conflictId,
        decisionNote,
        pin,
      });
      applyState(set, token, result.state);
      return { ok: true };
    } catch (error) {
      return failed(error);
    }
  },

  requestRevision: async (permitId, reason, pin) => {
    const token = nextStateToken();
    try {
      const result = await post<{ state: RemoteState; newPermitId: string }>('REQUEST_REVISION', {
        permitId,
        reason,
        pin,
      });
      applyState(set, token, result.state);
      return { ok: true, newPermitId: result.newPermitId };
    } catch (error) {
      return failed(error);
    }
  },

  selectPermit: (permitId) => set({ selectedPermitId: permitId }),

  markNotificationRead: async (id) => {
    const token = nextStateToken();
    try {
      const result = await post<{ state: RemoteState }>('MARK_NOTIFICATION_READ', { id });
      applyState(set, token, result.state);
      return { ok: true };
    } catch (error) {
      return failed(error);
    }
  },

  refreshExpiries: async () => {
    const token = nextStateToken();
    try {
      const result = await post<{ state: RemoteState }>('REFRESH_EXPIRIES');
      applyState(set, token, result.state);
    } catch (error) {
      // A transient network hiccup shouldn't log the user out, but an
      // authentication failure means the session actually expired/was
      // invalidated server-side – reflect that instead of continuing to
      // render permits/notifications as if still authenticated.
      if (isAuthError(error) && token === latestStateToken) {
        set({
          currentUser: null,
          permits: [],
          users: [],
          notifications: [],
          selectedPermitId: null,
          simulatedRole: null,
          sessionDeviceIp: null,
      /* ================================ AUTH =============================== */

      login: (username, pin, deviceIp) => {
        const state = get();
        const account = state.users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase());
        if (!account) return { ok: false, error: 'Tài khoản không tồn tại trong hệ thống.' };
        if (!account.active) return { ok: false, error: 'Tài khoản đã bị khóa. Liên hệ Giàn trưởng.' };
        if (!verifyPin(account, pin)) return { ok: false, error: 'Mã PIN không đúng.' };
        const loggedIn = { ...account, lastLoginAt: nowIso() };
        const users = state.users.map((u) => u.id === account.id ? loggedIn : u);
        set({ currentUser: loggedIn, users, sessionDeviceIp: deviceIp?.trim() || null });
        return { ok: true, mustChangePin: loggedIn.mustChangePin };
      },

      changeOwnPin: (newPin, currentPin) => {
        const state = get();
        const actor = state.currentUser;
        if (!actor) return { ok: false, error: 'Phiên làm việc chưa xác thực.' };
        if (!verifyPin(actor, currentPin)) return { ok: false, error: 'PIN hiện tại không đúng.' };
        if (!/^\d{4,8}$/.test(newPin)) return { ok: false, error: 'PIN mới phải là 4–8 chữ số.' };
        if (verifyPin(actor, newPin)) return { ok: false, error: 'PIN mới phải khác PIN hiện tại.' };
        const updated = { ...actor, pinHash: hashPin(newPin), mustChangePin: false };
        set({ users: state.users.map((u) => u.id === actor.id ? updated : u), currentUser: updated });
        return { ok: true };
      },

      logout: () => set({ currentUser: null, selectedPermitId: null, simulatedRole: null, sessionDeviceIp: null }),

      /* ========================= USER ADMIN (OIM ONLY) ===================== */

      createUserAccount: (input, operatorPin) => {
        const state = get();
        const actor = state.currentUser;
        if (!actor) return { ok: false, error: 'Phiên làm việc chưa xác thực.' };
        const perm = checkPermission(actor.role, 'MANAGE_USERS');
        if (!perm.allowed) return { ok: false, error: perm.reason };
        if (!verifyPin(actor, operatorPin)) return { ok: false, error: 'PIN xác thực của Giàn trưởng không đúng.' };
        if (!/^\d{4,8}$/.test(input.initialPin)) {
          return { ok: false, error: 'PIN khởi tạo phải là 4–8 chữ số.' };
        }
        const uname = input.username.trim().toLowerCase();
        if (!/^[a-z][a-z0-9._-]{2,29}$/.test(uname)) {
          return { ok: false, error: 'Username không hợp lệ (3–30 ký tự, bắt đầu bằng chữ).' };
        }
        if (uname === actor.username.toLowerCase()) {
          return { ok: false, error: 'Không thể tạo lại chính tài khoản của bạn.' };
        }
        if (state.users.some((u) => u.username.toLowerCase() === uname)) {
          return { ok: false, error: 'Username đã tồn tại trong danh bạ hệ thống.' };
        }
        const created: UserAccount = {
          id: `U-${newId().slice(0, 8).toUpperCase()}`,
          username: uname,
          fullName: input.fullName.trim(),
          role: input.role,
          platformCode: input.platformCode,
          email: input.email,
          phone: input.phone,
          organization: input.organization,
          certificationNumber: input.certificationNumber,
          pinHash: hashPin(input.initialPin),
          active: true,
          mustChangePin: true,
          createdAt: nowIso(),
          createdByUserId: actor.id,
        };
        set({ users: [...state.users, created] });
        return { ok: true, user: created };
      },

      createUser: (input, operatorPin) => get().createUserAccount(input, operatorPin),

      changePin: (userId, newPin, operatorPin) => {
        const state = get();
        const actor = state.currentUser;
        if (!actor) return { ok: false, error: 'Phiên làm việc chưa xác thực.' };
        const perm = checkPermission(actor.role, 'MANAGE_USERS');
        if (!perm.allowed) return { ok: false, error: perm.reason };
        if (!verifyPin(actor, operatorPin)) return { ok: false, error: 'PIN xác thực của Giàn trưởng không đúng.' };
        if (!/^\d{4,8}$/.test(newPin)) return { ok: false, error: 'PIN mới phải là 4–8 chữ số.' };
        const target = state.users.find((u) => u.id === userId);
        if (!target) return { ok: false, error: 'Không tìm thấy tài khoản đích.' };
        set({
          users: state.users.map((u) =>
            u.id === userId ? { ...u, pinHash: hashPin(newPin), mustChangePin: true } : u
          ),
        });
        return { ok: true };
      },

      toggleUserActive: (userId, active, operatorPin) => {
        const state = get();
        const actor = state.currentUser;
        if (!actor) return { ok: false, error: 'Phiên làm việc chưa xác thực.' };
        const perm = checkPermission(actor.role, 'MANAGE_USERS');
        if (!perm.allowed) return { ok: false, error: perm.reason };
        if (!verifyPin(actor, operatorPin)) return { ok: false, error: 'PIN xác thực của Giàn trưởng không đúng.' };
        if (userId === actor.id) return { ok: false, error: 'Không thể khóa chính tài khoản đang đăng nhập.' };
        set({
          users: state.users.map((u) => (u.id === userId ? { ...u, active } : u)),
        });
        return { ok: true };
      },

      /* ============================ PERMIT CREATE ========================== */

      createDraftPermit: (data, operatorPin) => {
        const state = get();
        const actor = state.currentUser;
        if (!actor) return { ok: false, error: 'Phiên làm việc chưa xác thực.' };
        const perm = checkPermission(actor.role, 'CREATE');
        if (!perm.allowed) return { ok: false, error: perm.reason };
        if (!verifyPin(actor, operatorPin)) return { ok: false, error: 'PIN điện tử không đúng – không thể tạo PTW.' };
        if (!data.workDescription?.trim()) return { ok: false, error: 'Mô tả công việc là bắt buộc.' };
        if (!data.areaId) return { ok: false, error: 'Khu vực (Area) là bắt buộc.' };
        if (!data.plannedStart || !data.plannedEnd) return { ok: false, error: 'Thời gian bắt đầu/kết thúc dự kiến là bắt buộc.' };
        if (new Date(data.plannedEnd).getTime() <= new Date(data.plannedStart).getTime()) {
          return { ok: false, error: 'Thời điểm kết thúc phải sau thời điểm bắt đầu.' };
        }

        const area = AREAS.find((a) => a.id === data.areaId);
        if (!area) return { ok: false, error: 'Khu vực không tồn tại trong danh mục giàn.' };
        if (data.platformCode && data.platformCode !== area.platformCode) return { ok: false, error: 'Khu vực không thuộc đúng giàn (Platform) đã chọn.' };
        if (data.equipmentTag && data.equipmentTag !== 'N/A') {
          const equipment = EQUIPMENT.find((e) => e.tag === data.equipmentTag);
          if (!equipment || equipment.areaId !== area.id) return { ok: false, error: 'Thiết bị không thuộc khu vực đã chọn.' };
        }
        if (!PLATFORMS.some((p) => p.code === area.platformCode)) {
          return { ok: false, error: 'Giàn (Platform) không hợp lệ.' };
        }
        const typeMeta = getPermitTypeMeta(data.permitType ?? 'COLD_WORK');

        const year = new Date().getFullYear();
        const seq = state.permits.filter((p) => p.platformCode === area.platformCode).length + 1;
        const permitNumber = `${area.platformCode}-PTW-${year}-${String(seq).padStart(5, '0')}`;

        const classifications = Array.from(
          new Set([
            ...typeMeta.workClassifications,
            ...(area.hazardous ? (['HIGH_RISK_AREA'] as const) : []),
            ...(data.criticalWork ? (['CRITICAL'] as const) : []),
          ])
        );

        const { chain } = buildApprovalChain({
          permitType: data.permitType ?? 'COLD_WORK',
          riskLevel: data.riskLevel ?? 'LOW',
          areaHazardous: area.hazardous,
          criticalWork: !!data.criticalWork,
          workClassifications: classifications as never,
        });

        const permit: Permit = {
          id: newId(),
          permitNumber,
          revisionNo: 0,
          platformCode: area.platformCode,
          permitType: data.permitType ?? 'COLD_WORK',
          riskLevel: data.riskLevel ?? 'LOW',
          workClassifications: classifications as Permit['workClassifications'],
          criticalWork: !!data.criticalWork,
          areaId: area.id,
          areaCode: area.code,
          areaName: area.name,
          equipmentTag: data.equipmentTag ?? '',
          workDescription: data.workDescription!.trim(),
          reasonForIssuing: data.reasonForIssuing?.trim(),
          contractorCompany: data.contractorCompany ?? 'Nội bộ Vận hành',
          companyDepartment: data.companyDepartment ?? 'Operations',
          applicantUserId: actor.id,
          applicantName: actor.fullName,
          supervisorUserId: data.supervisorUserId ?? actor.id,
          supervisorName: data.supervisorName ?? actor.fullName,
          workOrderNo: data.workOrderNo ?? '',
          priority: data.priority ?? 'MEDIUM',
          plannedStart: data.plannedStart!,
          plannedEnd: data.plannedEnd!,
          status: 'DRAFT',
          currentApprovalLevel: null,
          approvalChain: chain,
          requiresGasTest: typeMeta.requiresGasTest,
          gasTests: [],
          riskAssessments: [],
          lotoRecords: [],
          simopsAssessments: [],
          acknowledgedConflictIds: [],
          statusHistory: [
            {
              id: newId(),
              sequence: 0,
              fromStatus: null,
              toStatus: 'DRAFT',
              eventType: 'CREATED',
              userId: actor.id,
              userName: actor.fullName,
              userRole: actor.role,
              action: `Tạo mới PTW ${permitNumber} (chuỗi duyệt sinh bởi Rule Engine)`,
              deviceIp: DEFAULT_IP,
              newValues: { status: 'DRAFT', rule: chain.filter((s) => s.required).map((s) => s.level).join(' → ') },
              timestamp: nowIso(),
            },
          ],
          revisions: [],
          createdAt: nowIso(),
          updatedAt: nowIso(),
          createdById: actor.id,
        };

        set({ permits: [...state.permits, permit], selectedPermitId: permit.id });
        return { ok: true, permitNumber, permit };
      },

      createDraft: (data, operatorPin) => get().createDraftPermit(data, operatorPin),

      updateDraftPermit: (permitId, patch) => {
        const state = get();
        const permit = state.permits.find((p) => p.id === permitId);
        if (!permit) return { ok: false, error: 'Không tìm thấy permit.' };
        if (!['DRAFT', 'RETURNED'].includes(permit.status)) {
          return { ok: false, error: 'Permit đã gửi/duyệt – dữ liệu bị KHÓA. Hãy dùng Request Revision.' };
        }
        const actor = state.currentUser;
        if (!actor) return { ok: false, error: 'Phiên làm việc chưa xác thực.' };
        if (permit.applicantUserId !== actor.id && actor.role !== 'PERMIT_CONTROLLER') {
          return { ok: false, error: 'Chỉ người yêu cầu (hoặc PTW Controller) được sửa bản nháp này.' };
        }
        const protectedFields: (keyof Permit)[] = [
          'permitNumber', 'id', 'status', 'approvalChain', 'statusHistory', 'revisions', 'createdAt', 'createdById',
        ];
        for (const f of protectedFields) delete (patch as Record<string, unknown>)[f as string];
        const candidateAreaId = patch.areaId ?? permit.areaId;
        const candidateArea = AREAS.find((a) => a.id === candidateAreaId);
        if (!candidateArea) return { ok: false, error: 'Khu vực không tồn tại trong danh mục giàn.' };
        const candidatePermitType = patch.permitType ?? permit.permitType;
        const candidateCriticalWork = patch.criticalWork ?? permit.criticalWork;
        const candidateMeta = getPermitTypeMeta(candidatePermitType);
        const candidateEquipmentTag = patch.equipmentTag ?? permit.equipmentTag;
        if (candidateEquipmentTag && candidateEquipmentTag !== 'N/A') {
          const equipment = EQUIPMENT.find((e) => e.tag === candidateEquipmentTag);
          if (!equipment || equipment.areaId !== candidateArea.id) return { ok: false, error: 'Thiết bị không thuộc khu vực đã chọn.' };
        }
        const candidateClassifications = Array.from(new Set([
          ...candidateMeta.workClassifications,
          ...(candidateArea.hazardous ? (['HIGH_RISK_AREA'] as const) : []),
          ...(candidateCriticalWork ? (['CRITICAL'] as const) : []),
        ])) as Permit['workClassifications'];
        const updated: Permit = {
          ...permit,
          ...patch,
          permitType: candidatePermitType,
          platformCode: candidateArea.platformCode,
          areaId: candidateArea.id,
          areaCode: candidateArea.code,
          areaName: candidateArea.name,
          equipmentTag: candidateEquipmentTag,
          criticalWork: candidateCriticalWork,
          workClassifications: candidateClassifications,
          requiresGasTest: candidateMeta.requiresGasTest,
          updatedAt: nowIso(),
          statusHistory: [
            ...permit.statusHistory,
            makeHistory(permit, permit.status, permit.status, {
              eventType: 'UPDATED',
              userId: actor.id,
              userName: actor.fullName,
              userRole: actor.role,
              action: 'Cập nhật nội dung bản nháp',
              deviceIp: DEFAULT_IP,
              oldValues: { description: permit.workDescription },
              newValues: { description: patch.workDescription ?? permit.workDescription },
              timestamp: nowIso(),
            }),
          ],
        };
        set({ permits: state.permits.map((p) => (p.id === permitId ? updated : p)) });
        return { ok: true };
      },

      /* ============================== TRANSITIONS ========================== */

      runTransition: (permitId, kind, pin, comment) => {
        const state = get();
        const actor = state.currentUser;
        if (!actor) return { ok: false, error: 'Phiên làm việc chưa xác thực.' };
        // RBAC enforce theo VAI TRÒ THẬT của tài khoản đăng nhập.
        // Role Simulator chỉ ảnh hưởng hiển thị nút bấm, KHÔNG thể đổi quyền ký.
        const permCheck = checkPermission(actor.role, kind === 'SUBMIT' ? 'SUBMIT' : (kind as never));
        if (!permCheck.allowed && kind !== 'RESUME') {
          // RESUME/CLOSE do controller vận hành – engine sẽ kiểm tra lại đặc thù.
        }
        if (!permCheck.allowed && !['RESUME', 'CLOSE'].includes(kind)) {
          return { ok: false, error: permCheck.reason };
        }
        const permit = state.permits.find((p) => p.id === permitId);
        if (!permit) return { ok: false, error: 'Không tìm thấy permit.' };
        if (!verifyPin(actor, pin)) return { ok: false, error: 'PIN điện tử không đúng – hành động bị ghi log thất bại.' };

        const ctx = transitionCtxFrom(actor, comment, undefined, state.sessionDeviceIp ?? DEFAULT_IP);
        const sig = signPayload(permit, actor, kind, pin);

        const withSig = <R extends { ok: boolean; permit?: Permit }>(r: R): R => {
          if (r.ok && r.permit) {
            const p = r.permit;
            const chain = p.approvalChain.map((s) =>
              s.decidedByUserId === actor.id && !s.signatureHash ? { ...s, signatureHash: sig } : s
            );
            return { ...r, permit: { ...p, approvalChain: chain } };
          }
          return r;
        };

        let result;
        switch (kind) {
          case 'SUBMIT': {
            const conflicts = detectSimopsConflicts(permit, state.permits);
            const blockers = conflicts.filter(
              (c) => c.level === 'BLOCK' && !permit.acknowledgedConflictIds.includes(c.conflictId)
            );
            if (blockers.length > 0) {
              return { ok: false, error: 'Xung đột SIMOPS mức BLOCK chưa được đánh giá & ghi nhận quyết định.' };
            }
            result = submitPermit(permit, ctx);
            break;
          }
          case 'APPROVE':
            result = withSig(approveAtCurrentLevel(permit, ctx));
            break;
          case 'REJECT':
            result = withSig(rejectAtCurrentLevel(permit, ctx));
            break;
          case 'RETURN':
            result = withSig(returnToApplicant(permit, ctx));
            break;
          case 'START_WORK':
            result = startWork(permit, ctx);
            break;
          case 'SUSPEND':
            result = suspendPermit(permit, ctx);
            break;
          case 'RESUME':
            result = resumePermit(permit, ctx);
            break;
          case 'COMPLETE_WORK':
            result = completeWork(permit, ctx);
            break;
          case 'CLOSE':
            result = closePermit(permit, ctx);
            break;
          case 'CANCEL':
            result = cancelPermit(permit, ctx);
            break;
          default:
            return { ok: false, error: 'Hành động không được hỗ trợ.' };
        }
        return applyTransitionResult(get, set, permitId, result, permit, actor);
      },

      perform: (action, target, pin, comment) => {
        if (action === 'CREATE_REVISION') {
          const res = get().requestRevision(target.id, comment ?? '', pin);
          return { ok: res.ok, error: res.error };
        }
        const kindMap: Record<Exclude<Action, 'CREATE_REVISION'>, Parameters<PtwState['runTransition']>[1]> = {
          SUBMIT: 'SUBMIT',
          APPROVE_LINE_SUPERVISOR: 'APPROVE',
          APPROVE_FPS: 'APPROVE',
          APPROVE_DEPUTY_OIM: 'APPROVE',
          APPROVE_OIM: 'APPROVE',
          REJECT: 'REJECT',
          RETURN_FOR_CLARIFICATION: 'RETURN',
          START_WORK: 'START_WORK',
          SUSPEND: 'SUSPEND',
          RESUME: 'RESUME',
          COMPLETE_WORK: 'COMPLETE_WORK',
          CLOSE: 'CLOSE',
          CANCEL: 'CANCEL',
        };
        const kind = kindMap[action as Exclude<Action, 'CREATE_REVISION'>];
        return get().runTransition(target.id, kind, pin, comment);
      },

      /* =============================== GAS TEST ============================ */

      addGasTest: (permitId, record, pin) => {
        const state = get();
        const actor = state.currentUser;
        if (!actor) return { ok: false, error: 'Phiên làm việc chưa xác thực.' };
        const permit = state.permits.find((p) => p.id === permitId);
        if (!permit) return { ok: false, error: 'Không tìm thấy permit.' };
        const perm = checkPermission(actor.role, 'ADD_GAS_TEST');
        if (!perm.allowed) return { ok: false, error: perm.reason };
        if (!verifyPin(actor, pin)) return { ok: false, error: 'PIN điện tử của người đo khí không đúng.' };
        if (!hasAllRequiredParameters(record.readings)) {
          return { ok: false, error: 'Phải đo đủ 4 thông số O₂ / LEL / H₂S / CO.' };
        }
        const overall = computeOverallResult(record);
        const gasTest: GasTestRecord = {
          ...record,
          id: newId(),
          sequenceNo: permit.gasTests.length + 1,
          overallResult: overall,
          testedByUserId: actor.id,
          testedByName: actor.fullName,
        };
        const updated: Permit = {
          ...permit,
          gasTests: [...permit.gasTests, gasTest],
          updatedAt: nowIso(),
          statusHistory: [
            ...permit.statusHistory,
            makeHistory(permit, permit.status, permit.status, {
              eventType: 'GAS_TEST_ADDED',
              userId: actor.id,
              userName: actor.fullName,
              userRole: actor.role,
              action: `Ghi nhận Gas Test #${gasTest.sequenceNo} (${overall}) – detector ${gasTest.gasDetectorId}`,
              deviceIp: state.sessionDeviceIp ?? DEFAULT_IP,
              newValues: { result: overall, detector: gasTest.gasDetectorId },
              timestamp: nowIso(),
            }),
          ],
        };
        let notifications = state.notifications;
        if (overall === 'FAIL') {
          notifications = notify(state, updated, 'GAS_TEST_FAIL', `Gas test FAIL trên ${updated.permitNumber} – dừng ngay công việc liên quan.`, 'CRITICAL', [updated.applicantUserId]);
        }
        set({ permits: state.permits.map((p) => (p.id === permitId ? updated : p)), notifications });
        return { ok: true };
      },

      acknowledgeSimopsConflict: (permitId, conflictId, decisionNote, pin) => {
        const state = get();
        const actor = state.currentUser;
        if (!actor) return { ok: false, error: 'Phiên làm việc chưa xác thực.' };
        if (!['OIM', 'DEPUTY_OIM', 'FPS'].includes(actor.role)) {
          return { ok: false, error: 'Chỉ FPS / Deputy OIM / OIM được ghi nhận quyết định xử lý xung đột SIMOPS.' };
        }
        const permit = state.permits.find((p) => p.id === permitId);
        if (!permit) return { ok: false, error: 'Không tìm thấy permit.' };
        if (!verifyPin(actor, pin)) return { ok: false, error: 'PIN điện tử không đúng.' };
        const updated: Permit = {
          ...permit,
          acknowledgedConflictIds: [...permit.acknowledgedConflictIds, conflictId],
          simopsAssessments: [
            ...permit.simopsAssessments,
            {
              id: newId(),
              code: conflictId,
              assessmentSummary: decisionNote,
              decision: 'PROCEED_WITH_CONTROLS',
              decidedByUserId: actor.id,
              decidedAt: nowIso(),
            },
          ],
          statusHistory: [
            ...permit.statusHistory,
            makeHistory(permit, permit.status, permit.status, {
              eventType: 'SIMOPS_CONFLICT_ACK',
              userId: actor.id,
              userName: actor.fullName,
              userRole: actor.role,
              action: `Ghi nhận đánh giá xung đột SIMOPS ${conflictId}`,
              comment: decisionNote,
              deviceIp: state.sessionDeviceIp ?? DEFAULT_IP,
              timestamp: nowIso(),
            }),
          ],
          updatedAt: nowIso(),
        };
        set({ permits: state.permits.map((p) => (p.id === permitId ? updated : p)) });
        return { ok: true };
      },

      /* =============================== REVISION ============================ */

      requestRevision: (permitId, reason, pin) => {
        const state = get();
        const actor = state.currentUser;
        if (!actor) return { ok: false, error: 'Phiên làm việc chưa xác thực.' };
        const permit = state.permits.find((p) => p.id === permitId);
        if (!permit) return { ok: false, error: 'Không tìm thấy permit.' };
        const perm = checkPermission(actor.role, 'REQUEST_REVISION');
        if (!perm.allowed) return { ok: false, error: perm.reason };
        if (!['APPROVED', 'WORK_IN_PROGRESS', 'SUSPENDED', 'RESUMED', 'WORK_COMPLETED'].includes(permit.status)) {
          return { ok: false, error: 'Chỉ permit đã phát hành mới cần tạo Revision.' };
        }
        if (!verifyPin(actor, pin)) return { ok: false, error: 'PIN điện tử không đúng.' };
        if (!reason.trim()) return { ok: false, error: 'Lý do revision là bắt buộc.' };
        const children = state.permits.filter((p) => p.parentPermitId === permitId);
        if (permit.supersededByPermitId || children.some((p) =>
          ACTIVE_LIFECYCLE_STATUSES.includes(p.status) || ['DRAFT', 'RETURNED'].includes(p.status))) {
          return { ok: false, error: 'Permit đã có Revision đang chờ phê duyệt.' };
        }

        const nextRevisionNo = Math.max(permit.revisionNo, ...children.map((p) => p.revisionNo)) + 1;
        const snapshot: Permit = JSON.parse(JSON.stringify(permit));
        const newPermit: Permit = {
          ...snapshot,
          id: newId(),
          revisionNo: nextRevisionNo,
          parentPermitId: permit.id,
          previousRevisionOfPermitId: permit.id,
          revisionReason: reason.trim(),
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
            permitType: permit.permitType,
            riskLevel: permit.riskLevel,
            areaHazardous: permit.workClassifications.includes('HIGH_RISK_AREA'),
            criticalWork: permit.criticalWork,
            workClassifications: permit.workClassifications,
          }).chain,
          gasTests: [],
          acknowledgedConflictIds: [],
          statusHistory: [
            {
              id: newId(),
              sequence: 0,
              fromStatus: permit.status,
              toStatus: 'DRAFT',
              eventType: 'REVISION_CREATED',
              userId: actor.id,
              userName: actor.fullName,
              userRole: actor.role,
              action: `Tạo Rev ${nextRevisionNo} từ ${permit.permitNumber} Rev ${permit.revisionNo} – yêu cầu phê duyệt lại toàn bộ chuỗi`,
              comment: reason.trim(),
              deviceIp: state.sessionDeviceIp ?? DEFAULT_IP,
              oldValues: { revision: `Rev ${permit.revisionNo}` },
              newValues: { revision: `Rev ${nextRevisionNo}` },
              timestamp: nowIso(),
            },
          ],
          revisions: [],
          createdAt: nowIso(),
          updatedAt: nowIso(),
          createdById: actor.id,
        };

        const originalWithRevision: Permit = {
          ...permit,
          revisions: [...permit.revisions, {
            revisionNo: permit.revisionNo,
            createdAt: nowIso(),
            createdByUserId: actor.id,
            reason: reason.trim(),
            snapshot,
          }],
          statusHistory: [
            ...permit.statusHistory,
            makeHistory(permit, permit.status, permit.status, {
              eventType: 'REVISION_REQUESTED',
              userId: actor.id,
              userName: actor.fullName,
              userRole: actor.role,
              action: `Yêu cầu Revision → ${permit.permitNumber} Rev ${nextRevisionNo}`,
              comment: reason.trim(),
              deviceIp: state.sessionDeviceIp ?? DEFAULT_IP,
              timestamp: nowIso(),
            }),
          ],
        };

        set({
          permits: state.permits.map((p) => (p.id === permitId ? originalWithRevision : p)).concat(newPermit),
          selectedPermitId: newPermit.id,
        });
      }
    }
  },

  getVisiblePermits: (user) => {
    const permits = get().permits;
    return permits.filter((permit) => canViewPermit(user, permit));
  },

  conflictsFor: (permit) => detectSimopsConflicts(permit, get().permits),

  effectiveUser: () => {
    const user = get().currentUser;
    if (!user) return null;
    if (!get().simulatedRole || get().simulatedRole === user.role) return user;
    return { ...user, role: get().simulatedRole! };
  },

  setSimulatedRole: (role) => set({ simulatedRole: role }),
}));
      markNotificationRead: (id) =>
        set({
          notifications: get().notifications.map((n) =>
            n.id === id ? { ...n, readAt: nowIso() } : n
          ),
        }),

      refreshExpiries: (now = new Date()) => {
        const state = get();
        let changed = false;
        const permits = state.permits.map((p) => {
          const r = expireIfNeeded(p, now);
          if (r.permit && r.permit !== p) {
            changed = true;
            return r.permit;
          }
          return p;
        });
        if (changed) set({ permits });
      },

      getVisiblePermits: (user) => {
        const state = get();
        if (user.role === 'ADMINISTRATOR') return [];
        if (user.role === 'LINE_SUPERVISOR' || user.role === 'PERMIT_APPLICANT') {
          return state.permits.filter((p) => p.platformCode === user.platformCode);
        }
        return state.permits;
      },

      conflictsFor: (permit) => {
        const state = get();
        return detectSimopsConflicts(permit, state.permits);
      },

      effectiveUser: () => {
        const state = get();
        if (!state.currentUser) return null;
        if (!state.simulatedRole || state.simulatedRole === state.currentUser.role) {
          return state.currentUser;
        }
        return { ...state.currentUser, role: state.simulatedRole };
      },

      setSimulatedRole: (role) => set({ simulatedRole: role }),
    }),
    {
      name: 'offshore-ptw-v2',
      partialize: (state) => ({
        permits: state.permits,
        users: state.users,
        notifications: state.notifications,
        selectedPermitId: null,
        currentUser: null,
        simulatedRole: null,
        sessionDeviceIp: null,
      }),
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<PtwState>),
        currentUser: null,
        simulatedRole: null,
        sessionDeviceIp: null,
      }),
    }
  )
);
