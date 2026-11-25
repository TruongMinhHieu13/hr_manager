import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileCheck,
  Search,
  Filter,
  RefreshCw,
  Download,
  Edit3,
  Trash2,
  Printer,
  History,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  X,
  Save,
  FileSignature,
  Calendar,
  Building2,
  DollarSign,
  AlertTriangle,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { ContractRecord, Employee } from '../types';
import { api } from '../api';
import { DocumentGeneratorModal } from './DocumentGeneratorModal';
import { ContractHistoryModal } from './ContractHistoryModal';
import { NotificationModal } from './NotificationModal';
import { ErrorBoundary } from './ErrorBoundary';

interface CreatedContractsViewProps {
  employees: Employee[];
  onRefreshData?: () => Promise<void>;
  onBatchUpdateEmployees?: (updatedList: Employee[]) => void;
}

const STATUS_OPTIONS = [
  'Hiệu lực',
  'Đã tái ký',
  'Đã thay thế',
  'Hết hiệu lực',
  'Đã chấm dứt',
];

const CONTRACT_TYPE_OPTIONS = [
  { code: 'HĐTV', name: 'Hợp đồng thử việc' },
  { code: 'HĐĐT', name: 'Hợp đồng đào tạo' },
  { code: 'HĐXĐTH', name: 'HĐLĐ xác định thời hạn' },
  { code: 'HĐKXĐ', name: 'HĐLĐ không xác định thời hạn' },
];

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

function parseContractNumberValue(contractNumber?: string): number {
  if (!contractNumber) return -1;
  const match = String(contractNumber).match(/(\d+)/);
  if (!match) return -1;
  const num = parseInt(match[1], 10);
  return Number.isNaN(num) ? -1 : num;
}

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

