/**
 * ============================================================================
 * GAS TEST ENGINE – Tính toán định lượng kết quả đo khí (không dùng PASS/FAIL thô)
 * ----------------------------------------------------------------------------
 * Mỗi thông số có ngưỡng chấp nhận theo tiêu chuẩn công nghiệp dầu khí:
 *   O2  : 19.5% – 23.5% (thiếu oxy / giàu oxy đều FAIL)
 *   LEL : 0% – <10% LEL (tính theo %LEL hiển thị trên detector)
 *   H2S : < 5 ppm (ACGIH TLV ~1ppm; ngưỡng hành động PTW = 5ppm)
 *   CO  : < 25 ppm
 * Máy đo phải còn hạn hiệu chuẩn tại thời điểm đo.
 * ==========================================================================*/

import { GasParameter, GasTestRecord, TestResult } from '../types/domain.js';

export interface GasSpec {
  parameter: GasParameter;
  label: string;
  unit: string;
  min?: number;
  max?: number;
}

export const GAS_SPECS: Record<GasParameter, GasSpec> = {
  O2: { parameter: 'O2', label: 'Oxy (O₂)', unit: '%v/v', min: 19.5, max: 23.5 },
  LEL: { parameter: 'LEL', label: 'Khí cháy (LEL)', unit: '%LEL', min: 0, max: 9.9 },
  H2S: { parameter: 'H2S', label: 'Hydro sulfide (H₂S)', unit: 'ppm', min: 0, max: 4.9 },
  CO: { parameter: 'CO', label: 'Carbon monoxide (CO)', unit: 'ppm', min: 0, max: 24.9 },
};

export const REQUIRED_GAS_PARAMETERS: GasParameter[] = ['O2', 'LEL', 'H2S', 'CO'];

/** Đánh giá một chỉ số đo so với ngưỡng chuẩn. */
export function evaluateReading(parameter: GasParameter, value: number): TestResult {
  const spec = GAS_SPECS[parameter];
  if (!Number.isFinite(value)) return 'FAIL';
  if (spec.min !== undefined && value < spec.min) return 'FAIL';
  if (spec.max !== undefined && value > spec.max) return 'FAIL';
  return 'PASS';
}

/** Máy đo hết hạn hiệu chuẩn tại thời điểm đo => toàn bộ phép đo vô hiệu. */
export function isDetectorCalibrationValid(
  calibrationDueDate: string,
  testedAt: string
): boolean {
  const due = new Date(calibrationDueDate).getTime();
  const tested = new Date(testedAt).getTime();
  if (Number.isNaN(due) || Number.isNaN(tested)) return false;
  return tested <= due;
}

/** Kết quả tổng hợp của một lần đo: PASS khi mọi chỉ số PASS và máy còn hạn cal. */
export function computeOverallResult(record: {
  readings: Array<{ parameter: GasParameter; value: number }>;
  calibrationDueDate: string;
  testedAt: string;
}): TestResult {
  if (!isDetectorCalibrationValid(record.calibrationDueDate, record.testedAt)) return 'FAIL';
  if (record.readings.length === 0) return 'FAIL';
  const allPass = record.readings.every((r) => evaluateReading(r.parameter, r.value) === 'PASS');
  return allPass ? 'PASS' : 'FAIL';
}

/** Kiểm tra tính đầy đủ: phải đo đủ 4 thông số bắt buộc. */
export function hasAllRequiredParameters(
  readings: Array<{ parameter: GasParameter }>
): boolean {
  const present = new Set(readings.map((r) => r.parameter));
  return REQUIRED_GAS_PARAMETERS.every((p) => present.has(p));
}

/**
 * Điều kiện phát hành/tái phát hành permit yêu cầu gas test:
 * tồn tại ít nhất một lần đo PASS, đủ thông số, trong vòng `validityMinutes`
 * so với thời điểm hiện tại (default 60 phút theo thông lệ Hot Work/CSE).
 */
export function hasValidGasTest(
  permit: { requiresGasTest: boolean; gasTests: GasTestRecord[] },
  at: Date = new Date(),
  validityMinutes = 60
): boolean {
  if (!permit.requiresGasTest) return true;
  return permit.gasTests.some((gt) => {
    if (gt.overallResult !== 'PASS') return false;
    if (!hasAllRequiredParameters(gt.readings)) return false;
    if (!isDetectorCalibrationValid(gt.calibrationDueDate, gt.testedAt)) return false;
    const ageMs = at.getTime() - new Date(gt.testedAt).getTime();
    return ageMs >= 0 && ageMs <= validityMinutes * 60_000;
  });
}
