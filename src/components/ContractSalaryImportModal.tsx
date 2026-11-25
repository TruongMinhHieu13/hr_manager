import React, { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  X,
  RefreshCw,
  Search,
  DollarSign,
  ShieldCheck,
  ArrowRight,
  Filter,
  Check,
  Download,
} from 'lucide-react';
import { Employee } from '../types';
import { api } from '../api';
import { NotificationModal, NotificationStat } from './NotificationModal';
import {
  downloadSalaryTemplateExcel,
  downloadSalaryTemplateCsv,
} from '../utils/salaryTemplate';

export interface ContractSalaryImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
  contractEmployees?: Employee[];
  contractType?: 'probation' | 'training';
  onUpdateEmployee?: (id: string, updates: Partial<Employee>) => Promise<unknown>;
  onBatchUpdateEmployees?: (updatedList: Employee[]) => void;
  onRefreshData?: () => Promise<void>;
}

export interface ParsedSalaryRow {
  rowNumber: number;
  msnvInFile: string;
  hoInFile?: string;
  tenInFile?: string;
  fullNameInFile?: string;
  deptInFile?: string;
  jobInFile?: string;

  // Lương / Bậc / Ngạch / Chức vụ từ File
  newSalary: string;
  newBac: string;
  newNgach: string;
  newChucVu?: string;

  // Đối chiếu với hệ thống
  matchedEmployee?: Employee;
  status: 'valid_update' | 'not_found_skip' | 'empty_data';
  statusMessage: string;
  selected: boolean;

  // Trạng thái thay đổi
  hasSalaryChange: boolean;
  hasBacChange: boolean;
  hasNgachChange: boolean;
  hasChucVuChange: boolean;
}

export interface DetectedColumnOption {
  index: number;
  letter: string;
  name: string;
  previewSample: string;
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

function cleanBacString(val: string): string {
  if (!val) return '';
  const trimmed = val.trim();
  // Nếu Excel tự động chuyển 1/5 thành định dạng ngày như 1/5/01 hay 1/5/2026
  const matchFractionDate = trimmed.match(/^(\d{1,2}\/\d{1,2})\/\d{2,4}$/);
  if (matchFractionDate) {
    return matchFractionDate[1];
  }
  return trimmed;
}

export function formatSalaryVnd(val?: string | number): string {
  if (val === null || val === undefined) return '';
  const str = String(val).trim();
  if (!str) return '';
  if (str.includes('%') || !/\d/.test(str)) {
    return str;
  }
  const cleanDigits = str.replace(/[^0-9]/g, '');
  if (!cleanDigits) return str;
  const num = Number(cleanDigits);
  if (isNaN(num)) return str;
  return num.toLocaleString('vi-VN') + ' đ';
}

function cleanSalaryString(val: string): string {
  if (!val) return '';
  const trimmed = val.trim();
  // Nếu là dạng tỷ lệ phần trăm (85% lương) hoặc text thỏa thuận
  if (trimmed.includes('%') || !/\d/.test(trimmed)) {
    return trimmed;
  }
  // Nếu có số, format chuẩn thành VNĐ (VD: 5.900.000 đ)
  return formatSalaryVnd(trimmed);
}

function formatVnd(val?: string): string {
  if (!val || !val.trim()) return '(Trống)';
  return formatSalaryVnd(val);
}

function normalizeMsnv(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).trim().toUpperCase();
}