function formatCreatedAt(val: unknown): string {
  if (!val) return '—';
  const d = new Date(String(val));
  if (isNaN(d.getTime())) return String(val);
  return d.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const CreatedContractsView: React.FC<CreatedContractsViewProps> = ({
  employees,
  onRefreshData,
  onBatchUpdateEmployees,
}) => {
  const [contracts, setContracts] = useState<ContractRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // View mode: Danh sách chính vs DS trùng mã số HĐ
  const [viewMode, setViewMode] = useState<'list' | 'duplicates'>('list');
  const [duplicateSearch, setDuplicateSearch] = useState('');

  // Filters & Pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [signedFilter, setSignedFilter] = useState<'all' | 'signed' | 'unsigned'>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Edit Modal State
  const [editingContract, setEditingContract] = useState<ContractRecord | null>(null);
  const [editForm, setEditForm] = useState<Partial<ContractRecord>>({});
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Delete Confirm Modal State
  const [deletingContract, setDeletingContract] = useState<ContractRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Document Generator & History Modal State
  const [generatorTargetEmployees, setGeneratorTargetEmployees] = useState<Employee[]>([]);
  const [isDocGeneratorOpen, setIsDocGeneratorOpen] = useState(false);
  const [historyEmployee, setHistoryEmployee] = useState<Employee | null>(null);

  // Notification Modal
  const [notification, setNotification] = useState<{
    isOpen: boolean;
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message: string;
  }>({
    isOpen: false,
    type: 'info',
    title: '',
    message: '',
  });

  const employeeMap = useMemo(() => {
    const map = new Map<string, Employee>();
    for (const emp of employees) {
      map.set(emp.id, emp);
    }
    return map;
  }, [employees]);

  const contractCountByEmployee = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of contracts) {
      if (!c.employeeId) continue;
      counts.set(c.employeeId, (counts.get(c.employeeId) || 0) + 1);
    }
    return counts;
  }, [contracts]);

  const duplicateContractData = useMemo(() => {
    const map = new Map<string, ContractRecord[]>();
    for (const c of contracts) {
      const raw = String(c.contractNumber || '').trim();
      if (!raw) continue;
      const norm = raw.replace(/^0+/, '') || '0';
      if (!map.has(norm)) map.set(norm, []);
      map.get(norm)!.push(c);
    }
    const groups: Array<{ normalizedNumber: string; items: ContractRecord[] }> = [];
    let totalEmployees = 0;
    for (const [norm, items] of map.entries()) {
      if (items.length < 2) continue;
      totalEmployees += items.length;
      groups.push({ normalizedNumber: norm, items });
    }
    groups.sort((a, b) => {
      const na = parseInt(a.normalizedNumber, 10);
      const nb = parseInt(b.normalizedNumber, 10);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return nb - na;
      return b.normalizedNumber.localeCompare(a.normalizedNumber, 'vi');
    });
    return { groups, totalEmployees };
  }, [contracts]);

  const filteredDuplicateGroups = useMemo(() => {
    const q = duplicateSearch.trim().toLowerCase();
    if (!q) return duplicateContractData.groups;
    return duplicateContractData.groups.filter((g) => {
      if (g.normalizedNumber.toLowerCase().includes(q)) return true;
      return g.items.some((c) =>
        `${c.contractNumber || ''} ${c.msnv || ''} ${c.fullName || ''} ${c.department || ''} ${c.contractType || ''}`
          .toLowerCase()
          .includes(q)
      );
    });
  }, [duplicateContractData.groups, duplicateSearch]);

  const handleExportDuplicateExcel = () => {
    const rows: Array<Record<string, unknown>> = [];
    let idx = 1;
    for (const g of filteredDuplicateGroups) {
      for (const c of g.items) {
        rows.push({
          STT: idx++,
          'Nhóm số HĐ trùng': g.normalizedNumber,
          'Số HĐ hiện tại': c.contractNumber || '',
          MSNV: c.msnv || '',
          'Họ và tên': c.fullName || '',
          'Loại HĐ': c.contractType || '',
          'Phòng ban': c.department || '',
          'Tình trạng ký': c.isSigned ? 'Đã ký' : 'Chưa ký',
          'Ngày ký': c.signDate || '',
          'Trạng thái': c.status || '',
        });
      }
    }
    if (rows.length === 0) {
      setNotification({
        isOpen: true,
        type: 'warning',
        title: 'Không có dữ liệu',
        message: 'Không có hợp đồng trùng nào để xuất Excel.',
      });
      return;
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'TrungMaSoHD');
    XLSX.writeFile(wb, `DS_Trung_Ma_So_Hop_Dong_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const loadContracts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const list = await api.getContracts();
      setContracts(list);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể tải danh sách hợp đồng đã tạo';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadContracts();
  }, [loadContracts]);

  const contractTypes = useMemo(() => {
    const set = new Set<string>();
    for (const c of contracts) {
      if (c.contractType) set.add(c.contractType);
    }
    return Array.from(set);
  }, [contracts]);

  const stats = useMemo(() => {
    let active = 0;
    let renewed = 0;
    let expired = 0;
    for (const c of contracts) {
      if (c.status === 'Hiệu lực') active++;
      else if (c.status === 'Đã tái ký' || c.status === 'Đã thay thế') renewed++;
      else if (c.status === 'Hết hiệu lực' || c.status === 'Đã chấm dứt') expired++;
    }
    return {
      total: contracts.length,
      active,
      renewed,
      expired,
    };
  }, [contracts]);

  const filteredContracts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = contracts.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (typeFilter !== 'all' && c.contractType !== typeFilter) return false;
      if (signedFilter === 'signed' && !c.isSigned) return false;
      if (signedFilter === 'unsigned' && c.isSigned) return false;
      if (!q) return true;
      const haystack = [
        c.contractNumber,
        c.msnv,
        c.fullName,
        c.contractType,
        c.contractTypeName,
        c.department,
        c.position,
        c.note,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
    return [...list].sort((a, b) => {
      // Ưu tiên bản ghi hợp đồng thực tế trong bảng contracts lên trước bản ghi tổng hợp từ employees
      const isLegacyA = a.id.startsWith('emp_ctr_') ? 1 : 0;
      const isLegacyB = b.id.startsWith('emp_ctr_') ? 1 : 0;
      if (isLegacyA !== isLegacyB) return isLegacyA - isLegacyB;

      // Trong nhóm bản ghi contracts: mới tạo / mới cập nhật nhất lên trước
      if (isLegacyA === 0) {
        const createdA = parseDateTimestamp(a.createdAt || a.updatedAt);
        const createdB = parseDateTimestamp(b.createdAt || b.updatedAt);
        if (createdB !== createdA) return createdB - createdA;
      }

      const signedA = a.isSigned ? 1 : 0;
      const signedB = b.isSigned ? 1 : 0;
      if (signedB !== signedA) return signedB - signedA;

      const signDateA = parseDateTimestamp(a.signDate);
      const signDateB = parseDateTimestamp(b.signDate);
      if (signDateB !== signDateA) return signDateB - signDateA;

      const numA = parseContractNumberValue(a.contractNumber);
      const numB = parseContractNumberValue(b.contractNumber);
      if (numB !== numA) return numB - numA;
      return String(b.contractNumber || '').localeCompare(String(a.contractNumber || ''), 'vi');
    });
  }, [contracts, searchQuery, statusFilter, typeFilter, signedFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredContracts.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedContracts = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredContracts.slice(start, start + pageSize);
  }, [filteredContracts, safeCurrentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, typeFilter, signedFilter, pageSize]);

  const toggleSelectAllPage = () => {
    const pageIds = paginatedContracts.map((c) => c.id);
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const buildEmployeeForContract = (c: ContractRecord): Employee => {
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
      };
    }
    return {
      id: c.employeeId,
      msnv: c.msnv || '',
      fullName: c.fullName || '',
      department: c.department || '',
      chucVu: c.position || '',
      soHd: c.contractNumber || '',
      loaiHd: c.contractType || '',
      thoiHan: c.duration || '',
      tuNgay: c.startDate || '',
      denNgay: c.endDate || '',
      luongChinhThuc: c.salary || '',
      luongThuViec: c.probationSalary || '',
      bacLuong: c.bacLuong || '',
      ngachLuong: c.ngachLuong || '',
      ngayKyHopDong: c.signDate || '',
      joinDate: c.startDate || '',
      photoUrl: c.photoUrl || '',
      printCount: 0,
      lastPrintedAt: null,
      ownerId: c.ownerId || '',
    };
  };

  const handleOpenEdit = (c: ContractRecord) => {
    setEditingContract(c);
    setEditForm({
      contractNumber: c.contractNumber || '',
      contractType: c.contractType || 'HĐTV',
      contractTypeName: c.contractTypeName || '',
      duration: c.duration || '',
      startDate: c.startDate || '',
      endDate: c.endDate || '',
      signDate: c.signDate || '',
      status: c.status || 'Hiệu lực',
      salary: c.salary || '',
      probationSalary: c.probationSalary || '',
      bacLuong: c.bacLuong || '',
      ngachLuong: c.ngachLuong || '',
      department: c.department || '',
      position: c.position || '',
      note: c.note || '',
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingContract) return;
    setIsSavingEdit(true);
    try {
      const res = await api.updateContract(editingContract.id, editForm);
      setContracts((prev) =>
        prev.map((item) =>
          item.id === editingContract.id ? { ...item, ...res.contract } : item
        )
      );
      if (res.employee && onBatchUpdateEmployees) {
        onBatchUpdateEmployees([res.employee]);
      } else if (onRefreshData) {
        await onRefreshData();
      }
      setEditingContract(null);
      setNotification({
        isOpen: true,
        type: 'success',
        title: 'Cập nhật thành công',
        message: `Đã lưu thay đổi cho hợp đồng số ${res.contract.contractNumber || editingContract.contractNumber || ''}.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi cập nhật hợp đồng';
      setNotification({
        isOpen: true,
        type: 'error',
        title: 'Cập nhật thất bại',
        message: msg,
      });
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingContract) return;
    setIsDeleting(true);
    try {
      await api.deleteContract(deletingContract.id);
      setContracts((prev) => prev.filter((c) => c.id !== deletingContract.id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(deletingContract.id);
        return next;
      });
      setDeletingContract(null);
      setNotification({
        isOpen: true,
        type: 'success',
        title: 'Đã xóa hợp đồng',
        message: `Đã xóa bản ghi hợp đồng số ${deletingContract.contractNumber || deletingContract.id}.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể xóa hợp đồng';
      setNotification({
        isOpen: true,
        type: 'error',
        title: 'Xóa thất bại',
        message: msg,
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExportExcel = () => {
    const source =
      selectedIds.size > 0
        ? filteredContracts.filter((c) => selectedIds.has(c.id))
        : filteredContracts;

    if (source.length === 0) {
      setNotification({
        isOpen: true,
        type: 'warning',
        title: 'Không có dữ liệu',
        message: 'Không có hợp đồng nào phù hợp để xuất Excel.',
      });
      return;
    }

    const rows = source.map((c, idx) => ({
      STT: idx + 1,
      'Số hợp đồng': c.contractNumber || '',
      MSNV: c.msnv || '',
      'Họ và tên': c.fullName || '',
      'Phòng ban': c.department || '',
      'Chức vụ': c.position || '',
      'Mã loại HĐ': c.contractType || '',
      'Tên loại HĐ': c.contractTypeName || '',
      'Thời hạn': c.duration || '',
      'Từ ngày': c.startDate || '',
      'Đến ngày': c.endDate || '',
      'Ngày ký': c.signDate || '',
      'Lương chính thức': c.salary || '',
      'Lương thử việc': c.probationSalary || '',
      'Bậc lương': c.bacLuong || '',
      'Ngạch lương': c.ngachLuong || '',
      'Trạng thái': c.status || '',
      'Ghi chú': c.note || '',
      'Ngày tạo': formatCreatedAt(c.createdAt),
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'HopDongDaTao');
    const dateTag = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Danh_Sach_Hop_Dong_Da_Tao_${dateTag}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm shrink-0">
            <FileCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Quản lý hợp đồng đã tạo</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Tra cứu, chỉnh sửa, in lại văn bản và theo dõi trạng thái toàn bộ hợp đồng đã cấp số / tái ký
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={loadContracts}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors cursor-pointer shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            Xuất Excel {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
          </button>
        </div>
      </div>

      {/* Page switcher tabs */}
      <div className="flex flex-wrap items-center gap-2 bg-white p-2 rounded-2xl border border-slate-200/80 shadow-2xs">
        <button
          type="button"
          onClick={() => setViewMode('list')}
          className={`px-4 py-2 text-xs font-bold rounded-xl flex items-center gap-2 transition-colors cursor-pointer ${
            viewMode === 'list'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FileCheck className="w-4 h-4" />
          <span>Danh sách hợp đồng đã tạo</span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
              viewMode === 'list' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {contracts.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setViewMode('duplicates')}
          className={`px-4 py-2 text-xs font-bold rounded-xl flex items-center gap-2 transition-colors cursor-pointer ${
            viewMode === 'duplicates'
              ? 'bg-rose-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-rose-50 hover:text-rose-700'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          <span>DS nhân viên trùng mã số HĐ</span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
              viewMode === 'duplicates'
                ? 'bg-white/20 text-white'
                : duplicateContractData.totalEmployees > 0
                  ? 'bg-rose-100 text-rose-700'
                  : 'bg-emerald-100 text-emerald-700'
            }`}
          >
            {duplicateContractData.totalEmployees}
          </span>
        </button>
      </div>

      {viewMode === 'duplicates' ? (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={duplicateSearch}
                onChange={(e) => setDuplicateSearch(e.target.value)}
                placeholder="Tìm theo số HĐ trùng, MSNV, họ tên, phòng ban, loại HĐ..."
                className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-rose-500"
              />
              {duplicateSearch && (
                <button
                  type="button"
                  onClick={() => setDuplicateSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={handleExportDuplicateExcel}
              disabled={filteredDuplicateGroups.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 cursor-pointer shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              Xuất Excel danh sách trùng
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            {isLoading ? (
              <div className="p-12 text-center text-slate-500 text-sm">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
                Đang kiểm tra trùng mã số hợp đồng...
              </div>
            ) : filteredDuplicateGroups.length === 0 ? (
              <div className="p-12 text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                <p className="text-sm font-bold text-slate-800">
                  Không có hợp đồng nào bị trùng mã số HĐ!
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Hệ thống đã kiểm tra toàn bộ {contracts.length} hợp đồng (bao gồm cả trường hợp có số 0 ở đầu).
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-rose-50/70 border-b border-rose-200/70 text-[11px] font-bold text-rose-900 uppercase tracking-wider">
                      <th className="py-3 px-3">Số HĐ trùng</th>
                      <th className="py-3 px-3">Số HĐ gốc</th>
                      <th className="py-3 px-3">Nhân viên</th>
                      <th className="py-3 px-3">Loại HĐ</th>
                      <th className="py-3 px-3">Tình trạng ký</th>
                      <th className="py-3 px-3">Trạng thái</th>
                      <th className="py-3 px-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredDuplicateGroups.map((group) =>
                      group.items.map((c, idx) => (
                        <tr key={`${group.normalizedNumber}_${c.id}`} className="hover:bg-rose-50/20">
                          {idx === 0 && (
                            <td
                              rowSpan={group.items.length}
                              className="py-3 px-3 align-top border-r border-slate-100 bg-rose-50/40 whitespace-nowrap"
                            >
                              <span className="font-mono font-bold text-rose-700 bg-white border border-rose-200 px-2.5 py-1 rounded-lg inline-block">
                                #{group.normalizedNumber}
                              </span>
                              <div className="text-[11px] text-rose-600 font-semibold mt-1">
                                {group.items.length} hợp đồng trùng
                              </div>
                            </td>
                          )}
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span className="font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200/70 px-2 py-0.5 rounded-md">
                              {c.contractNumber || '—'}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-bold text-slate-900">{c.fullName || '—'}</div>
                            <div className="text-[11px] text-slate-500">
                              <span className="font-mono font-semibold text-slate-700">{c.msnv || '—'}</span>
                              {c.department ? ` • ${c.department}` : ''}
                            </div>
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span className="inline-block font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md">
                              {c.contractType || '—'}
                            </span>
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            {c.isSigned ? (
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Đã ký {c.signDate ? `(${c.signDate})` : ''}
                              </span>
                            ) : (
                              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                                Chưa ký
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${getStatusBadgeClass(
                                c.status
                              )}`}
                            >
                              {c.status || '—'}
                            </span>
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleOpenEdit(c)}
                                className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 transition-colors cursor-pointer"
                                title="Sửa số hợp đồng"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setHistoryEmployee(buildEmployeeForContract(c))}
                                className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                                title="Lịch sử hợp đồng"
                              >
                                <History className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingContract(c)}
                                className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                title="Xóa hợp đồng"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Tổng hợp đồng đã tạo</span>
            <FileSignature className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-1.5 font-mono-num">{stats.total}</div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-emerald-200/70 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-700">Đang hiệu lực</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-700 mt-1.5 font-mono-num">{stats.active}</div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-blue-200/70 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-blue-700">Đã tái ký / thay thế</span>
            <Clock className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-blue-700 mt-1.5 font-mono-num">{stats.renewed}</div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-rose-200/70 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-700">Hết hiệu lực / chấm dứt</span>
            <XCircle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-bold text-rose-700 mt-1.5 font-mono-num">{stats.expired}</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo số HĐ, MSNV, họ tên, phòng ban, ghi chú..."
            className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Filter className="w-3.5 h-3.5" />
            <span className="font-medium">Lọc:</span>
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="all">Tất cả loại HĐ</option>
            {contractTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <select
            value={signedFilter}
            onChange={(e) => setSignedFilter(e.target.value as 'all' | 'signed' | 'unsigned')}
            className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="all">Tất cả tình trạng ký</option>
            <option value="signed">Đã ký hợp đồng</option>
            <option value="unsigned">Chưa ký (đã cấp số)</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="all">Tất cả trạng thái</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {error ? (
          <div className="p-8 text-center">
            <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-800">{error}</p>
            <button
              type="button"
              onClick={loadContracts}
              className="mt-3 px-4 py-2 text-xs font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 cursor-pointer"
            >
              Thử lại
            </button>
          </div>
        ) : isLoading ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
            Đang tải danh sách hợp đồng đã tạo...
          </div>
        ) : filteredContracts.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <FileCheck className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">Chưa có hợp đồng nào phù hợp</p>
            <p className="text-xs text-slate-400 mt-1">
              Hợp đồng sẽ được lưu vào đây khi bạn cấp số / xuất hợp đồng hoặc tái ký hợp đồng.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                    <th className="py-3 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={
                          paginatedContracts.length > 0 &&
                          paginatedContracts.every((c) => selectedIds.has(c.id))
                        }
                        onChange={toggleSelectAllPage}
                        className="rounded border-slate-300 text-blue-600 cursor-pointer"
                      />
                    </th>
                    <th className="py-3 px-3">Số HĐ</th>
                    <th className="py-3 px-3">Nhân viên</th>
                    <th className="py-3 px-3">Loại hợp đồng</th>
                    <th className="py-3 px-3">Thời hạn & Hiệu lực</th>
                    <th className="py-3 px-3">Lương / Ngạch bậc</th>
                    <th className="py-3 px-3">Trạng thái</th>
                    <th className="py-3 px-3">Ngày tạo</th>
                    <th className="py-3 px-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {paginatedContracts.map((c) => {
                    const isSelected = selectedIds.has(c.id);
                    return (
                      <tr
                        key={c.id}
                        className={`hover:bg-blue-50/40 transition-colors ${
                          isSelected ? 'bg-blue-50/60' : ''
                        }`}
                      >
                        <td className="py-3 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectOne(c.id)}
                            className="rounded border-slate-300 text-blue-600 cursor-pointer"
                          />
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200/70 px-2 py-0.5 rounded-md">
                              {c.contractNumber || '—'}
                            </span>
                            {c.isSigned ? (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Đã ký
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                                Chưa ký
                              </span>
                            )}
                          </div>
                          {c.signDate && (
                            <div className="text-[11px] text-slate-400 mt-1">
                              Ký: {c.signDate}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-900">{c.fullName || '—'}</span>
                            {(contractCountByEmployee.get(c.employeeId) || 0) > 1 && (
                              <span
                                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200"
                                title="Nhân viên này có nhiều hợp đồng trong hệ thống"
                              >
                                {contractCountByEmployee.get(c.employeeId)} HĐ
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                            <span className="font-mono font-semibold text-slate-700">
                              {c.msnv || '—'}
                            </span>
                            {c.department && (
                              <>
                                <span>•</span>
                                <span className="truncate max-w-[180px]" title={c.department}>
                                  {c.department}
                                </span>
                              </>
                            )}
                          </div>
                          {c.position && (
                            <div className="text-[11px] text-slate-400 truncate max-w-[220px]">
                              {c.position}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <span className="inline-block font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md">
                            {c.contractType || '—'}
                          </span>
                          {c.contractTypeName && (
                            <div className="text-[11px] text-slate-500 mt-1 max-w-[180px] truncate" title={c.contractTypeName}>
                              {c.contractTypeName}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="font-semibold text-slate-700">{c.duration || '—'}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {c.startDate || '—'} → {c.endDate || 'Không xác định'}
                          </div>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          {c.salary || c.probationSalary ? (
                            <div>
                              {c.salary && (
                                <div className="text-slate-800 font-semibold">
                                  CT: {c.salary}
                                </div>
                              )}
                              {c.probationSalary && (
                                <div className="text-slate-500 text-[11px]">
                                  TV: {c.probationSalary}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                          {(c.bacLuong || c.ngachLuong) && (
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              {c.ngachLuong ? `Ngạch ${c.ngachLuong}` : ''}{' '}
                              {c.bacLuong ? `Bậc ${c.bacLuong}` : ''}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${getStatusBadgeClass(
                              c.status
                            )}`}
                          >
                            {c.status || '—'}
                          </span>
                          {c.note && (
                            <div
                              className="text-[11px] text-slate-400 mt-1 max-w-[160px] truncate"
                              title={c.note}
                            >
                              {c.note}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap text-[11px] text-slate-500">
                          {formatCreatedAt(c.createdAt)}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setGeneratorTargetEmployees([buildEmployeeForContract(c)]);
                                setIsDocGeneratorOpen(true);
                              }}
                              className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                              title="In / Xuất văn bản hợp đồng"
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(c)}
                              className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 transition-colors cursor-pointer"
                              title="Sửa thông tin hợp đồng"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setHistoryEmployee(buildEmployeeForContract(c))}
                              className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                              title="Lịch sử hợp đồng của nhân viên"
                            >
                              <History className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingContract(c)}
                              className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                              title="Xóa hợp đồng"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <span>
                  Hiển thị{' '}
                  <strong>
                    {(safeCurrentPage - 1) * pageSize + 1}–
                    {Math.min(safeCurrentPage * pageSize, filteredContracts.length)}
                  </strong>{' '}
                  / <strong>{filteredContracts.length}</strong> hợp đồng
                </span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs cursor-pointer"
                >
                  {[10, 20, 50, 100].map((size) => (
                    <option key={size} value={size}>
                      {size} / trang
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={safeCurrentPage <= 1}
                  onClick={() => setCurrentPage(1)}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronsLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={safeCurrentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="px-3 font-semibold">
                  Trang {safeCurrentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={safeCurrentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={safeCurrentPage >= totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronsRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
        </>
      )}

      {/* Edit Contract Modal */}
      {editingContract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold">Chỉnh sửa hợp đồng đã tạo</h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  {editingContract.fullName} ({editingContract.msnv})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingContract(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 space-y-4 max-h-[78vh] overflow-y-auto text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Số hợp đồng</label>
                  <input
                    type="text"
                    value={editForm.contractNumber || ''}
                    onChange={(e) => setEditForm((p) => ({ ...p, contractNumber: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Trạng thái</label>
                  <select
                    value={editForm.status || 'Hiệu lực'}
                    onChange={(e) => setEditForm((p) => ({ ...p, status: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Mã loại hợp đồng</label>
                  <input
                    type="text"
                    list="contract-type-codes"
                    value={editForm.contractType || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      const found = CONTRACT_TYPE_OPTIONS.find((o) => o.code === val);
                      setEditForm((p) => ({
                        ...p,
                        contractType: val,
                        contractTypeName: found ? found.name : p.contractTypeName,
                      }));
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
                    required
                  />
                  <datalist id="contract-type-codes">
                    {CONTRACT_TYPE_OPTIONS.map((o) => (
                      <option key={o.code} value={o.code}>
                        {o.name}
                      </option>
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tên loại hợp đồng</label>
                  <input
                    type="text"
                    value={editForm.contractTypeName || ''}
                    onChange={(e) => setEditForm((p) => ({ ...p, contractTypeName: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Thời hạn</label>
                  <input
                    type="text"
                    value={editForm.duration || ''}
                    onChange={(e) => setEditForm((p) => ({ ...p, duration: e.target.value }))}
                    placeholder="VD: 60 NGÀY, 12 THÁNG..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Ngày ký</label>
                  <input
                    type="text"
                    value={editForm.signDate || ''}
                    onChange={(e) => setEditForm((p) => ({ ...p, signDate: e.target.value }))}
                    placeholder="DD/MM/YYYY"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    Từ ngày
                  </label>
                  <input
                    type="text"
                    value={editForm.startDate || ''}
                    onChange={(e) => setEditForm((p) => ({ ...p, startDate: e.target.value }))}
                    placeholder="DD/MM/YYYY"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    Đến ngày
                  </label>
                  <input
                    type="text"
                    value={editForm.endDate || ''}
                    onChange={(e) => setEditForm((p) => ({ ...p, endDate: e.target.value }))}
                    placeholder="DD/MM/YYYY hoặc để trống"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1">
                    <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                    Lương chính thức
                  </label>
                  <input
                    type="text"
                    value={editForm.salary || ''}
                    onChange={(e) => setEditForm((p) => ({ ...p, salary: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1">
                    <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                    Lương thử việc
                  </label>
                  <input
                    type="text"
                    value={editForm.probationSalary || ''}
                    onChange={(e) => setEditForm((p) => ({ ...p, probationSalary: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Ngạch lương</label>
                  <input
                    type="text"
                    value={editForm.ngachLuong || ''}
                    onChange={(e) => setEditForm((p) => ({ ...p, ngachLuong: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Bậc lương</label>
                  <input
                    type="text"
                    value={editForm.bacLuong || ''}
                    onChange={(e) => setEditForm((p) => ({ ...p, bacLuong: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5 text-slate-400" />
                    Phòng ban
                  </label>
                  <input
                    type="text"
                    value={editForm.department || ''}
                    onChange={(e) => setEditForm((p) => ({ ...p, department: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Chức vụ / Công việc</label>
                  <input
                    type="text"
                    value={editForm.position || ''}
                    onChange={(e) => setEditForm((p) => ({ ...p, position: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Ghi chú</label>
                <textarea
                  rows={2}
                  value={editForm.note || ''}
                  onChange={(e) => setEditForm((p) => ({ ...p, note: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingContract(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  {isSavingEdit ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deletingContract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Xác nhận xóa hợp đồng</h3>
                <p className="text-xs text-slate-600 mt-1">
                  Bạn có chắc chắn muốn xóa bản ghi hợp đồng số{' '}
                  <strong className="font-mono text-slate-900">
                    {deletingContract.contractNumber || deletingContract.id}
                  </strong>{' '}
                  của nhân viên <strong>{deletingContract.fullName}</strong>? Hành động này không thể hoàn tác.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2.5 mt-5">
              <button
                type="button"
                onClick={() => setDeletingContract(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
              >
                {isDeleting ? 'Đang xóa...' : 'Xóa hợp đồng'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Generator Modal */}
      {isDocGeneratorOpen && (
        <ErrorBoundary>
          <DocumentGeneratorModal
            isOpen={isDocGeneratorOpen}
            onClose={() => setIsDocGeneratorOpen(false)}
            targetEmployees={generatorTargetEmployees}
            onSavedEmployees={(updated) => {
              if (onBatchUpdateEmployees) onBatchUpdateEmployees(updated);
              loadContracts();
            }}
          />
        </ErrorBoundary>
      )}

      {/* Contract History Modal */}
      <ContractHistoryModal
        isOpen={Boolean(historyEmployee)}
        employee={historyEmployee}
        onClose={() => setHistoryEmployee(null)}
        onOpenDocumentGenerator={(emp) => {
          setHistoryEmployee(null);
          setGeneratorTargetEmployees([emp]);
          setIsDocGeneratorOpen(true);
        }}
      />

      {/* Notification Modal */}
      <NotificationModal
        isOpen={notification.isOpen}
        type={notification.type}
        title={notification.title}
        message={notification.message}
        onClose={() => setNotification((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
