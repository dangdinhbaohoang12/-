import type { AppNotification, GasTestRecord, Permit, Role, UserAccount } from '../types/domain';

export interface ActionResult { ok: boolean; error?: string; }

export type Action =
  | 'SUBMIT' | 'APPROVE_LINE_SUPERVISOR' | 'APPROVE_FPS' | 'APPROVE_DEPUTY_OIM'
  | 'APPROVE_OIM' | 'REJECT' | 'RETURN_FOR_CLARIFICATION' | 'START_WORK'
  | 'SUSPEND' | 'RESUME' | 'COMPLETE_WORK' | 'CLOSE' | 'CANCEL' | 'CREATE_REVISION';

export interface RemoteState {
  permits: Permit[];
  users: UserAccount[];
  approverCertifications: Record<string, string>;
  currentUser: UserAccount | null;
  notifications: AppNotification[];
}

async function request<T>(method: 'GET' | 'POST', body?: Record<string, unknown>): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/api/ptw', {
      method,
      credentials: 'same-origin',
      headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
      body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
    });
  } catch {
    const error = new Error('Không thể kết nối đến máy chủ PTW. Kiểm tra triển khai API và kết nối mạng.');
    (error as { status?: number }).status = 0;
    throw error;
  }

  const text = await response.text();
  let payload: any = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = {};
    }
  }

  if (!response.ok || payload.ok === false) {
    const fallback =
      response.status >= 500
        ? 'Máy chủ PTW không phản hồi đúng định dạng. Kiểm tra API /api/ptw và biến môi trường Vercel.'
        : 'Yêu cầu máy chủ thất bại.';
    const error = new Error(payload.error ?? fallback);
    (error as { status?: number }).status = response.status;
    throw error;
  }

  return payload as T;
}

export async function getState(): Promise<RemoteState> {
  const result = await request<{ state: RemoteState }>('GET');
  return result.state;
}

export async function post<T = { state: RemoteState }>(
  operation: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  return request<T>('POST', { operation, ...body });
}

export function toActionKind(action: Exclude<Action, 'CREATE_REVISION'>) {
  const map: Record<Exclude<Action, 'CREATE_REVISION'>, string> = {
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
  return map[action] as
    | 'SUBMIT' | 'APPROVE' | 'REJECT' | 'RETURN' | 'START_WORK'
    | 'SUSPEND' | 'RESUME' | 'COMPLETE_WORK' | 'CLOSE' | 'CANCEL';
}

export type DraftPermitInput = Partial<Pick<
  Permit,
  | 'permitType' | 'riskLevel' | 'areaId' | 'equipmentTag' | 'workDescription'
  | 'reasonForIssuing' | 'contractorCompany' | 'companyDepartment'
  | 'supervisorUserId' | 'supervisorName' | 'workOrderNo' | 'priority'
  | 'plannedStart' | 'plannedEnd' | 'criticalWork'
>> & {
  riskLevelAssessed?: Permit['riskLevel'];
  areaCode?: string;
  platformCode?: string;
  safetyChecklistConfirmed?: Array<{ itemId: string; labelVi: string; confirmed: boolean }>;
};

export type { GasTestRecord, Role };
