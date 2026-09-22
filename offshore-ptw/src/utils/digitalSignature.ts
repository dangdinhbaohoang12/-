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