function msnvMatches(a: unknown, b: unknown): boolean {
  const na = normalizeMsnv(a);
  const nb = normalizeMsnv(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const naNoZero = na.replace(/^0+/, '');
  const nbNoZero = nb.replace(/^0+/, '');
  if (naNoZero && nbNoZero && naNoZero === nbNoZero) return true;
  return false;
}

export const ContractSalaryImportModal: React.FC<ContractSalaryImportModalProps> = ({
  isOpen,
  onClose,
  employees,
  contractEmployees,
  contractType = 'training',
  onUpdateEmployee,
  onBatchUpdateEmployees,
  onRefreshData,
}) => {
  const isTraining = contractType === 'training';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState('');
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const workbookRef = useRef<XLSX.WorkBook | null>(null);

  // Danh sách các cột phát hiện từ file
  const [availableColumns, setAvailableColumns] = useState<DetectedColumnOption[]>([]);
  const [selectedSalaryCol, setSelectedSalaryCol] = useState<number>(-1);
  const [selectedBacCol, setSelectedBacCol] = useState<number>(-1);
  const [selectedNgachCol, setSelectedNgachCol] = useState<number>(-1);
  const [selectedChucVuCol, setSelectedChucVuCol] = useState<number>(-1);
  const [selectedMsnvCol, setSelectedMsnvCol] = useState<number>(-1);
  const [dataStartRowState, setDataStartRowState] = useState<number>(1);
  const [sheetRangeState, setSheetRangeState] = useState<XLSX.Range | null>(null);

  const [parsedRows, setParsedRows] = useState<ParsedSalaryRow[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'valid' | 'skipped'>('all');
  const [searchFilter, setSearchFilter] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Dialog thông báo chuyên nghiệp thay cho alert()
  const [notification, setNotification] = useState<{
    isOpen: boolean;
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message?: string;
    stats?: NotificationStat[];
    details?: string[];
    note?: string;
    confirmText?: string;
    onConfirm?: () => void;
  }>({
    isOpen: false,
    type: 'info',
    title: '',
  });

  // Reset state when closed
  const handleClose = () => {
    setFileName('');
    setSheetNames([]);
    setSelectedSheet('');
    workbookRef.current = null;
    setAvailableColumns([]);
    setSelectedSalaryCol(-1);
    setSelectedBacCol(-1);
    setSelectedNgachCol(-1);
    setSelectedChucVuCol(-1);
    setSelectedMsnvCol(-1);
    setParsedRows([]);
    setActiveTab('all');
    setSearchFilter('');
    setErrorMsg('');
    onClose();
  };

  // Trích xuất các dòng dữ liệu với các cột được chỉ định
  const extractRowsWithColumns = (
    ws: XLSX.WorkSheet,
    colMsnv: number,
    colLuong: number,
    colBac: number,
    colNgach: number,
    colChucVu: number,
    colHo: number,
    colTen: number,
    colFullName: number,
    colDept: number,
    colJob: number,
    startRow: number,
    range: XLSX.Range
  ) => {
    // 1. Xác định danh sách nhân viên thuộc hợp đồng hiện tại (HĐTV hoặc HĐĐT)
    const targetList = contractEmployees !== undefined
      ? contractEmployees
      : employees.filter((emp) => {
          const loai = (emp.loaiHd || '').trim().toUpperCase();
          if (contractType === 'training') {
            return loai === 'HĐĐT' || loai === 'HDDT' || loai.includes('ĐÀO TẠO') || loai.includes('DAO TAO');
          }
          return loai === 'HĐTV' || loai === 'HDTV' || loai.includes('THỬ VIỆC') || loai.includes('THU VIEC');
        });

    // Map tra cứu nhanh trong danh sách hợp đồng này
    const contractEmpMap = new Map<string, Employee>();
    targetList.forEach((emp) => {
      if (emp.msnv) {
        const norm = normalizeMsnv(emp.msnv);
        contractEmpMap.set(norm, emp);
        const normNoZero = norm.replace(/^0+/, '');
        if (normNoZero && !contractEmpMap.has(normNoZero)) {
          contractEmpMap.set(normNoZero, emp);
        }
      }
    });

    // Map tra cứu toàn bộ nhân viên (để phát hiện trùng MSNV nhưng không thuộc danh sách hợp đồng này)
    const allEmpMap = new Map<string, Employee>();
    employees.forEach((emp) => {
      if (emp.msnv) {
        const norm = normalizeMsnv(emp.msnv);
        allEmpMap.set(norm, emp);
        const normNoZero = norm.replace(/^0+/, '');
        if (normNoZero && !allEmpMap.has(normNoZero)) {
          allEmpMap.set(normNoZero, emp);
        }
      }
    });

    const parsed: ParsedSalaryRow[] = [];

    for (let r = startRow; r <= range.e.r; r++) {
      const rawMsnv = readCellText(ws, r, colMsnv);
      if (!rawMsnv || stripViAccents(rawMsnv) === 'nan') {
        continue;
      }

      // Đọc Bậc, Ngạch, Lương, Chức vụ
      const rawBac = colBac >= 0 ? cleanBacString(readCellText(ws, r, colBac)) : '';
      const rawNgach = colNgach >= 0 ? readCellText(ws, r, colNgach) : '';
      const rawSalary = colLuong >= 0 ? readCellText(ws, r, colLuong) : '';
      const cleanedSalary = cleanSalaryString(rawSalary);
      const rawChucVu = colChucVu >= 0 ? readCellText(ws, r, colChucVu) : '';

      // Đọc thông tin phụ hiển thị preview
      const hoVal = colHo >= 0 ? readCellText(ws, r, colHo) : '';
      const tenVal = colTen >= 0 ? readCellText(ws, r, colTen) : '';
      const fullVal = colFullName >= 0 ? readCellText(ws, r, colFullName) : '';
      const deptVal = colDept >= 0 ? readCellText(ws, r, colDept) : '';
      const jobVal = colJob >= 0 ? readCellText(ws, r, colJob) : '';

      // Đối chiếu nhân viên theo MSNV
      const normInput = normalizeMsnv(rawMsnv);
      const normInputNoZero = normInput.replace(/^0+/, '');

      // Tra cứu ưu tiên trong danh sách hợp đồng này
      let matchedContract = contractEmpMap.get(normInput) || contractEmpMap.get(normInputNoZero);
      if (!matchedContract) {
        matchedContract = targetList.find((e) => msnvMatches(e.msnv, rawMsnv));
      }

      // Tra cứu trong toàn bộ hệ thống
      let matchedAll = matchedContract || allEmpMap.get(normInput) || allEmpMap.get(normInputNoZero);
      if (!matchedAll) {
        matchedAll = employees.find((e) => msnvMatches(e.msnv, rawMsnv));
      }

      const hasSalaryInfo = Boolean(cleanedSalary || rawBac || rawNgach || rawChucVu);

      let status: 'valid_update' | 'not_found_skip' | 'empty_data' = 'not_found_skip';
      let statusMessage = '';
      let isSelected = false;
      let matchedEmployee: Employee | undefined = undefined;

      let hasSalaryChange = false;
      let hasBacChange = false;
      let hasNgachChange = false;
      let hasChucVuChange = false;

      const contractLabel = isTraining ? 'HĐ đào tạo (HĐĐT)' : 'HĐ thử việc (HĐTV)';

      if (matchedContract) {
        // Thuộc danh sách hợp đồng hiện tại
        matchedEmployee = matchedContract;
        if (!hasSalaryInfo) {
          status = 'empty_data';
          statusMessage = 'File không có dữ liệu lương/bậc/ngạch/chức vụ (Bỏ qua)';
          isSelected = false;
        } else {
          status = 'valid_update';
          statusMessage = `Khớp nhân viên trong danh sách (${matchedContract.loaiHd || contractLabel}) - Sẵn sàng cập nhật`;
          isSelected = true;

          const currentSalary = formatSalaryVnd(matchedContract.luongThuViec || '');
          const currentBac = (matchedContract.bacLuong || '').trim();
          const currentNgach = (matchedContract.ngachLuong || '').trim();
          const currentChucVu = (matchedContract.chucVu || '').trim();

          if (cleanedSalary && cleanedSalary !== currentSalary) hasSalaryChange = true;
          if (rawBac && rawBac !== currentBac) hasBacChange = true;
          if (rawNgach && rawNgach !== currentNgach) hasNgachChange = true;
          if (rawChucVu && rawChucVu !== currentChucVu) hasChucVuChange = true;
        }
      } else if (matchedAll) {
        // Trùng MSNV nhưng KHÔNG thuộc danh sách hợp đồng này (ví dụ: HĐXĐTH, HĐKXĐ, etc.) -> BỎ QUA
        matchedEmployee = matchedAll;
        status = 'not_found_skip';
        isSelected = false;
        const empLoai = matchedAll.loaiHd ? `Hiện là: ${matchedAll.loaiHd}` : 'Không thuộc hợp đồng này';
        statusMessage = `Trùng MSNV nhưng không thuộc ${contractLabel} (${empLoai}) - BỎ QUA`;
      } else {
        // Hoàn toàn không tìm thấy MSNV trong hệ thống
        status = 'not_found_skip';
        statusMessage = 'Không tìm thấy trong hệ thống (Sẽ bỏ qua - Không thêm mới)';
        isSelected = false;
      }

      parsed.push({
        rowNumber: r + 1,
        msnvInFile: rawMsnv,
        hoInFile: hoVal,
        tenInFile: tenVal,
        fullNameInFile: fullVal || (hoVal && tenVal ? `${hoVal} ${tenVal}` : hoVal || tenVal),
        deptInFile: deptVal,
        jobInFile: jobVal,
        newSalary: cleanedSalary,
        newBac: rawBac,
        newNgach: rawNgach,
        newChucVu: rawChucVu,
        matchedEmployee: matchedEmployee,
        status,
        statusMessage,
        selected: isSelected,
        hasSalaryChange,
        hasBacChange,
        hasNgachChange,
        hasChucVuChange,
      });
    }

    setParsedRows(parsed);
  };

  // Tự động phân tích sheet từ workbook
  const parseSheet = (wb: XLSX.WorkBook, sheetName: string) => {
    const ws = wb.Sheets[sheetName];
    if (!ws || !ws['!ref']) {
      setErrorMsg(`Sheet "${sheetName}" không có dữ liệu`);
      setParsedRows([]);
      setAvailableColumns([]);
      return;
    }

    const range = XLSX.utils.decode_range(ws['!ref']);
    setSheetRangeState(range);
    const maxScanR = Math.min(range.e.r, 15);
    const maxScanC = Math.min(range.e.c, 60);

    // Thu thập token tiêu đề qua các hàng đầu tiên (hỗ trợ subheaders / merged headers)
    const colTokens: string[][] = [];
    for (let c = 0; c <= maxScanC; c++) {
      const tokens: string[] = [];
      for (let r = 0; r <= maxScanR; r++) {
        const text = stripViAccents(readCellText(ws, r, c));
        if (text) tokens.push(text);
      }
      colTokens[c] = tokens;
    }

    const findCol = (pred: (token: string) => boolean): number => {
      for (let c = 0; c <= maxScanC; c++) {
        if ((colTokens[c] || []).some(pred)) return c;
      }
      return -1;
    };

    // 1. TÌM CỘT MSNV
    const colMsnv = findCol(
      (s) =>
        s === 'msnv' ||
        s.startsWith('manhanvien') ||
        s.startsWith('manh') ||
        s.includes('ma so') ||
        s === 'ma nv' ||
        s === 'sothe' ||
        s.includes('so the')
    );

    // 2. TÌM CỘT BẬC: "bac", "bac luong", "bac/ngach"
    const colBac = findCol(
      (s) => s === 'bac' || s.startsWith('bac luong') || s === 'bac/ngach'
    );

    // 3. TÌM CỘT NGẠCH: "ngach", "ngach luong"
    const colNgach = findCol(
      (s) => s === 'ngach' || s.startsWith('ngach luong')
    );

    // 4. TÌM CỘT LƯƠNG:
    // **QUAN TRỌNG:** Ưu tiên số 1 phải là cột "LƯƠNG THỬ VIỆC" / "LƯƠNG THỬ VỆC" / "LƯƠNG TV"
    let colLuong = findCol(
      (s) =>
        (s.includes('thu viec') || s.includes('thu vec') || s.includes('tv')) &&
        (s.includes('luong') || s.includes('muc') || s.startsWith('luong')) &&
        !s.includes('hinh thuc') &&
        !s.includes('so ngay') &&
        !s.includes('thoi gian')
    );

    // Ưu tiên số 2: Nếu không có, tìm "Lương đào tạo" hoặc "Phụ cấp đào tạo"
    if (colLuong === -1) {
      colLuong = findCol(
        (s) =>
          s.includes('dao tao') &&
          (s.includes('luong') || s.includes('phu cap')) &&
          !s.includes('hinh thuc') &&
          !s.includes('so ngay') &&
          !s.includes('thoi gian')
      );
    }

    // Ưu tiên số 3: Cột có chữ 'luong' nhưng KHÔNG PHẢI lương chính thức, KHÔNG PHẢI lương cơ bản, BHXH...
    if (colLuong === -1) {
      colLuong = findCol(
        (s) =>
          (s.includes('luong') || s.includes('phu cap')) &&
          !s.includes('chinh thuc') &&
          !s.includes('co ban') &&
          !s.includes('bao hiem') &&
          !s.includes('bhxh') &&
          !s.includes('tong') &&
          !s.includes('kinh doanh') &&
          !s.includes('hinh thuc') &&
          !s.includes('so ngay') &&
          !s.includes('thoi gian') &&
          !s.includes('bac') &&
          !s.includes('ngach')
      );
    }

    // Ưu tiên số 4: Fallback
    if (colLuong === -1) {
      colLuong = findCol(
        (s) =>
          (s.includes('luong') || s.includes('phu cap')) &&
          !s.includes('hinh thuc') &&
          !s.includes('so ngay') &&
          !s.includes('thoi gian') &&
          !s.includes('bac') &&
          !s.includes('ngach')
      );
    }

    // 5. TÌM CỘT CHỨC VỤ: ưu tiên tìm "chuc vu", fallback sang cột 37 (AL)
    let colChucVu = findCol((s) => s === 'chuc vu' || s.startsWith('chuc vu'));
    if (colChucVu === -1 && maxScanC >= 37) {
      if ((colTokens[37] || []).some((s) => s.includes('chuc'))) {
        colChucVu = 37;
      }
    }

    // Các cột phụ để hiển thị preview cho người dùng dễ đối chiếu
    const colHo = findCol((s) => s === 'ho' || s === 'ho dem');
    const colTen = findCol((s) => s === 'ten');
    const colFullName = findCol((s) => s.includes('ho va ten') || s === 'ho ten');
    const colDept = findCol(
      (s) => s.includes('bo phan') || s.includes('phong ban') || s.includes('bophan')
    );
    const colJob = findCol((s) => s.includes('cong viec') || s.includes('chuc vu'));

    if (colMsnv === -1) {
      setErrorMsg(
        'Không tìm thấy cột Mã số nhân viên (MSNV) trong file Excel. Vui lòng kiểm tra lại file mẫu.'
      );
      setParsedRows([]);
      setAvailableColumns([]);
      return;
    }

    if (colLuong === -1 && colBac === -1 && colNgach === -1 && colChucVu === -1) {
      setErrorMsg(
        'Không tìm thấy cột Lương thử việc, Bậc, Ngạch hoặc Chức vụ trong file Excel. Vui lòng kiểm tra lại.'
      );
      setParsedRows([]);
      setAvailableColumns([]);
      return;
    }

    // Xác định dòng bắt đầu dữ liệu
    let dataStartRow = 1;
    for (let r = 0; r <= Math.min(range.e.r, 20); r++) {
      const msnvVal = readCellText(ws, r, colMsnv);
      const msnvNorm = stripViAccents(msnvVal);
      if (
        msnvNorm &&
        msnvNorm !== 'msnv' &&
        !msnvNorm.startsWith('manh') &&
        !msnvNorm.includes('ma so') &&
        msnvNorm !== 'nan' &&
        msnvNorm !== 'stt'
      ) {
        dataStartRow = r;
        break;
      }
    }
    setDataStartRowState(dataStartRow);

    // Xây dựng danh sách toàn bộ các cột có trong Excel để người dùng có thể chủ động chọn lại nếu muốn
    const colsList: DetectedColumnOption[] = [];
    for (let c = 0; c <= maxScanC; c++) {
      const letter = XLSX.utils.encode_col(c);
      const rawHeader1 = readCellText(ws, 0, c);
      const rawHeader2 = readCellText(ws, 1, c);
      let name = [rawHeader1, rawHeader2].filter(Boolean).join(' - ');
      if (!name) name = `Cột ${letter}`;
      const sample = readCellText(ws, dataStartRow, c);
      colsList.push({
        index: c,
        letter,
        name,
        previewSample: sample,
      });
    }
    setAvailableColumns(colsList);

    setSelectedMsnvCol(colMsnv);
    setSelectedSalaryCol(colLuong);
    setSelectedBacCol(colBac);
    setSelectedNgachCol(colNgach);
    setSelectedChucVuCol(colChucVu);

    // Thực hiện trích xuất dữ liệu
    extractRowsWithColumns(
      ws,
      colMsnv,
      colLuong,
      colBac,
      colNgach,
      colChucVu,
      colHo,
      colTen,
      colFullName,
      colDept,
      colJob,
      dataStartRow,
      range
    );

    setErrorMsg('');
  };

  // Người dùng thay đổi cột Lương thủ công
  const handleSalaryColChange = (newColIdx: number) => {
    setSelectedSalaryCol(newColIdx);
    if (!workbookRef.current || !selectedSheet || !sheetRangeState) return;
    const ws = workbookRef.current.Sheets[selectedSheet];
    if (!ws) return;

    extractRowsWithColumns(
      ws,
      selectedMsnvCol,
      newColIdx,
      selectedBacCol,
      selectedNgachCol,
      selectedChucVuCol,
      -1,
      -1,
      -1,
      -1,
      -1,
      dataStartRowState,
      sheetRangeState
    );
  };

  // Người dùng thay đổi cột Bậc thủ công
  const handleBacColChange = (newColIdx: number) => {
    setSelectedBacCol(newColIdx);
    if (!workbookRef.current || !selectedSheet || !sheetRangeState) return;
    const ws = workbookRef.current.Sheets[selectedSheet];
    if (!ws) return;

    extractRowsWithColumns(
      ws,
      selectedMsnvCol,
      selectedSalaryCol,
      newColIdx,
      selectedNgachCol,
      selectedChucVuCol,
      -1,
      -1,
      -1,
      -1,
      -1,
      dataStartRowState,
      sheetRangeState
    );
  };

  // Người dùng thay đổi cột Ngạch thủ công
  const handleNgachColChange = (newColIdx: number) => {
    setSelectedNgachCol(newColIdx);
    if (!workbookRef.current || !selectedSheet || !sheetRangeState) return;
    const ws = workbookRef.current.Sheets[selectedSheet];
    if (!ws) return;

    extractRowsWithColumns(
      ws,
      selectedMsnvCol,
      selectedSalaryCol,
      selectedBacCol,
      newColIdx,
      selectedChucVuCol,
      -1,
      -1,
      -1,
      -1,
      -1,
      dataStartRowState,
      sheetRangeState
    );
  };

  // Người dùng thay đổi cột Chức vụ thủ công
  const handleChucVuColChange = (newColIdx: number) => {
    setSelectedChucVuCol(newColIdx);
    if (!workbookRef.current || !selectedSheet || !sheetRangeState) return;
    const ws = workbookRef.current.Sheets[selectedSheet];
    if (!ws) return;

    extractRowsWithColumns(
      ws,
      selectedMsnvCol,
      selectedSalaryCol,
      selectedBacCol,
      selectedNgachCol,
      newColIdx,
      -1,
      -1,
      -1,
      -1,
      -1,
      dataStartRowState,
      sheetRangeState
    );
  };

  // Xử lý khi chọn file Excel
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setErrorMsg('');

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array', raw: true });
        workbookRef.current = wb;
        setSheetNames(wb.SheetNames);
        const firstSheet = wb.SheetNames[0];
        setSelectedSheet(firstSheet);
        parseSheet(wb, firstSheet);
      } catch (err: unknown) {
        console.error('Lỗi đọc file Excel:', err);
        setErrorMsg('Không thể đọc file Excel này. Vui lòng kiểm tra định dạng .xlsx, .xls hoặc .csv');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Đổi sheet
  const handleSheetChange = (sheet: string) => {
    setSelectedSheet(sheet);
    if (workbookRef.current) {
      parseSheet(workbookRef.current, sheet);
    }
  };

  // Toggle chọn 1 dòng
  const handleToggleRow = (index: number) => {
    setParsedRows((prev) =>
      prev.map((row, idx) => (idx === index ? { ...row, selected: !row.selected } : row))
    );
  };

  // Toggle chọn tất cả dòng hợp lệ
  const handleToggleSelectAllValid = () => {
    const validRows = parsedRows.filter((r) => r.status === 'valid_update');
    const allSelected = validRows.length > 0 && validRows.every((r) => r.selected);

    setParsedRows((prev) =>
      prev.map((r) => {
        if (r.status === 'valid_update') {
          return { ...r, selected: !allSelected };
        }
        return r;
      })
    );
  };

  // Thống kê
  const stats = useMemo(() => {
    const total = parsedRows.length;
    const valid = parsedRows.filter((r) => r.status === 'valid_update');
    const selected = valid.filter((r) => r.selected).length;
    const skipped = parsedRows.filter((r) => r.status !== 'valid_update').length;
    const notInContract = parsedRows.filter((r) => r.status === 'not_found_skip' && r.matchedEmployee).length;
    const notFound = parsedRows.filter((r) => r.status === 'not_found_skip' && !r.matchedEmployee).length;
    const emptyData = parsedRows.filter((r) => r.status === 'empty_data').length;
    return { total, validCount: valid.length, selected, skipped, notInContract, notFound, emptyData };
  }, [parsedRows]);

  // Danh sách dòng hiển thị theo Tab & Tìm kiếm
  const displayedRows = useMemo(() => {
    return parsedRows.filter((row) => {
      if (activeTab === 'valid' && row.status !== 'valid_update') return false;
      if (activeTab === 'skipped' && row.status === 'valid_update') return false;

      if (searchFilter.trim()) {
        const q = searchFilter.toLowerCase().trim();
        const matchMsnv = row.msnvInFile.toLowerCase().includes(q);
        const matchName = (row.fullNameInFile || '').toLowerCase().includes(q);
        const matchMatchedName = (row.matchedEmployee?.fullName || '').toLowerCase().includes(q);
        const matchDept = (row.deptInFile || row.matchedEmployee?.phongBan || '').toLowerCase().includes(q);
        if (!matchMsnv && !matchName && !matchMatchedName && !matchDept) return false;
      }
      return true;
    });
  }, [parsedRows, activeTab, searchFilter]);

  // Thực hiện Cập Nhật Lương, Bậc, Ngạch
  const handleExecuteImport = async () => {
    const rowsToUpdate = parsedRows.filter((r) => r.status === 'valid_update' && r.selected);
    if (rowsToUpdate.length === 0) {
      setNotification({
        isOpen: true,
        type: 'warning',
        title: 'Chưa chọn nhân sự',
        message: 'Vui lòng tích chọn ít nhất 1 dòng nhân viên hợp lệ trong bảng để cập nhật lương.',
        confirmText: 'Đã hiểu',
      });
      return;
    }

    setIsProcessing(true);
    try {
      // Chuẩn bị payload gồm: msnv, luongThuViec (đã format VNĐ), bacLuong, ngachLuong, chucVu
      const items = rowsToUpdate.map((r) => ({
        msnv: r.msnvInFile.trim(),
        luongThuViec: r.newSalary ? formatSalaryVnd(r.newSalary.trim()) : undefined,
        bacLuong: r.newBac ? r.newBac.trim() : undefined,
        ngachLuong: r.newNgach ? r.newNgach.trim() : undefined,
        chucVu: r.newChucVu ? r.newChucVu.trim() : undefined,
      }));

      // 1. Gọi API batch update lương / bậc / ngạch / chức vụ có kèm contractType để backend kiểm tra thêm 1 lớp bảo vệ
      const result = await api.batchUpdateSalaryRanks(items, contractType);

      // 2. Cập nhật state cục bộ cho UI
      if (result.updatedEmployees && result.updatedEmployees.length > 0) {
        if (onBatchUpdateEmployees) {
          onBatchUpdateEmployees(result.updatedEmployees);
        } else if (onUpdateEmployee) {
          for (const emp of result.updatedEmployees) {
            await onUpdateEmployee(emp.id, {
              luongThuViec: emp.luongThuViec,
              bacLuong: emp.bacLuong,
              ngachLuong: emp.ngachLuong,
              chucVu: emp.chucVu,
            });
          }
        }
      }

      // 3. Tải lại workspace nếu có callback
      if (onRefreshData) {
        await onRefreshData();
      }

      // Hiển thị Dialog thông báo thành công chuyên nghiệp
      setNotification({
        isOpen: true,
        type: 'success',
        title: 'Cập nhật thành công!',
        message: 'Dữ liệu Lương, Bậc, Ngạch và Chức vụ từ file Excel đã được đồng bộ an toàn vào cơ sở dữ liệu.',
        stats: [
          {
            label: 'Đã cập nhật',
            value: result.updatedCount,
            sublabel: 'Lương / Bậc / Ngạch / Chức vụ',
            color: 'emerald',
          },
          {
            label: 'Bỏ qua an toàn',
            value: stats.skipped,
            sublabel: 'Không thêm mới nhân sự',
            color: 'slate',
          },
        ],
        note: 'Bảo toàn dữ liệu: Hệ thống cập nhật các trường được chọn (Lương thử việc, Bậc, Ngạch, Chức vụ). Toàn bộ hồ sơ nhân sự khác (Họ tên, CCCD, Phòng ban...) được giữ nguyên tuyệt đối.',
        confirmText: 'Hoàn tất & Đóng',
        onConfirm: () => {
          setNotification((prev) => ({ ...prev, isOpen: false }));
          handleClose();
        },
      });
    } catch (err: unknown) {
      console.error('Lỗi cập nhật lương hàng loạt:', err);
      setNotification({
        isOpen: true,
        type: 'error',
        title: 'Không thể cập nhật',
        message: 'Đã xảy ra lỗi khi lưu dữ liệu vào cơ sở dữ liệu.',
        note:
          err instanceof Error
            ? err.message
            : 'Vui lòng kiểm tra lại kết nối mạng hoặc thử lại.',
        confirmText: 'Đóng thông báo',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Tải trực tiếp file Excel / CSV mẫu nhập lương/bậc/ngạch/chức vụ (sẵn sàng tải về từ mã nguồn)
  const handleDownloadSampleFile = async (format: 'xlsx' | 'csv' = 'xlsx') => {
    if (format === 'csv') {
      downloadSalaryTemplateCsv();
    } else {
      await downloadSalaryTemplateExcel();
    }
  };

  const currentSalaryColInfo = availableColumns.find((c) => c.index === selectedSalaryCol);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/90 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* 1. MODAL HEADER */}
        <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isTraining ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                Import Excel Cập Nhật Lương, Bậc, Ngạch
                <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-semibold ${isTraining ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>
                  {isTraining ? 'Hợp đồng đào tạo' : 'Hợp đồng thử việc'}
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Chỉ cập nhật nhân viên thuộc danh sách hợp đồng này • Tự động bỏ qua nhân viên khác loại hợp đồng hoặc không tồn tại
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleDownloadSampleFile('xlsx')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/90 rounded-xl transition-all cursor-pointer shadow-2xs hover:shadow-xs"
              title="Tải file Excel mẫu (.xlsx)"
            >
              <Download className="w-3.5 h-3.5 text-emerald-700" />
              <span>Tải mẫu Excel</span>
            </button>
            <button
              type="button"
              onClick={() => handleDownloadSampleFile('csv')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition-all cursor-pointer shadow-2xs hover:shadow-xs"
              title="Tải file CSV mẫu (.csv)"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>CSV</span>
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 3. MODAL BODY */}
        <div className="p-6 flex-1 overflow-y-auto space-y-4">
          {/* A. FILE UPLOAD BOX */}
          {!fileName ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-emerald-500 bg-slate-50/50 hover:bg-emerald-50/20 rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all group"
            >
              <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-center text-slate-600 group-hover:scale-105 group-hover:border-emerald-300 group-hover:text-emerald-600 transition-all mb-3">
                <Upload className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-800">
                Nhấp để tải lên hoặc kéo thả file Excel tổng hợp
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Hỗ trợ file .xlsx, .xls, .csv
              </p>

              {/* Nút tải file mẫu trực tiếp */}
              <div className="mt-4 pt-3.5 border-t border-slate-200/70 w-full max-w-sm flex flex-col items-center gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownloadSampleFile('xlsx');
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-emerald-800 bg-white hover:bg-emerald-50 border border-emerald-300 rounded-xl transition-all shadow-2xs hover:shadow-xs cursor-pointer"
                    title="Tải file Excel mẫu (.xlsx)"
                  >
                    <Download className="w-4 h-4 text-emerald-600" />
                    <span>Tải file Excel mẫu (.xlsx)</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownloadSampleFile('csv');
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition-all shadow-2xs hover:shadow-xs cursor-pointer"
                    title="Tải file mẫu dạng CSV (.csv)"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-500" />
                    <span>Mẫu CSV</span>
                  </button>
                </div>
                <span className="text-[11px] text-slate-400">File mẫu gồm đầy đủ 2 dòng tiêu đề và các cột Lương, Bậc, Ngạch, Chức vụ</span>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          ) : (
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">{fileName}</div>
                  <div className="text-[11px] text-slate-500">
                    Đã đọc {stats.total} dòng dữ liệu từ Excel
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {sheetNames.length > 1 && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-slate-500">Sheet:</span>
                    <select
                      value={selectedSheet}
                      onChange={(e) => handleSheetChange(e.target.value)}
                      className="px-2.5 py-1 text-xs border border-slate-300 rounded-lg bg-white font-medium text-slate-700"
                    >
                      {sheetNames.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
                >
                  Đổi file khác
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* B. THANH CHỌN / XÁC NHẬN CỘT DỮ LIỆU ĐƯỢC CHỌN */}
          {parsedRows.length > 0 && availableColumns.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
              <div className="text-xs font-bold text-slate-800">
                Cột đối chiếu dữ liệu:
              </div>

              {/* Bộ chọn cột thủ công để người dùng hoàn toàn chủ động */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Lương thử việc:
                  </label>
                  <select
                    value={selectedSalaryCol}
                    onChange={(e) => handleSalaryColChange(Number(e.target.value))}
                    className="w-full text-xs font-semibold px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 shadow-2xs"
                  >
                    {availableColumns.map((col) => (
                      <option key={col.index} value={col.index}>
                        [{col.letter}] {col.name} {col.previewSample ? `— VD: ${col.previewSample}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Bậc lương:
                  </label>
                  <select
                    value={selectedBacCol}
                    onChange={(e) => handleBacColChange(Number(e.target.value))}
                    className="w-full text-xs font-semibold px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 shadow-2xs"
                  >
                    <option value={-1}>-- Không cập nhật Bậc --</option>
                    {availableColumns.map((col) => (
                      <option key={col.index} value={col.index}>
                        [{col.letter}] {col.name} {col.previewSample ? `— VD: ${col.previewSample}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Ngạch lương:
                  </label>
                  <select
                    value={selectedNgachCol}
                    onChange={(e) => handleNgachColChange(Number(e.target.value))}
                    className="w-full text-xs font-semibold px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 shadow-2xs"
                  >
                    <option value={-1}>-- Không cập nhật Ngạch --</option>
                    {availableColumns.map((col) => (
                      <option key={col.index} value={col.index}>
                        [{col.letter}] {col.name} {col.previewSample ? `— VD: ${col.previewSample}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Chức vụ:
                  </label>
                  <select
                    value={selectedChucVuCol}
                    onChange={(e) => handleChucVuColChange(Number(e.target.value))}
                    className="w-full text-xs font-semibold px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 shadow-2xs"
                  >
                    <option value={-1}>-- Không cập nhật Chức vụ --</option>
                    {availableColumns.map((col) => (
                      <option key={col.index} value={col.index}>
                        [{col.letter}] {col.name} {col.previewSample ? `— VD: ${col.previewSample}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* C. THỐNG KÊ NHANH */}
          {parsedRows.length > 0 && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
                  <div className="text-[11px] font-semibold text-slate-500">Tổng dòng trong file</div>
                  <div className="text-xl font-bold text-slate-900 mt-0.5">{stats.total}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Dòng dữ liệu đọc được từ Excel</div>
                </div>

                <div className="bg-emerald-50/60 border border-emerald-200/70 rounded-xl p-3">
                  <div className="text-[11px] font-semibold text-emerald-700">Khớp MSNV sẽ cập nhật</div>
                  <div className="text-xl font-bold text-emerald-800 mt-0.5">{stats.selected} / {stats.validCount}</div>
                  <div className="text-[11px] text-emerald-700 mt-0.5">Đã chọn cập nhật Lương, Bậc, Ngạch</div>
                </div>

                <div className="bg-amber-50/60 border border-amber-200/70 rounded-xl p-3">
                  <div className="text-[11px] font-semibold text-amber-700">Bỏ qua an toàn</div>
                  <div className="text-xl font-bold text-amber-800 mt-0.5">{stats.skipped}</div>
                  <div className="text-[11px] text-amber-700 mt-0.5">
                    {stats.notInContract > 0 ? `${stats.notInContract} khác loại HĐ, ` : ''}
                    {stats.notFound} không tìm thấy MSNV, {stats.emptyData} trống lương
                  </div>
                </div>
              </div>

              {/* D. THANH ĐIỀU HƯỚNG TABS & TÌM KIẾM */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setActiveTab('all')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                      activeTab === 'all'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Tất cả ({stats.total})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('valid')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                      activeTab === 'valid'
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'text-emerald-800 hover:bg-emerald-100/50'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Sẽ cập nhật ({stats.validCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('skipped')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                      activeTab === 'skipped'
                        ? 'bg-amber-500 text-white shadow-2xs'
                        : 'text-amber-800 hover:bg-amber-100/50'
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Bỏ qua ({stats.skipped})
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative w-full sm:w-60">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Tìm theo MSNV, tên..."
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      className="w-full pl-8.5 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleToggleSelectAllValid}
                    className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shrink-0 transition-colors cursor-pointer"
                  >
                    Chọn/Bỏ chọn tất cả
                  </button>
                </div>
              </div>

              {/* E. BẢNG PREVIEW ĐỐI CHIẾU DỮ LIỆU */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <div className="max-h-80 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 z-10 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                      <tr>
                        <th className="py-2.5 px-3 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={stats.selected === stats.validCount && stats.validCount > 0}
                            onChange={handleToggleSelectAllValid}
                            className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                          />
                        </th>
                        <th className="py-2.5 px-3 w-14">Dòng</th>
                        <th className="py-2.5 px-3 w-24">MSNV</th>
                        <th className="py-2.5 px-3">Nhân viên hệ thống</th>
                        <th className="py-2.5 px-3 w-28">Bậc</th>
                        <th className="py-2.5 px-3 w-28">Ngạch</th>
                        <th className="py-2.5 px-3 w-36">Chức vụ</th>
                        <th className="py-2.5 px-3 w-40">Mức lương thử việc mới</th>
                        <th className="py-2.5 px-3 w-44">Trạng thái đối chiếu</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {displayedRows.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-8 text-center text-slate-400">
                            Không có dòng nào phù hợp bộ lọc
                          </td>
                        </tr>
                      ) : (
                        displayedRows.map((row, idx) => {
                          const originalIdx = parsedRows.indexOf(row);
                          const isMatched = row.status === 'valid_update';
                          const matchedEmp = row.matchedEmployee;

                          return (
                            <tr
                              key={originalIdx}
                              className={`hover:bg-slate-50/80 transition-colors ${
                                !isMatched ? 'bg-amber-50/20 text-slate-500' : ''
                              }`}
                            >
                              <td className="py-2.5 px-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={row.selected}
                                  disabled={!isMatched}
                                  onChange={() => handleToggleRow(originalIdx)}
                                  className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                />
                              </td>
                              <td className="py-2.5 px-3 text-slate-400 font-mono-num">
                                #{row.rowNumber}
                              </td>
                              <td className="py-2.5 px-3 font-bold font-mono-num text-slate-800">
                                {row.msnvInFile}
                              </td>
                              <td className="py-2.5 px-3">
                                {matchedEmp ? (
                                  <div>
                                    <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                                      {matchedEmp.fullName}
                                      {matchedEmp.loaiHd && (
                                        <span
                                          className={`text-[10px] px-1.5 py-0.2 rounded font-normal ${
                                            isMatched
                                              ? 'bg-emerald-100 text-emerald-800 font-semibold'
                                              : 'bg-amber-100 text-amber-800 font-medium'
                                          }`}
                                        >
                                          {matchedEmp.loaiHd}
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[11px] text-slate-500">
                                      {matchedEmp.phongBan || matchedEmp.department || 'Chưa phân PB'} - {matchedEmp.chucVu || matchedEmp.congViec || ''}
                                    </div>
                                    {!isMatched && (
                                      <div className="text-[10px] text-amber-700 font-medium mt-0.5">
                                        {row.statusMessage}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div>
                                    <div className="text-slate-600 italic">
                                      {row.fullNameInFile || 'Không có tên trong file'}
                                    </div>
                                    <div className="text-[11px] text-rose-600 font-medium">
                                      Không tìm thấy nhân viên có MSNV {row.msnvInFile}
                                    </div>
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-3">
                                {isMatched && matchedEmp ? (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-slate-400 line-through">
                                      {matchedEmp.bacLuong || '—'}
                                    </span>
                                    <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                                    <span className="font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60">
                                      {row.newBac || '(Không đổi)'}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="font-medium text-slate-700">{row.newBac || '—'}</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3">
                                {isMatched && matchedEmp ? (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-slate-400 line-through">
                                      {matchedEmp.ngachLuong || '—'}
                                    </span>
                                    <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                                    <span className="font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60">
                                      {row.newNgach || '(Không đổi)'}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="font-medium text-slate-700">{row.newNgach || '—'}</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3">
                                {isMatched && matchedEmp ? (
                                  row.newChucVu ? (
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-slate-400 line-through">
                                        {matchedEmp.chucVu || matchedEmp.congViec || '—'}
                                      </span>
                                      <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                                      <span className="font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60">
                                        {row.newChucVu}
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="text-slate-400 italic">(Không đổi)</span>
                                  )
                                ) : (
                                  <span className="font-medium text-slate-700">{row.newChucVu || '—'}</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3">
                                {isMatched && matchedEmp ? (
                                  <div>
                                    <div className="font-bold text-emerald-700">
                                      {formatVnd(row.newSalary)}
                                    </div>
                                    {matchedEmp.luongThuViec && (
                                      <div className="text-[10px] text-slate-400">
                                        Cũ: {formatVnd(matchedEmp.luongThuViec)}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="font-medium text-slate-700">
                                    {formatVnd(row.newSalary)}
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3">
                                {isMatched ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                    Sẵn sàng cập nhật
                                  </span>
                                ) : row.status === 'empty_data' ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600">
                                    Trống lương
                                  </span>
                                ) : row.matchedEmployee ? (
                                  <span
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800"
                                    title={row.statusMessage}
                                  >
                                    <AlertTriangle className="w-3 h-3 text-amber-600" />
                                    Khác loại HĐ ({row.matchedEmployee.loaiHd || 'Khác'}) - Bỏ qua
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600">
                                    <AlertTriangle className="w-3 h-3 text-slate-500" />
                                    Bỏ qua (Không tạo mới)
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        {/* 4. MODAL FOOTER */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/70 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-500 text-center sm:text-left">
            <span>
              {parsedRows.length > 0 ? (
                <span>
                  Sẽ cập nhật lương, bậc, ngạch, chức vụ cho{' '}
                  <strong className="text-emerald-700 font-bold">{stats.selected}</strong> nhân viên.{' '}
                  <span className="text-slate-400">|</span> Bỏ qua an toàn{' '}
                  <strong>{stats.skipped}</strong> dòng.
                </span>
              ) : (
                'Chọn file Excel để bắt đầu xem trước đối chiếu'
              )}
            </span>

            <span className="text-slate-300 hidden sm:inline">•</span>

            <div className="inline-flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleDownloadSampleFile('xlsx')}
                className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-900 font-bold hover:underline cursor-pointer"
                title="Tải file Excel mẫu (.xlsx)"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Tải mẫu Excel</span>
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={() => handleDownloadSampleFile('csv')}
                className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 font-medium hover:underline cursor-pointer"
                title="Tải file CSV mẫu (.csv)"
              >
                <span>Mẫu CSV</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleClose}
              disabled={isProcessing}
              className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer disabled:opacity-50"
            >
              Hủy bỏ
            </button>

            <button
              type="button"
              onClick={handleExecuteImport}
              disabled={isProcessing || stats.selected === 0}
              className={`px-5 py-2 text-xs font-bold rounded-xl text-white shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                isTraining
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Đang cập nhật {stats.selected} nhân viên...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Xác nhận cập nhật ({stats.selected} nhân viên)
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Dialog Thông Báo Chuyên Nghiệp */}
      <NotificationModal
        isOpen={notification.isOpen}
        onClose={() => setNotification((prev) => ({ ...prev, isOpen: false }))}
        type={notification.type}
        title={notification.title}
        message={notification.message}
        stats={notification.stats}
        details={notification.details}
        note={notification.note}
        confirmText={notification.confirmText}
        onConfirm={notification.onConfirm}
      />
    </div>
  );
};
