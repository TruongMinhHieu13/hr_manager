import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Briefcase,
  UserMinus,
  History,
  Plus,
  Search,
  Filter,
  Eye,
  Edit3,
  Trash2,
  Printer,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  AlertTriangle,
  FileText,
  Calendar,
  Building2,
  User,
} from 'lucide-react';
import {
  ActiveTab,
  AppSettings,
  AppointmentDecision,
  DecisionType,
  Department,
  Division,
  Employee,
  PositionHistoryItem,
  SubDepartment,
  UserRole,
} from '../types';
import { api } from '../api';
import { AppointmentFormModal } from './AppointmentFormModal';
import { AppointmentDetailModal } from './AppointmentDetailModal';

interface AppointmentManagementViewProps {
  activeSubMode: 'appointments' | 'dismissals' | 'position_histories';
  employees: Employee[];
  divisions: Division[];
  departments: Department[];
  subDepartments: SubDepartment[];
  appSettings?: AppSettings | null;
  userRole?: UserRole;
  onNavigate: (tab: ActiveTab) => void;
  onRefreshWorkspace?: () => Promise<void> | void;
}

function formatVnDate(iso?: string) {
  if (!iso) return '—';
  const parts = iso.slice(0, 10).split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function calcDurationText(startIso?: string, endIso?: string) {
  if (!startIso) return '';
  const start = new Date(startIso);
  const end = endIso ? new Date(endIso) : new Date();
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '';
  const diffDays = Math.max(0, Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  const years = Math.floor(diffDays / 365);
  const months = Math.floor((diffDays % 365) / 30);
  if (years > 0) return `${years} năm ${months} tháng`;
  if (months > 0) return `${months} tháng`;
  return `${diffDays} ngày`;
}

export const AppointmentManagementView: React.FC<AppointmentManagementViewProps> = ({
  activeSubMode,
  employees,
  divisions,
  departments,
  subDepartments,
  appSettings,
  userRole = 'admin',
  onNavigate,
  onRefreshWorkspace,
}) => {
  const [decisions, setDecisions] = useState<AppointmentDecision[]>([]);
  const [histories, setHistories] = useState<PositionHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchText, setSearchText] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterFromDate, setFilterFromDate] = useState('');
  const [filterToDate, setFilterToDate] = useState('');
  const [selectedHistoryEmployeeId, setSelectedHistoryEmployeeId] = useState('');

  // Modals
  const [formModalState, setFormModalState] = useState<{
    isOpen: boolean;
    mode: 'create' | 'edit';
    decisionType: DecisionType;
    initialDecision: AppointmentDecision | null;
  }>({
    isOpen: false,
    mode: 'create',
    decisionType: 'bo_nhiem',
    initialDecision: null,
  });

  const [detailDecision, setDetailDecision] = useState<AppointmentDecision | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const canCreateOrEdit = userRole === 'admin' || userRole === 'hr';
  const canDelete = userRole === 'admin';

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      if (activeSubMode === 'position_histories') {
        const list = await api.getPositionHistories({
          employeeId: selectedHistoryEmployeeId || undefined,
          search: searchText.trim() || undefined,
        });
        setHistories(list);
      } else {
        const type = activeSubMode === 'appointments' ? 'bo_nhiem' : 'mien_nhiem';
        const list = await api.getAppointments({
          type,
          search: searchText.trim() || undefined,
          department: filterDepartment || undefined,
          status: filterStatus || undefined,
          fromDate: filterFromDate || undefined,
          toDate: filterToDate || undefined,
        });
        setDecisions(list);
      }
    } catch (err: any) {
      showToast('error', err.message || 'Không thể tải dữ liệu.');
    } finally {
      setLoading(false);
    }
  }, [
    activeSubMode,
    searchText,
    filterDepartment,
    filterStatus,
    filterFromDate,
    filterToDate,
    selectedHistoryEmployeeId,
    showToast,
  ]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaved = async (message: string) => {
    setFormModalState((prev) => ({ ...prev, isOpen: false }));
    showToast('success', message);
    await loadData();
    if (onRefreshWorkspace) {
      await onRefreshWorkspace();
    }
  };

  const handleDelete = async (dec: AppointmentDecision) => {
    if (!canDelete) {
      showToast('error', 'Bạn không có quyền xóa quyết định.');
      return;
    }
    const confirmed = window.confirm(
      `Bạn có chắc chắn muốn xóa quyết định số "${dec.decisionNumber}" của ${dec.fullName}?\nHệ thống sẽ tự động đồng bộ lại chức vụ nhân sự.`
    );
    if (!confirmed) return;

    try {
      await api.deleteAppointment(dec.id, userRole);
      showToast('success', `Đã xóa quyết định ${dec.decisionNumber}.`);
      await loadData();
      if (onRefreshWorkspace) {
        await onRefreshWorkspace();
      }
    } catch (err: any) {
      showToast('error', err.message || 'Không thể xóa quyết định.');
    }
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'pending_effective':
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">
            <Clock className="w-3 h-3" /> Chờ hiệu lực
          </span>
        );
      case 'effective':
      case 'active':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
            <CheckCircle2 className="w-3 h-3" /> Đang hiệu lực
          </span>
        );
      case 'dismissed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-800">
            <AlertTriangle className="w-3 h-3" /> Đã miễn nhiệm
          </span>
        );
      case 'replaced':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-200 text-slate-700">
            Đã chuyển chức vụ
          </span>
        );
      case 'expired':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-orange-100 text-orange-800">
            Hết nhiệm kỳ
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">
            {status}
          </span>
        );
    }
  };

  const selectedHistoryEmployee = useMemo(
    () => employees.find((e) => e.id === selectedHistoryEmployeeId) || null,
    [employees, selectedHistoryEmployeeId]
  );

  return (
    <div className="space-y-4">
      {/* Toast notification */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-xs font-semibold ${
            toast.type === 'success'
              ? 'bg-emerald-600 text-white border-emerald-700'
              : 'bg-rose-600 text-white border-rose-700'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header & Sub-navigation */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-blue-700" />
              <span>Quản lý Bổ nhiệm & Miễn nhiệm nhân sự</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Theo dõi quyết định bổ nhiệm, miễn nhiệm, tự động cập nhật chức vụ & đơn vị theo ngày hiệu lực
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canCreateOrEdit && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setFormModalState({
                      isOpen: true,
                      mode: 'create',
                      decisionType: 'bo_nhiem',
                      initialDecision: null,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold shadow-xs cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Thêm QĐ Bổ nhiệm</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setFormModalState({
                      isOpen: true,
                      mode: 'create',
                      decisionType: 'mien_nhiem',
                      initialDecision: null,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                >
                  <UserMinus className="w-4 h-4" />
                  <span>Thêm QĐ Miễn nhiệm</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={loadData}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer"
              title="Làm mới dữ liệu"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Làm mới</span>
            </button>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onNavigate('appointments')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all ${
              activeSubMode === 'appointments'
                ? 'bg-blue-700 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Briefcase className="w-4 h-4" />
            <span>Quyết định bổ nhiệm</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('dismissals')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all ${
              activeSubMode === 'dismissals'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <UserMinus className="w-4 h-4" />
            <span>Quyết định miễn nhiệm</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('position_histories')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all ${
              activeSubMode === 'position_histories'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Lịch sử chức vụ nhân sự</span>
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="relative lg:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder={
                activeSubMode === 'position_histories'
                  ? 'Tìm theo tên nhân sự, MSNV, chức vụ, đơn vị...'
                  : 'Tìm theo tên nhân sự, MSNV, số quyết định, chức vụ...'
              }
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {activeSubMode === 'position_histories' ? (
            <div className="lg:col-span-2">
              <select
                value={selectedHistoryEmployeeId}
                onChange={(e) => setSelectedHistoryEmployeeId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Tất cả nhân sự --</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.msnv} - {emp.fullName} ({emp.congViec || emp.jobTitle || emp.chucVu || 'Chưa có chức vụ'})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <div>
                <select
                  value={filterDepartment}
                  onChange={(e) => setFilterDepartment(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Tất cả đơn vị --</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.name}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Tất cả trạng thái --</option>
                  <option value="pending_effective">Chờ hiệu lực</option>
                  <option value="effective">Đang hiệu lực</option>
                  <option value="replaced">Đã chuyển chức vụ</option>
                  <option value="dismissed">Đã miễn nhiệm</option>
                  <option value="expired">Hết nhiệm kỳ</option>
                </select>
              </div>
            </>
          )}

          <div className="flex items-center gap-2">
            {activeSubMode !== 'position_histories' && (
              <div className="flex items-center gap-1.5 w-full">
                <input
                  type="date"
                  value={filterFromDate}
                  onChange={(e) => setFilterFromDate(e.target.value)}
                  title="Hiệu lực từ ngày"
                  className="w-full px-2 py-2 text-[11px] border border-slate-300 rounded-xl"
                />
                <input
                  type="date"
                  value={filterToDate}
                  onChange={(e) => setFilterToDate(e.target.value)}
                  title="Hiệu lực đến ngày"
                  className="w-full px-2 py-2 text-[11px] border border-slate-300 rounded-xl"
                />
              </div>
            )}
            {(searchText || filterDepartment || filterStatus || filterFromDate || filterToDate || selectedHistoryEmployeeId) && (
              <button
                type="button"
                onClick={() => {
                  setSearchText('');
                  setFilterDepartment('');
                  setFilterStatus('');
                  setFilterFromDate('');
                  setFilterToDate('');
                  setSelectedHistoryEmployeeId('');
                }}
                className="px-2.5 py-2 rounded-xl border border-slate-300 text-xs text-slate-600 hover:bg-slate-100 shrink-0 cursor-pointer"
                title="Xóa bộ lọc"
              >
                <Filter className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      {activeSubMode !== 'position_histories' ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[920px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                  <th className="py-3 px-3 text-center w-12">STT</th>
                  <th className="py-3 px-3">Họ và tên</th>
                  <th className="py-3 px-3">Chức vụ</th>
                  <th className="py-3 px-3">Đơn vị</th>
                  <th className="py-3 px-3">Số quyết định</th>
                  <th className="py-3 px-3">Ngày quyết định</th>
                  <th className="py-3 px-3">Ngày hiệu lực</th>
                  <th className="py-3 px-3">Trạng thái</th>
                  <th className="py-3 px-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-500">
                      Đang tải dữ liệu...
                    </td>
                  </tr>
                ) : decisions.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-500">
                      Chưa có quyết định {activeSubMode === 'appointments' ? 'bổ nhiệm' : 'miễn nhiệm'} nào.
                    </td>
                  </tr>
                ) : (
                  decisions.map((dec, idx) => (
                    <tr key={dec.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3 text-center text-slate-500 font-medium">{idx + 1}</td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900">{dec.fullName}</div>
                        <div className="text-[11px] text-slate-500">MSNV: {dec.msnv}</div>
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-800">{dec.positionTitle}</td>
                      <td className="py-3 px-3 text-slate-700">{dec.departmentName}</td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-blue-700">{dec.decisionNumber}</div>
                        {dec.attachmentName && (
                          <a
                            href={api.getAppointmentAttachmentUrl(dec.id, false)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] text-slate-500 hover:text-blue-700 mt-0.5"
                          >
                            <FileText className="w-3 h-3" /> Đính kèm
                          </a>
                        )}
                      </td>
                      <td className="py-3 px-3 text-slate-600">{formatVnDate(dec.signDate)}</td>
                      <td className="py-3 px-3 font-semibold text-slate-800">
                        {formatVnDate(dec.effectiveDate)}
                      </td>
                      <td className="py-3 px-3">{renderStatusBadge(dec.status)}</td>
                      <td className="py-3 px-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setDetailDecision(dec)}
                            className="p-1.5 rounded-lg text-slate-600 hover:bg-blue-50 hover:text-blue-700 cursor-pointer"
                            title="Xem chi tiết & In/Xuất"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedHistoryEmployeeId(dec.employeeId);
                              onNavigate('position_histories');
                            }}
                            className="p-1.5 rounded-lg text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 cursor-pointer"
                            title="Xem lịch sử chức vụ nhân sự"
                          >
                            <History className="w-4 h-4" />
                          </button>
                          {canCreateOrEdit && (
                            <button
                              type="button"
                              onClick={() =>
                                setFormModalState({
                                  isOpen: true,
                                  mode: 'edit',
                                  decisionType: dec.decisionType,
                                  initialDecision: dec,
                                })
                              }
                              className="p-1.5 rounded-lg text-slate-600 hover:bg-amber-50 hover:text-amber-700 cursor-pointer"
                              title="Chỉnh sửa quyết định"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => handleDelete(dec)}
                              className="p-1.5 rounded-lg text-slate-600 hover:bg-rose-50 hover:text-rose-700 cursor-pointer"
                              title="Xóa quyết định"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Lịch sử chức vụ nhân sự */
        <div className="space-y-4">
          {selectedHistoryEmployee && (
            <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-700 text-white flex items-center justify-center">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-slate-900 text-sm">
                    {selectedHistoryEmployee.fullName} ({selectedHistoryEmployee.msnv})
                  </div>
                  <div className="text-slate-600">
                    Đơn vị hiện tại: <strong>{selectedHistoryEmployee.department || 'Chưa có'}</strong> • Công việc/Chức vụ hiện tại:{' '}
                    <strong className="text-blue-700">{selectedHistoryEmployee.congViec || selectedHistoryEmployee.jobTitle || selectedHistoryEmployee.chucVu || 'Chưa có'}</strong>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[920px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                    <th className="py-3 px-3 text-center w-12">STT</th>
                    <th className="py-3 px-3">Họ và tên</th>
                    <th className="py-3 px-3">Điều chuyển chức vụ (Cũ → Mới)</th>
                    <th className="py-3 px-3">Điều chuyển đơn vị (Cũ → Mới)</th>
                    <th className="py-3 px-3">Số QĐ Bổ nhiệm / Miễn nhiệm</th>
                    <th className="py-3 px-3">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500">
                        Đang tải lịch sử chức vụ...
                      </td>
                    </tr>
                  ) : histories.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500">
                        Chưa có dữ liệu lịch sử chức vụ.
                      </td>
                    </tr>
                  ) : (
                    histories.map((h, idx) => (
                      <tr key={h.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-3 text-center text-slate-500">{idx + 1}</td>
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900">{h.fullName}</div>
                          <div className="text-[11px] text-slate-500">MSNV: {h.msnv}</div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {h.previousPosition ? (
                              <>
                                <span className="text-slate-500 line-through decoration-slate-300">
                                  {h.previousPosition}
                                </span>
                                <span className="text-slate-400">→</span>
                              </>
                            ) : (
                              <>
                                <span className="text-slate-400 italic">Chưa có</span>
                                <span className="text-slate-400">→</span>
                              </>
                            )}
                            <span className="font-bold text-blue-700">{h.positionTitle}</span>
                            {h.status === 'dismissed' && (
                              <>
                                <span className="text-slate-400">→</span>
                                <span className="text-rose-600 font-semibold italic">Đã miễn nhiệm</span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-slate-700">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            {h.previousDepartment && h.previousDepartment !== h.departmentName ? (
                              <>
                                <span className="text-slate-500">{h.previousDepartment}</span>
                                <span className="text-slate-400">→</span>
                                <span className="font-semibold text-slate-900">{h.departmentName}</span>
                              </>
                            ) : (
                              <span className="font-medium text-slate-800">{h.departmentName}</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          {h.appointmentNumber && (
                            <div className="text-blue-700 font-semibold">BN: {h.appointmentNumber}</div>
                          )}
                          {h.dismissalNumber && (
                            <div className="text-rose-600 font-semibold">MN: {h.dismissalNumber}</div>
                          )}
                        </td>
                        <td className="py-3 px-3">{renderStatusBadge(h.status)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <AppointmentFormModal
        isOpen={formModalState.isOpen}
        mode={formModalState.mode}
        decisionType={formModalState.decisionType}
        initialDecision={formModalState.initialDecision}
        employees={employees}
        divisions={divisions}
        departments={departments}
        subDepartments={subDepartments}
        userRole={userRole}
        onClose={() => setFormModalState((prev) => ({ ...prev, isOpen: false }))}
        onSaved={handleSaved}
      />

      <AppointmentDetailModal
        decision={detailDecision}
        appSettings={appSettings}
        onClose={() => setDetailDecision(null)}
      />
    </div>
  );
};
