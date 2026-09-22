import Dexie, { Table } from 'dexie';
import { Permit, User, SimOpsRule } from '../types';

class OffshorePTWDatabase extends Dexie {
  permits!: Table<Permit>;
  users!: Table<User>;
  simopsRules!: Table<SimOpsRule>;
  syncQueue!: Table<{ id: string; action: string; data: any; timestamp: string }>;

  constructor() {
    super('OffshorePTWDB');
    
    this.version(1).stores({
      permits: 'id, permitNumber, status, type, locationTag, deck, createdAt, updatedAt',
      users: 'id, username, role',
      simopsRules: '[workType1+workType2]',
      syncQueue: 'id, timestamp'
    });
  }
}

export const db = new OffshorePTWDatabase();

/**
 * Lưu permit vào database offline
 */
export async function savePermitOffline(permit: Permit): Promise<void> {
  await db.permits.put(permit);
  
  // Thêm vào hàng đợi đồng bộ
  await db.syncQueue.add({
    id: `permit_${permit.id}_${Date.now()}`,
    action: 'SAVE_PERMIT',
    data: permit,
    timestamp: new Date().toISOString()
  });
}

/**
 * Lấy tất cả permits từ database offline
 */
export async function getAllPermitsOffline(): Promise<Permit[]> {
  return await db.permits.toArray();
}

/**
 * Lấy permit theo ID
 */
export async function getPermitByIdOffline(id: string): Promise<Permit | undefined> {
  return await db.permits.get(id);
}

/**
 * Xóa permit khỏi database offline
 */
export async function deletePermitOffline(id: string): Promise<void> {
  await db.permits.delete(id);
}

/**
 * Lưu user vào database
 */
export async function saveUserOffline(user: User): Promise<void> {
  await db.users.put(user);
}

/**
 * Lấy tất cả users
 */
export async function getAllUsersOffline(): Promise<User[]> {
  return await db.users.toArray();
}

/**
 * Lấy user theo username
 */
export async function getUserByUsernameOffline(username: string): Promise<User | undefined> {
  return await db.users.where('username').equals(username).first();
}

/**
 * Thêm vào hàng đợi đồng bộ
 */
export async function addToSyncQueue(action: string, data: any): Promise<void> {
  await db.syncQueue.add({
    id: `${action}_${Date.now()}`,
    action,
    data,
    timestamp: new Date().toISOString()
  });
}

/**
 * Lấy các bản ghi cần đồng bộ
 */
export async function getPendingSyncItems(): Promise<Array<{ id: string; action: string; data: any; timestamp: string }>> {
  return await db.syncQueue.toArray();
}

/**
 * Xóa bản ghi đã đồng bộ thành công
 */
export async function removeSyncedItem(id: string): Promise<void> {
  await db.syncQueue.delete(id);
}

/**
 * Kiểm tra trạng thái online/offline
 */
export function isOnline(): boolean {
  return navigator.onLine;
}

/**
 * Lắng nghe sự thay đổi kết nối mạng
 */
export function onConnectionChange(callback: (online: boolean) => void): () => void {
  const handleOnline = () => callback(true);
  const handleOffline = () => callback(false);
  
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  
  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}
