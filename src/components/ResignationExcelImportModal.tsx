import React, { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  X,
  Search,
  Filter,
  Check,
  Download,
  AlertCircle,
  Clock,
  UserCheck,
  UserX,
  Calendar,
} from 'lucide-react';
import { Employee, RESIGNATION_REASONS } from '../types';
import { api } from '../api';

export interface ResignationExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
  onSuccess: (updatedCount: number, skippedCount: number, notFoundMsnvs: string[]) => Promise<void> | void;
  onUpdateEmployee?: (id: string, updates: Partial<Employee>) => Promise<unknown>;
}

export interface ParsedResignationRow {
  rowNumber: number;
  msnv: string;
  fullName: string;
  donVi: string;
  viTri: string;
  ngayNghi: string;
  ngayHenTraLuong: string;
  lyDo: string;
  thangBaoCao: string;

  // Đối chiếu nhân sự
  matchedEmployee?: Employee;
  status: 'matched' | 'skipped';
  statusMessage: string;
  selected: boolean;
}

function cleanUnicodeStr(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

function stripViAccents(val: unknown): string {
  return cleanUnicodeStr(val)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

function readCellText(worksheet: XLSX.WorkSheet, r: number, c: number): string {
  if (c < 0 || r < 0) return '';
  const addr = XLSX.utils.encode_cell({ r, c });
  const cell = worksheet[addr] as XLSX.CellObject | undefined;
  if (!cell || cell.t === 'e' || cell.t === 'z') return '';
  if (cell.w !== undefined && String(cell.w).trim() !== '') {
    return String(cell.w).trim();
  }
  if (cell.v !== undefined && cell.v !== null) {
    return String(cell.v).trim();
  }
  return '';
}

function readCellDate(worksheet: XLSX.WorkSheet, r: number, c: number): string {
  if (c < 0 || r < 0) return '';
  const addr = XLSX.utils.encode_cell({ r, c });
  const cell = worksheet[addr] as XLSX.CellObject | undefined;
  if (!cell || cell.t === 'e' || cell.t === 'z') return '';
  if (cell.t === 'n' && typeof cell.v === 'number') {
    const parsed = XLSX.SSF.parse_date_code(cell.v);
    if (parsed && parsed.y > 1900 && parsed.m >= 1 && parsed.d >= 1) {
      return `${String(parsed.d).padStart(2, '0')}/${String(parsed.m).padStart(2, '0')}/${parsed.y}`;
    }
  }
  if (cell.w && cell.w.trim()) {
    const raw = cell.w.trim();
    const dmy = raw.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
    if (dmy) {
      return `${String(parseInt(dmy[1], 10)).padStart(2, '0')}/${String(parseInt(dmy[2], 10)).padStart(2, '0')}/${dmy[3]}`;
    }
    return raw;
  }
  return cleanUnicodeStr(cell.v);
}

function readCellMonth(worksheet: XLSX.WorkSheet, r: number, c: number): string {
  if (c < 0 || r < 0) return '';
  const addr = XLSX.utils.encode_cell({ r, c });
  const cell = worksheet[addr] as XLSX.CellObject | undefined;
  if (!cell || cell.t === 'e' || cell.t === 'z') return '';
  if (cell.t === 'n' && typeof cell.v === 'number') {
    const parsed = XLSX.SSF.parse_date_code(cell.v);
    if (parsed && parsed.y > 1900 && parsed.m >= 1) {
      return `${String(parsed.m).padStart(2, '0')}/${parsed.y}`;
    }
  }
  const txt = (cell.w || String(cell.v || '')).trim();
  const ymMatch = txt.match(/^(\d{4})[\/\-](\d{1,2})$/);
  if (ymMatch) return `${String(parseInt(ymMatch[2], 10)).padStart(2, '0')}/${ymMatch[1]}`;
  const myMatch = txt.match(/^(\d{1,2})[\/\-](\d{4})$/);
  if (myMatch) return `${String(parseInt(myMatch[1], 10)).padStart(2, '0')}/${myMatch[2]}`;
  const dmyMatch = txt.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) return `${String(parseInt(dmyMatch[2], 10)).padStart(2, '0')}/${dmyMatch[3]}`;
  return txt;
}

export const ResignationExcelImportModal: React.FC<ResignationExcelImportModalProps> = ({
  isOpen,
  onClose,
  employees,
  onSuccess,
  onUpdateEmployee,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedResignationRow[]>([]);
  const [parseError, setParseError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Search & Filter trong modal
  const [filterMode, setFilterMode] = useState<'all' | 'matched' | 'skipped'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset khi mở lại modal
  React.useEffect(() => {
    if (isOpen) {
      setFile(null);
      setFileName('');
      setParsedRows([]);
      setParseError('');
      setFilterMode('all');
      setSearchQuery('');
    }
  }, [isOpen]);

  // Tải file Excel mẫu đúng 100% định dạng "DANH SÁCH GIẢM" đã lưu sẵn
  const handleDownloadSample = async () => {
    try {
      const response = await fetch('/templates/Mau_Danh_Sach_Giam.xlsx');
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'Mau_Danh_Sach_Giam.xlsx';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        return;
      }
    } catch {
      // Fallback
    }

    const link = document.createElement('a');
    link.href = '/templates/Mau_Danh_Sach_Giam.xlsx';
    link.download = 'Mau_Danh_Sach_Giam.xlsx';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Đọc và phân tích file Excel
  const handleProcessFile = async (uploadedFile: File) => {
    setIsParsing(true);
    setParseError('');
    setParsedRows([]);

    try {
      const data = await uploadedFile.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array', cellDates: true });
      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        throw new Error('File Excel không có trang tính nào.');
      }

      // Chọn sheet có tên liên quan hoặc sheet đầu tiên
      const sheetName =
        workbook.SheetNames.find((s) => stripViAccents(s).includes('giam') || stripViAccents(s).includes('danh sach')) ||
        workbook.SheetNames[0];

      const worksheet = workbook.Sheets[sheetName];
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:AE50');

      // Tự động dò dòng tiêu đề chứa MSNV / Manhanvien
      let headerRow = -1;
      let colMsnv = -1;
      let colHo = -1;
      let colTen = -1;
      let colCongViec = -1;
      let colDonVi = -1;
      let colNgayNghi = -1;
      let colNgayHenTraLuong = -1;
      let colChoThoiViec = -1;
      let colBoViec = -1;
      let colDonPhuong = -1;
      let colDuyetTheoDon = -1;
      let colKyLuat = -1;
      let colGenericLyDo = -1;
      let colThangBaoCao = -1;

      const maxScanR = Math.min(range.e.r, 12);
      for (let r = 0; r <= maxScanR; r++) {
        for (let c = 0; c <= range.e.c; c++) {
          const txt = stripViAccents(readCellText(worksheet, r, c));
          if (!txt) continue;

          if (
            txt === 'msnv' ||
            txt === 'manhanvien' ||
            txt.startsWith('manhanvien') ||
            txt === 'ma nv' ||
            txt.includes('ma so nhan vien')
          ) {
            headerRow = r;
            colMsnv = c;
          }
        }
        if (colMsnv !== -1) break;
      }

      if (colMsnv === -1) {
        throw new Error('Không tìm thấy cột "MSNV" hoặc "Manhanvien" trong file Excel. Vui lòng tải file mẫu để kiểm tra.');
      }

      // Quét các dòng tiêu đề quanh headerRow (từ headerRow - 2 đến headerRow + 2) để map các cột còn lại
      const startHeaderScan = Math.max(0, headerRow - 2);
      const endHeaderScan = Math.min(range.e.r, headerRow + 2);

      for (let c = 0; c <= range.e.c; c++) {
        const tokens: string[] = [];
        for (let r = startHeaderScan; r <= endHeaderScan; r++) {
          const t = stripViAccents(readCellText(worksheet, r, c));
          if (t) tokens.push(t);
        }
        const fullHeaderStr = tokens.join(' ');

        if (colHo === -1 && (fullHeaderStr.includes(' ho ') || fullHeaderStr.startsWith('ho ') || fullHeaderStr === 'ho')) {
          colHo = c;
        }
        if (colTen === -1 && (fullHeaderStr.includes(' ten ') || fullHeaderStr.endsWith('ten') || fullHeaderStr === 'ten')) {
          colTen = c;
        }
        if (colDonVi === -1 && (fullHeaderStr.includes('don vi') || fullHeaderStr.includes('donvi'))) {
          colDonVi = c;
        }
        if (
          colCongViec === -1 &&
          (fullHeaderStr.includes('cong viec') || fullHeaderStr.includes('congviec') || fullHeaderStr.includes('vi tri'))
        ) {
          colCongViec = c;
        }
        if (
          colNgayNghi === -1 &&
          (fullHeaderStr.includes('ngay nghi') || fullHeaderStr.includes('ngaynghi'))
        ) {
          colNgayNghi = c;
        }
        if (
          colNgayHenTraLuong === -1 &&
          (fullHeaderStr.includes('hen tra luong') || fullHeaderStr.includes('ngay hentraluong') || fullHeaderStr.includes('tra luong'))
        ) {
          colNgayHenTraLuong = c;
        }
        if (
          colThangBaoCao === -1 &&
          (fullHeaderStr.includes('thang bao cao') || fullHeaderStr.includes('thangbaocao'))
        ) {
          colThangBaoCao = c;
        }

        // 5 Cột lý do chi tiết theo mẫu
        if (fullHeaderStr.includes('cho thoi viec') || fullHeaderStr.includes('chonghiviec')) {
          colChoThoiViec = c;
        }
        if (fullHeaderStr.includes('bo viec') || fullHeaderStr.includes('tunghiviec') || fullHeaderStr.includes('tu nghi')) {
          colBoViec = c;
        }
        if (fullHeaderStr.includes('don phuong') || fullHeaderStr.includes('cdhdld')) {
          colDonPhuong = c;
        }
        if (fullHeaderStr.includes('duyet theo don') || fullHeaderStr.includes('duyettheodon')) {
          colDuyetTheoDon = c;
        }
        if (fullHeaderStr.includes('ky luat') || fullHeaderStr.includes('kyluatld')) {
          colKyLuat = c;
        }
        if (fullHeaderStr === 'ly do' || fullHeaderStr === 'lydo' || fullHeaderStr.startsWith('ly do nv')) {
          colGenericLyDo = c;
        }
      }

      // Xác định dòng bắt đầu dữ liệu (sau các dòng header)
      let dataStartRow = endHeaderScan + 1;
      for (let r = endHeaderScan + 1; r <= range.e.r; r++) {
        const checkVal = readCellText(worksheet, r, colMsnv);
        if (checkVal && checkVal.length >= 2) {
          dataStartRow = r;
          break;
        }
      }

      const results: ParsedResignationRow[] = [];
      const currentMonth = `${String(new Date().getMonth() + 1).padStart(2, '0')}/${new Date().getFullYear()}`;

      for (let r = dataStartRow; r <= range.e.r; r++) {
        const rawMsnv = readCellText(worksheet, r, colMsnv).trim();
        if (!rawMsnv) continue; // Bỏ qua dòng trống MSNV

        const hoVal = colHo !== -1 ? readCellText(worksheet, r, colHo).trim() : '';
        const tenVal = colTen !== -1 ? readCellText(worksheet, r, colTen).trim() : '';
        const fullNameInFile = hoVal && tenVal ? `${hoVal} ${tenVal}` : tenVal || hoVal;
        const donViInFile = colDonVi !== -1 ? readCellText(worksheet, r, colDonVi).trim() : '';
        const viTriInFile = colCongViec !== -1 ? readCellText(worksheet, r, colCongViec).trim() : '';
        const ngayNghiInFile = colNgayNghi !== -1 ? readCellDate(worksheet, r, colNgayNghi) : '';
        const ngayHenTraLuongInFile = colNgayHenTraLuong !== -1 ? readCellDate(worksheet, r, colNgayHenTraLuong) : '';
        let thangBaoCaoInFile = colThangBaoCao !== -1 ? readCellMonth(worksheet, r, colThangBaoCao) : '';

        // Phân tích lý do thôi việc từ 5 cột hoặc cột generic
        let lyDoFound = '';
        const checkChoThoiViec = colChoThoiViec !== -1 ? readCellText(worksheet, r, colChoThoiViec).trim() : '';
        const checkBoViec = colBoViec !== -1 ? readCellText(worksheet, r, colBoViec).trim() : '';
        const checkDonPhuong = colDonPhuong !== -1 ? readCellText(worksheet, r, colDonPhuong).trim() : '';
        const checkDuyetTheoDon = colDuyetTheoDon !== -1 ? readCellText(worksheet, r, colDuyetTheoDon).trim() : '';
        const checkKyLuat = colKyLuat !== -1 ? readCellText(worksheet, r, colKyLuat).trim() : '';

        if (checkChoThoiViec) lyDoFound = 'Cho thôi việc';
        else if (checkBoViec) lyDoFound = 'Bỏ việc';
        else if (checkDonPhuong) lyDoFound = 'Đơn phương CDHĐLĐ';
        else if (checkDuyetTheoDon) lyDoFound = 'Duyệt theo đơn';
        else if (checkKyLuat) lyDoFound = 'Kỷ luật';
        else if (colGenericLyDo !== -1) {
          const rawLyDo = stripViAccents(readCellText(worksheet, r, colGenericLyDo));
          if (rawLyDo.includes('cho thoi viec')) lyDoFound = 'Cho thôi việc';
          else if (rawLyDo.includes('bo viec') || rawLyDo.includes('tu nghi')) lyDoFound = 'Bỏ việc';
          else if (rawLyDo.includes('don phuong')) lyDoFound = 'Đơn phương CDHĐLĐ';
          else if (rawLyDo.includes('duyet theo don') || rawLyDo.includes('theo don')) lyDoFound = 'Duyệt theo đơn';
          else if (rawLyDo.includes('ky luat')) lyDoFound = 'Kỷ luật';
          else if (rawLyDo.includes('rut ho so') || rawLyDo.includes('rut hs')) lyDoFound = 'Rút hồ sơ';
        }

        if (!lyDoFound) {
          lyDoFound = 'Duyệt theo đơn'; // Mặc định
        }

        // Nếu tháng báo cáo trống, trích xuất từ ngày nghỉ hoặc tháng hiện tại
        if (!thangBaoCaoInFile) {
          if (ngayNghiInFile && ngayNghiInFile.includes('/')) {
            const parts = ngayNghiInFile.split('/');
            if (parts.length === 3) {
              thangBaoCaoInFile = `${parts[1]}/${parts[2]}`;
            }
          }
          if (!thangBaoCaoInFile) {
            thangBaoCaoInFile = currentMonth;
          }
        }

        // ========================================================
        // ĐỐI CHIẾU VỚI DANH SÁCH NHÂN VIÊN TRONG HỆ THỐNG
        // ========================================================
        const msnvLower = rawMsnv.toLowerCase();
        const msnvNoZero = msnvLower.replace(/^0+/, '');

        const matchedEmp = employees.find((e) => {
          if (!e.msnv) return false;
          const eLower = e.msnv.trim().toLowerCase();
          const eNoZero = eLower.replace(/^0+/, '');
          return eLower === msnvLower || (msnvNoZero && eNoZero === msnvNoZero);
        });

        if (matchedEmp) {
          results.push({
            rowNumber: r + 1,
            msnv: rawMsnv,
            fullName: matchedEmp.fullName || fullNameInFile,
            donVi: matchedEmp.donVi || donViInFile || 'CÔNG TY CỔ PHẦN ĐẦU TƯ MẶT TRỜI VIỆT - CN ĐỒNG NAI',
            viTri: matchedEmp.congViec || matchedEmp.jobTitle || matchedEmp.department || viTriInFile || 'Công nhân may',
            ngayNghi: ngayNghiInFile || matchedEmp.denNgay || '',
            ngayHenTraLuong: ngayHenTraLuongInFile,
            lyDo: lyDoFound,
            thangBaoCao: thangBaoCaoInFile,
            matchedEmployee: matchedEmp,
            status: 'matched',
            statusMessage: 'Hợp lệ: Sẽ chấm dứt HĐ & đưa qua đơn xin nghỉ việc',
            selected: true,
          });
        } else {
          // MSNV KHÔNG TỒN TẠI TRONG DANH SÁCH HỆ THỐNG -> BỎ QUA KHÔNG THÊM MỚI HAY CẬP NHẬT
          results.push({
            rowNumber: r + 1,
            msnv: rawMsnv,
            fullName: fullNameInFile || '—',
            donVi: donViInFile || '—',
            viTri: viTriInFile || '—',
            ngayNghi: ngayNghiInFile || '—',
            ngayHenTraLuong: ngayHenTraLuongInFile || '—',
            lyDo: lyDoFound,
            thangBaoCao: thangBaoCaoInFile,
            matchedEmployee: undefined,
            status: 'skipped',
            statusMessage: 'Bỏ qua: Không tìm thấy MSNV trong hệ thống (Không thêm mới)',
            selected: false,
          });
        }
      }

      if (results.length === 0) {
        throw new Error('Không đọc được dòng nhân viên nào từ file. Vui lòng kiểm tra lại cấu trúc file.');
      }

      setParsedRows(results);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi đọc file Excel';
      setParseError(msg);
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      setFile(files[0]);
      setFileName(files[0].name);
      handleProcessFile(files[0]);
    }
  };

  // Thống kê số lượng
  const stats = useMemo(() => {
    const total = parsedRows.length;
    const matched = parsedRows.filter((r) => r.status === 'matched').length;
    const skipped = parsedRows.filter((r) => r.status === 'skipped').length;
    const selectedCount = parsedRows.filter((r) => r.selected).length;
    return { total, matched, skipped, selectedCount };
  }, [parsedRows]);

  // Bộ lọc danh sách hiển thị
  const filteredRows = useMemo(() => {
    let list = parsedRows;
    if (filterMode === 'matched') {
      list = list.filter((r) => r.status === 'matched');
    } else if (filterMode === 'skipped') {
      list = list.filter((r) => r.status === 'skipped');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (r) =>
          r.msnv.toLowerCase().includes(q) ||
          r.fullName.toLowerCase().includes(q) ||
          r.donVi.toLowerCase().includes(q) ||
          r.lyDo.toLowerCase().includes(q)
      );
    }
    return list;
  }, [parsedRows, filterMode, searchQuery]);

  // Check / Uncheck từng dòng
  const handleToggleRow = (rowNumber: number) => {
    setParsedRows((prev) =>
      prev.map((r) => {
        if (r.rowNumber === rowNumber && r.status === 'matched') {
          return { ...r, selected: !r.selected };
        }
        return r;
      })
    );
  };

  // Chọn tất cả dòng hợp lệ
  const handleToggleSelectAllMatched = (checked: boolean) => {
    setParsedRows((prev) =>
      prev.map((r) => (r.status === 'matched' ? { ...r, selected: checked } : r))
    );
  };

  // Xử lý thực hiện Import
  const handleExecuteImport = async () => {
    const rowsToProcess = parsedRows.filter((r) => r.selected && r.status === 'matched');
    if (rowsToProcess.length === 0) {
      alert('Không có nhân viên hợp lệ nào được chọn để import.');
      return;
    }

    try {
      setIsSubmitting(true);

      const items = rowsToProcess.map((r) => ({
        msnv: r.msnv,
        fullName: r.fullName,
        donVi: r.donVi,
        viTri: r.viTri,
        ngayNghi: r.ngayNghi,
        ngayHenTraLuong: r.ngayHenTraLuong,
        lyDo: r.lyDo,
        thangBaoCao: r.thangBaoCao,
      }));

      // Gọi API batch xử lý đồng thời chấm dứt hợp đồng và tạo đơn nghỉ việc
      const res = await api.batchTerminateAndResign(items);

      // Cập nhật lại state của nhân viên trên giao diện nếu có onUpdateEmployee
      if (onUpdateEmployee) {
        for (const row of rowsToProcess) {
          if (row.matchedEmployee) {
            await onUpdateEmployee(row.matchedEmployee.id, {
              tinhTrang: 'Nghỉ việc',
              trangThaiHopDong: 'Hết hiệu lực',
              denNgay: row.ngayNghi || row.matchedEmployee.denNgay,
              extraData: {
                ...(row.matchedEmployee.extraData || {}),
                ngayNghi: row.ngayNghi || row.matchedEmployee.denNgay,
                ngayHenTraLuong: row.ngayHenTraLuong,
                lyDoNghi: row.lyDo,
                nhomLyDo: row.lyDo,
                thangBaoCao: row.thangBaoCao,
                tinhTrangHopDong: 'Hết hiệu lực',
              },
            });
          }
        }
      }

      await onSuccess(res.updatedCount, stats.skipped, res.notFoundMsnvs || []);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Có lỗi xảy ra khi thực hiện import';
      alert(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 md:p-6 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        {/* Header Modal */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center border border-emerald-200 font-bold shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Nhập Danh Sách Giảm Lao Động Từ Excel
              </h2>
              <p className="text-xs text-slate-500">
                Kiểm tra MSNV, chấm dứt hợp đồng nhân viên và đưa qua đơn nghỉ việc với trạng thái Đang thực hiện
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/templates/Mau_Danh_Sach_Giam.xlsx"
              download="Mau_Danh_Sach_Giam.xlsx"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl cursor-pointer transition-colors"
              title="Tải file mẫu Excel chuẩn theo cấu trúc DANH SÁCH GIẢM"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Tải file mẫu Excel</span>
            </a>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200 cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body Modal */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {/* Vùng chọn / kéo thả File */}
          <div className="bg-slate-50 border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-2xl p-6 transition-all text-center">
            <input
              type="file"
              ref={fileInputRef}
              accept=".xlsx,.xls"
              onChange={handleFileInputChange}
              className="hidden"
            />
            <div className="flex flex-col items-center justify-center gap-2">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 shadow-2xs">
                <Upload className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800">
                  {fileName ? `File đã chọn: ${fileName}` : 'Chọn hoặc kéo thả file Excel vào đây'}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Định dạng hỗ trợ: .xlsx, .xls theo mẫu "DANH SÁCH GIẢM"
                </p>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isParsing}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-blue-700 bg-white hover:bg-blue-50 border border-slate-200 rounded-xl cursor-pointer shadow-2xs transition-colors"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>{fileName ? 'Chọn file khác' : 'Chọn file từ máy tính'}</span>
              </button>
            </div>
          </div>

          {/* Lỗi Parse nếu có */}
          {parseError && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-3 text-rose-700 text-xs">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <div className="font-medium">{parseError}</div>
            </div>
          )}

          {/* Bảng Preview kết quả đối chiếu */}
          {parsedRows.length > 0 && (
            <div className="space-y-4">
              {/* Thẻ Thống Kê Nhanh */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] text-slate-500 font-medium">Tổng dòng trong file</span>
                    <p className="text-base font-bold text-slate-900 mt-0.5">{stats.total} nhân sự</p>
                  </div>
                  <FileSpreadsheet className="w-6 h-6 text-slate-400" />
                </div>
                <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] text-emerald-700 font-medium">Hợp lệ (Sẽ chấm dứt HĐ & tạo đơn)</span>
                    <p className="text-base font-bold text-emerald-800 mt-0.5">{stats.matched} nhân sự</p>
                  </div>
                  <UserCheck className="w-6 h-6 text-emerald-500" />
                </div>
                <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] text-amber-700 font-medium">Bỏ qua (Không có trong hệ thống)</span>
                    <p className="text-base font-bold text-amber-800 mt-0.5">{stats.skipped} MSNV</p>
                  </div>
                  <UserX className="w-6 h-6 text-amber-500" />
                </div>
              </div>

              {/* Thanh công cụ tìm kiếm và lọc */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setFilterMode('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                      filterMode === 'all'
                        ? 'bg-slate-800 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Tất cả ({stats.total})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterMode('matched')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                      filterMode === 'matched'
                        ? 'bg-emerald-700 text-white'
                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    }`}
                  >
                    Hợp lệ ({stats.matched})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterMode('skipped')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                      filterMode === 'skipped'
                        ? 'bg-amber-700 text-white'
                        : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                    }`}
                  >
                    Bỏ qua ({stats.skipped})
                  </button>
                </div>

                <div className="relative w-full sm:w-64">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm theo MSNV, tên, lý do..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-900"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Bảng chi tiết */}
              <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-80 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 sticky top-0 z-10">
                    <tr>
                      <th className="py-2.5 px-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={stats.matched > 0 && stats.selectedCount === stats.matched}
                          onChange={(e) => handleToggleSelectAllMatched(e.target.checked)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          title="Chọn / Bỏ chọn tất cả nhân viên hợp lệ"
                        />
                      </th>
                      <th className="py-2.5 px-3 w-12 text-center">Dòng</th>
                      <th className="py-2.5 px-3 w-24">MSNV</th>
                      <th className="py-2.5 px-3">Họ và tên</th>
                      <th className="py-2.5 px-3">Ngày nghỉ việc</th>
                      <th className="py-2.5 px-3">Hẹn trả lương</th>
                      <th className="py-2.5 px-3">Lý do</th>
                      <th className="py-2.5 px-3">Tháng BC</th>
                      <th className="py-2.5 px-3 text-center">Đối chiếu hệ thống</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filteredRows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-400 italic">
                          Không có dữ liệu phù hợp với bộ lọc
                        </td>
                      </tr>
                    ) : (
                      filteredRows.map((row) => (
                        <tr
                          key={row.rowNumber}
                          className={`hover:bg-slate-50/80 transition-colors ${
                            row.status === 'skipped' ? 'bg-amber-50/30' : ''
                          }`}
                        >
                          <td className="py-2.5 px-3 text-center">
                            {row.status === 'matched' ? (
                              <input
                                type="checkbox"
                                checked={row.selected}
                                onChange={() => handleToggleRow(row.rowNumber)}
                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono text-slate-400 text-[11px]">
                            {row.rowNumber}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-blue-700">
                            {row.msnv}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-semibold text-slate-900 block">{row.fullName}</span>
                            <span className="text-[10px] text-slate-400 block truncate max-w-[160px]" title={row.viTri}>
                              {row.viTri}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-800">
                            {row.ngayNghi || '—'}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-emerald-700 font-semibold">
                            {row.ngayHenTraLuong || '—'}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-800 border border-slate-200">
                              {row.lyDo}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-blue-700 text-[11px] font-bold">
                            {row.thangBaoCao || '—'}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {row.status === 'matched' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                <Check className="w-3 h-3 text-emerald-600" />
                                <span>Hợp lệ</span>
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200"
                                title="Không tìm thấy nhân viên này trong danh sách hệ thống. Sẽ bỏ qua, không thêm mới."
                              >
                                <span>Bỏ qua (Không có trong hệ thống)</span>
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500">
            {stats.matched > 0 && (
              <span>
                Đã chọn: <strong className="text-blue-700">{stats.selectedCount}</strong> / {stats.matched} nhân sự hợp lệ
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-5 py-2.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl cursor-pointer transition-colors"
            >
              Hủy bỏ
            </button>
            <button
              type="button"
              onClick={handleExecuteImport}
              disabled={isSubmitting || stats.selectedCount === 0}
              className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-xl shadow-sm cursor-pointer transition-colors disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>
                {isSubmitting
                  ? 'Đang xử lý...'
                  : `Chấm dứt HĐ & Đưa qua đơn nghỉ việc (${stats.selectedCount})`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
