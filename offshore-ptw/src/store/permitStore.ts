import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Permit, User, PermitType, PermitStatus, JSAItem, Isolation, PermitApproval, Role } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { db, savePermitOffline, getAllPermitsOffline, isOnline } from '../db/offlineDb';
import { checkSimOpsForPermit } from '../utils/simops';
import { SimOpsConflict } from '../types';
import { createDigitalSignature } from '../utils/digitalSignature';

interface PermitState {
  // State
  permits: Permit[];
  currentUser: User | null;
  selectedPermit: Permit | null;
  isOnline: boolean;
  simopsConflicts: SimOpsConflict[];
  
  // Actions
  login: (username: string, pinCode: string) => boolean;
  logout: () => void;
  createPermit: (data: Partial<Permit>) => Promise<Permit>;
  updatePermit: (id: string, data: Partial<Permit>) => Promise<void>;
  deletePermit: (id: string) => void;
  submitPermit: (id: string, pinCode: string) => Promise<boolean>;
  approvePermit: (id: string, action: 'APPROVE' | 'REJECT', comment: string, pinCode: string) => boolean;
  verifyPermit: (id: string, pinCode: string) => boolean;
  closePermit: (id: string, pinCode: string) => boolean;
  addJSAItem: (permitId: string, item: JSAItem) => void;
  addIsolation: (permitId: string, isolation: Isolation) => void;
  selectPermit: (permit: Permit | null) => void;
  getPermitsByStatus: (status: PermitStatus) => Permit[];
  getPermitsByUser: (userId: string) => Permit[];
  getActivePermits: () => Permit[];
  getPendingApprovals: (role: Role) => Permit[];
  checkSimOps: (permit: Permit) => SimOpsConflict[];
  generatePermitNumber: () => string;
}

// Users mẫu cho demo
export const DEMO_USERS: User[] = [
  { id: '1', username: 'oim', fullName: 'Giàn Trưởng (OIM)', role: 'OIM', pinCode: '0001' },
  { id: '2', username: 'deputy', fullName: 'Giàn Phó', role: 'DEPUTY_OIM', pinCode: '0002' },
  { id: '3', username: 'fps', fullName: 'GS Sản Xuất (FPS)', role: 'FPS', pinCode: '0003' },
  { id: '4', username: 'supervisor', fullName: 'GS Trực Tiếp', role: 'LINE_SUP', pinCode: '0004' },
  { id: '5', username: 'worker', fullName: 'Nhân Viên', role: 'WORKER', pinCode: '0005' }
];

