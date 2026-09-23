import CryptoJS from 'crypto-js';

export interface SignatureResult {
  hash: string;
  timestamp: string;
  isValid: boolean;
  isTrusted: false;
}

/**
 * Tạo checksum phục vụ bản demo client-only.
 *
 * Đây KHÔNG phải chữ ký số đáng tin cậy: mọi mã chạy trong trình duyệt đều có
 * thể bị sửa và PIN demo có thể bị dò. Bản production phải gửi nội dung tới
 * backend đã xác thực để backend ký/xác minh bằng bí mật không bao giờ gửi tới
 * trình duyệt (hoặc dùng khóa bất đối xứng riêng cho từng người dùng).
 */
export function createDigitalSignature(
  content: string,
  pinCode: string,
  userId: string
): SignatureResult {
  const timestamp = new Date().toISOString();
  const dataToSign = `${content}|${userId}|${timestamp}|${pinCode}`;
  const hash = CryptoJS.SHA256(dataToSign).toString(CryptoJS.enc.Hex);
  
  return {
    hash,
    timestamp,
    isValid: true,
    isTrusted: false
  };
}

/**
 * So sánh checksum demo. Kết quả true chỉ cho biết dữ liệu khớp; nó không xác
 * thực danh tính người ký và không được dùng làm bằng chứng phê duyệt.
 */
export function verifyDigitalSignature(
  content: string,
  signatureHash: string,
  userId: string,
  timestamp: string,
  pinCode: string
): boolean {
  const dataToSign = `${content}|${userId}|${timestamp}|${pinCode}`;
  const expectedHash = CryptoJS.SHA256(dataToSign).toString(CryptoJS.enc.Hex);
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
 * Tạo payload QR kèm checksum cho bản demo. Checksum này có thể phát hiện dữ
 * liệu không khớp với permit hiện tại, nhưng bất kỳ ai cũng có thể tạo lại nên
 * không chứng minh tính xác thực.
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
  const signature = CryptoJS.SHA256(buildPermitQrContent(base)).toString(CryptoJS.enc.Hex);
  return { ...base, signature };
}

/**
 * Kiểm tra checksum QR demo khớp với nội dung permit hiện tại.
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
  const expectedSignature = CryptoJS.SHA256(buildPermitQrContent(base)).toString(CryptoJS.enc.Hex);
  return (
    expectedSignature === payload.signature &&
    payload.permitId === currentPermit.id &&
    payload.permitNumber === currentPermit.permitNumber &&
    payload.status === currentPermit.status &&
    payload.updatedAt === currentPermit.updatedAt
  );
}
