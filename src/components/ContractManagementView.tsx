import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  FileText,
  Search,
  Filter,
  DollarSign,
  Calendar,
  Building2,
  Users,
  CheckCircle2,
  AlertCircle,
  Clock,
  Printer,
  Download,
  Save,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Sparkles,
  Edit3,
  Plus,
  X,
  Award,
  Tag,
  GraduationCap,
  FileX,
  MoreVertical,
  Upload,
  History,
  FileSignature,
  XCircle,
  FileCheck,
  RefreshCw,
} from 'lucide-react';
import { Division, Department, SubDepartment, Employee, ContractRecord } from '../types';
import { api } from '../api';
import { DocumentGeneratorModal } from './DocumentGeneratorModal';
import { TerminateContractModal } from './TerminateContractModal';
import { ContractSalaryImportModal } from './ContractSalaryImportModal';
import { ContractHistoryModal } from './ContractHistoryModal';
import { RenewContractModal } from './RenewContractModal';
import { NotificationModal, NotificationStat } from './NotificationModal';
import { ErrorBoundary } from './ErrorBoundary';
import { isContractTerminated } from '../utils/employeeUtils';

function parseDateTimestamp(dateStr?: unknown): number {
  if (!dateStr) return -1;
  const s = String(dateStr).trim();
  if (!s) return -1;
  const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmy) {
    const d = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
    return Number.isNaN(d.getTime()) ? -1 : d.getTime();
  }
  const ymd = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (ymd) {
    const d = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
    return Number.isNaN(d.getTime()) ? -1 : d.getTime();
  }
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? -1 : parsed.getTime();
}

function parseContractNumberValue(contractNumber?: string): number {
  if (!contractNumber) return -1;
  const match = String(contractNumber).match(/(\d+)/);
  if (!match) return -1;
  const num = parseInt(match[1], 10);
  return Number.isNaN(num) ? -1 : num;
}

