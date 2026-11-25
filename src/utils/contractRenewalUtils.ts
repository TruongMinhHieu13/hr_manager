/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ContractTypeOption {
  id: string;
  name: string;
  code: string; // 'HĐXĐTH' | 'HĐKXĐ'
  durationMonths: number | null; // null biểu thị không xác định thời hạn
  durationLabel: string;
  description?: string;
}

/**
 * Danh mục các loại hợp đồng lao động mới cho tái ký
 * Dễ dàng cấu hình hoặc mở rộng thêm các loại khác trong tương lai
 */
export const CONTRACT_TYPE_OPTIONS: ContractTypeOption[] = [
  {
    id: 'hdld_12m',
    name: 'HĐLĐ 12 tháng',
    code: 'HĐXĐTH',
    durationMonths: 12,
    durationLabel: '12 THÁNG',
    description: 'Hợp đồng lao động xác định thời hạn 12 tháng',
  },
  {
    id: 'hdld_kxd',
    name: 'HĐLĐ không xác định thời hạn',
    code: 'HĐKXĐ',
    durationMonths: null,
    durationLabel: 'Không xác định',
    description: 'Hợp đồng không xác định thời hạn, không cần nhập ngày hết hạn',
  },
  {
    id: 'hdld_24m',
    name: 'HĐLĐ 24 tháng',
    code: 'HĐXĐTH',
    durationMonths: 24,
    durationLabel: '24 THÁNG',
    description: 'Hợp đồng lao động xác định thời hạn 24 tháng',
  },
  {
    id: 'hdld_36m',
    name: 'HĐLĐ 36 tháng',
    code: 'HĐXĐTH',
    durationMonths: 36,
    durationLabel: '36 THÁNG',
    description: 'Hợp đồng lao động xác định thời hạn 36 tháng',
  },
];

/**
 * Phân tích chuỗi ngày bất kỳ (DD/MM/YYYY, YYYY-MM-DD, Excel serial, ISO) thành Date object
 */
export function parseAnyDate(dateStr?: string | null): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const clean = dateStr.trim();
  if (!clean) return null;

  // DD/MM/YYYY hoặc DD-MM-YYYY hoặc DD.MM.YYYY
  const dmyMatch = clean.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  // YYYY-MM-DD
  const ymdMatch = clean.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  // Excel serial number
  if (/^\d{5}$/.test(clean)) {
    const serial = parseInt(clean, 10);
    const excelEpoch = new Date(1899, 11, 30);
    const d = new Date(excelEpoch.getTime() + serial * 86400000);
    if (!isNaN(d.getTime())) return d;
  }

  const parsed = new Date(clean);
  return !isNaN(parsed.getTime()) ? parsed : null;
}

/**
 * Định dạng Date object sang DD/MM/YYYY
 */
export function formatDateDDMMYYYY(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

/**
 * Định dạng Date object sang YYYY-MM-DD (dùng cho input type="date")
 */
export function formatDateYYYYMMDD(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${y}-${m}-${d}`;
}

/**
 * Chuyển DD/MM/YYYY sang YYYY-MM-DD
 */
export function dmyToYmd(dmy: string): string {
  if (!dmy) return '';
  const parsed = parseAnyDate(dmy);
  return parsed ? formatDateYYYYMMDD(parsed) : '';
}

/**
 * Chuyển YYYY-MM-DD sang DD/MM/YYYY
 */
export function ymdToDmy(ymd: string): string {
  if (!ymd) return '';
  const parsed = parseAnyDate(ymd);
  return parsed ? formatDateDDMMYYYY(parsed) : ymd;
}

/**
 * Tính Ngày bắt đầu mặc định = Ngày hết hạn hiện tại + 1 ngày
 * Trả về chuỗi DD/MM/YYYY
 */
export function calculateRenewStartDate(currentExpiryDateStr?: string | null): string {
  const expiryDate = parseAnyDate(currentExpiryDateStr);
  if (!expiryDate) {
    // Nếu không có ngày hết hạn cũ, lấy ngày mai
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return formatDateDDMMYYYY(tomorrow);
  }

  const nextDay = new Date(expiryDate.getTime());
  nextDay.setDate(nextDay.getDate() + 1);
  return formatDateDDMMYYYY(nextDay);
}

/**
 * Tính Ngày hết hạn mới = Ngày bắt đầu + số tháng - 1 ngày
 * Xử lý chính xác:
 * - Năm nhuận (ví dụ bắt đầu 29/02/2024 -> hết hạn 28/02/2025; bắt đầu 01/03/2023 -> hết hạn 29/02/2024)
 * - Cuối tháng (ví dụ bắt đầu 01/01/2026 -> hết hạn 31/12/2026; bắt đầu 31/01/2026 -> hết hạn 30/01/2027)
 * - Cuối năm (ví dụ bắt đầu 31/12/2025 -> hết hạn 30/12/2026)
 */
export function calculateRenewEndDate(startDateStr: string, months: number): string {
  const start = parseAnyDate(startDateStr);
  if (!start || months <= 0) return '';

  const end = new Date(start.getTime());
  end.setMonth(end.getMonth() + months);
  end.setDate(end.getDate() - 1);

  return formatDateDDMMYYYY(end);
}

/**
 * So sánh 2 ngày (chấp nhận cả DD/MM/YYYY hoặc YYYY-MM-DD)
 * Trả về > 0 nếu date1 > date2, 0 nếu bằng, < 0 nếu date1 < date2
 */
export function compareDates(dateStr1: string, dateStr2: string): number {
  const d1 = parseAnyDate(dateStr1);
  const d2 = parseAnyDate(dateStr2);
  if (!d1 || !d2) return 0;

  const t1 = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate()).getTime();
  const t2 = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate()).getTime();
  return t1 - t2;
}
