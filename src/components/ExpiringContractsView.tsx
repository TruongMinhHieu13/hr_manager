/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  ScrollText,
  AlertTriangle,
  AlertCircle,
  Clock,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  FileText,
  ExternalLink,
  CheckCircle2,
  ArrowRight,
  Building2,
  Printer,
  Calendar,
  GraduationCap,
  Sparkles,
  FileX,
  FileSignature,
  MoreVertical,
  History,
} from 'lucide-react';
import { ActiveTab, Employee } from '../types';
import { stripViAccents } from './EmployeeManagementView';
import { DocumentGeneratorModal } from './DocumentGeneratorModal';
import { TerminateContractModal } from './TerminateContractModal';
import { RenewContractModal } from './RenewContractModal';
import { ContractHistoryModal } from './ContractHistoryModal';
import { ErrorBoundary } from './ErrorBoundary';
import { isContractTerminated } from '../utils/employeeUtils';

interface ExpiringContractsViewProps {
  employees: Employee[];
  onNavigate: (tab: ActiveTab) => void;
  onOpenPrintDialog?: (employeeIds?: string[]) => void;
  onUpdateEmployee?: (id: string, updates: Partial<Employee>) => Promise<unknown>;
}

// Helper: Phân tích ngày tháng năm (DD/MM/YYYY, YYYY-MM-DD, Excel serial)
function parseFullDate(dateStr?: string): Date | null {
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

export const ExpiringContractsView: React.FC<ExpiringContractsViewProps> = ({
  employees,
  onNavigate,
  onOpenPrintDialog,
  onUpdateEmployee,
}) => {
  // State bộ lọc
  const [contractRangeFilter, setContractRangeFilter] = useState<
    'all' | '7days' | '15days' | '30days' | '60days' | 'expired'
  >('30days');
  const [contractSearch, setContractSearch] = useState<string>('');
  const [contractDeptFilter, setContractDeptFilter] = useState<string>('ALL');
  const [contractTypeFilter, setContractTypeFilter] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Cửa sổ Tạo & In Hợp Đồng
  const [isDocGeneratorOpen, setIsDocGeneratorOpen] = useState(false);
  const [generatorTargetEmployees, setGeneratorTargetEmployees] = useState<Employee[]>([]);

  // Action Menu (3-dots) State
  const [openActionMenuEmpId, setOpenActionMenuEmpId] = useState<string | null>(null);

  // Modal Chấm dứt hợp đồng
  const [terminatingEmployee, setTerminatingEmployee] = useState<Employee | null>(null);

  // Modal Tái ký hợp đồng
  const [renewingEmployee, setRenewingEmployee] = useState<Employee | null>(null);

  // Modal Lịch sử hợp đồng
  const [viewingHistoryEmployee, setViewingHistoryEmployee] = useState<Employee | null>(null);

  // Toast thông báo
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleTerminateContract = async (updates: {
    tinhTrang: string;
    trangThaiHopDong: string;
    denNgay?: string;
  }) => {
    if (!terminatingEmployee || !onUpdateEmployee) return;
    try {
      await onUpdateEmployee(terminatingEmployee.id, updates);
      setTerminatingEmployee(null);
    } catch (err) {
      console.error('Lỗi khi chấm dứt hợp đồng:', err);
      throw err;
    }
  };

  const handleOpenDocGenerator = (targetList: Employee[]) => {
    if (targetList.length === 0) {
      alert('Vui lòng chọn ít nhất một nhân viên để tạo hợp đồng.');
      return;
    }
    setGeneratorTargetEmployees(targetList);
    setIsDocGeneratorOpen(true);
  };

  // Danh sách các phòng ban duy nhất (chỉ tính nhân sự đang hoạt động)
  const uniqueDepartments = useMemo(() => {
    const set = new Set<string>();
    for (const emp of employees) {
      if (isContractTerminated(emp)) continue;
      const d = (emp.department || emp.phongBanCon || emp.boPhan || '').trim();
      if (d) set.add(d);
      const pb = (emp.phongBan || '').trim();
      if (pb) set.add(pb);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [employees]);

  // Tính toán toàn bộ danh sách hợp đồng (chỉ tính nhân viên đang làm việc, loại bỏ đã nghỉ việc / chấm dứt HĐ)
  const expiringContractsList = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const list: Array<{
      employee: Employee;
      expiryDate: Date;
      expiryDateStr: string;
      diffDays: number;
      status: 'expired' | 'today' | 'urgent' | 'warning' | 'upcoming';
      loaiHd: string;
      soHd: string;
      thoiHan: string;
      tuNgay: string;
      denNgay: string;
    }> = [];

    for (const emp of employees) {
      if (isContractTerminated(emp)) continue;
      const denNgayStr = (emp.denNgay || '').trim();
      if (!denNgayStr) continue;

      const expiry = parseFullDate(denNgayStr);
      if (!expiry) continue;
      expiry.setHours(0, 0, 0, 0);

      const diffDays = Math.round((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      let status: 'expired' | 'today' | 'urgent' | 'warning' | 'upcoming' = 'upcoming';
      if (diffDays < 0) {
        status = 'expired';
      } else if (diffDays === 0) {
        status = 'today';
      } else if (diffDays <= 7) {
        status = 'urgent';
      } else if (diffDays <= 30) {
        status = 'warning';
      } else {
        status = 'upcoming';
      }

      list.push({
        employee: emp,
        expiryDate: expiry,
        expiryDateStr: denNgayStr,
        diffDays,
        status,
        loaiHd: (emp.loaiHd || 'HĐTV').trim(),
        soHd: (emp.soHd || '').trim(),
        thoiHan: (emp.thoiHan || '').trim(),
        tuNgay: (emp.tuNgay || '').trim(),
        denNgay: denNgayStr,
      });
    }

    // Sắp xếp: Ưu tiên hết hạn trước lên đầu (diffDays tăng dần)
    list.sort((a, b) => a.diffDays - b.diffDays);
    return list;
  }, [employees]);

  // Thống kê số lượng hợp đồng theo mốc
  const contractStats = useMemo(() => {
    let expired = 0;
    let within7Days = 0;
    let within15Days = 0;
    let within30Days = 0;
    let within60Days = 0;

    for (const item of expiringContractsList) {
      if (item.diffDays < 0) {
        expired++;
      } else {
        if (item.diffDays <= 7) within7Days++;
        if (item.diffDays <= 15) within15Days++;
        if (item.diffDays <= 30) within30Days++;
        if (item.diffDays <= 60) within60Days++;
      }
    }

    return {
      expired,
      within7Days,
      within15Days,
      within30Days,
      within60Days,
      totalNeedAction: expired + within30Days,
      total: expiringContractsList.length,
    };
  }, [expiringContractsList]);

  // Danh sách các loại HĐ duy nhất
  const uniqueContractTypes = useMemo(() => {
    const set = new Set<string>();
    for (const item of expiringContractsList) {
      if (item.loaiHd) set.add(item.loaiHd);
    }
    return Array.from(set).sort();
  }, [expiringContractsList]);

  // Lọc hợp đồng theo điều kiện
  const filteredExpiringContracts = useMemo(() => {
    let result = expiringContractsList;

    // Khung thời gian
    if (contractRangeFilter === '30days') {
      result = result.filter((item) => item.diffDays <= 30);
    } else if (contractRangeFilter === '7days') {
      result = result.filter((item) => item.diffDays >= 0 && item.diffDays <= 7);
    } else if (contractRangeFilter === '15days') {
      result = result.filter((item) => item.diffDays >= 0 && item.diffDays <= 15);
    } else if (contractRangeFilter === '60days') {
      result = result.filter((item) => item.diffDays <= 60);
    } else if (contractRangeFilter === 'expired') {
      result = result.filter((item) => item.diffDays < 0);
    }

    // Phòng ban
    if (contractDeptFilter !== 'ALL') {
      const target = stripViAccents(contractDeptFilter);
      result = result.filter(
        (item) =>
          stripViAccents(item.employee.department || '') === target ||
          stripViAccents(item.employee.phongBanCon || '') === target ||
          stripViAccents(item.employee.boPhan || '') === target ||
          stripViAccents(item.employee.phongBan || '') === target
      );
    }

    // Loại HĐ
    if (contractTypeFilter !== 'ALL') {
      result = result.filter((item) => item.loaiHd === contractTypeFilter);
    }

    // Tìm kiếm
    if (contractSearch.trim()) {
      const term = contractSearch.trim().toLowerCase();
      result = result.filter(
        (item) =>
          item.employee.fullName.toLowerCase().includes(term) ||
          item.employee.msnv.toLowerCase().includes(term) ||
          (item.employee.department || '').toLowerCase().includes(term) ||
          item.soHd.toLowerCase().includes(term) ||
          item.loaiHd.toLowerCase().includes(term)
      );
    }

    return result;
  }, [
    expiringContractsList,
    contractRangeFilter,
    contractDeptFilter,
    contractTypeFilter,
    contractSearch,
  ]);

  // Phân trang
  const totalPages = Math.max(1, Math.ceil(filteredExpiringContracts.length / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedContracts = useMemo(() => {
    const startIdx = (safeCurrentPage - 1) * pageSize;
    return filteredExpiringContracts.slice(startIdx, startIdx + pageSize);
  }, [filteredExpiringContracts, safeCurrentPage, pageSize]);

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

  // Xuất file CSV danh sách người sắp hết hạn hợp đồng
  const handleExportExpiringContracts = () => {
    const headers = [
      'STT',
      'MSNV',
      'Họ và tên',
      'Bộ phận / Phòng ban',
      'Chức vụ / Công việc',
      'Loại HĐ',
      'Số HĐ',
      'Thời hạn',
      'Từ ngày',
      'Đến ngày (Ngày hết hạn)',
      'Số ngày còn lại',
      'Tình trạng',
    ];

    const rows = filteredExpiringContracts.map((item, idx) => {
      let statusText = '';
      if (item.status === 'expired') statusText = `Đã quá hạn ${Math.abs(item.diffDays)} ngày`;
      else if (item.status === 'today') statusText = 'Hết hạn hôm nay';
      else statusText = `Còn ${item.diffDays} ngày`;

      return [
        idx + 1,
        `"${item.employee.msnv || ''}"`,
        `"${item.employee.fullName || ''}"`,
        `"${item.employee.department || item.employee.phongBan || ''}"`,
        `"${item.employee.congViec || item.employee.chucVu || ''}"`,
        `"${item.loaiHd || ''}"`,
        `"${item.soHd || ''}"`,
        `"${item.thoiHan || ''}"`,
        `"${item.tuNgay || ''}"`,
        `"${item.denNgay || ''}"`,
        item.diffDays,
        `"${statusText}"`,
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Danh_Sach_Hop_Dong_Sap_Het_Han_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Banner Tiêu đề & Các nút tác vụ */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-500 text-white rounded-2xl shadow-xs">
            <ScrollText className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-slate-900 leading-tight">
                Quản Lý Hợp Đồng Sắp Hết Hạn
              </h1>
              <span
                className={`px-2.5 py-0.5 text-xs font-bold rounded-full ${
                  contractStats.totalNeedAction > 0
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                {filteredExpiringContracts.length} hợp đồng
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Theo dõi và cảnh báo các hợp đồng lao động & thử việc sắp đến ngày kết thúc để kịp thời đánh giá, gia hạn hoặc ký tiếp
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          <button
            type="button"
            onClick={handleExportExpiringContracts}
            disabled={filteredExpiringContracts.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl cursor-pointer transition-colors"
            title="Xuất danh sách ra file Excel / CSV"
          >
            <Download className="w-4 h-4 text-slate-500" />
            Xuất Excel
          </button>

          <button
            type="button"
            onClick={() => onNavigate('probation_contracts')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-xl shadow-xs cursor-pointer transition-colors"
          >
            <FileText className="w-4 h-4" />
            Quản lý HĐTV
            <ExternalLink className="w-3.5 h-3.5 opacity-80" />
          </button>

          <button
            type="button"
            onClick={() => onNavigate('training_contracts')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 rounded-xl shadow-xs cursor-pointer transition-colors"
          >
            <GraduationCap className="w-4 h-4 text-emerald-700" />
            Quản lý HĐĐT
            <ExternalLink className="w-3.5 h-3.5 opacity-80" />
          </button>
        </div>
      </div>

      {/* Dải Thẻ Lọc Nhanh Theo Mức Độ Khẩn Cấp */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* 1. Cần xử lý trong 30 ngày */}
        <button
          type="button"
          onClick={() => {
            setContractRangeFilter('30days');
            setCurrentPage(1);
          }}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
            contractRangeFilter === '30days'
              ? 'bg-amber-500 text-white border-amber-600 shadow-md ring-2 ring-amber-400'
              : 'bg-white border-slate-200 hover:border-amber-300 hover:bg-amber-50/40 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold opacity-90">Cần xử lý (≤ 30 ngày)</span>
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold font-mono-num mt-2">
            {contractStats.totalNeedAction}
          </div>
          <div className="text-[11px] opacity-80 mt-0.5">Khuyến nghị xử lý</div>
        </button>

        {/* 2. Đã quá hạn */}
        <button
          type="button"
          onClick={() => {
            setContractRangeFilter('expired');
            setCurrentPage(1);
          }}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
            contractRangeFilter === 'expired'
              ? 'bg-red-600 text-white border-red-700 shadow-md ring-2 ring-red-400'
              : 'bg-white border-slate-200 hover:border-red-300 hover:bg-red-50/40 shadow-xs text-red-900'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold opacity-90">Đã quá hạn</span>
            <AlertCircle className="w-4 h-4 text-red-500" />
          </div>
          <div className="text-2xl font-bold font-mono-num mt-2 text-red-600">
            {contractStats.expired}
          </div>
          <div className="text-[11px] opacity-80 mt-0.5">Cần ký gấp</div>
        </button>

        {/* 3. Gấp trong 7 ngày */}
        <button
          type="button"
          onClick={() => {
            setContractRangeFilter('7days');
            setCurrentPage(1);
          }}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
            contractRangeFilter === '7days'
              ? 'bg-rose-600 text-white border-rose-700 shadow-md ring-2 ring-rose-400'
              : 'bg-white border-slate-200 hover:border-rose-300 hover:bg-rose-50/40 shadow-xs text-rose-900'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold opacity-90">Gấp (≤ 7 ngày)</span>
            <Clock className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-bold font-mono-num mt-2 text-rose-600">
            {contractStats.within7Days}
          </div>
          <div className="text-[11px] opacity-80 mt-0.5">Trong 1 tuần tới</div>
        </button>

        {/* 4. Trong 60 ngày */}
        <button
          type="button"
          onClick={() => {
            setContractRangeFilter('60days');
            setCurrentPage(1);
          }}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
            contractRangeFilter === '60days'
              ? 'bg-blue-600 text-white border-blue-700 shadow-md ring-2 ring-blue-400'
              : 'bg-white border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 shadow-xs text-blue-900'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold opacity-90">Trong 60 ngày</span>
            <Calendar className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold font-mono-num mt-2 text-blue-700">
            {contractStats.within60Days}
          </div>
          <div className="text-[11px] opacity-80 mt-0.5">Trong 2 tháng tới</div>
        </button>

        {/* 5. Tất cả có hợp đồng */}
        <button
          type="button"
          onClick={() => {
            setContractRangeFilter('all');
            setCurrentPage(1);
          }}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
            contractRangeFilter === 'all'
              ? 'bg-slate-900 text-white border-slate-950 shadow-md ring-2 ring-slate-700'
              : 'bg-white border-slate-200 hover:border-slate-400 hover:bg-slate-50 shadow-xs text-slate-800'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold opacity-90">Tất cả có HĐ</span>
            <ScrollText className="w-4 h-4 text-slate-500" />
          </div>
          <div className="text-2xl font-bold font-mono-num mt-2">
            {contractStats.total}
          </div>
          <div className="text-[11px] opacity-80 mt-0.5">Toàn bộ nhân sự</div>
        </button>
      </div>

      {/* Khối Bảng Danh Sách */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        {/* Toolbar Lọc & Tìm kiếm */}
        <div className="p-5 border-b border-slate-200 flex flex-col md:flex-row items-stretch md:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={contractSearch}
              onChange={(e) => {
                setContractSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Tìm theo Họ tên, MSNV, Số HĐ, Bộ phận..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-blue-600 transition-colors"
            />
          </div>

          <div className="relative w-full md:w-56">
            <select
              value={contractDeptFilter}
              onChange={(e) => {
                setContractDeptFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-3 pr-8 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-blue-600 cursor-pointer appearance-none"
            >
              <option value="ALL">Tất cả các bộ phận ({uniqueDepartments.length})</option>
              {uniqueDepartments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 rotate-90 pointer-events-none" />
          </div>

          {uniqueContractTypes.length > 0 && (
            <div className="relative w-full md:w-44">
              <select
                value={contractTypeFilter}
                onChange={(e) => {
                  setContractTypeFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-3 pr-8 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-blue-600 cursor-pointer appearance-none"
              >
                <option value="ALL">Tất cả loại HĐ</option>
                {uniqueContractTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 rotate-90 pointer-events-none" />
            </div>
          )}

          {(contractSearch || contractDeptFilter !== 'ALL' || contractTypeFilter !== 'ALL' || contractRangeFilter !== '30days') && (
            <button
              type="button"
              onClick={() => {
                setContractSearch('');
                setContractDeptFilter('ALL');
                setContractTypeFilter('ALL');
                setContractRangeFilter('30days');
                setCurrentPage(1);
              }}
              className="px-3.5 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer shrink-0 transition-colors"
            >
              Xóa lọc
            </button>
          )}

          {/* Nút in hợp đồng cho toàn bộ danh sách hiển thị */}
          {filteredExpiringContracts.length > 0 && (
            <button
              type="button"
              onClick={() => handleOpenDocGenerator(filteredExpiringContracts.map((c) => c.employee))}
              className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 flex items-center gap-1.5 transition-colors cursor-pointer ml-auto"
              title="Mở cửa sổ tạo văn bản hợp đồng cho toàn bộ danh sách đang hiển thị"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>In HĐ cho tất cả ({filteredExpiringContracts.length})</span>
            </button>
          )}
        </div>

        {/* Bảng Dữ Liệu */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase text-[11px] tracking-wider">
                <th className="py-3.5 px-4 w-12 text-center">STT</th>
                <th className="py-3.5 px-4 min-w-[220px]">Nhân Viên</th>
                <th className="py-3.5 px-4 min-w-[180px]">Bộ Phận / Phòng Ban</th>
                <th className="py-3.5 px-4 w-40 text-center">Loại & Số HĐ</th>
                <th className="py-3.5 px-4 w-36 text-center">Thời Hạn HĐ</th>
                <th className="py-3.5 px-4 w-40 text-center">Ngày Hết Hạn</th>
                <th className="py-3.5 px-4 w-44 text-center">Tình Trạng Hết Hạn</th>
                <th className="py-3.5 px-4 w-20 text-center">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredExpiringContracts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-400">
                    <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-2.5" />
                    <p className="font-semibold text-sm text-slate-700">
                      Không có nhân sự nào sắp hết hạn hợp đồng
                      {contractSearch || contractDeptFilter !== 'ALL' || contractTypeFilter !== 'ALL'
                        ? ' khớp với điều kiện lọc'
                        : contractRangeFilter === '30days'
                        ? ' trong 30 ngày tới'
                        : ''}.
                    </p>
                    <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                      {contractStats.total > 0
                        ? 'Bạn có thể chọn mốc "Tất cả có HĐ" hoặc "Trong 60 ngày" ở trên để xem thêm.'
                        : 'Các nhân sự chưa cập nhật trường "Đến ngày" kết thúc hợp đồng trong hồ sơ.'}
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedContracts.map((item, idx) => {
                  const emp = item.employee;

                  return (
                    <tr
                      key={emp.id || idx}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        item.status === 'expired'
                          ? 'bg-red-50/20'
                          : item.status === 'today'
                          ? 'bg-rose-50/30'
                          : item.status === 'urgent'
                          ? 'bg-amber-50/20'
                          : ''
                      }`}
                    >
                      {/* STT */}
                      <td className="py-3.5 px-4 text-center font-mono-num text-slate-400 text-xs">
                        {(safeCurrentPage - 1) * pageSize + idx + 1}
                      </td>

                      {/* Thông tin nhân viên */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                              item.status === 'expired'
                                ? 'bg-red-100 text-red-700'
                                : item.status === 'today' || item.status === 'urgent'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-blue-100 text-blue-700'
                            }`}
                          >
                            {emp.fullName
                              ? emp.fullName
                                  .split(' ')
                                  .filter(Boolean)
                                  .slice(-2)
                                  .map((n) => n[0])
                                  .join('')
                                  .toUpperCase()
                              : 'NV'}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 truncate">
                              {emp.fullName}
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono-num mt-0.5">
                              <span>MSNV: <strong>{emp.msnv || '—'}</strong></span>
                              {(emp.congViec || emp.chucVu) && (
                                <>
                                  <span>•</span>
                                  <span className="truncate max-w-[140px]">
                                    {emp.congViec || emp.chucVu}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Bộ phận / Phòng ban */}
                      <td className="py-3.5 px-4 text-slate-700">
                        <span className="font-semibold block truncate" title={emp.department || emp.phongBan}>
                          {emp.department || emp.phongBan || '—'}
                        </span>
                        {emp.phongBanCon && (
                          <span className="text-[11px] text-slate-400 block truncate">
                            {emp.phongBanCon}
                          </span>
                        )}
                      </td>

                      {/* Loại & Số HĐ */}
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          {item.loaiHd || 'HĐTV'}
                        </span>
                        {item.soHd && (
                          <p className="text-[11px] text-slate-400 font-mono-num mt-0.5">
                            Số: {item.soHd}
                          </p>
                        )}
                      </td>

                      {/* Thời hạn HĐ */}
                      <td className="py-3.5 px-4 text-center text-slate-600 font-mono-num text-[11px]">
                        {item.tuNgay ? (
                          <div>
                            <div>Từ: <strong>{item.tuNgay}</strong></div>
                            {item.thoiHan && (
                              <div className="text-slate-400 text-[10px]">
                                ({item.thoiHan})
                              </div>
                            )}
                          </div>
                        ) : item.thoiHan ? (
                          <span>{item.thoiHan}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Ngày hết hạn (Đến ngày) */}
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-block font-mono-num font-bold text-xs px-2.5 py-1 rounded-lg border border-slate-200 bg-white shadow-2xs">
                          {item.denNgay}
                        </span>
                      </td>

                      {/* Tình trạng & Thời gian còn lại */}
                      <td className="py-3.5 px-4 text-center">
                        {isContractTerminated(item.employee) || item.employee.tinhTrang === 'Hết hiệu lực' || item.employee.trangThaiHopDong === 'Hết hiệu lực' || item.employee.tinhTrang === 'Nghỉ việc' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300 shadow-2xs">
                            <CheckCircle2 className="w-3.5 h-3.5 text-slate-500" />
                            Đã nghỉ việc
                          </span>
                        ) : item.status === 'expired' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-200 shadow-2xs">
                            <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                            Đã quá hạn {Math.abs(item.diffDays)} ngày
                          </span>
                        ) : item.status === 'today' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200 animate-pulse">
                            <Clock className="w-3.5 h-3.5 text-rose-600" />
                            Hết hạn hôm nay!
                          </span>
                        ) : item.status === 'urgent' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                            Còn {item.diffDays} ngày (Gấp)
                          </span>
                        ) : item.status === 'warning' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                            <Clock className="w-3.5 h-3.5 text-amber-600" />
                            Còn {item.diffDays} ngày
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                            Còn {item.diffDays} ngày
                          </span>
                        )}
                      </td>

                      {/* Thao tác: Dấu 3 chấm mở menu thao tác */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="relative inline-block text-left">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenActionMenuEmpId(
                                openActionMenuEmpId === item.employee.id ? null : item.employee.id
                              );
                            }}
                            className={`p-1.5 rounded-lg cursor-pointer transition-colors ${
                              openActionMenuEmpId === item.employee.id
                                ? 'bg-blue-100 text-blue-700'
                                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200'
                            }`}
                            title="Bấm để mở các thao tác"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>

                          {openActionMenuEmpId === item.employee.id && (
                            <>
                              <div
                                className="fixed inset-0 z-30"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenActionMenuEmpId(null);
                                }}
                              />
                              <div
                                className={`absolute right-0 z-40 w-56 bg-white border border-slate-200 rounded-2xl shadow-2xl py-2 text-left text-xs animate-in fade-in zoom-in-95 duration-100 ${
                                  paginatedContracts.indexOf(item) >= 4 &&
                                  paginatedContracts.indexOf(item) >= paginatedContracts.length - 3
                                    ? 'bottom-full mb-1 origin-bottom-right'
                                    : 'top-full mt-1 origin-top-right'
                                }`}
                              >
                                {/* Header của bảng thao tác */}
                                <div className="px-3.5 py-1.5 border-b border-slate-100 flex items-center justify-between">
                                  <span className="font-bold text-[10px] text-slate-400 uppercase tracking-wider">
                                    Bảng thao tác
                                  </span>
                                  <span className="text-[10px] font-mono-num font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                                    {item.employee.msnv}
                                  </span>
                                </div>

                                <div className="px-3.5 py-1 font-bold text-slate-900 text-xs truncate">
                                  {item.employee.fullName}
                                </div>

                                <div className="py-1">
                                  {/* THAO TÁC 0: Xem lịch sử hợp đồng */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenActionMenuEmpId(null);
                                      setViewingHistoryEmployee(item.employee);
                                    }}
                                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-indigo-700 hover:bg-indigo-50 cursor-pointer transition-colors group font-semibold"
                                  >
                                    <div className="p-1 rounded-md bg-indigo-100 text-indigo-700 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                      <History className="w-3.5 h-3.5" />
                                    </div>
                                    <span>Xem lịch sử hợp đồng</span>
                                  </button>

                                  {/* THAO TÁC 1: Tái ký hợp đồng */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenActionMenuEmpId(null);
                                      setRenewingEmployee(item.employee);
                                    }}
                                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-blue-700 hover:bg-blue-50 cursor-pointer transition-colors group font-semibold"
                                  >
                                    <div className="p-1 rounded-md bg-blue-100 text-blue-700 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                      <FileSignature className="w-3.5 h-3.5" />
                                    </div>
                                    <span>Tái ký hợp đồng</span>
                                  </button>

                                  {/* THAO TÁC 2: In / Tạo văn bản Hợp đồng */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenActionMenuEmpId(null);
                                      handleOpenDocGenerator([item.employee]);
                                    }}
                                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-slate-700 hover:bg-blue-50 hover:text-blue-700 cursor-pointer transition-colors group"
                                  >
                                    <Printer className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600" />
                                    <span className="font-medium">Tạo / In hợp đồng</span>
                                  </button>

                                  {/* THAO TÁC 2: In thẻ nhân viên này */}
                                  {onOpenPrintDialog && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenActionMenuEmpId(null);
                                        onOpenPrintDialog([item.employee.id]);
                                      }}
                                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-slate-700 hover:bg-slate-50 hover:text-slate-900 cursor-pointer transition-colors"
                                    >
                                      <Printer className="w-3.5 h-3.5 text-slate-400" />
                                      <span className="font-medium">In thẻ nhân viên này</span>
                                    </button>
                                  )}

                                  {/* THAO TÁC 3: Chấm dứt hợp đồng (chỉ hiển thị khi hợp đồng chưa chấm dứt) */}
                                  {onUpdateEmployee && !isContractTerminated(item.employee) && (
                                    <div className="pt-1 mt-1 border-t border-slate-100">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setOpenActionMenuEmpId(null);
                                          setTerminatingEmployee(item.employee);
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
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Phân trang */}
        {filteredExpiringContracts.length > 0 && (
          <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
            <div className="flex flex-wrap items-center gap-3">
              <span>
                Đang xem{' '}
                <strong className="font-mono-num text-slate-800">
                  {filteredExpiringContracts.length === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1}
                </strong>{' '}
                -{' '}
                <strong className="font-mono-num text-slate-800">
                  {Math.min(safeCurrentPage * pageSize, filteredExpiringContracts.length)}
                </strong>{' '}
                trong tổng số{' '}
                <strong className="font-mono-num text-blue-700">
                  {filteredExpiringContracts.length}
                </strong>{' '}
                hợp đồng
              </span>

              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">Số dòng:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs font-mono-num font-semibold text-slate-700 focus:outline-none focus:border-blue-600 cursor-pointer"
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
                          ? 'bg-blue-700 text-white shadow-2xs'
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
        )}
      </div>

      {/* Cửa sổ Tạo & In Hợp Đồng */}
      <ErrorBoundary
        fallbackTitle="Lỗi hiển thị cửa sổ Tạo văn bản hợp đồng"
        onReset={() => setIsDocGeneratorOpen(false)}
      >
        <DocumentGeneratorModal
          isOpen={isDocGeneratorOpen}
          onClose={() => setIsDocGeneratorOpen(false)}
          targetEmployees={generatorTargetEmployees}
        />
      </ErrorBoundary>

      {/* Modal Chấm dứt hợp đồng */}
      <ErrorBoundary
        fallbackTitle="Lỗi hiển thị cửa sổ Chấm dứt hợp đồng"
        onReset={() => setTerminatingEmployee(null)}
      >
        <TerminateContractModal
          isOpen={!!terminatingEmployee}
          employee={terminatingEmployee}
          onClose={() => setTerminatingEmployee(null)}
          onConfirm={handleTerminateContract}
        />
      </ErrorBoundary>

      {/* Modal Tái ký hợp đồng */}
      <ErrorBoundary
        fallbackTitle="Lỗi hiển thị cửa sổ Tái ký hợp đồng"
        onReset={() => setRenewingEmployee(null)}
      >
        <RenewContractModal
          isOpen={!!renewingEmployee}
          employee={renewingEmployee}
          onClose={() => setRenewingEmployee(null)}
          onRenewSuccess={(updatedEmp) => {
            if (onUpdateEmployee) {
              onUpdateEmployee(updatedEmp.id, updatedEmp);
            }
          }}
          onOpenDocumentGenerator={(updatedEmp) => {
            handleOpenDocGenerator([updatedEmp]);
          }}
          onShowToast={showToast}
        />
      </ErrorBoundary>

      {/* Modal Lịch sử hợp đồng */}
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

      {/* Toast thông báo */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl border text-xs font-semibold animate-in fade-in slide-in-from-bottom-2 ${
            toastMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}
    </div>
  );
};
