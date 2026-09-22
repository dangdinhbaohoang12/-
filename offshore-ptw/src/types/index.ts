export type Role = 'OIM' | 'DEPUTY_OIM' | 'FPS' | 'LINE_SUP' | 'WORKER';

export type PermitType = 'COLD_WORK' | 'HOT_WORK' | 'CONFINED_SPACE' | 'RADIOGRAPHY' | 'ELECTRICAL';

export type PermitStatus = 
  | 'DRAFT' 
  | 'SUBMITTED' 
  | 'VERIFIED_ISOLATED' 
  | 'REVIEWED' 
  | 'ISSUED' 
  | 'SUSPENDED' 
  | 'REVALIDATED' 
  | 'CLOSED_OUT';

export type ConflictLevel = 'NONE' | 'WARNING' | 'BLOCK';

export interface User {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  pinCode: string;
}

export interface JSAItem {
  id: string;
  hazard: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  controlMeasure: string;
}

export interface Isolation {
  id: string;
  equipmentTag: string;
  isolationType: 'VALVE' | 'BREAKER' | 'BLIND' | 'LOCKOUT';
  lockNumber: string;
  verifiedBy?: string;
  verifiedAt?: string;
}

export interface PermitApproval {
  id: string;
  permitId: string;
  approverId: string;
  approverRole: Role;
  action: 'APPROVE' | 'REJECT' | 'VERIFY' | 'CLOSE';
  comment?: string;
  signatureHash: string;
  timestamp: string;
}

export interface Permit {
  id: string;
  permitNumber: string;
  type: PermitType;
  status: PermitStatus;
  title: string;
  location: string;
  locationTag: string;
  deck: string;
  startTime: string;
  endTime: string;
  requesterId: string;
  workers: string[];
  ppe: string[];
  jsaData: JSAItem[];
  isolations: Isolation[];
  gasTestPassed: boolean;
  electricalIsolated: boolean;
  pressureIsolated: boolean;
  approvals: PermitApproval[];
  createdAt: string;
  updatedAt: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface SimOpsRule {
  workType1: PermitType;
  workType2: PermitType;
  conflictLevel: ConflictLevel;
  description: string;
}

export interface SimOpsConflict {
  permit1: Permit;
  permit2: Permit;
  conflictLevel: ConflictLevel;
  reason: string;
}
