/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Employee } from '../types';

export function getEmployeeTimeMs(val: unknown): number {
  if (!val) return 0;
  if (typeof val === 'number' && !Number.isNaN(val)) return val;
  if (typeof val === 'string') {
    const parsed = Date.parse(val);
    if (!Number.isNaN(parsed)) return parsed;
  }
  if (val && typeof val === 'object') {
    const obj = val as { toMillis?: () => number; seconds?: number; nanoseconds?: number };
    if (typeof obj.toMillis === 'function') return obj.toMillis();
    if (typeof obj.seconds === 'number') {
      return obj.seconds * 1000 + Math.floor((obj.nanoseconds || 0) / 1e6);
    }
  }
  return 0;
}

export function getEmployeeLatestTimeMs(emp: Employee): number {
  const created = getEmployeeTimeMs(emp.createdAt);
  const updated = getEmployeeTimeMs(emp.updatedAt);
  let idTs = 0;
  const idMatch = emp.id?.match(/^emp_(\d{10,15})_/);
  if (idMatch) {
    idTs = parseInt(idMatch[1], 10);
  }
  return Math.max(created, updated, idTs);
}

// Mốc thời gian đợt import dữ liệu gốc ban đầu (16/11/2026 10:11 UTC = 1794823881789)
export const BASELINE_IMPORT_MS = 1794823881789;

/**
 * Kiểm tra xem nhân viên có phải là nhân viên mới tạo hay không:
 * - Được tạo sau thời điểm đợt import gốc ban đầu (16/11/2026 10:11:21 UTC)
 * - Hoặc ID tạo sau thời điểm import gốc
 */
export function isNewlyCreatedEmployee(emp: Employee): boolean {
  const createdMs = getEmployeeTimeMs(emp.createdAt);
  if (createdMs > BASELINE_IMPORT_MS) return true;

  // Kiểm tra qua ID nếu có timestamp tạo sau đợt import gốc
  const idMatch = emp.id?.match(/^emp_(\d{10,15})_/);
  if (idMatch) {
    const idTs = parseInt(idMatch[1], 10);
    if (idTs > BASELINE_IMPORT_MS) return true;
  }

  const idParts = emp.id?.split('_');
  if (idParts && idParts.length >= 3) {
    const ts = parseInt(idParts[idParts.length - 1], 10);
    if (!Number.isNaN(ts) && ts > BASELINE_IMPORT_MS) return true;
  }

  return false;
}

/**
 * Sắp xếp nhân viên: Ưu tiên người mới tạo nhất lên đầu danh sách
 *
 * Thứ tự ưu tiên:
 * 1. created_at mới nhất → người mới tạo lên đầu trang cho dễ thao tác
 * 2. updated_at mới nhất → nếu ngày tạo trùng nhau thì người mới cập nhật lên trước
 * 3. ID timestamp mới nhất → trích xuất từ định dạng emp_<timestamp>_xxx
 * 4. MSNV số lớn hơn → nhân sự số mới hơn
 */
export function sortEmployeesNewestFirst(a: Employee, b: Employee): number {
  // Ưu tiên 1: created_at mới nhất (người mới tạo lên đầu tiên)
  const createdA = getEmployeeTimeMs(a.createdAt);
  const createdB = getEmployeeTimeMs(b.createdAt);
  if (createdB !== createdA) return createdB - createdA;

  // Ưu tiên 2: updated_at mới nhất
  const updatedA = getEmployeeTimeMs(a.updatedAt);
  const updatedB = getEmployeeTimeMs(b.updatedAt);
  if (updatedB !== updatedA) return updatedB - updatedA;

  // Ưu tiên 3: ID timestamp (thời điểm tạo bản ghi trên hệ thống)
  const getIdTs = (emp: Employee): number => {
    const m = emp.id?.match(/^emp_(\d{10,15})_/);
    return m ? parseInt(m[1], 10) : 0;
  };
  const idTsA = getIdTs(a);
  const idTsB = getIdTs(b);
  if (idTsB !== idTsA) return idTsB - idTsA;

  // Fallback: MSNV số lớn hơn → mới vào hơn
  return b.msnv.localeCompare(a.msnv, undefined, { numeric: true });
}

/**
 * So sánh 2 nhân viên theo Mã số nhân viên (MSNV) tự nhiên (numeric: true).
 * Hỗ trợ giảm dần ('desc', mặc định: số lớn nhất lên đầu) hoặc tăng dần ('asc').
 */
export function compareEmployeeMsnv(a: Employee, b: Employee, order: 'asc' | 'desc' = 'desc'): number {
  const msnvA = (a.msnv || '').trim();
  const msnvB = (b.msnv || '').trim();
  if (!msnvA && !msnvB) return 0;
  if (!msnvA) return 1;
  if (!msnvB) return -1;
  const cmp = msnvA.localeCompare(msnvB, undefined, { numeric: true, sensitivity: 'base' });
  return order === 'asc' ? cmp : -cmp;
}

/**
 * Sắp xếp nhân viên theo Mã số nhân viên (MSNV) - Mặc định đưa số lớn nhất lên đầu
 */
export function sortEmployeesByMsnv(a: Employee, b: Employee, order: 'asc' | 'desc' = 'desc'): number {
  return compareEmployeeMsnv(a, b, order);
}

/**
 * Kiểm tra xem nhân viên hoặc hợp đồng đã chấm dứt / hết hiệu lực hay chưa
 */
export function isContractTerminated(emp?: { tinhTrang?: string; trangThaiHopDong?: string } | null): boolean {
  if (!emp) return false;
  const tt = (emp.tinhTrang || '').trim().toLowerCase();
  const hd = (emp.trangThaiHopDong || '').trim().toLowerCase();
  return (
    tt === 'hết hiệu lực' ||
    tt === 'đã chấm dứt' ||
    tt === 'chấm dứt' ||
    tt === 'đã nghỉ việc' ||
    tt === 'nghỉ việc' ||
    tt === 'thôi việc' ||
    tt.includes('nghỉ') ||
    tt.includes('chấm dứt') ||
    hd === 'hết hiệu lực' ||
    hd === 'đã chấm dứt' ||
    hd === 'chấm dứt' ||
    hd === 'đã kết thúc' ||
    hd === 'kết thúc' ||
    hd.includes('hết hiệu lực')
  );
}

/**
 * Phân tích ngày tháng năm từ các định dạng (DD/MM/YYYY, YYYY-MM-DD, Excel serial)
 */
export function parseFullDate(dateStr?: string): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const clean = dateStr.trim();
  if (!clean) return null;

  const dmyMatch = clean.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  const ymdMatch = clean.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  if (/^\d{5}$/.test(clean)) {
    const serial = parseInt(clean, 10);
    const excelEpoch = new Date(1899, 11, 30);
    const d = new Date(excelEpoch.getTime() + serial * 86400000);
    if (!isNaN(d.getTime())) return d;
  }

  const parsed = new Date(clean);
  return !isNaN(parsed.getTime()) ? parsed : null;
}
