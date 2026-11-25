import React, { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import {
  FileSpreadsheet,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  X,
  RefreshCw,
  CheckSquare,
  Square,
  Printer,
  Camera,
  Layers,
  Filter,
} from 'lucide-react';
import { Employee } from '../types';
import { compressImageTo3x4DataUrl } from './EmployeeManagementView';
import { VIETSUN_LOGO_BASE64 } from '../utils/vietsunLogoBase64';
import { EMPLOYEE_TEMPLATE_EXCEL_BASE64 } from '../utils/employeeTemplateBase64';

/**
 * Định nghĩa chỉ số các cột trong file Excel Danh Sách Cán Bộ Công Nhân Viên.
 * Bố cục mới (51 cột, từ A đến AY):
 * - Cột AW (index 48): Cột mới trống (không có tiêu đề, không có dữ liệu, bỏ qua hoàn toàn).
 * - Cột AX (index 49): Khối (trước đây là AW - index 48).
 * - Cột AY (index 50): Chức vụ (trước đây là AX - index 49).
 */
export const EMPLOYEE_EXCEL_COLUMNS = {
  STT: 0, // A
  DON_VI: 1, // B
  TINH_TRANG: 2, // C
  KHOI: 3, // D
  KY_HIEU_PB: 4, // E
  PHONG_BAN: 5, // F
  PHONG_BAN_CON: 6, // G
  MSNV: 7, // H
  HO: 8, // I
  TEN: 9, // J
  CONG_VIEC: 10, // K
  NGAY_VAO: 11, // L
  NGAY_SINH: 12, // M
  NOI_SINH: 13, // N
  NGUYEN_QUAN: 14, // O
  NAM: 15, // P
  NU: 16, // Q
  DAN_TOC: 17, // R
  TON_GIAO: 18, // S
  SO_NHA_THUONG_TRU: 19, // T
  PHUONG_XA_THUONG_TRU: 20, // U
  TINH_TP_THUONG_TRU: 21, // V
  DIA_CHI_THUONG_TRU: 22, // W
  SO_NHA_TAM_TRU: 23, // X
  PHUONG_XA_TAM_TRU: 24, // Y
  TINH_TP_TAM_TRU: 25, // Z
  CCCD: 26, // AA
  NGAY_CAP_CCCD: 27, // AB
  NOI_CAP_CCCD: 28, // AC
  NGAY_HET_HAN_CCCD: 29, // AD
  TRINH_DO_VAN_HOA: 30, // AE
  TRINH_DO_CHUYEN_MON: 31, // AF
  SO_CMND_CU: 32, // AG
  TRINH_DO_NGOAI_NGU: 33, // AH
  TAY_NGHE: 34, // AI
  DAO_TAO: 35, // AJ
  SO_DIEN_THOAI: 36, // AK
  DA_KET_HON: 37, // AL
  DOC_THAN: 38, // AM
  SUC_KHOE: 39, // AN
  GIOI_THIEU: 40, // AO
  BO_PHAN: 41, // AP
  LOAI_HD: 42, // AQ
  THOI_HAN: 43, // AR
  PHAN_LOAI: 44, // AS
  SO_HD: 45, // AT
  TU_NGAY: 46, // AU
  DEN_NGAY: 47, // AV
  COT_TRONG_AW: 48, // AW - Cột mới trống (bỏ qua hoàn toàn)
  KHOI_2: 49, // AX (trước đây là AW - 48)
  CHUC_VU: 50, // AY (trước đây là AX - 49)
} as const;

export const TOTAL_EMPLOYEE_EXCEL_COLUMNS = 51;

export interface ParsedExcelRow {
  rowNumber: number;
  stt?: string;
  msnv: string;
  lastName?: string;
  firstName?: string;
  fullName: string;
  department: string;
  jobTitle?: string;
  joinDate: string;
  photoUrl?: string;
  status: 'valid_new' | 'valid_update' | 'error';
  errors: string[];
  existingEmployeeId?: string;
  selected: boolean;

  // Các trường hồ sơ cán bộ công nhân viên đầy đủ theo file Excel
  donVi?: string;
  tinhTrang?: string;
  khoi?: string;
  kyHieuPb?: string;
  phongBan?: string;
  phongBanCon?: string;
  ho?: string;
  ten?: string;
  congViec?: string;
  ngayVao?: string;
  ngaySinh?: string;
  noiSinh?: string;
  nguyenQuan?: string;
  gioiTinh?: string; // 'Nam' | 'Nữ'
  danToc?: string;
  tonGiao?: string;
  soNhaThuongTru?: string;
  phuongXaThuongTru?: string;
  tinhTpThuongTru?: string;
  diaChiThuongTru?: string;
  soNhaTamTru?: string;
  phuongXaTamTru?: string;
  tinhTpTamTru?: string;
  cccd?: string;
  ngayCapCccd?: string;
  noiCapCccd?: string;
  ngayHetHanCccd?: string;
  trinhDoVanHoa?: string;
  trinhDoChuyenMon?: string;
  soCmndCu?: string;
  trinhDoNgoaiNgu?: string;
  tayNghe?: string;
  daoTao?: string;
  soDienThoai?: string;
  tinhTrangHonNhan?: string; // 'Đã kết hôn' | 'Độc thân'
  sucKhoe?: string;
  gioiThieu?: string;
  boPhan?: string;
  loaiHd?: string;
  thoiHan?: string;
  phanLoai?: string;
  soHd?: string;
  tuNgay?: string;
  denNgay?: string;
  khoi2?: string;
  chucVu?: string;
  extraData?: Record<string, unknown>;
}

interface RawExtractedRow {
  rowNumber: number;
  stt: string;
  msnv: string;
  lastName: string;
  firstName: string;
  fullName: string;
  department: string;
  jobTitle: string;
  joinDate: string;
  isHiddenInExcel: boolean;

  // Chi tiết HR đầy đủ
  donVi: string;
  tinhTrang: string;
  khoi: string;
  kyHieuPb: string;
  phongBan: string;
  phongBanCon: string;
  ho: string;
  ten: string;
  congViec: string;
  ngayVao: string;
  ngaySinh: string;
  noiSinh: string;
  nguyenQuan: string;
  gioiTinh: string;
  danToc: string;
  tonGiao: string;
  soNhaThuongTru: string;
  phuongXaThuongTru: string;
  tinhTpThuongTru: string;
  diaChiThuongTru: string;
  soNhaTamTru: string;
  phuongXaTamTru: string;
  tinhTpTamTru: string;
  cccd: string;
  ngayCapCccd: string;
  noiCapCccd: string;
  ngayHetHanCccd: string;
  trinhDoVanHoa: string;
  trinhDoChuyenMon: string;
  soCmndCu: string;
  trinhDoNgoaiNgu: string;
  tayNghe: string;
  daoTao: string;
  soDienThoai: string;
  tinhTrangHonNhan: string;
  sucKhoe: string;
  gioiThieu: string;
  boPhan: string;
  loaiHd: string;
  thoiHan: string;
  phanLoai: string;
  soHd: string;
  tuNgay: string;
  denNgay: string;
  khoi2: string;
  chucVu: string;
  extraData: Record<string, unknown>;
}

interface DetectedColMap {
  stt: string;
  khoi?: string;
  kyHieuPb?: string;
  phongBan?: string;
  dept: string;
  msnv: string;
  ho: string;
  ten: string;
  job: string;
  date: string;
}

interface ExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingEmployees: Employee[];
  onConfirmImport: (
    rowsToImport: ParsedExcelRow[],
    importMode: 'add_only' | 'upsert',
    fileName: string,
    stats: {
      totalRows: number;
      validCount: number;
      errorCount: number;
      importedCount: number;
      updatedCount: number;
    },
    triggerPrintImmediately?: boolean
  ) => Promise<string[]>;
  onGoToPrintWithIds: (ids: string[]) => void;
}