export const usePermitStore = create<PermitState>()(
  persist(
    (set, get) => ({
      permits: [],
      currentUser: null,
      selectedPermit: null,
      isOnline: true,
      simopsConflicts: [],

      login: (username: string, pinCode: string) => {
        const user = DEMO_USERS.find(u => u.username === username && u.pinCode === pinCode);
        if (user) {
          set({ currentUser: user });
          return true;
        }
        return false;
      },

      logout: () => {
        set({ currentUser: null, selectedPermit: null });
      },

      generatePermitNumber: () => {
        const date = new Date();
        const year = date.getFullYear().toString().substr(-2);
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const count = get().permits.length + 1;
        return `PTW-${year}${month}-${String(count).padStart(4, '0')}`;
      },

      createPermit: async (data: Partial<Permit>) => {
        const state = get();
        const permit: Permit = {
          id: uuidv4(),
          permitNumber: state.generatePermitNumber(),
          type: data.type || 'COLD_WORK',
          status: 'DRAFT',
          title: data.title || '',
          location: data.location || '',
          locationTag: data.locationTag || '',
          deck: data.deck || 'Main Deck',
          startTime: data.startTime || new Date().toISOString(),
          endTime: data.endTime || new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
          requesterId: state.currentUser?.id || '',
          workers: data.workers || [],
          ppe: data.ppe || [],
          jsaData: data.jsaData || [],
          isolations: data.isolations || [],
          gasTestPassed: false,
          electricalIsolated: false,
          pressureIsolated: false,
          approvals: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          priority: data.priority || 'LOW',
          ...data
        };

        const newPermits = [...state.permits, permit];
        set({ permits: newPermits, selectedPermit: permit });
        
        // Lưu offline trước khi báo thành công cho người dùng.
        await savePermitOffline(permit);
        
        return permit;
      },

      updatePermit: async (id: string, data: Partial<Permit>) => {
        const state = get();
        const updatedPermits = state.permits.map(p => 
          p.id === id ? { ...p, ...data, updatedAt: new Date().toISOString() } : p
        );
        const updatedPermit = updatedPermits.find(p => p.id === id);
        set({ permits: updatedPermits, selectedPermit: updatedPermit || null });
        
        if (updatedPermit) {
          await savePermitOffline(updatedPermit);
        }
      },

      deletePermit: (id: string) => {
        const state = get();
        set({ permits: state.permits.filter(p => p.id !== id) });
      },

      submitPermit: async (id: string, pinCode: string) => {
        const state = get();
        const user = state.currentUser;
        const permit = state.permits.find(p => p.id === id);
        if (!user || !permit) return false;

        if (permit.status !== 'DRAFT') return false;

        if (user.pinCode !== pinCode) {
          alert('PIN không đúng!');
          return false;
        }

        // SIMOPS chỉ xét permit đang hoạt động, vì vậy cần kiểm tra trạng thái
        // ứng viên SUBMITTED thay vì bản DRAFT hiện tại.
        const candidatePermit: Permit = { ...permit, status: 'SUBMITTED' };
        const conflicts = checkSimOpsForPermit(candidatePermit, state.permits);
        const hasBlockConflict = conflicts.some(c => c.conflictLevel === 'BLOCK');
        
        if (hasBlockConflict) {
          alert('Không thể submit do có xung đột SIMOPS nghiêm trọng!');
          return false;
        }

        const signature = createDigitalSignature(
          `${permit.id}:SUBMIT`,
          pinCode,
          user.id
        );

        const approval: PermitApproval = {
          id: uuidv4(),
          permitId: permit.id,
          approverId: user.id,
          approverRole: user.role,
          action: 'SUBMIT',
          signatureHash: signature.hash,
          signatureTrust: 'DEMO_ONLY',
          timestamp: new Date().toISOString()
        };

        const updatedPermit: Permit = {
          ...permit,
          status: 'SUBMITTED',
          approvals: [...permit.approvals, approval],
          updatedAt: new Date().toISOString()
        };

        await savePermitOffline(updatedPermit);

        set({ 
          permits: state.permits.map(p => 
            p.id === id ? updatedPermit : p
          ),
          simopsConflicts: conflicts
        });

        return true;
      },

      approvePermit: (id: string, action: 'APPROVE' | 'REJECT', comment: string, pinCode: string) => {
        const state = get();
        const user = state.currentUser;
        const permit = state.permits.find(p => p.id === id);
        
        if (!user || !permit) return false;

        // Xác thực PIN
        if (user.pinCode !== pinCode) {
          alert('PIN không đúng!');
          return false;
        }

        if (action === 'APPROVE') {
          const approvableStatuses: PermitStatus[] = ['VERIFIED_ISOLATED', 'REVIEWED'];
          if (!approvableStatuses.includes(permit.status)) {
            alert('Trạng thái PTW hiện tại không thể được phê duyệt!');
            return false;
          }

          if (permit.status === 'VERIFIED_ISOLATED' && user.role !== 'DEPUTY_OIM') {
            alert('Chỉ Giàn Phó mới có quyền rà soát PTW!');
            return false;
          }

          if (permit.status === 'REVIEWED' && user.role !== 'OIM') {
            alert('Chỉ OIM mới có quyền phát hành PTW!');
            return false;
          }
        }

        const signature = createDigitalSignature(
          `${permit.id}:${permit.permitNumber}:${action}`,
          pinCode,
          user.id
        );

        const approval: PermitApproval = {
          id: uuidv4(),
          permitId: permit.id,
          approverId: user.id,
          approverRole: user.role,
          action,
          comment,
          signatureHash: signature.hash,
          signatureTrust: 'DEMO_ONLY',
          timestamp: new Date().toISOString()
        };

        let newStatus: PermitStatus = permit.status;
        
        if (action === 'APPROVE') {
          switch (permit.status) {
            case 'VERIFIED_ISOLATED':
              newStatus = 'REVIEWED';
              break;
            case 'REVIEWED':
              newStatus = 'ISSUED';
              break;
            case 'CLOSED_OUT':
              newStatus = 'CLOSED_OUT';
              break;
          }
        } else {
          newStatus = 'DRAFT';
        }

        set({
          permits: state.permits.map(p => 
            p.id === id ? { 
              ...p, 
              status: newStatus,
              approvals: [...p.approvals, approval],
              updatedAt: new Date().toISOString()
            } : p
          )
        });

        return true;
      },

      verifyPermit: (id: string, pinCode: string) => {
        const state = get();
        const user = state.currentUser;
        const permit = state.permits.find(p => p.id === id);
        
        if (!user || !permit) return false;
        if (user.role !== 'FPS') {
          alert('Chỉ FPS mới có quyền xác nhận!');
          return false;
        }
        if (user.pinCode !== pinCode) {
          alert('PIN không đúng!');
          return false;
        }

        const signature = createDigitalSignature(
          `${permit.id}:VERIFY`,
          pinCode,
          user.id
        );

        const approval: PermitApproval = {
          id: uuidv4(),
          permitId: permit.id,
          approverId: user.id,
          approverRole: 'FPS',
          action: 'VERIFY',
          signatureHash: signature.hash,
          signatureTrust: 'DEMO_ONLY',
          timestamp: new Date().toISOString()
        };

        set({
          permits: state.permits.map(p => 
            p.id === id ? { 
              ...p, 
              status: 'VERIFIED_ISOLATED',
              approvals: [...p.approvals, approval],
              updatedAt: new Date().toISOString()
            } : p
          )
        });

        return true;
      },

      closePermit: (id: string, pinCode: string) => {
        const state = get();
        const user = state.currentUser;
        const permit = state.permits.find(p => p.id === id);
        
        if (!user || !permit) return false;
        if (user.pinCode !== pinCode) {
          alert('PIN không đúng!');
          return false;
        }

        const signature = createDigitalSignature(
          `${permit.id}:CLOSE`,
          pinCode,
          user.id
        );

        const approval: PermitApproval = {
          id: uuidv4(),
          permitId: permit.id,
          approverId: user.id,
          approverRole: user.role,
          action: 'CLOSE',
          signatureHash: signature.hash,
          signatureTrust: 'DEMO_ONLY',
          timestamp: new Date().toISOString()
        };

        set({
          permits: state.permits.map(p => 
            p.id === id ? { 
              ...p, 
              status: 'CLOSED_OUT',
              approvals: [...p.approvals, approval],
              updatedAt: new Date().toISOString()
            } : p
          )
        });

        return true;
      },

      addJSAItem: (permitId: string, item: JSAItem) => {
        const state = get();
        const permit = state.permits.find(p => p.id === permitId);
        if (!permit) return;

        set({
          permits: state.permits.map(p => 
            p.id === permitId ? { 
              ...p, 
              jsaData: [...p.jsaData, item],
              updatedAt: new Date().toISOString()
            } : p
          )
        });
      },

      addIsolation: (permitId: string, isolation: Isolation) => {
        const state = get();
        const permit = state.permits.find(p => p.id === permitId);
        if (!permit) return;

        set({
          permits: state.permits.map(p => 
            p.id === permitId ? { 
              ...p, 
              isolations: [...p.isolations, isolation],
              updatedAt: new Date().toISOString()
            } : p
          )
        });
      },

      selectPermit: (permit) => {
        set({ selectedPermit: permit });
      },

      getPermitsByStatus: (status: PermitStatus) => {
        return get().permits.filter(p => p.status === status);
      },

      getPermitsByUser: (userId: string) => {
        return get().permits.filter(p => p.requesterId === userId);
      },

      getActivePermits: () => {
        const activeStatuses: PermitStatus[] = ['SUBMITTED', 'VERIFIED_ISOLATED', 'REVIEWED', 'ISSUED', 'REVALIDATED'];
        return get().permits.filter(p => activeStatuses.includes(p.status));
      },

      getPendingApprovals: (role: Role) => {
        const state = get();
        const permits = state.permits.filter(p => {
          if (role === 'OIM') return p.status === 'REVIEWED';
          if (role === 'DEPUTY_OIM') return p.status === 'VERIFIED_ISOLATED';
          if (role === 'FPS') return p.status === 'SUBMITTED';
          return false;
        });
        return permits;
      },

      checkSimOps: (permit: Permit) => {
        const conflicts = checkSimOpsForPermit(permit, get().permits);
        set({ simopsConflicts: conflicts });
        return conflicts;
      }
    }),
    {
      name: 'offshore-ptw-storage',
      partialize: (state) => ({ 
        permits: state.permits,
        currentUser: null
      }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...(persistedState as Partial<PermitState>),
        currentUser: null
      })
    }
  )
);
