import CryptoJS from 'crypto-js';

const SECRET_KEY = 'offshore-ptw-secret-key-2024';

export interface SignatureResult {
  hash: string;
  timestamp: string;
  isValid: boolean;
}

/**
 * Tạo chữ ký số cho việc phê duyệt PTW
 * Sử dụng HMAC-SHA256 để tạo hash từ nội dung và PIN
 */
export function createDigitalSignature(
  content: string,
  pinCode: string,
  userId: string
): SignatureResult {
  const timestamp = new Date().toISOString();
  const dataToSign = `${content}|${userId}|${timestamp}|${pinCode}`;
  const hash = CryptoJS.HmacSHA256(dataToSign, SECRET_KEY).toString(CryptoJS.enc.Hex);
  
  return {
    hash,
    timestamp,
    isValid: true
  };
}

/**
 * Xác thực chữ ký số
 */
export function verifyDigitalSignature(
  content: string,
  signatureHash: string,
  userId: string,
  timestamp: string,
  pinCode: string
): boolean {
  const dataToSign = `${content}|${userId}|${timestamp}|${pinCode}`;
  const expectedHash = CryptoJS.HmacSHA256(dataToSign, SECRET_KEY).toString(CryptoJS.enc.Hex);
  return expectedHash === signatureHash;
}

/**
 * Tạo hash duy nhất cho permit
 */
export function createPermitHash(permitId: string, status: string): string {
  const data = `${permitId}|${status}|${Date.now()}`;
  return CryptoJS.SHA256(data).toString(CryptoJS.enc.Hex).substring(0, 16);
}

export interface PermitQrPayload {
  permitId: string;
  permitNumber: string;
  status: string;
  updatedAt: string;
  signature: string;
}

function buildPermitQrContent(payload: Omit<PermitQrPayload, 'signature'>): string {
  return `${payload.permitId}|${payload.permitNumber}|${payload.status}|${payload.updatedAt}`;
}

/**
 * Tạo payload QR đã ký cho permit, cho phép người quét xác thực
 * tính xác thực và phát hiện giả mạo (permit đã bị thay đổi sau khi ký).
 */
export function createPermitQrPayload(permit: {
  id: string;
  permitNumber: string;
  status: string;
  updatedAt: string;
}): PermitQrPayload {
  const base = {
    permitId: permit.id,
    permitNumber: permit.permitNumber,
    status: permit.status,
    updatedAt: permit.updatedAt
  };
  const signature = CryptoJS.HmacSHA256(buildPermitQrContent(base), SECRET_KEY).toString(CryptoJS.enc.Hex);
  return { ...base, signature };
}

/**
 * Xác thực payload QR đã quét: kiểm tra chữ ký khớp với nội dung permit hiện tại.
 */
export function verifyPermitQrPayload(
  payload: PermitQrPayload,
  currentPermit: { id: string; permitNumber: string; status: string; updatedAt: string }
): boolean {
  const base = {
    permitId: currentPermit.id,
    permitNumber: currentPermit.permitNumber,
    status: currentPermit.status,
    updatedAt: currentPermit.updatedAt
  };
  const expectedSignature = CryptoJS.HmacSHA256(buildPermitQrContent(base), SECRET_KEY).toString(CryptoJS.enc.Hex);
  return (
    expectedSignature === payload.signature &&
    payload.permitId === currentPermit.id &&
    payload.permitNumber === currentPermit.permitNumber &&
    payload.status === currentPermit.status &&
    payload.updatedAt === currentPermit.updatedAt
  );
}
