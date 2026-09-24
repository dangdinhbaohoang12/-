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
  logout: () => Promise<void>;

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
  updateDraftPermit: (permitId: string, patch: Partial<Permit>) => Promise<ActionResult>;
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

function applyState(set: (state: Partial<PtwState>) => void, state: {
  permits: Permit[];
  users: UserAccount[];
  currentUser: UserAccount | null;
  notifications: AppNotification[];
}): void {
  set({
    permits: state.permits,
    users: state.users,
    currentUser: state.currentUser,
    notifications: state.notifications,
  });
}

function failed(error: unknown): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : 'Yêu cầu thất bại.' };
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
    try {
      const state = await getState();
      // A concurrent login may have completed while this GET was in flight;
      // don't let the stale unauthenticated hydration response clobber it.
      if (!get().currentUser) applyState(set, state);
    } catch {
      // Expired session / network outage: degrade to the login redirect
      // handled by RequireAuth instead of rejecting on every page load.
    } finally {
      set({ authReady: true });
    }
  },

  login: async (username, pin) => {
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
      applyState(set, result.state);
      set({ selectedPermitId: null, simulatedRole: null });
      return { ok: true, mustChangePin: result.mustChangePin };
    } catch (error) {
      return failed(error);
    }
  },

  changeOwnPin: async (newPin, currentPin) => {
    try {
      const result = await post<{ state: RemoteState }>('CHANGE_OWN_PIN', { newPin, currentPin });
      applyState(set, result.state);
      return { ok: true };
    } catch (error) {
      return failed(error);
    }
  },

  logout: async () => {
    try { await post('LOGOUT'); } finally {
      set({
        currentUser: null,
        permits: [],
        users: [],
        notifications: [],
        selectedPermitId: null,
        simulatedRole: null,
        sessionDeviceIp: null,
      });
    }
  },

  createUserAccount: async (input, operatorPin) => {
    try {
      const result = await post<{ state: RemoteState }>('CREATE_USER', { input, operatorPin });
      applyState(set, result.state);
      const created = result.state.users.find((u) => u.username === input.username);
      return { ok: true, user: created };
    } catch (error) {
      return failed(error);
    }
  },

  createUser: async (input, operatorPin) => get().createUserAccount(input, operatorPin),

  toggleUserActive: async (userId, active, operatorPin) => {
    try {
      const result = await post<{ state: RemoteState }>('TOGGLE_USER_ACTIVE', { userId, active, operatorPin });
      applyState(set, result.state);
      return { ok: true };
    } catch (error) {
      return failed(error);
    }
  },

  changePin: async (userId, newPin, operatorPin) => {
    try {
      const result = await post<{ state: RemoteState }>('CHANGE_USER_PIN', { userId, newPin, operatorPin });
      applyState(set, result.state);
      return { ok: true };
    } catch (error) {
      return failed(error);
    }
  },

  createDraftPermit: async (data, operatorPin) => {
    try {
      const result = await post<{
        state: RemoteState;
        permitId: string;
      }>('CREATE_DRAFT', { data, pin: operatorPin });
      applyState(set, result.state);
      const permit = result.state.permits.find((p) => p.id === result.permitId);
      return { ok: true, permitNumber: permit?.permitNumber, permit };
    } catch (error) {
      return failed(error);
    }
  },

  createDraft: async (data, operatorPin) => get().createDraftPermit(data, operatorPin),

  updateDraftPermit: async (permitId, patch) => {
    try {
      const result = await post<{ state: RemoteState }>('UPDATE_DRAFT', { permitId, patch });
      applyState(set, result.state);
      return { ok: true };
    } catch (error) {
      return failed(error);
    }
  },

  runTransition: async (permitId, kind, pin, comment) => {
    try {
      const result = await post<{ state: RemoteState }>('TRANSITION', {
        permitId,
        kind,
        pin,
        comment,
      });
      applyState(set, result.state);
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
    try {
      const result = await post<{ state: RemoteState }>('ADD_GAS_TEST', {
        permitId,
        record,
        pin,
      });
      applyState(set, result.state);
      return { ok: true };
    } catch (error) {
      return failed(error);
    }
  },

  acknowledgeSimopsConflict: async (permitId, conflictId, decisionNote, pin) => {
    try {
      const result = await post<{ state: RemoteState }>('ACK_SIMOPS', {
        permitId,
        conflictId,
        decisionNote,
        pin,
      });
      applyState(set, result.state);
      return { ok: true };
    } catch (error) {
      return failed(error);
    }
  },

  requestRevision: async (permitId, reason, pin) => {
    try {
      const result = await post<{ state: RemoteState; newPermitId: string }>('REQUEST_REVISION', {
        permitId,
        reason,
        pin,
      });
      applyState(set, result.state);
      return { ok: true, newPermitId: result.newPermitId };
    } catch (error) {
      return failed(error);
    }
  },

  selectPermit: (permitId) => set({ selectedPermitId: permitId }),

  markNotificationRead: async (id) => {
    try {
      const result = await post<{ state: RemoteState }>('MARK_NOTIFICATION_READ', { id });
      applyState(set, result.state);
      return { ok: true };
    } catch (error) {
      return failed(error);
    }
  },

  refreshExpiries: async () => {
    try {
      const result = await post<{ state: RemoteState }>('REFRESH_EXPIRIES');
      applyState(set, result.state);
    } catch {
      // Keep the last authoritative state if a background refresh fails.
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