function cleanUnicodeStr(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val)
    .normalize('NFC')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripViAccents(val: unknown): string {
  return cleanUnicodeStr(val)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

function formatExcelDate(val: unknown, preferMonthFirst = false): string {
  if (val === null || val === undefined || val === '') return '';
  if (typeof val === 'number') {
    const parsed = XLSX.SSF.parse_date_code(val);
    if (parsed && parsed.y > 1900 && parsed.m >= 1 && parsed.d >= 1) {
      return `${String(parsed.d).padStart(2, '0')}/${String(parsed.m).padStart(2, '0')}/${parsed.y}`;
    }
    const utcDays = Math.floor(val - 25569);
    const dateInfo = new Date(utcDays * 86400 * 1000);
    if (!isNaN(dateInfo.getTime())) {
      const dd = String(dateInfo.getUTCDate()).padStart(2, '0');
      const mm = String(dateInfo.getUTCMonth() + 1).padStart(2, '0');
      const yyyy = dateInfo.getUTCFullYear();
      return `${dd}/${mm}/${yyyy}`;
    }
  }
  if (val instanceof Date && !isNaN(val.getTime())) {
    const dd = String(val.getDate()).padStart(2, '0');
    const mm = String(val.getMonth() + 1).padStart(2, '0');
    const yyyy = val.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }
  const str = cleanUnicodeStr(val);
  // Convert YYYY-MM-DD to DD/MM/YYYY if matched
  const isoMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[3].padStart(2, '0')}/${isoMatch[2].padStart(2, '0')}/${isoMatch[1]}`;
  }
  // Normalize D/M/YYYY (hoặc M/D/YYYY khi preferMonthFirst = true) sang DD/MM/YYYY
  const dmyMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (dmyMatch) {
    const p1 = parseInt(dmyMatch[1], 10);
    const p2 = parseInt(dmyMatch[2], 10);
    const yearStr = dmyMatch[3].length === 2 ? `20${dmyMatch[3]}` : dmyMatch[3];
    if (preferMonthFirst) {
      if (p1 >= 1 && p1 <= 12 && p2 >= 1 && p2 <= 31) {
        return `${String(p2).padStart(2, '0')}/${String(p1).padStart(2, '0')}/${yearStr}`;
      }
      return `${String(p1).padStart(2, '0')}/${String(p2).padStart(2, '0')}/${yearStr}`;
    }
    if (p2 > 12 && p1 >= 1 && p1 <= 12) {
      return `${String(p2).padStart(2, '0')}/${String(p1).padStart(2, '0')}/${yearStr}`;
    }
    return `${dmyMatch[1].padStart(2, '0')}/${dmyMatch[2].padStart(2, '0')}/${yearStr}`;
  }
  return str;
}

function readCellText(worksheet: XLSX.WorkSheet, r: number, c: number): string {
  if (c < 0 || r < 0) return '';
  const addr = XLSX.utils.encode_cell({ r, c });
  const cell = worksheet[addr] as XLSX.CellObject | undefined;
  if (!cell || cell.t === 'e' || cell.t === 'z') return '';
  if (cell.w !== undefined && String(cell.w).trim() !== '') {
    return cleanUnicodeStr(cell.w);
  }
  if (cell.v !== undefined && cell.v !== null) {
    return cleanUnicodeStr(cell.v);
  }
  return '';
}

function readCellDate(
  worksheet: XLSX.WorkSheet,
  r: number,
  c: number,
  preferMonthFirst = false
): string {
  if (c < 0 || r < 0) return '';
  const addr = XLSX.utils.encode_cell({ r, c });
  const cell = worksheet[addr] as XLSX.CellObject | undefined;
  if (!cell || cell.t === 'e' || cell.t === 'z') return '';
  if (cell.t === 'n' && typeof cell.v === 'number') {
    return formatExcelDate(cell.v, preferMonthFirst);
  }
  if (cell.t === 'd' && cell.v instanceof Date) {
    return formatExcelDate(cell.v, preferMonthFirst);
  }
  if (cell.v !== undefined && cell.v !== null && String(cell.v).trim() !== '') {
    return formatExcelDate(cell.v, preferMonthFirst);
  }
  if (cell.w !== undefined && String(cell.w).trim() !== '') {
    return formatExcelDate(cell.w, preferMonthFirst);
  }
  return '';
}

function detectColumnMonthFirst(
  worksheet: XLSX.WorkSheet,
  startRow: number,
  endRow: number,
  c: number,
  defaultMonthFirst = true
): boolean {
  if (c < 0) return defaultMonthFirst;
  let hasP1Gt12 = false;
  let hasP2Gt12 = false;
  for (let r = startRow; r <= endRow; r++) {
    const addr = XLSX.utils.encode_cell({ r, c });
    const cell = worksheet[addr] as XLSX.CellObject | undefined;
    if (!cell || cell.t === 'e' || cell.t === 'z' || cell.t === 'n' || cell.t === 'd') continue;
    const raw = cell.v !== undefined && cell.v !== null ? cleanUnicodeStr(cell.v) : '';
    const match = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
    if (!match) continue;
    const p1 = parseInt(match[1], 10);
    const p2 = parseInt(match[2], 10);
    if (p1 > 12) hasP1Gt12 = true;
    if (p2 > 12) hasP2Gt12 = true;
  }
  if (hasP2Gt12) return true;
  if (hasP1Gt12) return false;
  return defaultMonthFirst;
}

function getFormattedStringTime(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function buildVietSunWorkbookBuffer(
  dataRows: Array<Array<string | number | null>>
): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'VietSun HR';
  wb.created = new Date();
  wb.modified = new Date();

  const ws = wb.addWorksheet('DanhSachNhanVien', {
    views: [{ showGridLines: true }],
  });

  // Đầy đủ 51 cột theo cấu trúc file nhân sự chuẩn VietSun (chèn cột trống AW tại index 48)
  ws.columns = [
    { key: 'stt', width: 6 },
    { key: 'donVi', width: 14 },
    { key: 'tinhTrang', width: 12 },
    { key: 'khoi', width: 14 },
    { key: 'kyHieuPb', width: 13 },
    { key: 'phongBan', width: 22 },
    { key: 'phongBanCon', width: 22 },
    { key: 'msnv', width: 13 },
    { key: 'ho', width: 20 },
    { key: 'ten', width: 12 },
    { key: 'congViec', width: 26 },
    { key: 'ngayVao', width: 14 },
    { key: 'ngaySinh', width: 14 },
    { key: 'noiSinh', width: 22 },
    { key: 'nguyenQuan', width: 22 },
    { key: 'nam', width: 7 },
    { key: 'nu', width: 7 },
    { key: 'danToc', width: 12 },
    { key: 'tonGiao', width: 14 },
    { key: 'soNhaThuongTru', width: 20 },
    { key: 'phuongXaThuongTru', width: 20 },
    { key: 'tinhTpThuongTru', width: 22 },
    { key: 'diaChiThuongTru', width: 36 },
    { key: 'soNhaTamTru', width: 20 },
    { key: 'phuongXaTamTru', width: 20 },
    { key: 'tinhTpTamTru', width: 22 },
    { key: 'cccd', width: 18 },
    { key: 'ngayCapCccd', width: 14 },
    { key: 'noiCapCccd', width: 24 },
    { key: 'ngayHetHanCccd', width: 14 },
    { key: 'trinhDoVanHoa', width: 16 },
    { key: 'trinhDoChuyenMon', width: 22 },
    { key: 'soCmndCu', width: 16 },
    { key: 'trinhDoNgoaiNgu', width: 18 },
    { key: 'tayNghe', width: 12 },
    { key: 'daoTao', width: 12 },
    { key: 'soDienThoai', width: 16 },
    { key: 'daKetHon', width: 12 },
    { key: 'docThan', width: 12 },
    { key: 'sucKhoe', width: 12 },
    { key: 'gioiThieu', width: 16 },
    { key: 'boPhan', width: 16 },
    { key: 'loaiHd', width: 14 },
    { key: 'thoiHan', width: 14 },
    { key: 'phanLoai', width: 14 },
    { key: 'soHd', width: 13 },
    { key: 'tuNgay', width: 14 },
    { key: 'denNgay', width: 14 },
    { key: 'cotTrongAW', width: 12 },
    { key: 'khoi2', width: 14 },
    { key: 'chucVu', width: 18 },
  ];

  // Merge A1:AY2 cho tiêu đề chính (cột AY là cột 51)
  ws.mergeCells('A1:AY2');
  const titleCell = ws.getCell('A1');
  titleCell.value = 'DANH SÁCH CÁN BỘ CÔNG NHÂN VIÊN';
  titleCell.font = {
    name: 'Times New Roman',
    size: 15,
    bold: true,
    color: { argb: 'FF000000' },
  };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFFFFF' },
  };

  ws.getRow(1).height = 26;
  ws.getRow(2).height = 26;

  // Embed VIETSUN logo at top-left
  const logoId = wb.addImage({
    base64: VIETSUN_LOGO_BASE64,
    extension: 'png',
  });
  ws.addImage(logoId, {
    tl: { col: 0, row: 0 },
    ext: { width: 122, height: 50 },
  });

  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FF000000' } },
    left: { style: 'thin', color: { argb: 'FF000000' } },
    bottom: { style: 'thin', color: { argb: 'FF000000' } },
    right: { style: 'thin', color: { argb: 'FF000000' } },
  };

  // Row 3: Vietnamese Main Headers (51 cột, AW để trống, Khối ở AX, Chức vụ ở AY)
  const headersVn = [
    'STT', 'ĐƠN VỊ', 'Tình trạng', 'KHỐI', 'KÝ HIỆU PB', 'PHÒNG BAN', 'PHÒNG BAN CON', 'MSNV', 'HỌ', 'TÊN',
    'CÔNG VIỆC', 'NGÀY VÀO', 'NGÀY SINH', 'NƠI SINH', 'NGUYÊN QUÁN', 'NAM', 'NỮ', 'DÂN TỘC', 'TÔN GIÁO',
    'THƯỜNG TRÚ', '', '', 'THƯỜNG TRÚ', 'TẠM TRÚ', '', '', 'CCCD', 'NGÀY CẤP', 'NƠI CẤP', 'NGÀY HẾT HẠN',
    'TRÌNH ĐỘ VĂN HÓA', 'TRÌNH ĐỘ CHUYÊN MÔN', 'SỐ CMND CŨ', 'TRÌNH ĐỘ NGOẠI NGỮ', 'TAY NGHỀ', 'ĐÀO TẠO',
    'SỐ ĐIỆN THOẠI', 'TÌNH TRẠNG HÔN NHÂN', '', 'SỨC KHỎE', 'GIỚI THIỆU', 'BỘ PHẬN', 'Loại HĐ', 'Thời hạn',
    'Phân Loại', 'Số HĐ', 'Từ ngày', 'Đến ngày', '', 'Khối', 'Chức vụ'
  ];
  const row3 = ws.getRow(3);
  row3.height = 28;
  headersVn.forEach((text, idx) => {
    const cell = row3.getCell(idx + 1);
    cell.value = text;
    cell.font = { name: 'Times New Roman', size: 11, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder;
  });

  // Row 4: Vietnamese Sub-Headers (51 cột)
  const headersSub = [
    '', '', '', '', '', '', '', '', '', '',
    '', '', '', '', '', '', '', '', '',
    'SỐ NHÀ', 'PHƯỜNG XÃ', 'TỈNH/TP', 'ĐỊA CHỈ ĐẦY ĐỦ', 'SỐ NHÀ', 'PHƯỜNG XÃ', 'TỈNH/TP', '', '', '', '',
    '', '', '', '', '', '',
    '', 'ĐÃ KẾT HÔN', 'ĐỘC THÂN', '', '', '', '', '',
    '', '', '', '', '', '', ''
  ];
  const row4 = ws.getRow(4);
  row4.height = 20;
  headersSub.forEach((text, idx) => {
    const cell = row4.getCell(idx + 1);
    cell.value = text;
    cell.font = { name: 'Times New Roman', size: 10, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder;
  });

  // Row 5: Code Column Sub-Header (51 cột, AW/AX/AY để trống khớp file mẫu)
  const headersCode = [
    'No', 'Donvi3', 'Tinhtrang4', '', 'Tinhtrang5', 'Bophan5', 'Bophancon6', 'Manhanvien2222', 'Ho', 'Ten',
    'Congviec', 'Ngayvaocty', 'Ngaysinh', 'Noisinh', 'Nguyenquan', 'Column7', 'Gioitinhnu', 'Dantoc', 'Tongiao',
    'Sonha', 'Phuongxa', 'Tinh', 'Diachithuongtru', 'Sonha8', 'Phuongxa9', 'Tinh11', 'CCCD', 'Ngaycap', 'Noicap', 'Ngay hethan',
    'Tdvanhoa', 'Tdchuyenmon', 'Scmndc', 'Tdngoaingu', 'Taynghe', 'Daotao',
    'Sodienthoai', 'Dakethon', 'docthan', 'Column12', '', 'Column13', 'Column15', 'Column16',
    'Column17', 'Column18', 'Column19', 'Column20', '', '', ''
  ];
  const row5 = ws.getRow(5);
  row5.height = 19;
  headersCode.forEach((text, idx) => {
    const cell = row5.getCell(idx + 1);
    cell.value = text;
    cell.font = { name: 'Times New Roman', size: 10, italic: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder;
  });

  // Rows 6+: Data rows
  dataRows.forEach((vals, rowIdx) => {
    const row = ws.getRow(6 + rowIdx);
    row.height = 20;
    for (let c = 1; c <= TOTAL_EMPLOYEE_EXCEL_COLUMNS; c++) {
      const cell = row.getCell(c);
      const v = vals[c - 1];
      cell.value = v === undefined || v === '' ? null : v;
      cell.font = { name: 'Times New Roman', size: 11 };
      cell.alignment = {
        horizontal: c === 1 || c === 8 || c === 12 || c === 13 || c === 16 || c === 17 || c === 27 || c === 28 || c === 30 || c === 38 || c === 39 ? 'center' : 'left',
        vertical: 'middle',
      };
      cell.border = thinBorder;
    }
  });

  return await wb.xlsx.writeBuffer();
}

export async function downloadSampleExcelTemplate() {
  const stringTime = getFormattedStringTime();
  try {
    const byteCharacters = atob(EMPLOYEE_TEMPLATE_EXCEL_BASE64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    triggerBlobDownload(
      new Blob([byteArray], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      `FileMauLamTheNV_${stringTime}.xlsx`
    );
    return;
  } catch (err) {
    console.warn('[EmployeeTemplate] Lỗi giải mã Base64, thử API download:', err);
  }

  try {
    const res = await fetch(`/api/templates/download/employee?t=${Date.now()}`, {
      cache: 'no-store',
      headers: {
        Pragma: 'no-cache',
        'Cache-Control': 'no-cache',
      },
    });
    if (res.ok) {
      const blob = await res.blob();
      triggerBlobDownload(blob, `FileMauLamTheNV_${stringTime}.xlsx`);
      return;
    }
  } catch (err) {
    console.warn('[EmployeeTemplate] Lỗi fetch API template, chuyển sang ExcelJS:', err);
  }

  const emptyTemplateRows: Array<Array<string | number | null>> = Array.from(
    { length: 10 },
    () => Array(TOTAL_EMPLOYEE_EXCEL_COLUMNS).fill(null)
  );
  const buffer = await buildVietSunWorkbookBuffer(emptyTemplateRows);
  triggerBlobDownload(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `FileMauLamTheNV_${stringTime}.xlsx`
  );
}

export async function exportEmployeesToExcel(employees: Employee[]) {
  const rows: Array<Array<string | number | null>> = employees.map(
    (emp, idx) => {
      const parts = (emp.fullName || '').trim().split(/\s+/);
      const ten = emp.ten || (parts.length > 1 ? parts[parts.length - 1] : emp.fullName || '');
      const ho = emp.ho || (parts.length > 1 ? parts.slice(0, -1).join(' ') : '');
      const isNam = emp.gioiTinh === 'Nam';
      const isNu = emp.gioiTinh === 'Nữ';
      const isDaKetHon = emp.tinhTrangHonNhan === 'Đã kết hôn';
      const isDocThan = emp.tinhTrangHonNhan === 'Độc thân';

      return [
        emp.stt || idx + 1,
        emp.donVi || 'XMAY 03',
        emp.tinhTrang || 'LV',
        emp.khoi || '',
        emp.kyHieuPb || '',
        emp.phongBan || '',
        emp.phongBanCon || emp.department || '',
        emp.msnv || '',
        ho || '',
        ten || '',
        emp.congViec || emp.jobTitle || '',
        emp.ngayVao || emp.joinDate || '',
        emp.ngaySinh || '',
        emp.noiSinh || '',
        emp.nguyenQuan || '',
        isNam ? 'x' : '',
        isNu ? 'x' : '',
        emp.danToc || '',
        emp.tonGiao || '',
        emp.soNhaThuongTru || '',
        emp.phuongXaThuongTru || '',
        emp.tinhTpThuongTru || '',
        emp.diaChiThuongTru || '',
        emp.soNhaTamTru || '',
        emp.phuongXaTamTru || '',
        emp.tinhTpTamTru || '',
        emp.cccd || '',
        emp.ngayCapCccd || '',
        emp.noiCapCccd || '',
        emp.ngayHetHanCccd || '',
        emp.trinhDoVanHoa || '',
        emp.trinhDoChuyenMon || '',
        emp.soCmndCu || '',
        emp.trinhDoNgoaiNgu || '',
        emp.tayNghe || '',
        emp.daoTao || '',
        emp.soDienThoai || '',
        isDaKetHon ? 'x' : '',
        isDocThan ? 'x' : '',
        emp.sucKhoe || '',
        emp.gioiThieu || '',
        emp.boPhan || '',
        emp.loaiHd || '',
        emp.thoiHan || '',
        emp.phanLoai || '',
        emp.soHd || '',
        emp.tuNgay || '', // AU - index 46
        emp.denNgay || '', // AV - index 47
        '', // AW - index 48: Cột mới trống (bỏ qua hoàn toàn)
        emp.khoi2 || emp.khoi || '', // AX - index 49: Khối
        emp.chucVu || emp.congViec || '', // AY - index 50: Chức vụ
      ];
    }
  );
  const buffer = await buildVietSunWorkbookBuffer(rows);
  const stringTime = getFormattedStringTime();
  triggerBlobDownload(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `DanhSachNhanVien_${stringTime}.xlsx`
  );
}

export const ExcelImportModal: React.FC<ExcelImportModalProps> = ({
  isOpen,
  onClose,
  existingEmployees,
  onConfirmImport,
  onGoToPrintWithIds,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const workbookRef = useRef<XLSX.WorkBook | null>(null);

  const [fileName, setFileName] = useState<string>('');
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheetName, setSelectedSheetName] = useState<string>('');
  const [detectedColumnsNote, setDetectedColumnsNote] = useState<string>('');
  const [detectedCols, setDetectedCols] = useState<DetectedColMap>({
    stt: 'A',
    dept: 'E',
    msnv: 'F',
    ho: 'G',
    ten: 'H',
    job: 'I',
    date: 'J',
  });
  const [onlyVisibleExcelRows, setOnlyVisibleExcelRows] = useState<boolean>(true);
  const [isParsingFile, setIsParsingFile] = useState<boolean>(false);

  const [allExtractedRows, setAllExtractedRows] = useState<RawExtractedRow[]>([]);
  const [rowPhotos, setRowPhotos] = useState<Record<number, string>>({});
  const [importMode, setImportMode] = useState<'add_only' | 'upsert'>('upsert');
  const [deselectedRowNums, setDeselectedRowNums] = useState<Set<number>>(new Set());
  const [filterView, setFilterView] = useState<'all' | 'valid' | 'error'>('all');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [importResultBanner, setImportResultBanner] = useState<{
    importedCount: number;
    updatedCount: number;
    errorCount: number;
    importedIds: string[];
  } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const existingMap = useMemo(() => {
    const map = new Map<string, Employee>();
    existingEmployees.forEach((emp) => {
      map.set(emp.msnv.trim().toLowerCase(), emp);
    });
    return map;
  }, [existingEmployees]);

  const hiddenRowCountInSheet = useMemo(() => {
    return allExtractedRows.filter((r) => r.isHiddenInExcel).length;
  }, [allExtractedRows]);

  const activeRawRows = useMemo(() => {
    const visibleOnly = allExtractedRows.filter((r) => !r.isHiddenInExcel);
    // If user enabled onlyVisibleExcelRows and there is at least 1 visible row, use visible rows
    if (onlyVisibleExcelRows && visibleOnly.length > 0) {
      return visibleOnly;
    }
    return allExtractedRows;
  }, [allExtractedRows, onlyVisibleExcelRows]);

  // Re-evaluate rows whenever activeRawRows, importMode, or existingEmployees change
  const evaluatedRows: ParsedExcelRow[] = useMemo(() => {
    const seenInFile = new Map<string, number>();

    return activeRawRows.map((row) => {
      const errors: string[] = [];
      const msnvClean = row.msnv.trim();
      const nameClean = row.fullName.trim();
      const deptClean = (row.department || row.phongBanCon || row.phongBan || row.boPhan || '').trim();
      const dateClean = (row.joinDate || row.ngayVao || '').trim();

      if (!msnvClean) errors.push('Thiếu MSNV');
      if (!nameClean) errors.push('Thiếu Họ / Tên');
      if (!deptClean) errors.push('Thiếu Phòng ban');
      if (!dateClean) errors.push('Thiếu Ngày vào');

      if (msnvClean.length > 50) errors.push('MSNV vượt quá 50 ký tự');
      if (nameClean.length > 120) errors.push('Họ và tên vượt quá 120 ký tự');
      if (deptClean.length > 120) errors.push('Phòng ban vượt quá 120 ký tự');
      if (dateClean.length > 30) errors.push('Ngày vào vượt quá 30 ký tự');

      const msnvKey = msnvClean.toLowerCase();
      if (msnvKey) {
        if (seenInFile.has(msnvKey)) {
          errors.push(
            `Trùng MSNV ngay trong file Excel (trùng với dòng ${seenInFile.get(msnvKey)})`
          );
        } else {
          seenInFile.set(msnvKey, row.rowNumber);
        }
      }

      const existingEmp = msnvKey ? existingMap.get(msnvKey) : undefined;
      if (existingEmp && importMode === 'add_only') {
        errors.push(`Trùng MSNV "${msnvClean}" đã tồn tại (${existingEmp.fullName})`);
      }

      const isError = errors.length > 0;
      const status: ParsedExcelRow['status'] = isError
        ? 'error'
        : existingEmp
          ? 'valid_update'
          : 'valid_new';

      return {
        rowNumber: row.rowNumber,
        stt: row.stt,
        msnv: msnvClean,
        lastName: row.lastName,
        firstName: row.firstName,
        fullName: nameClean,
        department: deptClean,
        jobTitle: row.jobTitle,
        joinDate: dateClean,
        photoUrl: rowPhotos[row.rowNumber] || existingEmp?.photoUrl || '',
        status,
        errors,
        existingEmployeeId: existingEmp?.id,
        selected: !isError && !deselectedRowNums.has(row.rowNumber),

        // Các trường nhân sự đầy đủ
        donVi: row.donVi || existingEmp?.donVi,
        tinhTrang: row.tinhTrang || existingEmp?.tinhTrang,
        khoi: row.khoi || existingEmp?.khoi,
        kyHieuPb: row.kyHieuPb || existingEmp?.kyHieuPb,
        phongBan: row.phongBan || existingEmp?.phongBan || deptClean,
        phongBanCon: row.phongBanCon || existingEmp?.phongBanCon || deptClean,
        ho: row.ho || row.lastName,
        ten: row.ten || row.firstName,
        congViec: row.congViec || row.jobTitle,
        ngayVao: row.ngayVao || dateClean,
        ngaySinh: row.ngaySinh || existingEmp?.ngaySinh,
        noiSinh: row.noiSinh || existingEmp?.noiSinh,
        nguyenQuan: row.nguyenQuan || existingEmp?.nguyenQuan,
        gioiTinh: row.gioiTinh || existingEmp?.gioiTinh,
        danToc: row.danToc || existingEmp?.danToc,
        tonGiao: row.tonGiao || existingEmp?.tonGiao,
        soNhaThuongTru: row.soNhaThuongTru || existingEmp?.soNhaThuongTru,
        phuongXaThuongTru: row.phuongXaThuongTru || existingEmp?.phuongXaThuongTru,
        tinhTpThuongTru: row.tinhTpThuongTru || existingEmp?.tinhTpThuongTru,
        diaChiThuongTru: row.diaChiThuongTru || existingEmp?.diaChiThuongTru,
        soNhaTamTru: row.soNhaTamTru || existingEmp?.soNhaTamTru,
        phuongXaTamTru: row.phuongXaTamTru || existingEmp?.phuongXaTamTru,
        tinhTpTamTru: row.tinhTpTamTru || existingEmp?.tinhTpTamTru,
        cccd: row.cccd || existingEmp?.cccd,
        ngayCapCccd: row.ngayCapCccd || existingEmp?.ngayCapCccd,
        noiCapCccd: row.noiCapCccd || existingEmp?.noiCapCccd,
        ngayHetHanCccd: row.ngayHetHanCccd || existingEmp?.ngayHetHanCccd,
        trinhDoVanHoa: row.trinhDoVanHoa || existingEmp?.trinhDoVanHoa,
        trinhDoChuyenMon: row.trinhDoChuyenMon || existingEmp?.trinhDoChuyenMon,
        soCmndCu: row.soCmndCu || existingEmp?.soCmndCu,
        trinhDoNgoaiNgu: row.trinhDoNgoaiNgu || existingEmp?.trinhDoNgoaiNgu,
        tayNghe: row.tayNghe || existingEmp?.tayNghe,
        daoTao: row.daoTao || existingEmp?.daoTao,
        soDienThoai: row.soDienThoai || existingEmp?.soDienThoai,
        tinhTrangHonNhan: row.tinhTrangHonNhan || existingEmp?.tinhTrangHonNhan,
        sucKhoe: row.sucKhoe || existingEmp?.sucKhoe,
        gioiThieu: row.gioiThieu || existingEmp?.gioiThieu,
        boPhan: row.boPhan || existingEmp?.boPhan,
        loaiHd: row.loaiHd || existingEmp?.loaiHd,
        thoiHan: row.thoiHan || existingEmp?.thoiHan,
        phanLoai: row.phanLoai || existingEmp?.phanLoai,
        soHd: row.soHd || existingEmp?.soHd,
        tuNgay: row.tuNgay || existingEmp?.tuNgay,
        denNgay: row.denNgay || existingEmp?.denNgay,
        khoi2: row.khoi2 || existingEmp?.khoi2,
        chucVu: row.chucVu || existingEmp?.chucVu,
        extraData: row.extraData || existingEmp?.extraData,
      };
    });
  }, [activeRawRows, importMode, existingMap, deselectedRowNums, rowPhotos, detectedCols]);

  const stats = useMemo(() => {
    const totalRows = evaluatedRows.length;
    const validRows = evaluatedRows.filter((r) => r.status !== 'error');
    const errorRows = evaluatedRows.filter((r) => r.status === 'error');
    const selectedRows = validRows.filter((r) => r.selected);
    const newCount = selectedRows.filter((r) => r.status === 'valid_new').length;
    const updateCount = selectedRows.filter((r) => r.status === 'valid_update').length;

    return {
      totalRows,
      validCount: validRows.length,
      errorCount: errorRows.length,
      selectedCount: selectedRows.length,
      newCount,
      updateCount,
    };
  }, [evaluatedRows]);

  const filteredRows = useMemo(() => {
    if (filterView === 'valid') {
      return evaluatedRows.filter((r) => r.status !== 'error');
    }
    if (filterView === 'error') {
      return evaluatedRows.filter((r) => r.status === 'error');
    }
    return evaluatedRows;
  }, [evaluatedRows, filterView]);

  if (!isOpen) return null;

  const parseSheetFromWorkbook = (wb: XLSX.WorkBook, sheetName: string) => {
    const worksheet = wb.Sheets[sheetName];
    if (!worksheet || !worksheet['!ref']) {
      setParseError(`Sheet "${sheetName}" không có dữ liệu hoặc để trống.`);
      setAllExtractedRows([]);
      return;
    }

    const range = XLSX.utils.decode_range(worksheet['!ref']);
    const maxScanHeaderRow = Math.min(range.e.r, 60);
    const maxScanCol = Math.min(range.e.c, 80);

    let colStt = 0;
    let colDonVi = -1;
    let colTinhTrang = -1;
    let colKhoi = -1;
    let colKyHieuPb = -1;
    let colPhongBan = -1;
    let colDept = 4;
    let colMsnv = 5;
    let colHo = 6;
    let colTen = 7;
    let colFullName = -1;
    let colCongViec = 8;
    let colDate = 9;
    let colNgaySinh = -1;
    let colNoiSinh = -1;
    let colNguyenQuan = -1;
    let colNam = -1;
    let colNu = -1;
    let colDanToc = -1;
    let colTonGiao = -1;
    let colSoNhaThuongTru = -1;
    let colPhuongXaThuongTru = -1;
    let colTinhTpThuongTru = -1;
    let colDiaChiThuongTru = -1;
    let colSoNhaTamTru = -1;
    let colPhuongXaTamTru = -1;
    let colTinhTpTamTru = -1;
    let colCccd = -1;
    let colNgayCapCccd = -1;
    let colNoiCapCccd = -1;
    let colNgayHetHanCccd = -1;
    let colTrinhDoVanHoa = -1;
    let colTrinhDoChuyenMon = -1;
    let colSoCmndCu = -1;
    let colTrinhDoNgoaiNgu = -1;
    let colTayNghe = -1;
    let colDaoTao = -1;
    let colSoDienThoai = -1;
    let colDaKetHon = -1;
    let colDocThan = -1;
    let colSucKhoe = -1;
    let colGioiThieu = -1;
    let colBoPhan = -1;
    let colLoaiHd = -1;
    let colThoiHan = -1;
    let colPhanLoai = -1;
    let colSoHd = -1;
    let colTuNgay = -1;
    let colDenNgay = -1;
    let colKhoi2 = -1;
    let colChucVu = -1;
    let dataStartRow = 0;

    let vnHeaderRowIdx = -1;
    let codeSubHeaderRowIdx = -1;

    for (let r = 0; r <= maxScanHeaderRow; r++) {
      let hasVnMsnv = false;
      let hasVnDeptOrName = false;
      let hasCodeSubHeader = false;

      for (let c = 0; c <= maxScanCol; c++) {
        const s = stripViAccents(readCellText(worksheet, r, c));
        if (!s) continue;

        if (s === 'msnv' || s.includes('ma so nhan vien') || s === 'ma nv') {
          hasVnMsnv = true;
        }
        if (
          s.includes('phong ban') ||
          s.includes('bo phan') ||
          s === 'ho' ||
          s === 'ho va ten'
        ) {
          hasVnDeptOrName = true;
        }
        if (
          s.includes('bophancon') ||
          s.startsWith('manhanvien') ||
          s.includes('ngayvaocty') ||
          s === 'congviec'
        ) {
          hasCodeSubHeader = true;
        }
      }

      if (vnHeaderRowIdx === -1 && hasVnMsnv && hasVnDeptOrName) {
        vnHeaderRowIdx = r;
      }
      if (codeSubHeaderRowIdx === -1 && hasCodeSubHeader) {
        codeSubHeaderRowIdx = r;
      }
      if (vnHeaderRowIdx !== -1 && codeSubHeaderRowIdx !== -1 && r > vnHeaderRowIdx + 3) {
        break;
      }
    }

    const anchorRowIdx = vnHeaderRowIdx !== -1 ? vnHeaderRowIdx : codeSubHeaderRowIdx;

    if (anchorRowIdx !== -1) {
      const scanEndR = Math.min(
        maxScanHeaderRow,
        Math.max(anchorRowIdx + 3, codeSubHeaderRowIdx !== -1 ? codeSubHeaderRowIdx : anchorRowIdx)
      );

      if (codeSubHeaderRowIdx !== -1 && codeSubHeaderRowIdx >= anchorRowIdx) {
        dataStartRow = codeSubHeaderRowIdx + 1;
      } else {
        const merges = worksheet['!merges'] || [];
        let maxMergedRow = anchorRowIdx;
        for (const m of merges) {
          if (m.s.r === anchorRowIdx && m.e.r > maxMergedRow && m.e.r <= anchorRowIdx + 2) {
            maxMergedRow = m.e.r;
          }
        }
        const afterMergeR = maxMergedRow + 1;
        let isAfterMergeSubHeader = false;
        for (let c = 0; c <= maxScanCol; c++) {
          const s = stripViAccents(readCellText(worksheet, afterMergeR, c));
          if (
            s.includes('bophan') ||
            s.startsWith('manh') ||
            s.includes('ngayvao') ||
            s === 'congviec' ||
            s === 'no'
          ) {
            isAfterMergeSubHeader = true;
            break;
          }
        }
        dataStartRow = isAfterMergeSubHeader ? afterMergeR + 1 : maxMergedRow + 1;
      }

      const colTokens: string[][] = [];
      for (let c = 0; c <= maxScanCol; c++) {
        const tokens: string[] = [];
        for (let r = anchorRowIdx; r <= scanEndR; r++) {
          if (r >= dataStartRow) break;
          const t = stripViAccents(readCellText(worksheet, r, c));
          if (t) tokens.push(t);
        }
        colTokens[c] = tokens;
      }

      const findCol = (pred: (s: string) => boolean): number => {
        for (let c = 0; c <= maxScanCol; c++) {
          if ((colTokens[c] || []).some(pred)) return c;
        }
        return -1;
      };

      const foundStt = findCol((s) => s === 'stt' || s === 'no');
      const foundDeptSub = findCol(
        (s) => s.includes('phong ban con') || s.includes('bophancon')
      );
      const foundMsnv = findCol(
        (s) =>
          s === 'msnv' ||
          s.startsWith('manhanvien') ||
          s.startsWith('manh') ||
          s.includes('ma so') ||
          s === 'ma nv'
      );
      const foundHo = findCol((s) => s === 'ho' || s === 'ho dem');
      const foundTen = findCol((s) => s === 'ten');
      const foundFullName = findCol(
        (s) => s.includes('ho va ten') || s === 'ho ten'
      );
      const foundJob = findCol(
        (s) => s.includes('cong viec') || s.includes('congviec')
      );
      const foundDate = findCol(
        (s) => s.includes('ngay vao') || s.includes('ngayvaocty')
      );

      // Check if this sheet matches the official format (Col 7 is MSNV, Col 6 is PHÒNG BAN CON, Col 8 is HỌ)
      const isOfficialTemplateFormat =
        foundMsnv === EMPLOYEE_EXCEL_COLUMNS.MSNV &&
        foundHo === EMPLOYEE_EXCEL_COLUMNS.HO &&
        foundTen === EMPLOYEE_EXCEL_COLUMNS.TEN;

      if (isOfficialTemplateFormat) {
        colStt = EMPLOYEE_EXCEL_COLUMNS.STT;
        colDonVi = EMPLOYEE_EXCEL_COLUMNS.DON_VI;
        colTinhTrang = EMPLOYEE_EXCEL_COLUMNS.TINH_TRANG;
        colKhoi = EMPLOYEE_EXCEL_COLUMNS.KHOI;
        colKyHieuPb = EMPLOYEE_EXCEL_COLUMNS.KY_HIEU_PB;
        colPhongBan = EMPLOYEE_EXCEL_COLUMNS.PHONG_BAN;
        colDept = EMPLOYEE_EXCEL_COLUMNS.PHONG_BAN_CON;
        colMsnv = EMPLOYEE_EXCEL_COLUMNS.MSNV;
        colHo = EMPLOYEE_EXCEL_COLUMNS.HO;
        colTen = EMPLOYEE_EXCEL_COLUMNS.TEN;
        colFullName = -1;
        colCongViec = EMPLOYEE_EXCEL_COLUMNS.CONG_VIEC;
        colDate = EMPLOYEE_EXCEL_COLUMNS.NGAY_VAO;
        colNgaySinh = EMPLOYEE_EXCEL_COLUMNS.NGAY_SINH;
        colNoiSinh = EMPLOYEE_EXCEL_COLUMNS.NOI_SINH;
        colNguyenQuan = EMPLOYEE_EXCEL_COLUMNS.NGUYEN_QUAN;
        colNam = EMPLOYEE_EXCEL_COLUMNS.NAM;
        colNu = EMPLOYEE_EXCEL_COLUMNS.NU;
        colDanToc = EMPLOYEE_EXCEL_COLUMNS.DAN_TOC;
        colTonGiao = EMPLOYEE_EXCEL_COLUMNS.TON_GIAO;
        colSoNhaThuongTru = EMPLOYEE_EXCEL_COLUMNS.SO_NHA_THUONG_TRU;
        colPhuongXaThuongTru = EMPLOYEE_EXCEL_COLUMNS.PHUONG_XA_THUONG_TRU;
        colTinhTpThuongTru = EMPLOYEE_EXCEL_COLUMNS.TINH_TP_THUONG_TRU;
        colDiaChiThuongTru = EMPLOYEE_EXCEL_COLUMNS.DIA_CHI_THUONG_TRU;
        colSoNhaTamTru = EMPLOYEE_EXCEL_COLUMNS.SO_NHA_TAM_TRU;
        colPhuongXaTamTru = EMPLOYEE_EXCEL_COLUMNS.PHUONG_XA_TAM_TRU;
        colTinhTpTamTru = EMPLOYEE_EXCEL_COLUMNS.TINH_TP_TAM_TRU;
        colCccd = EMPLOYEE_EXCEL_COLUMNS.CCCD;
        colNgayCapCccd = EMPLOYEE_EXCEL_COLUMNS.NGAY_CAP_CCCD;
        colNoiCapCccd = EMPLOYEE_EXCEL_COLUMNS.NOI_CAP_CCCD;
        colNgayHetHanCccd = EMPLOYEE_EXCEL_COLUMNS.NGAY_HET_HAN_CCCD;
        colTrinhDoVanHoa = EMPLOYEE_EXCEL_COLUMNS.TRINH_DO_VAN_HOA;
        colTrinhDoChuyenMon = EMPLOYEE_EXCEL_COLUMNS.TRINH_DO_CHUYEN_MON;
        colSoCmndCu = EMPLOYEE_EXCEL_COLUMNS.SO_CMND_CU;
        colTrinhDoNgoaiNgu = EMPLOYEE_EXCEL_COLUMNS.TRINH_DO_NGOAI_NGU;
        colTayNghe = EMPLOYEE_EXCEL_COLUMNS.TAY_NGHE;
        colDaoTao = EMPLOYEE_EXCEL_COLUMNS.DAO_TAO;
        colSoDienThoai = EMPLOYEE_EXCEL_COLUMNS.SO_DIEN_THOAI;
        colDaKetHon = EMPLOYEE_EXCEL_COLUMNS.DA_KET_HON;
        colDocThan = EMPLOYEE_EXCEL_COLUMNS.DOC_THAN;
        colSucKhoe = EMPLOYEE_EXCEL_COLUMNS.SUC_KHOE;
        colGioiThieu = EMPLOYEE_EXCEL_COLUMNS.GIOI_THIEU;
        colBoPhan = EMPLOYEE_EXCEL_COLUMNS.BO_PHAN;
        colLoaiHd = EMPLOYEE_EXCEL_COLUMNS.LOAI_HD;
        colThoiHan = EMPLOYEE_EXCEL_COLUMNS.THOI_HAN;
        colPhanLoai = EMPLOYEE_EXCEL_COLUMNS.PHAN_LOAI;
        colSoHd = EMPLOYEE_EXCEL_COLUMNS.SO_HD;
        colTuNgay = EMPLOYEE_EXCEL_COLUMNS.TU_NGAY; // 46 (AU)
        colDenNgay = EMPLOYEE_EXCEL_COLUMNS.DEN_NGAY; // 47 (AV)

        // Cột AW (index 48): Cột mới trống, bỏ qua hoàn toàn không đọc/validate
        // Hỗ trợ cả file mẫu cũ và mới:
        const hasKhoiAtOldAw = (colTokens[48] || []).some((s) => s === 'khoi' || s.includes('khoi'));
        if (hasKhoiAtOldAw) {
          colKhoi2 = 48; // File mẫu cũ (AW)
          colChucVu = 49; // File mẫu cũ (AX)
        } else {
          // File mẫu mới chuẩn: Cột AW (48) bỏ qua; Khối ở AX (49); Chức vụ ở AY (50)
          colKhoi2 = EMPLOYEE_EXCEL_COLUMNS.KHOI_2; // 49 (AX)
          colChucVu = EMPLOYEE_EXCEL_COLUMNS.CHUC_VU; // 50 (AY)
        }
      } else {
        // Dynamic search for all columns
        if (foundStt !== -1) colStt = foundStt;
        if (foundMsnv !== -1) colMsnv = foundMsnv;

        colKhoi = findCol((s) => s === 'khoi' || s.includes('khoi'));
        colKyHieuPb = findCol((s) => s.includes('ky hieu') || s.includes('ma pb') || s.includes('kyhieu') || s === 'tinhtrang5');
        colPhongBan = findCol((s) => (s === 'phong ban' || s === 'bophan5' || (s.includes('phong ban') && !s.includes('con'))) && !s.includes('ky hieu'));

        let resolvedDeptCol = foundDeptSub;
        if (resolvedDeptCol === -1) {
          resolvedDeptCol = findCol((s) => s.includes('phong ban con') || s.includes('bophancon') || s.includes('bo phan con'));
        }
        if (resolvedDeptCol === -1) {
          resolvedDeptCol = colPhongBan;
        }
        colDept = resolvedDeptCol;

        if (foundHo !== -1) colHo = foundHo;
        if (foundTen !== -1) colTen = foundTen;
        if (foundFullName !== -1) colFullName = foundFullName;
        if (foundJob !== -1) colCongViec = foundJob;
        if (foundDate !== -1) colDate = foundDate;

        colDonVi = findCol((s) => s.includes('don vi') || s.startsWith('donvi'));
        colTinhTrang = findCol(
          (s) => (s.includes('tinh trang') && !s.includes('hon nhan')) || s === 'tinhtrang4'
        );
        colNgaySinh = findCol((s) => s.includes('ngay sinh') || s.includes('ngaysinh'));
        colNoiSinh = findCol((s) => s.includes('noi sinh') || s.includes('noisinh'));
        colNguyenQuan = findCol((s) => s.includes('nguyen quan') || s.includes('nguyenquan'));
        colNam = findCol((s) => s === 'nam' || s === 'column7');
        colNu = findCol((s) => s === 'nu' || s === 'gioitinhnu');
        colDanToc = findCol((s) => s.includes('dan toc') || s.includes('dantoc'));
        colTonGiao = findCol((s) => s.includes('ton giao') || s.includes('tongiao'));
        colSoNhaThuongTru = findCol((s) => s === 'sonha' || (s.includes('thuong tru') && s.includes('so nha')));
        colPhuongXaThuongTru = findCol((s) => s === 'phuongxa' || (s.includes('thuong tru') && s.includes('phuong xa')));
        colTinhTpThuongTru = findCol((s) => s === 'tinh' || (s.includes('thuong tru') && s.includes('tinh')));
        colDiaChiThuongTru = findCol((s) => s.includes('diachithuongtru') || (s.includes('thuong tru') && s.includes('dia chi')));
        colSoNhaTamTru = findCol((s) => s === 'sonha8' || (s.includes('tam tru') && s.includes('so nha')));
        colPhuongXaTamTru = findCol((s) => s === 'phuongxa9' || (s.includes('tam tru') && s.includes('phuong xa')));
        colTinhTpTamTru = findCol((s) => s === 'tinh11' || (s.includes('tam tru') && s.includes('tinh')));
        colCccd = findCol((s) => s === 'cccd' || s.includes('can cuoc'));
        colNgayCapCccd = findCol((s) => s === 'ngaycap' || (s.includes('ngay cap') && !s.includes('het han')));
        colNoiCapCccd = findCol((s) => s === 'noicap' || s.includes('noi cap'));
        colNgayHetHanCccd = findCol((s) => s.includes('hethan') || s.includes('het han'));
        colTrinhDoVanHoa = findCol((s) => s.includes('tdvanhoa') || s.includes('van hoa'));
        colTrinhDoChuyenMon = findCol((s) => s.includes('tdchuyenmon') || s.includes('chuyen mon'));
        colSoCmndCu = findCol((s) => s.includes('scmndc') || s.includes('cmnd cu'));
        colTrinhDoNgoaiNgu = findCol((s) => s.includes('tdngoaingu') || s.includes('ngoai ngu'));
        colTayNghe = findCol((s) => s.includes('taynghe') || s.includes('tay nghe'));
        colDaoTao = findCol((s) => s.includes('daotao') || s.includes('dao tao'));
        colSoDienThoai = findCol((s) => s.includes('sodienthoai') || s.includes('dien thoai'));
        colDaKetHon = findCol((s) => s.includes('dakethon') || s.includes('da ket hon'));
        colDocThan = findCol((s) => s.includes('docthan') || s.includes('doc than'));
        colSucKhoe = findCol((s) => s.includes('suc khoe') || s === 'column12');
        colGioiThieu = findCol((s) => s.includes('gioi thieu'));
        colBoPhan = findCol((s) => s === 'bo phan' || s === 'column13');
        colLoaiHd = findCol((s) => s.includes('loai hd') || s.includes('loai hop dong') || s === 'column15');
        colThoiHan = findCol((s) => s.includes('thoi han') || s === 'column16');
        colPhanLoai = findCol((s) => s.includes('phan loai') || s === 'column17');
        colSoHd = findCol((s) => s.includes('so hd') || s === 'column18');
        colTuNgay = findCol((s) => s.includes('tu ngay') || s === 'column19');
        colDenNgay = findCol((s) => s.includes('den ngay') || s === 'column20');
        colChucVu = findCol((s) => s.includes('chuc vu'));

        // colKhoi2 nằm ở các cột phía sau, tìm cột có chứa 'khoi' khác colKhoi ban đầu (quét từ phải qua)
        for (let c = maxScanCol; c >= 0; c--) {
          if (c !== colKhoi && (colTokens[c] || []).some((s) => s === 'khoi' || s.includes('khoi'))) {
            colKhoi2 = c;
            break;
          }
        }
        if (colKhoi2 === -1 && maxScanCol >= EMPLOYEE_EXCEL_COLUMNS.KHOI_2) {
          colKhoi2 = EMPLOYEE_EXCEL_COLUMNS.KHOI_2;
        }
        if (colChucVu === -1 && maxScanCol >= EMPLOYEE_EXCEL_COLUMNS.CHUC_VU) {
          colChucVu = EMPLOYEE_EXCEL_COLUMNS.CHUC_VU;
        }
      }
    }

    const colLetter = (c: number) => (c >= 0 ? XLSX.utils.encode_col(c) : '?');
    const nextDetectedCols: DetectedColMap = {
      stt: colLetter(colStt),
      khoi: colLetter(colKhoi),
      kyHieuPb: colLetter(colKyHieuPb),
      phongBan: colLetter(colPhongBan),
      dept: colLetter(colDept),
      msnv: colLetter(colMsnv),
      ho: colFullName >= 0 ? colLetter(colFullName) : colLetter(colHo),
      ten: colFullName >= 0 ? colLetter(colFullName) : colLetter(colTen),
      job: colLetter(colCongViec),
      date: colLetter(colDate),
    };
    setDetectedCols(nextDetectedCols);
    setDetectedColumnsNote('');

    const rowProps = worksheet['!rows'] || [];
    const extracted: RawExtractedRow[] = [];
    let emptyStreak = 0;
    const maxRow = Math.min(range.e.r, 20000);

    // Cột AU (Từ ngày) & AV (Đến ngày) có thể đang format mm/dd/yyyy -> mặc định ưu tiên đọc MM/DD/YYYY (trừ khi cột có ngày > 12 ở vị trí đầu)
    const tuNgayMonthFirst = detectColumnMonthFirst(worksheet, dataStartRow, maxRow, colTuNgay, true);
    const denNgayMonthFirst = detectColumnMonthFirst(worksheet, dataStartRow, maxRow, colDenNgay, true);

    for (let r = dataStartRow; r <= maxRow; r++) {
      const sttVal = colStt >= 0 ? readCellText(worksheet, r, colStt) : '';
      const msnvVal = colMsnv >= 0 ? readCellText(worksheet, r, colMsnv) : '';
      const hoVal = colHo >= 0 ? readCellText(worksheet, r, colHo) : '';
      const tenVal = colTen >= 0 ? readCellText(worksheet, r, colTen) : '';
      const fullVal =
        colFullName >= 0
          ? readCellText(worksheet, r, colFullName)
          : [hoVal, tenVal].filter(Boolean).join(' ').trim();
      const khoiVal = colKhoi >= 0 ? readCellText(worksheet, r, colKhoi) : '';
      const kyHieuPbVal = colKyHieuPb >= 0 ? readCellText(worksheet, r, colKyHieuPb) : '';
      const phongBanVal = colPhongBan >= 0 ? readCellText(worksheet, r, colPhongBan) : '';
      const phongBanConVal = colDept >= 0 ? readCellText(worksheet, r, colDept) : '';
      const deptVal = phongBanConVal || phongBanVal;
      const jobVal =
        (colCongViec >= 0 ? readCellText(worksheet, r, colCongViec) : '') ||
        (colChucVu >= 0 ? readCellText(worksheet, r, colChucVu) : '');
      const dateVal = colDate >= 0 ? readCellDate(worksheet, r, colDate) : '';

      if (!msnvVal && !fullVal && !deptVal && !dateVal) {
        emptyStreak++;
        if (emptyStreak > 250) break;
        continue;
      }
      emptyStreak = 0;

      // Skip repeated header / sub-header / filter code rows
      const msnvCheck = stripViAccents(msnvVal);
      const deptCheck = stripViAccents(deptVal);
      const hoCheck = stripViAccents(hoVal);
      const sttCheck = stripViAccents(sttVal);
      if (
        msnvCheck === 'msnv' ||
        msnvCheck.startsWith('manh') ||
        deptCheck === 'phong ban con' ||
        deptCheck.startsWith('bophancon') ||
        sttCheck === 'stt' ||
        sttCheck === 'no' ||
        (hoCheck === 'ho' && stripViAccents(tenVal) === 'ten')
      ) {
        continue;
      }

      if (!msnvVal && !fullVal) {
        continue;
      }

      let splitHo = hoVal;
      let splitTen = tenVal;
      if (!splitHo && !splitTen && fullVal) {
        const parts = fullVal.split(/\s+/);
        splitTen = parts.length > 1 ? parts[parts.length - 1] : fullVal;
        splitHo = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';
      }

      // Gender
      const namVal = colNam >= 0 ? readCellText(worksheet, r, colNam) : '';
      const nuVal = colNu >= 0 ? readCellText(worksheet, r, colNu) : '';
      let gioiTinhVal = '';
      if (namVal && !nuVal) gioiTinhVal = 'Nam';
      else if (nuVal && !namVal) gioiTinhVal = 'Nữ';
      else if (stripViAccents(namVal).includes('nam')) gioiTinhVal = 'Nam';
      else if (stripViAccents(nuVal).includes('nu')) gioiTinhVal = 'Nữ';

      // Marital status
      const daKetHonVal = colDaKetHon >= 0 ? readCellText(worksheet, r, colDaKetHon) : '';
      const docThanVal = colDocThan >= 0 ? readCellText(worksheet, r, colDocThan) : '';
      let tinhTrangHonNhanVal = '';
      if (daKetHonVal && !docThanVal) tinhTrangHonNhanVal = 'Đã kết hôn';
      else if (docThanVal && !daKetHonVal) tinhTrangHonNhanVal = 'Độc thân';
      else if (stripViAccents(daKetHonVal).includes('ket hon')) tinhTrangHonNhanVal = 'Đã kết hôn';
      else if (stripViAccents(docThanVal).includes('doc than')) tinhTrangHonNhanVal = 'Độc thân';

      const isHidden = Boolean(rowProps[r]?.hidden);

      extracted.push({
        rowNumber: r + 1,
        stt: sttVal || String(extracted.length + 1),
        msnv: msnvVal,
        lastName: splitHo,
        firstName: splitTen,
        fullName: fullVal,
        department: deptVal,
        jobTitle: jobVal,
        joinDate: dateVal,
        isHiddenInExcel: isHidden,

        // Full HR details
        donVi: colDonVi >= 0 ? readCellText(worksheet, r, colDonVi) : '',
        tinhTrang: colTinhTrang >= 0 ? readCellText(worksheet, r, colTinhTrang) : '',
        khoi: khoiVal,
        kyHieuPb: kyHieuPbVal,
        phongBan: phongBanVal,
        phongBanCon: phongBanConVal,
        ho: splitHo,
        ten: splitTen,
        congViec: jobVal,
        ngayVao: dateVal,
        ngaySinh: colNgaySinh >= 0 ? readCellDate(worksheet, r, colNgaySinh) : '',
        noiSinh: colNoiSinh >= 0 ? readCellText(worksheet, r, colNoiSinh) : '',
        nguyenQuan: colNguyenQuan >= 0 ? readCellText(worksheet, r, colNguyenQuan) : '',
        gioiTinh: gioiTinhVal,
        danToc: colDanToc >= 0 ? readCellText(worksheet, r, colDanToc) : '',
        tonGiao: colTonGiao >= 0 ? readCellText(worksheet, r, colTonGiao) : '',
        soNhaThuongTru: colSoNhaThuongTru >= 0 ? readCellText(worksheet, r, colSoNhaThuongTru) : '',
        phuongXaThuongTru: colPhuongXaThuongTru >= 0 ? readCellText(worksheet, r, colPhuongXaThuongTru) : '',
        tinhTpThuongTru: colTinhTpThuongTru >= 0 ? readCellText(worksheet, r, colTinhTpThuongTru) : '',
        diaChiThuongTru: colDiaChiThuongTru >= 0 ? readCellText(worksheet, r, colDiaChiThuongTru) : '',
        soNhaTamTru: colSoNhaTamTru >= 0 ? readCellText(worksheet, r, colSoNhaTamTru) : '',
        phuongXaTamTru: colPhuongXaTamTru >= 0 ? readCellText(worksheet, r, colPhuongXaTamTru) : '',
        tinhTpTamTru: colTinhTpTamTru >= 0 ? readCellText(worksheet, r, colTinhTpTamTru) : '',
        cccd: colCccd >= 0 ? readCellText(worksheet, r, colCccd) : '',
        ngayCapCccd: colNgayCapCccd >= 0 ? readCellDate(worksheet, r, colNgayCapCccd) : '',
        noiCapCccd: colNoiCapCccd >= 0 ? readCellText(worksheet, r, colNoiCapCccd) : '',
        ngayHetHanCccd: colNgayHetHanCccd >= 0 ? readCellDate(worksheet, r, colNgayHetHanCccd) : '',
        trinhDoVanHoa: colTrinhDoVanHoa >= 0 ? readCellText(worksheet, r, colTrinhDoVanHoa) : '',
        trinhDoChuyenMon: colTrinhDoChuyenMon >= 0 ? readCellText(worksheet, r, colTrinhDoChuyenMon) : '',
        soCmndCu: colSoCmndCu >= 0 ? readCellText(worksheet, r, colSoCmndCu) : '',
        trinhDoNgoaiNgu: colTrinhDoNgoaiNgu >= 0 ? readCellText(worksheet, r, colTrinhDoNgoaiNgu) : '',
        tayNghe: colTayNghe >= 0 ? readCellText(worksheet, r, colTayNghe) : '',
        daoTao: colDaoTao >= 0 ? readCellText(worksheet, r, colDaoTao) : '',
        soDienThoai: colSoDienThoai >= 0 ? readCellText(worksheet, r, colSoDienThoai) : '',
        tinhTrangHonNhan: tinhTrangHonNhanVal,
        sucKhoe: colSucKhoe >= 0 ? readCellText(worksheet, r, colSucKhoe) : '',
        gioiThieu: colGioiThieu >= 0 ? readCellText(worksheet, r, colGioiThieu) : '',
        boPhan: colBoPhan >= 0 ? readCellText(worksheet, r, colBoPhan) : '',
        loaiHd: colLoaiHd >= 0 ? readCellText(worksheet, r, colLoaiHd) : '',
        thoiHan: colThoiHan >= 0 ? readCellText(worksheet, r, colThoiHan) : '',
        phanLoai: colPhanLoai >= 0 ? readCellText(worksheet, r, colPhanLoai) : '',
        soHd: colSoHd >= 0 ? readCellText(worksheet, r, colSoHd) : '',
        tuNgay: colTuNgay >= 0 ? readCellDate(worksheet, r, colTuNgay, tuNgayMonthFirst) : '',
        denNgay: colDenNgay >= 0 ? readCellDate(worksheet, r, colDenNgay, denNgayMonthFirst) : '',
        khoi2: colKhoi2 >= 0 ? readCellText(worksheet, r, colKhoi2) : '',
        chucVu: colChucVu >= 0 ? readCellText(worksheet, r, colChucVu) : '',
        extraData: {},
      });
    }

    if (extracted.length === 0) {
      setParseError(
        `Sheet "${sheetName}" không có dòng dữ liệu nhân viên nào. Nếu dữ liệu nằm ở Sheet khác, vui lòng chọn Sheet tương ứng bên dưới.`
      );
      setAllExtractedRows([]);
      return;
    }

    setParseError(null);
    setAllExtractedRows(extracted);
  };

  const processExcelFile = (file: File) => {
    setIsParsingFile(true);
    setParseError(null);
    setImportResultBanner(null);
    setFileName(file.name);
    setDeselectedRowNums(new Set());
    setRowPhotos({});

    const reader = new FileReader();
    reader.onerror = () => {
      setIsParsingFile(false);
      setParseError('Không thể đọc file từ máy tính. Vui lòng thử chọn lại file.');
    };
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const wb = XLSX.read(data, { type: 'array' });
        workbookRef.current = wb;

        const allSheets = wb.SheetNames || [];
        setSheetNames(allSheets);

        if (allSheets.length === 0) {
          setParseError('File Excel không có Sheet nào.');
          setAllExtractedRows([]);
          setIsParsingFile(false);
          return;
        }

        // Smartly pick the best Sheet: prefer the sheet that contains PHÒNG BAN CON / Bophancon6 & MSNV / Manhanvien2222, and prefer Excel's activeTab
        const wbProps = wb.Workbook as
          | {
              WBView?: Array<{ activeTab?: number }>;
              Sheets?: Array<{ Hidden?: number }>;
            }
          | undefined;
        const activeTabIdx = wbProps?.WBView?.[0]?.activeTab ?? 0;
        const sheetMeta = wbProps?.Sheets || [];

        let bestSheet = allSheets[activeTabIdx] || allSheets[0];
        let bestScore = -1;

        allSheets.forEach((sName, idx) => {
          const isHiddenSheet = sheetMeta[idx]?.Hidden === 1 || sheetMeta[idx]?.Hidden === 2;
          if (isHiddenSheet && allSheets.length > 1) return;

          const ws = wb.Sheets[sName];
          if (!ws || !ws['!ref']) return;
          const rRange = XLSX.utils.decode_range(ws['!ref']);
          const scanR = Math.min(rRange.e.r, 40);
          const scanC = Math.min(rRange.e.c, 20);

          let score = idx === activeTabIdx ? 5 : 0;
          for (let r = 0; r <= scanR; r++) {
            for (let c = 0; c <= scanC; c++) {
              const txt = stripViAccents(readCellText(ws, r, c));
              if (!txt) continue;
              if (txt === 'msnv' || txt.startsWith('manh')) score += 20;
              if (txt.includes('phong ban con') || txt.includes('bophancon')) score += 30;
              if (txt.includes('ngay vao') || txt.includes('ngayvaocty')) score += 15;
              if (txt.includes('danh sach can bo cong nhan vien')) score += 15;
            }
          }

          if (score > bestScore) {
            bestScore = score;
            bestSheet = sName;
          }
        });

        setSelectedSheetName(bestSheet);
        parseSheetFromWorkbook(wb, bestSheet);
      } catch (err) {
        setParseError(
          err instanceof Error
            ? `Không thể đọc file Excel: ${err.message}`
            : 'Định dạng file Excel không hợp lệ.'
        );
        setAllExtractedRows([]);
      } finally {
        setIsParsingFile(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset input value immediately so selecting the same file again ALWAYS fires onChange
    e.target.value = '';
    if (!file) return;
    processExcelFile(file);
  };

  const handleSheetChange = (newSheetName: string) => {
    setSelectedSheetName(newSheetName);
    setDeselectedRowNums(new Set());
    if (workbookRef.current) {
      parseSheetFromWorkbook(workbookRef.current, newSheetName);
    }
  };

  const toggleRowSelection = (rowNumber: number) => {
    setDeselectedRowNums((prev) => {
      const next = new Set(prev);
      if (next.has(rowNumber)) {
        next.delete(rowNumber);
      } else {
        next.add(rowNumber);
      }
      return next;
    });
  };

  const selectAllValid = () => {
    setDeselectedRowNums(new Set());
  };

  const deselectAllValid = () => {
    const allNums = new Set(
      evaluatedRows.filter((r) => r.status !== 'error').map((r) => r.rowNumber)
    );
    setDeselectedRowNums(allNums);
  };

  const handleConfirm = async (goToPrintAfter = false) => {
    const selectedRows = evaluatedRows.filter(
      (r) => r.status !== 'error' && r.selected
    );
    if (selectedRows.length === 0) return;

    setIsSubmitting(true);
    try {
      const importedIds = await onConfirmImport(
        selectedRows,
        importMode,
        fileName,
        {
          totalRows: stats.totalRows,
          validCount: stats.validCount,
          errorCount: stats.errorCount,
          importedCount: stats.newCount,
          updatedCount: stats.updateCount,
        },
        goToPrintAfter
      );
      if (goToPrintAfter) {
        handleReset();
        return;
      }
      setImportResultBanner({
        importedCount: stats.newCount,
        updatedCount: stats.updateCount,
        errorCount: stats.errorCount,
        importedIds,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setFileName('');
    setSheetNames([]);
    setSelectedSheetName('');
    setDetectedColumnsNote('');
    setAllExtractedRows([]);
    setRowPhotos({});
    setDeselectedRowNums(new Set());
    setImportResultBanner(null);
    setParseError(null);
    workbookRef.current = null;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden shadow-xl">
        {/* Header */}
        <div className="px-6 py-4 bg-blue-700 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-6 h-6" />
            <div>
              <h2 className="text-lg font-bold">
                Import Danh Sách Cán Bộ Công Nhân Viên Từ File Excel
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-blue-600 transition-colors"
            title="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {/* Step 1 & Step 2 Controls */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
            {/* Upload & Template Download */}
            <div className="lg:col-span-7 flex flex-col justify-between gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-800">
                  1. Chọn file Excel nhân sự (.xlsx, .xls)
                </span>
                <button
                  type="button"
                  onClick={downloadSampleExcelTemplate}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Tải File Excel Mẫu
                </button>
              </div>

              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const droppedFile = e.dataTransfer.files?.[0];
                  if (droppedFile) {
                    processExcelFile(droppedFile);
                  }
                }}
                className="flex items-center justify-center gap-3 border-2 border-dashed border-blue-400 bg-white hover:bg-blue-50/50 rounded-lg p-4 cursor-pointer transition-colors"
              >
                {isParsingFile ? (
                  <RefreshCw className="w-5 h-5 text-blue-600 animate-spin shrink-0" />
                ) : (
                  <Upload className="w-5 h-5 text-blue-600 shrink-0" />
                )}
                <div className="text-left flex-1">
                  <div className="text-sm font-semibold text-slate-800">
                    {isParsingFile
                      ? 'Đang đọc dữ liệu từ file Excel...'
                      : fileName
                        ? `Đã tải file: ${fileName} (Bấm hoặc kéo thả để chọn lại file)`
                        : 'Bấm vào đây hoặc kéo thả file Excel (.xlsx, .xls) từ máy tính'}
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.xlsm,.xlsb,.csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>

              {/* Sheet Selector & Hidden Rows Filter */}
              {(sheetNames.length > 1 || hiddenRowCountInSheet > 0) && (
                <div className="flex flex-wrap items-center justify-between gap-2 bg-blue-50/70 border border-blue-200 rounded-lg px-3 py-2 text-xs">
                  {sheetNames.length > 1 && (
                    <div className="flex items-center gap-2">
                      <Layers className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                      <span className="font-semibold text-slate-700">Chọn Sheet cần lấy:</span>
                      <select
                        value={selectedSheetName}
                        onChange={(e) => handleSheetChange(e.target.value)}
                        className="px-2.5 py-1 text-xs font-bold text-blue-800 bg-white border border-blue-300 rounded-md cursor-pointer"
                      >
                        {sheetNames.map((sName) => (
                          <option key={sName} value={sName}>
                            Sheet: {sName}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {hiddenRowCountInSheet > 0 && (
                    <label className="inline-flex items-center gap-1.5 font-semibold text-amber-800 bg-amber-100/80 border border-amber-300 px-2.5 py-1 rounded-md cursor-pointer">
                      <input
                        type="checkbox"
                        checked={onlyVisibleExcelRows}
                        onChange={(e) => setOnlyVisibleExcelRows(e.target.checked)}
                        className="accent-blue-700"
                      />
                      <Filter className="w-3 h-3" />
                      <span>
                        Chỉ lấy dòng đang lọc/hiển thị (Bỏ qua {hiddenRowCountInSheet} dòng ẩn trong Excel)
                      </span>
                    </label>
                  )}
                </div>
              )}
            </div>

            {/* Duplicate Handling Option */}
            <div className="lg:col-span-5 flex flex-col justify-between bg-white p-3.5 rounded-lg border border-slate-200">
              <div className="text-sm font-semibold text-slate-800 mb-2">
                2. Chế độ xử lý khi MSNV đã tồn tại
              </div>
              <div className="space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer text-xs">
                  <input
                    type="radio"
                    name="importMode"
                    checked={importMode === 'add_only'}
                    onChange={() => setImportMode('add_only')}
                    className="mt-0.5 text-blue-600"
                  />
                  <div>
                    <span className="font-semibold text-slate-900 block">
                      Chỉ thêm nhân viên mới (Mặc định - An toàn)
                    </span>
                    <span className="text-slate-500">
                      Không ghi đè dữ liệu cũ. Báo lỗi các dòng có MSNV trùng với dữ liệu đã có.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer text-xs">
                  <input
                    type="radio"
                    name="importMode"
                    checked={importMode === 'upsert'}
                    onChange={() => setImportMode('upsert')}
                    className="mt-0.5 text-blue-600"
                  />
                  <div>
                    <span className="font-semibold text-slate-900 block">
                      Cập nhật thông tin nếu MSNV đã tồn tại
                    </span>
                    <span className="text-slate-500">
                      Thêm mới nhân viên chưa có và cập nhật Họ tên, Bộ phận, Ngày vào làm cho MSNV đã tồn tại.
                    </span>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {parseError && (
            <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>{parseError}</span>
            </div>
          )}

          {importResultBanner && (
            <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                <div>
                  <div className="font-bold text-sm">
                    Hoàn tất Import dữ liệu nhân viên thành công!
                  </div>
                  <div className="text-xs text-emerald-800 mt-0.5 font-mono-num">
                    Thêm mới thành công: {importResultBanner.importedCount} nhân viên · Cập nhật:{' '}
                    {importResultBanner.updatedCount} nhân viên · Bỏ qua dòng lỗi:{' '}
                    {importResultBanner.errorCount} dòng
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-3 py-1.5 text-xs font-semibold bg-white border border-emerald-300 rounded-lg hover:bg-emerald-100 cursor-pointer"
                >
                  Import file khác
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-1.5 text-xs font-semibold bg-white text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Đóng & Xem danh sách
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const ids = importResultBanner.importedIds;
                    handleReset();
                    onGoToPrintWithIds(ids);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold bg-blue-700 text-white rounded-lg hover:bg-blue-800 cursor-pointer shadow-xs"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Chuyển Qua In Ngay ({importResultBanner.importedIds.length} thẻ)
                </button>
              </div>
            </div>
          )}

          {/* Preview & Validation Table */}
          {evaluatedRows.length > 0 && (
            <div className="space-y-3">
              {/* Summary Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-lg border border-slate-200">
                <div className="flex flex-wrap items-center gap-4 text-xs font-mono-num">
                  <span className="font-semibold text-slate-700">
                    Tổng số dòng đọc được: <strong>{stats.totalRows}</strong>
                  </span>
                  <span className="text-slate-300">·</span>
                  <span className="text-emerald-700 font-semibold">
                    Dòng hợp lệ: <strong>{stats.validCount}</strong> (Thêm mới: {stats.newCount}, Cập nhật: {stats.updateCount})
                  </span>
                  <span className="text-slate-300">·</span>
                  <span className="text-red-600 font-semibold">
                    Dòng bị lỗi (không import): <strong>{stats.errorCount}</strong>
                  </span>
                  <span className="text-slate-300">·</span>
                  <span className="text-blue-700 font-bold">
                    Đã chọn Import: {stats.selectedCount} dòng
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setFilterView('all')}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer ${
                        filterView === 'all'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Tất cả ({stats.totalRows})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterView('valid')}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer ${
                        filterView === 'valid'
                          ? 'bg-white text-emerald-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Hợp lệ ({stats.validCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterView('error')}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer ${
                        filterView === 'error'
                          ? 'bg-white text-red-600 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Dòng lỗi ({stats.errorCount})
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={selectAllValid}
                    className="px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg cursor-pointer"
                  >
                    Chọn tất cả dòng hợp lệ
                  </button>
                  <button
                    type="button"
                    onClick={deselectAllValid}
                    className="px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                  >
                    Bỏ chọn
                  </button>
                </div>
              </div>

              {/* Thông tin ánh xạ cột tổ chức */}
              <div className="flex flex-wrap items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700">
                <span className="font-bold text-slate-900">Ánh xạ cột nhận diện:</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-800 font-medium">
                  Khối: Cột <strong>{detectedCols.khoi || '—'}</strong>
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-800 font-medium">
                  Ký hiệu PB: Cột <strong>{detectedCols.kyHieuPb || '—'}</strong>
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 font-medium">
                  Phòng ban: Cột <strong>{detectedCols.phongBan || '—'}</strong>
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 font-medium">
                  Phòng ban con: Cột <strong>{detectedCols.dept || '—'}</strong>
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 border border-slate-300 text-slate-800 font-mono-num font-medium">
                  MSNV: Cột <strong>{detectedCols.msnv || '—'}</strong>
                </span>
              </div>

              {/* Data Table */}
              <div className="border border-slate-200 rounded-lg overflow-hidden max-h-[380px] overflow-x-auto overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10 border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-2.5 w-10 text-center">Chọn</th>
                      <th className="py-2.5 px-2.5 w-14 text-center font-bold text-slate-900">
                        STT
                      </th>
                      <th className="py-2.5 px-2.5 w-18 text-center">Ảnh 3×4</th>
                      <th className="py-2.5 px-2.5 font-bold text-slate-900">
                        KHỐI
                      </th>
                      <th className="py-2.5 px-2.5 font-bold text-slate-900">
                        KÝ HIỆU PB
                      </th>
                      <th className="py-2.5 px-2.5 font-bold text-slate-900">
                        PHÒNG BAN
                      </th>
                      <th className="py-2.5 px-2.5 font-bold text-slate-900">
                        PHÒNG BAN CON
                      </th>
                      <th className="py-2.5 px-2.5 w-28 font-bold text-slate-900">
                        MSNV
                      </th>
                      <th className="py-2.5 px-2.5 font-bold text-slate-900">
                        HỌ
                      </th>
                      <th className="py-2.5 px-2.5 w-20 font-bold text-slate-900">
                        TÊN
                      </th>
                      <th className="py-2.5 px-2.5 font-bold text-slate-900">
                        CÔNG VIỆC
                      </th>
                      <th className="py-2.5 px-2.5 w-28 font-bold text-slate-900">
                        NGÀY VÀO
                      </th>
                      <th className="py-2.5 px-2.5 w-32">Trạng thái</th>
                      <th className="py-2.5 px-2.5">Ghi chú / Kiểm tra</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {filteredRows.map((row) => {
                      const isError = row.status === 'error';
                      return (
                        <tr
                          key={row.rowNumber}
                          className={
                            isError
                              ? 'bg-red-50/60 hover:bg-red-50'
                              : row.selected
                                ? 'bg-white hover:bg-blue-50/40'
                                : 'bg-slate-50/60 opacity-70'
                          }
                        >
                          <td className="py-2 px-2.5 text-center">
                            {isError ? (
                              <span title="Dòng lỗi không thể import">
                                <X className="w-4 h-4 text-red-500 mx-auto" />
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => toggleRowSelection(row.rowNumber)}
                                className="text-blue-600 hover:text-blue-800 cursor-pointer"
                              >
                                {row.selected ? (
                                  <CheckSquare className="w-4 h-4" />
                                ) : (
                                  <Square className="w-4 h-4 text-slate-400" />
                                )}
                              </button>
                            )}
                          </td>
                          <td
                            className="py-2 px-2.5 font-mono-num text-center text-slate-700 font-semibold"
                            title={`Dòng Excel #${row.rowNumber}`}
                          >
                            {row.stt || row.rowNumber}
                          </td>
                          <td className="py-1.5 px-2.5 text-center">
                            {!isError && (
                              <label
                                className="w-8 h-10 rounded border border-slate-300 bg-white overflow-hidden inline-flex flex-col items-center justify-center cursor-pointer hover:border-blue-600"
                                title="Bấm để chọn ảnh 3×4 cho dòng này"
                              >
                                {row.photoUrl ? (
                                  <img
                                    src={row.photoUrl}
                                    alt={row.fullName}
                                    referrerPolicy="no-referrer"
                                    className="w-full h-full object-cover object-top"
                                  />
                                ) : (
                                  <div className="flex flex-col items-center justify-center text-blue-600">
                                    <Camera className="w-3 h-3" />
                                    <span className="text-[7.5px] font-bold leading-none mt-0.5">
                                      3×4
                                    </span>
                                  </div>
                                )}
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    try {
                                      const compressed =
                                        await compressImageTo3x4DataUrl(file);
                                      setRowPhotos((prev) => ({
                                        ...prev,
                                        [row.rowNumber]: compressed,
                                      }));
                                    } finally {
                                      e.target.value = '';
                                    }
                                  }}
                                  className="hidden"
                                />
                              </label>
                            )}
                          </td>
                          <td className="py-2 px-2.5 text-slate-700">
                            {row.khoi || <span className="text-slate-400 italic">—</span>}
                          </td>
                          <td className="py-2 px-2.5">
                            {row.kyHieuPb ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                {row.kyHieuPb}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">—</span>
                            )}
                          </td>
                          <td className="py-2 px-2.5 text-slate-800 font-semibold">
                            {row.phongBan || <span className="text-slate-400 italic">—</span>}
                          </td>
                          <td className="py-2 px-2.5 text-slate-800 font-medium">
                            {row.phongBanCon || row.department || <span className="text-red-500 italic">(Trống)</span>}
                          </td>
                          <td className="py-2 px-2.5 font-mono-num font-bold text-slate-900">
                            {row.msnv || <span className="text-red-500 italic">(Trống)</span>}
                          </td>
                          <td className="py-2 px-2.5 text-slate-800">
                            {row.lastName || <span className="text-slate-400 italic">—</span>}
                          </td>
                          <td className="py-2 px-2.5 font-bold text-slate-900">
                            {row.firstName || <span className="text-red-500 italic">(Trống)</span>}
                          </td>
                          <td className="py-2 px-2.5 text-slate-600">
                            {row.jobTitle || <span className="text-slate-400 italic">—</span>}
                          </td>
                          <td className="py-2 px-2.5 font-mono-num text-slate-800 font-medium">
                            {row.joinDate || <span className="text-red-500 italic">(Trống)</span>}
                          </td>
                          <td className="py-2 px-2.5 font-semibold">
                            {row.status === 'valid_new' && (
                              <span className="text-emerald-700">Hợp lệ (Thêm mới)</span>
                            )}
                            {row.status === 'valid_update' && (
                              <span className="text-blue-700">Hợp lệ (Cập nhật)</span>
                            )}
                            {row.status === 'error' && (
                              <span className="text-red-600">Dòng lỗi</span>
                            )}
                          </td>
                          <td className="py-2 px-2.5">
                            {isError ? (
                              <span className="text-red-600 font-medium">
                                {row.errors.join(' · ')}
                              </span>
                            ) : row.status === 'valid_update' ? (
                              <span className="text-blue-700">
                                Cập nhật thẻ: <strong>{row.fullName}</strong> ({row.msnv})
                              </span>
                            ) : (
                              <span className="text-emerald-700">
                                In trên thẻ: <strong>{row.fullName.toUpperCase()}</strong>
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500">
            Lưu ý: Hệ thống chỉ import các dòng hợp lệ được tích chọn và tự động loại bỏ các dòng lỗi.
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              Đóng
            </button>
            {importResultBanner ? (
              <button
                type="button"
                onClick={() => {
                  const ids = importResultBanner.importedIds;
                  handleReset();
                  onGoToPrintWithIds(ids);
                }}
                className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-blue-700 rounded-lg hover:bg-blue-800 cursor-pointer transition-colors shadow-xs"
              >
                <Printer className="w-4 h-4" />
                Chuyển Qua In Ngay ({importResultBanner.importedIds.length} thẻ vừa import)
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={stats.selectedCount === 0 || isSubmitting}
                  onClick={() => handleConfirm(false)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Chỉ Import ({stats.selectedCount} dòng)
                </button>
                <button
                  type="button"
                  disabled={stats.selectedCount === 0 || isSubmitting}
                  onClick={() => handleConfirm(true)}
                  className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-xs"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Đang Import vào hệ thống...
                    </>
                  ) : (
                    <>
                      <Printer className="w-4 h-4" />
                      Import &amp; Chuyển Qua In Ngay ({stats.selectedCount} thẻ)
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