function getStatusBadgeClass(status?: string): string {
  switch (status) {
    case 'Hiệu lực':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'Đã tái ký':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'Đã thay thế':
      return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    case 'Hết hiệu lực':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'Đã chấm dứt':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

interface ContractManagementViewProps {
  employees: Employee[];
  divisions: Division[];
  departments: Department[];
  subDepartments: SubDepartment[];
  onUpdateEmployee: (id: string, updates: Partial<Employee>) => Promise<unknown>;
  onBatchUpdateEmployees?: (updatedList: Employee[]) => void;
  onRefreshData?: () => Promise<void>;
  onNavigateToEmployees?: () => void;
  contractType?: 'probation' | 'training';
}

export const ContractManagementView: React.FC<ContractManagementViewProps> = ({
  employees,
  divisions,
  departments,
  subDepartments,
  onUpdateEmployee,
  onBatchUpdateEmployees,
  onRefreshData,
  onNavigateToEmployees,
  contractType = 'probation',
}) => {
  const isTraining = contractType === 'training';

  // Contracts state (quản lý theo danh sách hợp đồng)
  const [contracts, setContracts] = useState<ContractRecord[]>([]);
  const [isLoadingContracts, setIsLoadingContracts] = useState<boolean>(true);
  const [contractsError, setContractsError] = useState<string | null>(null);

  const loadContracts = useCallback(async () => {
    setIsLoadingContracts(true);
    setContractsError(null);
    try {
      const list = await api.getContracts();
      setContracts(list);
    } catch (err: unknown) {
      setContractsError(err instanceof Error ? err.message : 'Không thể tải danh sách hợp đồng');
    } finally {
      setIsLoadingContracts(false);
    }
  }, []);

  useEffect(() => {
    loadContracts();
  }, [loadContracts]);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDivision, setSelectedDivision] = useState<string>('all');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [salaryFilter, setSalaryFilter] = useState<'all' | 'has_salary' | 'no_salary'>('all');
  const [signingFilter, setSigningFilter] = useState<'all' | 'signed' | 'unsigned'>('signed');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);

  // Selected contracts for batch actions
  const [selectedContractIds, setSelectedContractIds] = useState<Set<string>>(new Set());

  // Inline salary editing states (kept for compatibility)
  const [salaryDrafts, setSalaryDrafts] = useState<Record<string, string>>({});
  const [savingSalaryIds, setSavingSalaryIds] = useState<Set<string>>(new Set());
  const [savedSuccessIds, setSavedSuccessIds] = useState<Set<string>>(new Set());

  // Modal Nhập Lương + Bậc + Ngạch cho 1 hợp đồng
  const [editingContract, setEditingContract] = useState<ContractRecord | null>(null);
  const [modalSalary, setModalSalary] = useState('');
  const [modalBac, setModalBac] = useState('');
  const [modalNgach, setModalNgach] = useState('');
  const [isSavingSalaryModal, setIsSavingSalaryModal] = useState(false);

  // Batch salary modal state
  const [isBatchSalaryModalOpen, setIsBatchSalaryModalOpen] = useState(false);
  const [batchSalaryValue, setBatchSalaryValue] = useState('');
  const [batchBacValue, setBatchBacValue] = useState('');
  const [batchNgachValue, setBatchNgachValue] = useState('');
  const [isBatchSaving, setIsBatchSaving] = useState(false);

  // Document generator modal state
  const [isDocGeneratorOpen, setIsDocGeneratorOpen] = useState(false);
  const [generatorTargetEmployees, setGeneratorTargetEmployees] = useState<Employee[]>([]);

  // Action Menu (3-dots) State
  const [actionMenuState, setActionMenuState] = useState<{
    contract: ContractRecord;
    top: number;
    bottom: number;
    right: number;
    openUpwards: boolean;
  } | null>(null);

  // Modal Lịch sử hợp đồng & Tái ký hợp đồng
  const [viewingHistoryEmployee, setViewingHistoryEmployee] = useState<Employee | null>(null);
  const [renewingEmployee, setRenewingEmployee] = useState<Employee | null>(null);

  // Modal Import Excel Lương / Bậc / Ngạch
  const [isImportSalaryModalOpen, setIsImportSalaryModalOpen] = useState(false);

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

  // Modal Chấm dứt hợp đồng
  const [terminatingTarget, setTerminatingTarget] = useState<{
    employee: Employee;
    contract?: ContractRecord;
  } | null>(null);

  const employeeMap = useMemo(() => {
    const map = new Map<string, Employee>();
    for (const emp of employees) {
      map.set(emp.id, emp);
    }
    return map;
  }, [employees]);

  const buildEmployeeForContract = useCallback(
    (c: ContractRecord): Employee => {
      const existing = employeeMap.get(c.employeeId);
      if (existing) {
        return {
          ...existing,
          soHd: c.contractNumber || existing.soHd,
          loaiHd: c.contractType || existing.loaiHd,
          thoiHan: c.duration || existing.thoiHan,
          tuNgay: c.startDate || existing.tuNgay,
          denNgay: c.endDate ?? existing.denNgay,
          luongChinhThuc: c.salary || existing.luongChinhThuc,
          luongThuViec: c.probationSalary || existing.luongThuViec,
          bacLuong: c.bacLuong || existing.bacLuong,
          ngachLuong: c.ngachLuong || existing.ngachLuong,
          ngayKyHopDong: c.signDate || existing.ngayKyHopDong,
          daKyHopDong: c.isSigned ?? existing.daKyHopDong,
        };
      }
      return {
        id: c.employeeId,
        msnv: c.msnv || '',
        fullName: c.fullName || '',
        department: c.department || '',
        chucVu: c.position || '',
        soHd: c.contractNumber || '',
        loaiHd: c.contractType || (isTraining ? 'HĐĐT' : 'HĐTV'),
        thoiHan: c.duration || '',
        tuNgay: c.startDate || '',
        denNgay: c.endDate || '',
        luongChinhThuc: c.salary || '',
        luongThuViec: c.probationSalary || '',
        bacLuong: c.bacLuong || '',
        ngachLuong: c.ngachLuong || '',
        ngayKyHopDong: c.signDate || '',
        daKyHopDong: Boolean(c.isSigned),
        joinDate: c.startDate || '',
        photoUrl: c.photoUrl || '',
        printCount: 0,
        lastPrintedAt: '',
        ownerId: c.ownerId || '',
      };
    },
    [employeeMap, isTraining]
  );

  const handleTerminateContract = async (updates: {
    tinhTrang: string;
    trangThaiHopDong: string;
    denNgay?: string;
  }) => {
    if (!terminatingTarget) return;
    try {
      await onUpdateEmployee(terminatingTarget.employee.id, updates);
      if (terminatingTarget.contract && !terminatingTarget.contract.id.startsWith('emp_ctr_')) {
        await api.updateContract(terminatingTarget.contract.id, {
          status: 'Đã chấm dứt',
          endDate: updates.denNgay ?? terminatingTarget.contract.endDate ?? '',
        });
      }
      await loadContracts();
      setTerminatingTarget(null);
    } catch (err) {
      console.error('Lỗi khi chấm dứt hợp đồng:', err);
      throw err;
    }
  };

  // 1. Filter danh sách nhân viên HĐTV/HĐĐT (dùng cho modal Import Excel Lương)
  const contractEmployees = useMemo(() => {
    return employees.filter((emp) => {
      if (isContractTerminated(emp)) return false;
      const loai = (emp.loaiHd || '').trim().toUpperCase();
      if (isTraining) {
        return loai === 'HĐĐT' || loai === 'HDDT' || loai.includes('ĐÀO TẠO') || loai.includes('DAO TAO');
      }
      return loai === 'HĐTV' || loai.includes('THỬ VIỆC') || loai.includes('THU VIEC');
    });
  }, [employees, isTraining]);

  // 2. Filter danh sách hợp đồng theo loại (HĐTV hoặc HĐĐT)
  const typeContracts = useMemo(() => {
    return contracts.filter((c) => {
      const loai = (c.contractType || '').trim().toUpperCase();
      if (isTraining) {
        return loai === 'HĐĐT' || loai === 'HDDT' || loai.includes('ĐÀO TẠO') || loai.includes('DAO TAO');
      }
      return loai === 'HĐTV' || loai.includes('THỬ VIỆC') || loai.includes('THU VIEC');
    });
  }, [contracts, isTraining]);

  // Bộ lọc phòng ban theo Khối đã chọn
  const filteredDepartments = useMemo(() => {
    if (selectedDivision === 'all') return departments;
    return departments.filter((d) => d.divisionName === selectedDivision || d.divisionId === selectedDivision);
  }, [departments, selectedDivision]);

  // Danh sách hợp đồng hiển thị theo Bộ lọc & sắp xếp mới ký nhất lên đầu
  const displayedContracts = useMemo(() => {
    const filtered = typeContracts.filter((c) => {
      const emp = employeeMap.get(c.employeeId);

      // 1. Tìm kiếm theo từ khóa
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const haystack = [
          c.contractNumber,
          c.fullName,
          c.msnv,
          c.department,
          emp?.phongBan,
          emp?.department,
          c.position,
          emp?.chucVu,
          emp?.congViec,
          emp?.soDienThoai,
          c.note,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) {
          return false;
        }
      }

      // 2. Lọc theo Khối
      if (selectedDivision !== 'all') {
        if ((emp?.khoi || '') !== selectedDivision) return false;
      }

      // 3. Lọc theo Phòng ban
      if (selectedDepartment !== 'all') {
        const dName = emp?.phongBan || emp?.department || c.department || '';
        if (dName !== selectedDepartment) return false;
      }

      // 4. Lọc theo Trạng thái hợp đồng
      if (statusFilter !== 'all') {
        if (c.status !== statusFilter) return false;
      }

      // 5. Lọc theo Trạng thái lương
      const salaryVal = (c.probationSalary || c.salary || '').trim();
      if (salaryFilter === 'has_salary') {
        if (!salaryVal) return false;
      } else if (salaryFilter === 'no_salary') {
        if (salaryVal) return false;
      }

      // 6. Lọc theo Trạng thái ký hợp đồng
      if (signingFilter === 'signed') {
        if (!c.isSigned) return false;
      } else if (signingFilter === 'unsigned') {
        if (c.isSigned) return false;
      }

      return true;
    });

    return [...filtered].sort((a, b) => {
      const isLegacyA = a.id.startsWith('emp_ctr_') ? 1 : 0;
      const isLegacyB = b.id.startsWith('emp_ctr_') ? 1 : 0;
      if (isLegacyA !== isLegacyB) return isLegacyA - isLegacyB;

      const createdA = parseDateTimestamp(a.createdAt || a.updatedAt);
      const createdB = parseDateTimestamp(b.createdAt || b.updatedAt);
      if (createdB !== createdA) return createdB - createdA;

      const signDateA = parseDateTimestamp(a.signDate);
      const signDateB = parseDateTimestamp(b.signDate);
      if (signDateB !== signDateA) return signDateB - signDateA;

      const numA = parseContractNumberValue(a.contractNumber);
      const numB = parseContractNumberValue(b.contractNumber);
      if (numB !== numA) return numB - numA;

      return String(b.contractNumber || '').localeCompare(String(a.contractNumber || ''), 'vi');
    });
  }, [
    typeContracts,
    employeeMap,
    searchQuery,
    selectedDivision,
    selectedDepartment,
    statusFilter,
    salaryFilter,
    signingFilter,
  ]);

  // Phân trang
  const totalPages = Math.max(1, Math.ceil(displayedContracts.length / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedContracts = useMemo(() => {
    const startIdx = (safeCurrentPage - 1) * pageSize;
    return displayedContracts.slice(startIdx, startIdx + pageSize);
  }, [displayedContracts, safeCurrentPage, pageSize]);

  const visiblePageNumbers = useMemo(() => {
    const pages: (number | 'ellipsis-start' | 'ellipsis-end')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
      return pages;
    }
    pages.push(1);
    if (safeCurrentPage > 3) {
      pages.push('ellipsis-start');
    }
    const start = Math.max(2, safeCurrentPage - 1);
    const end = Math.min(totalPages - 1, safeCurrentPage + 1);
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    if (safeCurrentPage < totalPages - 2) {
      pages.push('ellipsis-end');
    }
    pages.push(totalPages);
    return pages;
  }, [totalPages, safeCurrentPage]);

  // Thống kê nhanh cho Hợp đồng
  const contractStats = useMemo(() => {
    const total = typeContracts.length;
    let withSalary = 0;
    let withoutSalary = 0;
    let signedCount = 0;
    let unsignedCount = 0;

    typeContracts.forEach((c) => {
      if ((c.probationSalary || c.salary || '').trim()) {
        withSalary++;
      } else {
        withoutSalary++;
      }
      if (c.isSigned) {
        signedCount++;
      } else {
        unsignedCount++;
      }
    });

    return { total, withSalary, withoutSalary, signedCount, unsignedCount };
  }, [typeContracts]);

  // Format số tiền VND hiển thị
  const formatSalaryDisplay = (val?: string) => {
    if (!val || !val.trim()) return '';
    const str = val.trim();
    if (str.includes('%') || !/\d/.test(str)) {
      return str;
    }
    const cleanNum = str.replace(/[^0-9]/g, '');
    if (cleanNum) {
      return Number(cleanNum).toLocaleString('vi-VN') + ' đ';
    }
    return str;
  };

  // Format hiển thị số tiền dạng dấu phẩy khi gõ (VD: 500000 -> 500,000)
  const formatNumberWithCommas = (val: string): string => {
    if (!val || !val.trim()) return '';
    const str = val.trim();
    if (str.includes('%')) return str;
    const digits = str.replace(/\D/g, '');
    if (!digits) return '';
    return Number(digits).toLocaleString('en-US');
  };

  // Xử lý khi gõ input số tiền: tự động định dạng phân tách hàng nghìn bằng dấu phẩy (VD: 500,000), không hiển thị chữ đ
  const handleCurrencyInputChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (val: string) => void
  ) => {
    const target = e.target;
    const rawValue = target.value;
    const selectionStart = target.selectionStart || 0;

    if (rawValue.includes('%')) {
      setter(rawValue);
      return;
    }

    // Đếm số chữ số trước vị trí con trỏ hiện tại để giữ con trỏ chuẩn xác
    const digitsBeforeCursor = rawValue.slice(0, selectionStart).replace(/\D/g, '').length;
    const cleanDigits = rawValue.replace(/\D/g, '');

    if (!cleanDigits) {
      setter('');
      return;
    }

    const formatted = Number(cleanDigits).toLocaleString('en-US');
    setter(formatted);

    requestAnimationFrame(() => {
      let currentDigits = 0;
      let newCursorPos = formatted.length;
      for (let i = 0; i < formatted.length; i++) {
        if (/\d/.test(formatted[i])) {
          currentDigits++;
        }
        if (currentDigits === digitsBeforeCursor) {
          newCursorPos = i + 1;
          break;
        }
      }
      target.setSelectionRange(newCursorPos, newCursorPos);
    });
  };

  // Hỗ trợ xóa (Backspace) mượt mà khi con trỏ đứng ngay sau dấu phẩy
  const handleCurrencyKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    currentValue: string,
    setter: (val: string) => void
  ) => {
    if (e.key === 'Backspace') {
      const target = e.currentTarget;
      const { selectionStart, selectionEnd } = target;
      if (selectionStart === selectionEnd && selectionStart && selectionStart > 1) {
        if (currentValue[selectionStart - 1] === ',') {
          e.preventDefault();
          const before = currentValue.slice(0, selectionStart - 2);
          const after = currentValue.slice(selectionStart);
          const nextRaw = (before + after).replace(/\D/g, '');
          const nextFormatted = nextRaw ? Number(nextRaw).toLocaleString('en-US') : '';
          setter(nextFormatted);
          requestAnimationFrame(() => {
            const newPos = Math.max(0, selectionStart - 2);
            target.setSelectionRange(newPos, newPos);
          });
        }
      }
    }
  };

  // Xử lý thay đổi draft lương thử việc
  const handleSalaryChange = (empId: string, value: string) => {
    setSalaryDrafts((prev) => ({
      ...prev,
      [empId]: value,
    }));
  };

  // Lưu lương thử việc cho 1 nhân viên
  const handleSaveSalary = async (emp: Employee) => {
    const draftValue = salaryDrafts[emp.id];
    const finalValue = draftValue !== undefined ? draftValue.trim() : (emp.luongThuViec || '').trim();

    // Nếu không thay đổi thì bỏ qua
    if (finalValue === (emp.luongThuViec || '').trim() && draftValue === undefined) {
      return;
    }

    setSavingSalaryIds((prev) => new Set(prev).add(emp.id));
    try {
      const formattedSalary = formatSalaryDisplay(finalValue);
      await onUpdateEmployee(emp.id, {
        luongThuViec: formattedSalary,
      });

      // Hiển thị badge đã lưu thành công trong 2 giây
      setSavedSuccessIds((prev) => new Set(prev).add(emp.id));
      setTimeout(() => {
        setSavedSuccessIds((prev) => {
          const next = new Set(prev);
          next.delete(emp.id);
          return next;
        });
      }, 2500);

      // Xóa draft sau khi đã lưu thành công
      setSalaryDrafts((prev) => {
        const next = { ...prev };
        delete next[emp.id];
        return next;
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : (isTraining ? 'Lỗi cập nhật lương đào tạo' : 'Lỗi cập nhật lương thử việc'));
    } finally {
      setSavingSalaryIds((prev) => {
        const next = new Set(prev);
        next.delete(emp.id);
        return next;
      });
    }
  };

  // Chọn / bỏ chọn tất cả hợp đồng đang lọc
  const handleToggleSelectAll = () => {
    if (selectedContractIds.size === displayedContracts.length) {
      setSelectedContractIds(new Set());
    } else {
      setSelectedContractIds(new Set(displayedContracts.map((c) => c.id)));
    }
  };

  // Chọn / bỏ chọn từng hợp đồng
  const handleToggleSelect = (id: string) => {
    setSelectedContractIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Mở modal nhập Lương + Bậc + Ngạch cho 1 hợp đồng
  const handleOpenSalaryModal = (contract: ContractRecord) => {
    setEditingContract(contract);
    const rawSalary = (contract.probationSalary || contract.salary || '').trim();
    if (rawSalary && !rawSalary.includes('%')) {
      const cleanDigits = rawSalary.replace(/\D/g, '');
      setModalSalary(cleanDigits ? Number(cleanDigits).toLocaleString('en-US') : '');
    } else {
      setModalSalary(rawSalary);
    }
    setModalBac(contract.bacLuong || '');
    setModalNgach(contract.ngachLuong || '');
  };

  // Lưu thông tin Lương + Bậc + Ngạch từ modal
  const handleSaveSalaryModal = async () => {
    if (!editingContract) return;
    setIsSavingSalaryModal(true);
    try {
      const trimmed = modalSalary.trim();
      const finalSalary = trimmed ? (formatSalaryDisplay(trimmed) || trimmed) : '';
      const bac = modalBac.trim();
      const ngach = modalNgach.trim();

      const res = await api.updateContract(editingContract.id, {
        probationSalary: finalSalary,
        bacLuong: bac,
        ngachLuong: ngach,
      });

      if (editingContract.status === 'Hiệu lực' && editingContract.employeeId) {
        await api.updateProbationSalary(editingContract.employeeId, {
          luongThuViec: finalSalary,
          bacLuong: bac,
          ngachLuong: ngach,
        }, undefined);
        await onUpdateEmployee(editingContract.employeeId, {
          luongThuViec: finalSalary,
          bacLuong: bac,
          ngachLuong: ngach,
        });
      }

      setContracts((prev) =>
        prev.map((item) =>
          item.id === editingContract.id
            ? { ...item, ...res.contract, probationSalary: finalSalary, bacLuong: bac, ngachLuong: ngach }
            : item
        )
      );
      await loadContracts();
      setEditingContract(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Lỗi cập nhật Lương, Bậc, Ngạch');
    } finally {
      setIsSavingSalaryModal(false);
    }
  };

  // Áp dụng lương thử việc hàng loạt cho các hợp đồng đã chọn
  const handleBatchApplySalary = async () => {
    if (!batchSalaryValue.trim() && !batchBacValue.trim() && !batchNgachValue.trim()) {
      setNotification({
        isOpen: true,
        type: 'warning',
        title: 'Chưa nhập thông tin',
        message: 'Vui lòng nhập ít nhất một thông tin: Lương, Bậc hoặc Ngạch cần áp dụng.',
        confirmText: 'Đã hiểu',
      });
      return;
    }
    const selectedList = typeContracts.filter((c) => selectedContractIds.has(c.id));
    if (selectedList.length === 0) {
      setNotification({
        isOpen: true,
        type: 'warning',
        title: 'Chưa chọn hợp đồng',
        message: 'Vui lòng tích chọn ít nhất 1 hợp đồng để áp dụng hàng loạt.',
        confirmText: 'Đã hiểu',
      });
      return;
    }

    setIsBatchSaving(true);
    try {
      const formattedSalary = batchSalaryValue.trim()
        ? formatSalaryDisplay(batchSalaryValue.trim()) || batchSalaryValue.trim()
        : undefined;
      const bac = batchBacValue.trim() || undefined;
      const ngach = batchNgachValue.trim() || undefined;

      for (const c of selectedList) {
        const contractPayload: Partial<ContractRecord> = {};
        if (formattedSalary !== undefined) contractPayload.probationSalary = formattedSalary;
        if (bac !== undefined) contractPayload.bacLuong = bac;
        if (ngach !== undefined) contractPayload.ngachLuong = ngach;
        await api.updateContract(c.id, contractPayload);

        if (c.status === 'Hiệu lực' && c.employeeId) {
          const empPayload: { luongThuViec?: string; bacLuong?: string; ngachLuong?: string } = {};
          if (formattedSalary !== undefined) empPayload.luongThuViec = formattedSalary;
          if (bac !== undefined) empPayload.bacLuong = bac;
          if (ngach !== undefined) empPayload.ngachLuong = ngach;
          await api.updateProbationSalary(c.employeeId, empPayload, undefined);
          await onUpdateEmployee(c.employeeId, empPayload);
        }
      }
      await loadContracts();
      setIsBatchSalaryModalOpen(false);
      setBatchSalaryValue('');
      setBatchBacValue('');
      setBatchNgachValue('');

      setNotification({
        isOpen: true,
        type: 'success',
        title: 'Áp dụng hàng loạt thành công!',
        message: `Đã cập nhật Lương, Bậc, Ngạch cho ${selectedList.length} hợp đồng được chọn.`,
        stats: [
          {
            label: 'Hợp đồng cập nhật',
            value: selectedList.length,
            sublabel: 'Áp dụng thành công',
            color: 'emerald',
          },
        ],
        confirmText: 'Hoàn tất & Đóng',
      });
    } catch (err) {
      setNotification({
        isOpen: true,
        type: 'error',
        title: 'Lỗi cập nhật',
        message: 'Không thể áp dụng lương hàng loạt.',
        note: err instanceof Error ? err.message : 'Vui lòng kiểm tra lại.',
        confirmText: 'Đóng',
      });
    } finally {
      setIsBatchSaving(false);
    }
  };

  // Cập nhật trạng thái Đã ký / Chưa ký hợp đồng cho 1 hợp đồng
  const handleToggleSigned = async (contract: ContractRecord, isSigned: boolean) => {
    try {
      const today = new Date().toLocaleDateString('vi-VN');
      const signDate = isSigned ? (contract.signDate || contract.startDate || today) : '';

      if (contract.id.startsWith('emp_ctr_')) {
        await api.toggleContractSigned({
          employeeIds: [contract.employeeId],
          isSigned,
          signDate,
        });
      } else {
        await api.updateContract(contract.id, { signDate });
        if (contract.status === 'Hiệu lực' && contract.employeeId) {
          await api.toggleContractSigned({
            employeeIds: [contract.employeeId],
            isSigned,
            signDate,
          });
        }
      }

      await loadContracts();
      if (onRefreshData) onRefreshData();

      setNotification({
        isOpen: true,
        type: 'success',
        title: isSigned ? 'Đã xác nhận ký hợp đồng' : 'Đã chuyển về chưa ký',
        message: `Hợp đồng ${contract.contractNumber ? `#${contract.contractNumber} ` : ''}của ${contract.fullName || ''} (${contract.msnv || ''}) đã được cập nhật: ${
          isSigned ? 'ĐÃ KÝ HỢP ĐỒNG' : 'CHƯA KÝ HỢP ĐỒNG'
        }.`,
        confirmText: 'Đã hiểu',
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Lỗi cập nhật trạng thái ký');
    }
  };

  // Đánh dấu Đã ký / Chưa ký cho nhiều hợp đồng đang chọn
  const handleBatchToggleSigned = async (isSigned: boolean) => {
    const selectedList = typeContracts.filter((c) => selectedContractIds.has(c.id));
    if (selectedList.length === 0) return;
    try {
      const today = new Date().toLocaleDateString('vi-VN');
      const empIdsForSync: string[] = [];

      for (const c of selectedList) {
        const signDate = isSigned ? (c.signDate || c.startDate || today) : '';
        if (c.id.startsWith('emp_ctr_')) {
          empIdsForSync.push(c.employeeId);
        } else {
          await api.updateContract(c.id, { signDate });
          if (c.status === 'Hiệu lực' && c.employeeId) {
            empIdsForSync.push(c.employeeId);
          }
        }
      }

      if (empIdsForSync.length > 0) {
        const res = await api.toggleContractSigned({
          employeeIds: Array.from(new Set(empIdsForSync)),
          isSigned,
          signDate: today,
        });
        if (onBatchUpdateEmployees && res.updatedEmployees) {
          const updatedMap = new Map(res.updatedEmployees.map((e) => [e.id, e]));
          onBatchUpdateEmployees(employees.map((e) => updatedMap.get(e.id) || e));
        }
      }

      await loadContracts();
      if (onRefreshData) onRefreshData();
      setSelectedContractIds(new Set());

      setNotification({
        isOpen: true,
        type: 'success',
        title: 'Cập nhật trạng thái ký hàng loạt',
        message: `Đã đánh dấu ${selectedList.length} hợp đồng là: ${
          isSigned ? 'ĐÃ KÝ HỢP ĐỒNG' : 'CHƯA KÝ HỢP ĐỒNG'
        }.`,
        confirmText: 'Đóng',
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Lỗi cập nhật trạng thái ký hàng loạt');
    }
  };

  // Mở modal tạo/in hợp đồng cho danh sách đã chọn
  const handleOpenDocGenerator = (targetList: Employee[]) => {
    if (targetList.length === 0) {
      setNotification({
        isOpen: true,
        type: 'warning',
        title: 'Chưa chọn hợp đồng',
        message: 'Vui lòng tích chọn ít nhất một hợp đồng để tạo hoặc in văn bản.',
        confirmText: 'Đã hiểu',
      });
      return;
    }
    setGeneratorTargetEmployees(targetList);
    setIsDocGeneratorOpen(true);
  };

  // Xuất file CSV / Excel danh sách Hợp đồng
  const handleExportCsv = () => {
    const list = displayedContracts;
    if (list.length === 0) {
      alert('Không có dữ liệu để xuất file.');
      return;
    }

    const headers = [
      'STT',
      'Số hợp đồng',
      'Loại hợp đồng',
      'Trạng thái HĐ',
      'Tình trạng ký',
      'Ngày ký',
      'Mã nhân viên',
      'Họ và tên',
      'Khối',
      'Phòng ban',
      'Chức vụ',
      'Thời hạn',
      'Từ ngày',
      'Đến ngày',
      isTraining ? 'Lương / Phụ cấp đào tạo' : 'Lương thử việc',
      'Bậc lương',
      'Ngạch lương',
      'Số điện thoại',
    ];

    const rows = list.map((c, idx) => {
      const emp = employeeMap.get(c.employeeId);
      const salaryDisplay = formatSalaryDisplay(c.probationSalary || c.salary);
      return [
        idx + 1,
        `"${(c.contractNumber || '').replace(/"/g, '""')}"`,
        c.contractType || '',
        c.status || '',
        c.isSigned ? 'Đã ký' : 'Chưa ký',
        c.signDate || '',
        c.msnv || emp?.msnv || '',
        `"${(c.fullName || emp?.fullName || '').replace(/"/g, '""')}"`,
        `"${(emp?.khoi || '').replace(/"/g, '""')}"`,
        `"${(c.department || emp?.phongBan || emp?.department || '').replace(/"/g, '""')}"`,
        `"${(c.position || emp?.chucVu || '').replace(/"/g, '""')}"`,
        c.duration || '',
        c.startDate || '',
        c.endDate || '',
        `"${salaryDisplay.replace(/"/g, '""')}"`,
        `"${(c.bacLuong || '').replace(/"/g, '""')}"`,
        `"${(c.ngachLuong || '').replace(/"/g, '""')}"`,
        emp?.soDienThoai || '',
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = isTraining
      ? `Danh_Sach_Hop_Dong_Dao_Tao_${new Date().toISOString().slice(0, 10)}.csv`
      : `Danh_Sach_Hop_Dong_Thu_Viec_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* 1. HEADER CHÍNH CỦA MODULE HỢP ĐỒNG */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className={`w-10 h-10 rounded-xl ${isTraining ? 'bg-emerald-50 border border-emerald-200/60 text-emerald-700' : 'bg-blue-50 border border-blue-200/60 text-blue-700'} flex items-center justify-center`}>
              {isTraining ? <GraduationCap className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                {isTraining ? 'Quản Lý Hợp Đồng Đào Tạo' : 'Quản Lý Hợp Đồng Thử Việc'}
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${isTraining ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-blue-100 text-blue-800 border border-blue-200'}`}>
                  {isTraining ? 'Phân hệ HĐĐT' : 'Phân hệ HĐTV'}
                </span>
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                {isTraining
                  ? 'Quản lý danh sách Hợp đồng đào tạo (HĐĐT), ưu tiên hiển thị hợp đồng vừa ký mới nhất lên đầu'
                  : 'Quản lý danh sách Hợp đồng thử việc (HĐTV), ưu tiên hiển thị hợp đồng vừa ký mới nhất lên đầu'}
              </p>
            </div>
          </div>
        </div>

        {/* Nút thao tác nhanh trên Header */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={loadContracts}
            disabled={isLoadingContracts}
            className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-2 shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
            title="Tải lại danh sách hợp đồng"
          >
            <RefreshCw className={`w-4 h-4 text-slate-500 ${isLoadingContracts ? 'animate-spin' : ''}`} />
            Làm mới
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-2 shadow-2xs transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-500" />
            Xuất Excel
          </button>

          <button
            type="button"
            onClick={() => setIsImportSalaryModalOpen(true)}
            className={`px-3.5 py-2 text-xs font-semibold rounded-xl border flex items-center gap-2 shadow-2xs transition-colors cursor-pointer ${
              isTraining
                ? 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800'
                : 'border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-800'
            }`}
            title="Import file Excel để cập nhật Lương, Bậc, Ngạch theo MSNV"
          >
            <Upload className={`w-4 h-4 ${isTraining ? 'text-emerald-700' : 'text-blue-700'}`} />
            Import Excel Lương / Bậc / Ngạch
          </button>

          {selectedContractIds.size > 0 && (
            <>
              <button
                type="button"
                onClick={() => handleBatchToggleSigned(true)}
                className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-teal-600 hover:bg-teal-700 text-white flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                title="Đánh dấu toàn bộ hợp đồng được chọn là đã ký"
              >
                <CheckCircle2 className="w-4 h-4" />
                Đánh dấu đã ký ({selectedContractIds.size})
              </button>

              <button
                type="button"
                onClick={() => setIsBatchSalaryModalOpen(true)}
                className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-amber-500 hover:bg-amber-600 text-white flex items-center gap-2 shadow-2xs transition-colors cursor-pointer"
              >
                <DollarSign className="w-4 h-4" />
                Nhập lương hàng loạt ({selectedContractIds.size})
              </button>

              <button
                type="button"
                onClick={() => {
                  const selectedTargets = typeContracts
                    .filter((c) => selectedContractIds.has(c.id))
                    .map((c) => buildEmployeeForContract(c));
                  handleOpenDocGenerator(selectedTargets);
                }}
                className={`px-4 py-2 text-xs font-semibold rounded-xl ${isTraining ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'} text-white flex items-center gap-2 shadow-xs transition-colors cursor-pointer`}
              >
                <Printer className="w-4 h-4" />
                {isTraining ? 'Tạo / In HĐ Đào Tạo' : 'Tạo / In HĐ Thử Việc'} ({selectedContractIds.size})
              </button>
            </>
          )}
        </div>
      </div>

      {/* 2. THẺ THỐNG KÊ KPI CHO HỢP ĐỒNG (Bấm để lọc nhanh) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Tổng hợp đồng */}
        <button
          type="button"
          onClick={() => {
            setSigningFilter('all');
            setCurrentPage(1);
          }}
          className={`text-left bg-white rounded-2xl border p-4 shadow-2xs flex items-center gap-3.5 transition-all cursor-pointer ${
            signingFilter === 'all'
              ? 'border-blue-400 ring-2 ring-blue-500/20'
              : 'border-slate-200/80 hover:border-slate-300'
          }`}
        >
          <div className={`w-11 h-11 rounded-xl ${isTraining ? 'bg-emerald-50 border border-emerald-200/60 text-emerald-600' : 'bg-blue-50 border border-blue-200/60 text-blue-600'} flex items-center justify-center shrink-0`}>
            {isTraining ? <GraduationCap className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">
              {isTraining ? 'Tổng hợp đồng đào tạo' : 'Tổng hợp đồng thử việc'}
            </p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">{contractStats.total}</p>
          </div>
        </button>

        {/* Card 2: Đã ký hợp đồng (vừa ký) */}
        <button
          type="button"
          onClick={() => {
            setSigningFilter('signed');
            setCurrentPage(1);
          }}
          className={`text-left rounded-2xl border p-4 shadow-2xs flex items-center gap-3.5 bg-emerald-50/40 transition-all cursor-pointer ${
            signingFilter === 'signed'
              ? 'border-emerald-500 ring-2 ring-emerald-500/20'
              : 'border-emerald-200/90 hover:border-emerald-300'
          }`}
        >
          <div className="w-11 h-11 rounded-xl bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
            <FileCheck className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-bold text-emerald-800">
              Hợp đồng đã ký (mới nhất)
            </p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl font-bold text-emerald-700">{contractStats.signedCount}</span>
              <span className="text-xs text-emerald-600 font-semibold">
                ({contractStats.total > 0 ? Math.round((contractStats.signedCount / contractStats.total) * 100) : 0}%)
              </span>
            </div>
          </div>
        </button>

        {/* Card 3: Chưa ký hợp đồng */}
        <button
          type="button"
          onClick={() => {
            setSigningFilter('unsigned');
            setCurrentPage(1);
          }}
          className={`text-left rounded-2xl border p-4 shadow-2xs flex items-center gap-3.5 bg-amber-50/30 transition-all cursor-pointer ${
            signingFilter === 'unsigned'
              ? 'border-amber-500 ring-2 ring-amber-500/20'
              : 'border-amber-200/90 hover:border-amber-300'
          }`}
        >
          <div className="w-11 h-11 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0">
            <FileSignature className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-bold text-amber-800">
              Chưa ký hợp đồng
            </p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl font-bold text-amber-700">{contractStats.unsignedCount}</span>
              <span className="text-xs text-amber-600 font-medium">chờ ký</span>
            </div>
          </div>
        </button>

        {/* Card 4: Đã nhập lương / phụ cấp */}
        <button
          type="button"
          onClick={() => {
            setSalaryFilter((prev) => (prev === 'has_salary' ? 'all' : 'has_salary'));
            setCurrentPage(1);
          }}
          className={`text-left rounded-2xl border p-4 shadow-2xs flex items-center gap-3.5 bg-blue-50/20 transition-all cursor-pointer ${
            salaryFilter === 'has_salary'
              ? 'border-blue-500 ring-2 ring-blue-500/20'
              : 'border-blue-200/90 hover:border-blue-300'
          }`}
        >
          <div className="w-11 h-11 rounded-xl bg-blue-100/70 border border-blue-200 flex items-center justify-center text-blue-700 shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-blue-800">
              {isTraining ? 'Đã nhập phụ cấp' : 'Đã nhập lương'}
            </p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl font-bold text-blue-700">{contractStats.withSalary}</span>
              <span className="text-xs text-blue-600">
                ({contractStats.total > 0 ? Math.round((contractStats.withSalary / contractStats.total) * 100) : 0}%)
              </span>
            </div>
          </div>
        </button>
      </div>

      {/* 4. THANH CÔNG CỤ TÌM KIẾM VÀ LỌC */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex flex-wrap items-center gap-3">
        {/* Tìm kiếm */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm theo Số HĐ, Tên, MSNV, phòng ban, chức vụ..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 bg-slate-50/50"
          />
        </div>

        {/* Lọc theo Khối */}
        <div className="min-w-[150px]">
          <select
            value={selectedDivision}
            onChange={(e) => {
              setSelectedDivision(e.target.value);
              setSelectedDepartment('all');
              setCurrentPage(1);
            }}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 bg-white"
          >
            <option value="all">Tất cả Khối</option>
            {divisions.map((div) => (
              <option key={div.id} value={div.name}>
                {div.name}
              </option>
            ))}
          </select>
        </div>

        {/* Lọc theo Phòng ban */}
        <div className="min-w-[170px]">
          <select
            value={selectedDepartment}
            onChange={(e) => {
              setSelectedDepartment(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 bg-white"
          >
            <option value="all">Tất cả Phòng ban</option>
            {filteredDepartments.map((dept) => (
              <option key={dept.id} value={dept.name}>
                {dept.code ? `[${dept.code}] ` : ''}
                {dept.name}
              </option>
            ))}
          </select>
        </div>

        {/* Lọc theo trạng thái ký hợp đồng */}
        <div className="min-w-[190px]">
          <select
            value={signingFilter}
            onChange={(e) => {
              setSigningFilter(e.target.value as 'all' | 'signed' | 'unsigned');
              setCurrentPage(1);
            }}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 bg-white font-semibold text-slate-700"
          >
            <option value="signed">✓ Đã ký / Vừa ký ({contractStats.signedCount})</option>
            <option value="all">Tất cả hợp đồng ({contractStats.total})</option>
            <option value="unsigned">⏳ Chưa ký hợp đồng ({contractStats.unsignedCount})</option>
          </select>
        </div>

        {/* Lọc theo trạng thái hợp đồng */}
        <div className="min-w-[140px]">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 bg-white"
          >
            <option value="all">Mọi trạng thái</option>
            <option value="Hiệu lực">Hiệu lực</option>
            <option value="Đã tái ký">Đã tái ký</option>
            <option value="Hết hiệu lực">Hết hiệu lực</option>
            <option value="Đã chấm dứt">Đã chấm dứt</option>
          </select>
        </div>

        {/* Lọc theo trạng thái lương */}
        <div className="min-w-[155px]">
          <select
            value={salaryFilter}
            onChange={(e) => {
              setSalaryFilter(e.target.value as 'all' | 'has_salary' | 'no_salary');
              setCurrentPage(1);
            }}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 bg-white"
          >
            <option value="all">Tất cả mức lương</option>
            <option value="has_salary">
              {isTraining ? 'Đã có lương / phụ cấp' : 'Đã có lương thử việc'}
            </option>
            <option value="no_salary">
              {isTraining ? 'Chưa có lương / phụ cấp' : 'Chưa có lương thử việc'}
            </option>
          </select>
        </div>

        {/* Nút tạo hợp đồng cho toàn bộ danh sách đang lọc */}
        {displayedContracts.length > 0 && (
          <button
            type="button"
            onClick={() => handleOpenDocGenerator(displayedContracts.map((c) => buildEmployeeForContract(c)))}
            className={`px-3.5 py-2 text-xs font-semibold rounded-xl border ${
              isTraining
                ? 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
                : 'border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700'
            } flex items-center gap-1.5 transition-colors cursor-pointer ml-auto`}
            title={
              isTraining
                ? 'Mở cửa sổ tạo văn bản hợp đồng đào tạo cho toàn bộ hợp đồng đang hiển thị'
                : 'Mở cửa sổ tạo văn bản hợp đồng thử việc cho toàn bộ hợp đồng đang hiển thị'
            }
          >
            <Sparkles className={`w-3.5 h-3.5 ${isTraining ? 'text-emerald-600' : 'text-blue-600'}`} />
            Tạo HĐ cho tất cả ({displayedContracts.length})
          </button>
        )}
      </div>

      {/* 5. BẢNG DANH SÁCH HỢP ĐỒNG */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {contractsError && (
          <div className="p-4 bg-rose-50 border-b border-rose-200 text-xs text-rose-700 flex items-center justify-between gap-3">
            <span>{contractsError}</span>
            <button
              type="button"
              onClick={loadContracts}
              className="px-3 py-1 rounded-lg bg-rose-600 text-white font-semibold hover:bg-rose-700 cursor-pointer"
            >
              Thử lại
            </button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={
                      displayedContracts.length > 0 &&
                      selectedContractIds.size === displayedContracts.length
                    }
                    onChange={handleToggleSelectAll}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </th>
                <th className="py-3 px-4 w-12 text-center">STT</th>
                <th className="py-3 px-4 min-w-[165px]">Số HĐ &amp; Trạng thái</th>
                <th className="py-3 px-4 min-w-[200px]">Nhân viên</th>
                <th className="py-3 px-4 min-w-[150px]">Chức vụ &amp; Công việc</th>
                <th className="py-3 px-4 min-w-[165px]">Tình trạng ký HĐ</th>
                <th className="py-3 px-4 w-36">
                  {isTraining ? 'Thời gian đào tạo' : 'Thời gian thử việc'}
                </th>
                <th className="py-3 px-4 min-w-[240px]">
                  <div className="flex items-center gap-1.5 text-blue-700">
                    <DollarSign className="w-3.5 h-3.5" />
                    <span>Lương + Bậc + Ngạch</span>
                  </div>
                </th>
                <th className="py-3 px-4 text-center w-20">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {isLoadingContracts && contracts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    <RefreshCw className="w-7 h-7 mx-auto mb-2 text-blue-500 animate-spin" />
                    <p className="font-medium">Đang tải danh sách hợp đồng...</p>
                  </td>
                </tr>
              ) : displayedContracts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <FileText className="w-10 h-10 mx-auto mb-2 text-slate-300 stroke-[1.5]" />
                    <p className="font-medium text-slate-500">
                      {signingFilter === 'signed'
                        ? isTraining
                          ? 'Chưa có Hợp đồng đào tạo (HĐĐT) nào đã ký phù hợp bộ lọc.'
                          : 'Chưa có Hợp đồng thử việc (HĐTV) nào đã ký phù hợp bộ lọc.'
                        : isTraining
                        ? 'Không tìm thấy Hợp đồng đào tạo (HĐĐT) phù hợp bộ lọc.'
                        : 'Không tìm thấy Hợp đồng thử việc (HĐTV) phù hợp bộ lọc.'}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Hãy thử đổi bộ lọc trạng thái ký hoặc từ khóa tìm kiếm.
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedContracts.map((contract, index) => {
                  const emp = employeeMap.get(contract.employeeId);
                  const isSelected = selectedContractIds.has(contract.id);
                  const salaryText = (contract.probationSalary || contract.salary || '').trim();
                  const hasSalaryData = Boolean(
                    salaryText || (contract.bacLuong || '').trim() || (contract.ngachLuong || '').trim()
                  );
                  const displayName = contract.fullName || emp?.fullName || 'Chưa có tên';
                  const displayMsnv = contract.msnv || emp?.msnv || '';
                  const displayDept = contract.department || emp?.phongBan || emp?.department || '';
                  const displayPosition = contract.position || emp?.chucVu || emp?.jobTitle || 'Chưa cập nhật';
                  const displayPhoto = contract.photoUrl || emp?.photoUrl || '';

                  return (
                    <tr
                      key={contract.id}
                      className={`hover:bg-slate-50/70 transition-colors ${
                        isSelected ? 'bg-blue-50/40' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(contract.id)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>

                      {/* STT */}
                      <td className="py-3 px-4 text-center text-slate-400 font-mono text-[11px]">
                        {(safeCurrentPage - 1) * pageSize + index + 1}
                      </td>

                      {/* Số HĐ & Loại HĐ & Trạng thái */}
                      <td className="py-3 px-4">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200/70 px-2 py-0.5 rounded-md text-xs">
                              {contract.contractNumber ? `#${contract.contractNumber}` : 'Chưa cấp số'}
                            </span>
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                isTraining
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  : 'bg-amber-100 text-amber-800 border border-amber-200'
                              }`}
                            >
                              {contract.contractType || (isTraining ? 'HĐĐT' : 'HĐTV')}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadgeClass(
                                contract.status
                              )}`}
                            >
                              {contract.status || 'Hiệu lực'}
                            </span>
                            {contract.duration && (
                              <span className="text-[11px] text-slate-500 font-medium">
                                {contract.duration}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Thông tin nhân viên */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center font-bold text-slate-600 text-xs">
                            {displayPhoto ? (
                              <img
                                src={displayPhoto}
                                alt={displayName}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              displayName.slice(0, 2).toUpperCase()
                            )}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 leading-tight">{displayName}</p>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              <span className="font-mono text-[11px] font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200/50">
                                {displayMsnv || 'Chưa có mã'}
                              </span>
                              {emp?.gioiTinh && (
                                <span className="text-[11px] text-slate-500">{emp.gioiTinh}</span>
                              )}
                            </div>
                            {displayDept && (
                              <p className="text-[11px] text-slate-500 mt-0.5 truncate max-w-[190px]">
                                {displayDept}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Chức vụ & Công việc */}
                      <td className="py-3 px-4">
                        <p className="font-semibold text-slate-800">{displayPosition}</p>
                        {emp?.congViec && emp.congViec !== displayPosition && (
                          <p className="text-[11px] text-slate-500 mt-0.5 truncate max-w-[160px]">
                            {emp.congViec}
                          </p>
                        )}
                      </td>

                      {/* Tình trạng ký hợp đồng */}
                      <td className="py-3 px-4">
                        {contract.isSigned ? (
                          <div className="flex flex-col gap-1 items-start">
                            <button
                              type="button"
                              onClick={() => handleToggleSigned(contract, false)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs transition-colors cursor-pointer group"
                              title="Bấm để chuyển về Chưa ký"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 group-hover:scale-110 transition-transform" />
                              <span>Đã ký hợp đồng</span>
                            </button>
                            {contract.signDate && (
                              <span className="text-[11px] text-emerald-700 font-semibold font-mono-num pl-1">
                                Ngày ký: {contract.signDate}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1 items-start">
                            <button
                              type="button"
                              onClick={() => handleToggleSigned(contract, true)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 shadow-2xs transition-all cursor-pointer group"
                              title="Bấm để xác nhận hợp đồng này đã ký"
                            >
                              <Clock className="w-3.5 h-3.5 text-amber-600 group-hover:scale-110 transition-transform" />
                              <span>Chưa ký HĐ</span>
                              <span className="text-[10px] font-bold text-amber-700 underline ml-0.5">Xác nhận</span>
                            </button>
                            <span className="text-[10px] text-slate-400 pl-1">Chờ ký văn bản</span>
                          </div>
                        )}
                      </td>

                      {/* Thời gian hợp đồng (Từ ngày -> Đến ngày) */}
                      <td className="py-3 px-4 text-slate-700">
                        {contract.startDate || contract.endDate ? (
                          <div className="text-[11px] space-y-0.5">
                            {contract.startDate && (
                              <p>
                                <span className="text-slate-400">Từ:</span>{' '}
                                <span className="font-semibold text-slate-800">{contract.startDate}</span>
                              </p>
                            )}
                            {contract.endDate && (
                              <p>
                                <span className="text-slate-400">Đến:</span>{' '}
                                <span className="font-semibold text-slate-800">{contract.endDate}</span>
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Chưa nhập</span>
                        )}
                      </td>

                      {/* MỤC NHẬP LƯƠNG + BẬC + NGẠCH */}
                      <td className="py-3 px-4">
                        {hasSalaryData ? (
                          <button
                            type="button"
                            onClick={() => handleOpenSalaryModal(contract)}
                            className="w-full text-left p-2 rounded-xl border border-emerald-200/90 bg-emerald-50/50 hover:bg-emerald-100/70 hover:border-emerald-300 transition-all shadow-2xs group cursor-pointer"
                            title="Bấm để chỉnh sửa Lương, Bậc, Ngạch"
                          >
                            <div className="flex items-center justify-between gap-1.5">
                              <span className="font-bold text-xs text-emerald-800 tracking-tight">
                                {formatSalaryDisplay(salaryText) || 'Chưa nhập mức lương'}
                              </span>
                              <Edit3 className="w-3.5 h-3.5 text-emerald-600 opacity-60 group-hover:opacity-100 shrink-0 transition-opacity" />
                            </div>
                            {contract.bacLuong || contract.ngachLuong ? (
                              <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[10px] font-semibold text-emerald-700">
                                {contract.bacLuong && (
                                  <span className="bg-emerald-100/80 px-1.5 py-0.2 rounded border border-emerald-200/60">
                                    Bậc: {contract.bacLuong}
                                  </span>
                                )}
                                {contract.ngachLuong && (
                                  <span className="bg-emerald-100/80 px-1.5 py-0.2 rounded border border-emerald-200/60">
                                    Ngạch: {contract.ngachLuong}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-[10px] text-emerald-600/80 mt-0.5 block">
                                + Thêm Bậc &amp; Ngạch
                              </span>
                            )}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOpenSalaryModal(contract)}
                            className="w-full px-3 py-2 rounded-xl border border-dashed border-blue-300 bg-blue-50/40 hover:bg-blue-100/70 hover:border-blue-400 text-blue-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-2xs group cursor-pointer"
                            title="Bấm để nhập Lương, Bậc, Ngạch cho hợp đồng này"
                          >
                            <Plus className="w-3.5 h-3.5 text-blue-600 group-hover:scale-110 transition-transform" />
                            <span>Nhập Lương + Bậc + Ngạch</span>
                          </button>
                        )}
                      </td>

                      {/* Thao tác: Dấu 3 chấm mở menu thao tác */}
                      <td className="py-3 px-4 text-center">
                        <div className="inline-block text-left">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (actionMenuState && actionMenuState.contract.id === contract.id) {
                                setActionMenuState(null);
                                return;
                              }
                              const rect = e.currentTarget.getBoundingClientRect();
                              const menuHeight = 310;
                              const spaceBelow = window.innerHeight - rect.bottom;
                              const openUpwards = spaceBelow < menuHeight && rect.top > menuHeight;

                              setActionMenuState({
                                contract,
                                top: rect.bottom + 4,
                                bottom: window.innerHeight - rect.top + 4,
                                right: window.innerWidth - rect.right,
                                openUpwards,
                              });
                            }}
                            className={`p-1.5 rounded-lg cursor-pointer transition-colors ${
                              actionMenuState?.contract.id === contract.id
                                ? 'bg-blue-100 text-blue-700'
                                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200'
                            }`}
                            title="Bấm để mở các thao tác"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer phân trang của bảng */}
        <div className="p-4 border-t border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-3">
            <span>
              Đang xem{' '}
              <strong className="font-mono-num text-slate-800">
                {displayedContracts.length === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1}
              </strong>{' '}
              -{' '}
              <strong className="font-mono-num text-slate-800">
                {Math.min(safeCurrentPage * pageSize, displayedContracts.length)}
              </strong>{' '}
              trong tổng số{' '}
              <strong className={`font-mono-num ${isTraining ? 'text-emerald-700' : 'text-blue-700'}`}>
                {displayedContracts.length}
              </strong>{' '}
              hợp đồng
              {selectedContractIds.size > 0 && (
                <span className="ml-2 font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full text-[11px]">
                  Đang chọn: {selectedContractIds.size}
                </span>
              )}
            </span>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">Số dòng:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className={`px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs font-mono-num font-semibold text-slate-700 focus:outline-none ${
                  isTraining ? 'focus:border-emerald-600' : 'focus:border-blue-600'
                } cursor-pointer`}
              >
                <option value={10}>10 / trang</option>
                <option value={20}>20 / trang</option>
                <option value={50}>50 / trang</option>
                <option value={100}>100 / trang</option>
              </select>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={safeCurrentPage <= 1}
                onClick={() => setCurrentPage(1)}
                className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                title="Trang đầu"
              >
                <ChevronsLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={safeCurrentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Trước</span>
              </button>

              {visiblePageNumbers.map((item) =>
                typeof item === 'number' ? (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setCurrentPage(item)}
                    className={`min-w-[30px] h-7 px-2 rounded-lg font-mono-num font-bold text-xs transition-colors cursor-pointer ${
                      item === safeCurrentPage
                        ? isTraining
                          ? 'bg-emerald-700 text-white shadow-2xs'
                          : 'bg-blue-700 text-white shadow-2xs'
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {item}
                  </button>
                ) : (
                  <span
                    key={item}
                    className="px-1.5 text-slate-400 font-mono-num select-none"
                  >
                    ...
                  </span>
                )
              )}

              <button
                type="button"
                disabled={safeCurrentPage >= totalPages}
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
              >
                <span>Sau</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={safeCurrentPage >= totalPages}
                onClick={() => setCurrentPage(totalPages)}
                className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                title="Trang cuối"
              >
                <ChevronsRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Floating Action Menu (Bảng thao tác nổi - không bị che khuất bởi overflow bảng) */}
      {actionMenuState && (
        <>
          <div
            className="fixed inset-0 z-50 bg-transparent"
            onClick={(e) => {
              e.stopPropagation();
              setActionMenuState(null);
            }}
          />
          <div
            style={{
              position: 'fixed',
              top: actionMenuState.openUpwards ? undefined : actionMenuState.top,
              bottom: actionMenuState.openUpwards ? actionMenuState.bottom : undefined,
              right: Math.max(16, actionMenuState.right),
            }}
            className="z-50 w-60 bg-white border border-slate-200 rounded-2xl shadow-2xl py-2 text-left text-xs animate-in fade-in zoom-in-95 duration-100"
          >
            {/* Header của bảng thao tác */}
            <div className="px-3.5 py-1.5 border-b border-slate-100 flex items-center justify-between">
              <span className="font-bold text-[10px] text-slate-400 uppercase tracking-wider">
                Thao tác hợp đồng
              </span>
              <span className="text-[10px] font-mono-num font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                {actionMenuState.contract.contractNumber
                  ? `#${actionMenuState.contract.contractNumber}`
                  : actionMenuState.contract.msnv}
              </span>
            </div>

            <div className="px-3.5 py-1 font-bold text-slate-900 text-xs truncate">
              {actionMenuState.contract.fullName || 'Nhân viên'}
            </div>

            <div className="py-1">
              {/* THAO TÁC 0: Xem lịch sử hợp đồng */}
              <button
                type="button"
                onClick={() => {
                  const targetContract = actionMenuState.contract;
                  setActionMenuState(null);
                  setViewingHistoryEmployee(buildEmployeeForContract(targetContract));
                }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-blue-700 hover:bg-blue-50 cursor-pointer transition-colors group font-semibold"
              >
                <History className="w-3.5 h-3.5 text-blue-600" />
                <span>Xem lịch sử hợp đồng</span>
              </button>

              {/* THAO TÁC KÝ HỢP ĐỒNG: Đánh dấu đã ký / chưa ký */}
              <button
                type="button"
                onClick={() => {
                  const targetContract = actionMenuState.contract;
                  setActionMenuState(null);
                  handleToggleSigned(targetContract, !targetContract.isSigned);
                }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors group"
              >
                {actionMenuState.contract.isSigned ? (
                  <>
                    <XCircle className="w-3.5 h-3.5 text-amber-500" />
                    <span className="font-medium text-amber-700">Hủy đánh dấu đã ký HĐ</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="font-medium text-emerald-700">Đánh dấu đã ký HĐ</span>
                  </>
                )}
              </button>

              {/* THAO TÁC 1: In / Tạo văn bản Hợp đồng */}
              <button
                type="button"
                onClick={() => {
                  const targetContract = actionMenuState.contract;
                  setActionMenuState(null);
                  handleOpenDocGenerator([buildEmployeeForContract(targetContract)]);
                }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-slate-700 hover:bg-blue-50 hover:text-blue-700 cursor-pointer transition-colors group"
              >
                <Printer className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600" />
                <span className="font-medium">
                  {isTraining ? 'Tạo / In HĐ đào tạo' : 'Tạo / In HĐ thử việc'}
                </span>
              </button>

              {/* THAO TÁC: Tái ký hợp đồng */}
              <button
                type="button"
                onClick={() => {
                  const targetContract = actionMenuState.contract;
                  setActionMenuState(null);
                  setRenewingEmployee(buildEmployeeForContract(targetContract));
                }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 cursor-pointer transition-colors group"
              >
                <FileSignature className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600" />
                <span className="font-medium">Tái ký hợp đồng</span>
              </button>

              {/* THAO TÁC 2: Nhập Lương, Bậc, Ngạch */}
              <button
                type="button"
                onClick={() => {
                  const targetContract = actionMenuState.contract;
                  setActionMenuState(null);
                  handleOpenSalaryModal(targetContract);
                }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 cursor-pointer transition-colors group"
              >
                <Edit3 className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600" />
                <span className="font-medium">Nhập Lương, Bậc, Ngạch</span>
              </button>

              {/* THAO TÁC 3: Chấm dứt hợp đồng (chỉ hiển thị khi hợp đồng còn hiệu lực) */}
              {actionMenuState.contract.status !== 'Đã chấm dứt' && (
                <div className="pt-1 mt-1 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      const targetContract = actionMenuState.contract;
                      setActionMenuState(null);
                      setTerminatingTarget({
                        employee: buildEmployeeForContract(targetContract),
                        contract: targetContract,
                      });
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-red-600 hover:bg-red-50 hover:text-red-700 cursor-pointer transition-colors group font-semibold"
                  >
                    <div className="p-1 rounded-md bg-red-100 text-red-600 group-hover:bg-red-600 group-hover:text-white transition-colors">
                      <FileX className="w-3.5 h-3.5" />
                    </div>
                    <span>Chấm dứt hợp đồng</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ===================================================================== */}
      {/* 6. MODAL NHẬP LƯƠNG + BẬC + NGẠCH CHO 1 HỢP ĐỒNG */}
      {/* ===================================================================== */}
      {editingContract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            {/* Header modal */}
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0 border border-blue-200/60">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 leading-tight">
                    Nhập Lương + Bậc + Ngạch
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {editingContract.contractNumber ? `HĐ #${editingContract.contractNumber} • ` : ''}
                    {editingContract.fullName} ({editingContract.msnv})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingContract(null)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form inputs */}
            <div className="space-y-4 py-4">
              {/* 1. Mức lương */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-blue-600" />
                    <span>
                      {isTraining
                        ? '1. Mức lương / phụ cấp đào tạo:'
                        : '1. Mức lương thử việc:'}
                    </span>
                  </label>
                  {modalSalary && (
                    <button
                      type="button"
                      onClick={() => setModalSalary('')}
                      className="text-[11px] text-rose-600 hover:text-rose-800 font-medium cursor-pointer"
                    >
                      Xóa mức lương
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="VD: 500,000 hoặc 5,900,000..."
                    value={modalSalary}
                    onChange={(e) => handleCurrencyInputChange(e, setModalSalary)}
                    onKeyDown={(e) => handleCurrencyKeyDown(e, modalSalary, setModalSalary)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:border-blue-600 font-semibold text-slate-900"
                    autoFocus
                  />
                  {modalSalary && (
                    <button
                      type="button"
                      onClick={() => setModalSalary('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 hover:text-slate-600 flex items-center justify-center cursor-pointer"
                      title="Xóa trắng mức lương"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Gợi ý nhanh mức lương */}
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {['5,000,000', '5,900,000', '6,000,000', '7,000,000', '8,000,000', '85% lương'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setModalSalary(preset)}
                      className="px-2 py-0.5 text-[11px] rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-600 font-medium transition-colors cursor-pointer"
                    >
                      {preset}
                    </button>
                  ))}
                  {modalSalary && (
                    <button
                      type="button"
                      onClick={() => setModalSalary('')}
                      className="px-2 py-0.5 text-[11px] rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-medium transition-colors cursor-pointer"
                    >
                      Xóa trống
                    </button>
                  )}
                </div>
              </div>

              {/* 2. Bậc lương */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-emerald-600" />
                  <span>2. Bậc lương:</span>
                </label>
                <input
                  type="text"
                  placeholder="VD: Bậc 1, Bậc 2, 1/7, 2/7..."
                  value={modalBac}
                  onChange={(e) => setModalBac(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:border-emerald-600 font-medium text-slate-900"
                />
                {/* Gợi ý nhanh Bậc */}
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {['Bậc 1', 'Bậc 2', 'Bậc 3', 'Bậc 4', '1/7', '2/7'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setModalBac(preset)}
                      className="px-2 py-0.5 text-[11px] rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-600 font-medium transition-colors cursor-pointer"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. Ngạch lương */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-purple-600" />
                  <span>3. Ngạch lương / Vị trí ngạch:</span>
                </label>
                <input
                  type="text"
                  placeholder="VD: Công nhân kỹ thuật, Chuyên viên, Nhân viên..."
                  value={modalNgach}
                  onChange={(e) => setModalNgach(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:border-purple-600 font-medium text-slate-900"
                />
                {/* Gợi ý nhanh Ngạch */}
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {['Công nhân', 'Nhân viên', 'Chuyên viên', 'Kỹ thuật viên', 'Cán sự'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setModalNgach(preset)}
                      className="px-2 py-0.5 text-[11px] rounded-lg bg-slate-100 hover:bg-purple-50 hover:text-purple-700 text-slate-600 font-medium transition-colors cursor-pointer"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer modal */}
            <div className="flex items-center justify-end gap-2.5 pt-3.5 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingContract(null)}
                disabled={isSavingSalaryModal}
                className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleSaveSalaryModal}
                disabled={isSavingSalaryModal}
                className="px-5 py-2 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                {isSavingSalaryModal ? 'Đang lưu...' : 'Lưu thông tin'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 7. MODAL NHẬP LƯƠNG + BẬC + NGẠCH HÀNG LOẠT (KHI CHỌN NHIỀU HỢP ĐỒNG) */}
      {/* ===================================================================== */}
      {isBatchSalaryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <DollarSign className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Nhập Lương, Bậc &amp; Ngạch hàng loạt
                </h3>
                <p className="text-xs text-slate-500">
                  Áp dụng chung cho {selectedContractIds.size} hợp đồng đã chọn
                </p>
              </div>
            </div>

            <div className="space-y-3.5 my-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700">
                    {isTraining
                      ? 'Mức lương / phụ cấp đào tạo áp dụng:'
                      : 'Mức lương thử việc áp dụng:'}
                  </label>
                  {batchSalaryValue && (
                    <button
                      type="button"
                      onClick={() => setBatchSalaryValue('')}
                      className="text-[11px] text-rose-600 hover:text-rose-800 font-medium cursor-pointer"
                    >
                      Xóa mức lương
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="VD: 500,000 hoặc 5,900,000..."
                    value={batchSalaryValue}
                    onChange={(e) => handleCurrencyInputChange(e, setBatchSalaryValue)}
                    onKeyDown={(e) => handleCurrencyKeyDown(e, batchSalaryValue, setBatchSalaryValue)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:border-blue-600 font-medium"
                  />
                  {batchSalaryValue && (
                    <button
                      type="button"
                      onClick={() => setBatchSalaryValue('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 hover:text-slate-600 flex items-center justify-center cursor-pointer"
                      title="Xóa trắng mức lương"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1.5">
                  {['5,000,000', '5,900,000', '6,000,000', '7,000,000', '8,000,000', '85% lương'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setBatchSalaryValue(preset)}
                      className="px-2 py-0.5 text-[11px] rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors cursor-pointer"
                    >
                      {preset}
                    </button>
                  ))}
                  {batchSalaryValue && (
                    <button
                      type="button"
                      onClick={() => setBatchSalaryValue('')}
                      className="px-2 py-0.5 text-[11px] rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-medium transition-colors cursor-pointer"
                    >
                      Xóa trống
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Bậc lương (Tùy chọn):
                </label>
                <input
                  type="text"
                  placeholder="VD: Bậc 1, Bậc 2..."
                  value={batchBacValue}
                  onChange={(e) => setBatchBacValue(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:border-blue-600 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Ngạch lương (Tùy chọn):
                </label>
                <input
                  type="text"
                  placeholder="VD: Công nhân, Nhân viên..."
                  value={batchNgachValue}
                  onChange={(e) => setBatchNgachValue(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:border-blue-600 font-medium"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsBatchSalaryModalOpen(false)}
                disabled={isBatchSaving}
                className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleBatchApplySalary}
                disabled={isBatchSaving}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                {isBatchSaving ? 'Đang cập nhật...' : 'Xác nhận áp dụng'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. MODAL TẠO VĂN BẢN HỢP ĐỒNG THỬ VIỆC / ĐÀO TẠO */}
      <ErrorBoundary
        fallbackTitle="Lỗi hiển thị cửa sổ Tạo văn bản hợp đồng"
        onReset={() => setIsDocGeneratorOpen(false)}
      >
        <DocumentGeneratorModal
          isOpen={isDocGeneratorOpen}
          onClose={() => setIsDocGeneratorOpen(false)}
          targetEmployees={generatorTargetEmployees}
          initialTemplateName={isTraining ? 'VSDN_HDDT' : 'VSDN_HDTV'}
          initialCategory="Hợp đồng"
          onSavedEmployees={(updatedEmployees) => {
            if (onBatchUpdateEmployees) {
              const updatedMap = new Map(updatedEmployees.map((e) => [e.id, e]));
              onBatchUpdateEmployees(
                employees.map((e) => updatedMap.get(e.id) || e)
              );
            }
            loadContracts();
            if (onRefreshData) onRefreshData();
          }}
        />
      </ErrorBoundary>

      {/* 8. MODAL CHẤM DỨT HỢP ĐỒNG */}
      <ErrorBoundary
        fallbackTitle="Lỗi hiển thị cửa sổ Chấm dứt hợp đồng"
        onReset={() => setTerminatingTarget(null)}
      >
        <TerminateContractModal
          isOpen={!!terminatingTarget}
          employee={terminatingTarget?.employee || null}
          onClose={() => setTerminatingTarget(null)}
          onConfirm={handleTerminateContract}
        />
      </ErrorBoundary>

      {/* 9. MODAL IMPORT EXCEL LƯƠNG, BẬC, NGẠCH */}
      <ErrorBoundary
        fallbackTitle="Lỗi hiển thị cửa sổ Import Excel Lương"
        onReset={() => setIsImportSalaryModalOpen(false)}
      >
        <ContractSalaryImportModal
          isOpen={isImportSalaryModalOpen}
          onClose={() => setIsImportSalaryModalOpen(false)}
          employees={employees}
          contractEmployees={contractEmployees}
          contractType={contractType}
          onUpdateEmployee={onUpdateEmployee}
          onBatchUpdateEmployees={onBatchUpdateEmployees}
          onRefreshData={async () => {
            await loadContracts();
            if (onRefreshData) await onRefreshData();
          }}
        />
      </ErrorBoundary>

      {/* 10. MODAL LỊCH SỬ HỢP ĐỒNG */}
      <ContractHistoryModal
        isOpen={!!viewingHistoryEmployee}
        employee={viewingHistoryEmployee}
        onClose={() => setViewingHistoryEmployee(null)}
        onRenewContract={(emp) => {
          setViewingHistoryEmployee(null);
          setRenewingEmployee(emp);
        }}
        onOpenDocumentGenerator={(emp) => {
          handleOpenDocGenerator([emp]);
        }}
      />

      {/* 11. MODAL TÁI KÝ HỢP ĐỒNG */}
      {renewingEmployee && (
        <RenewContractModal
          isOpen={!!renewingEmployee}
          employee={renewingEmployee}
          onClose={() => setRenewingEmployee(null)}
          onRenewSuccess={(updatedEmp) => {
            if (onBatchUpdateEmployees) {
              onBatchUpdateEmployees(
                employees.map((e) => (e.id === updatedEmp.id ? updatedEmp : e))
              );
            }
            loadContracts();
            if (onRefreshData) onRefreshData();
          }}
          onOpenDocumentGenerator={(emp) => {
            handleOpenDocGenerator([emp]);
          }}
        />
      )}

      {/* 10. DIALOG THÔNG BÁO CHUYÊN NGHIỆP */}
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
