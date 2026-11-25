import React, { useState, useEffect, useMemo } from 'react';
import {
  UserMinus,
  FileCheck,
  FileText,
  Search,
  Filter,
  Plus,
  Trash2,
  Edit3,
  CheckCircle2,
  AlertCircle,
  Clock,
  Calendar,
  Building2,
  Users,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Sparkles,
  Paperclip,
  Check,
  X,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  MoreVertical,
  Printer,
  ClipboardCheck,
  FileSpreadsheet,
  Upload,
  RotateCcw,
  History,
} from 'lucide-react';
import { Employee, ResignationApplication, ActiveTab } from '../types';
import { api } from '../api';
import { isContractTerminated, parseFullDate } from '../utils/employeeUtils';
import { ResignationFormModal } from './ResignationFormModal';
import { ResignationExcelImportModal } from './ResignationExcelImportModal';
import { ResignationWorkHistorySection } from './ResignationWorkHistorySection';
import { NotificationModal, NotificationStat } from './NotificationModal';
import { DocumentGeneratorModal } from './DocumentGeneratorModal';
import { ErrorBoundary } from './ErrorBoundary';

interface ResignationManagementViewProps {
  employees: Employee[];
  onNavigate?: (tab: ActiveTab) => void;
  onUpdateEmployee?: (id: string, updates: Partial<Employee>) => Promise<unknown>;
  onBatchUpdateEmployees?: (updatedList: Employee[]) => void;
}

export const ResignationManagementView: React.FC<ResignationManagementViewProps> = ({
  employees,
  onNavigate,
  onUpdateEmployee,
  onBatchUpdateEmployees,
}) => {
  // Main Tab: 'expired_contracts' (Hợp đồng hết hiệu lực) | 'applications' (Đơn xin nghỉ việc) | 'procedures' (Thủ tục nghỉ việc)
  const [activeSubTab, setActiveSubTab] = useState<'expired_contracts' | 'applications' | 'procedures'>('expired_contracts');

  // Trạng thái Menu thao tác nổi (Floating Action Menu) - Sử dụng position fixed để tránh bị cắt bởi table overflow
  const [actionMenuState, setActionMenuState] = useState<{
    id: string;
    type: 'expired' | 'app' | 'procedure';
    data: Employee | ResignationApplication;
    top: number;
    right: number;
    openUpwards: boolean;
  } | null>(null);

  const handleToggleActionMenu = (
    e: React.MouseEvent<HTMLButtonElement>,
    id: string,
    type: 'expired' | 'app' | 'procedure',
    data: Employee | ResignationApplication
  ) => {
    e.stopPropagation();
    if (actionMenuState && actionMenuState.id === id) {
      setActionMenuState(null);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const menuHeight = 220;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpwards = spaceBelow < menuHeight && rect.top > menuHeight;

    setActionMenuState({
      id,
      type,
      data,
      top: openUpwards ? rect.top - 6 : rect.bottom + 6,
      right: Math.max(16, window.innerWidth - rect.right),
      openUpwards,
    });
  };

  // Modal Tạo văn bản (Quyết định thôi việc, Biên bản bàn giao, etc.)
  const [isDocGeneratorOpen, setIsDocGeneratorOpen] = useState(false);
  const [generatorTargetEmployees, setGeneratorTargetEmployees] = useState<Employee[]>([]);

  // Applications list from API
  const [applications, setApplications] = useState<ResignationApplication[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Modal State
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isExcelImportModalOpen, setIsExcelImportModalOpen] = useState(false);
  const [editingApplication, setEditingApplication] = useState<Partial<ResignationApplication> | null>(null);

  // Delete Confirm State
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Notification dialog
  const [notification, setNotification] = useState<{
    isOpen: boolean;
    type: 'success' | 'error' | 'info';
    title: string;
    message: string;
    stats?: NotificationStat[];
  }>({
    isOpen: false,
    type: 'info',
    title: '',
    message: '',
  });

  // Tab 1 (Nhân viên nghỉ việc / HĐ hết hiệu lực) Search & Filter
  const [expiredSearch, setExpiredSearch] = useState('');
  const [expiredDeptFilter, setExpiredDeptFilter] = useState('ALL');
  const [expiredPage, setExpiredPage] = useState(1);
  const EXPIRED_PER_PAGE = 15;

  // Tab 2 (Danh sách đơn nghỉ việc) Search & Filter
  const [appSearch, setAppSearch] = useState('');
  const [appStatusFilter, setAppStatusFilter] = useState('ALL');
  const [appReasonFilter, setAppReasonFilter] = useState('ALL');
  const [appPage, setAppPage] = useState(1);
  const APPS_PER_PAGE = 12;

  // Tab 3 (Thủ tục thôi việc & Bàn giao) Search & Filter
  const [procedureViewMode, setProcedureViewMode] = useState<'tasks' | 'work_history'>('tasks');
  const [procedureSearch, setProcedureSearch] = useState('');
  const [procedureFilter, setProcedureFilter] = useState<'ALL' | 'COMPLETED' | 'UPCOMING'>('ALL');
  const [procedurePage, setProcedurePage] = useState(1);
  const PROCEDURES_PER_PAGE = 12;

  // Mở cửa sổ Tạo văn bản với danh sách nhân sự mục tiêu
  const handleOpenDocGenerator = (targetList: Employee[]) => {
    if (!targetList || targetList.length === 0) return;
    setGeneratorTargetEmployees(targetList);
    setIsDocGeneratorOpen(true);
  };

  // Ánh xạ đơn thôi việc (ResignationApplication) sang đối tượng Employee đầy đủ
  const getEmployeeFromApp = (app: ResignationApplication): Employee => {
    const rawMsnv = (app.msnv || '').trim().toLowerCase();
    const rawMsnvNoZero = rawMsnv.replace(/^0+/, '');

    const found = employees.find((e) => {
      if (app.employeeId && e.id === app.employeeId) return true;
      if (e.msnv) {
        const eMsnv = e.msnv.trim().toLowerCase();
        const eMsnvNoZero = eMsnv.replace(/^0+/, '');
        if (eMsnv === rawMsnv || (rawMsnvNoZero && eMsnvNoZero === rawMsnvNoZero)) return true;
      }
      return false;
    });

    if (found) {
      return {
        ...found,
        denNgay: app.ngayNghi || found.denNgay,
        extraData: {
          ...(found.extraData || {}),
          soQuyetDinh: app.soQuyetDinh,
          ngayNghi: app.ngayNghi,
          ngayHenTraLuong: app.ngayHenTraLuong,
          thangBaoCao: app.thangBaoCao,
          lyDoNghi: app.lyDo || app.nhomLyDo,
          nhomLyDo: app.nhomLyDo || app.lyDo,
          nguoiDuyet: app.nguoiDuyet,
        },
      };
    }

    return {
      id: app.employeeId || `emp_res_${app.id}`,
      msnv: app.msnv,
      fullName: app.fullName,
      department: app.donVi || 'VIETSUN ĐỒNG NAI',
      joinDate: '',
      photoUrl: '',
      printCount: 0,
      lastPrintedAt: '',
      ownerId: 'workspace_vietsun_dong_nai_v1',
      donVi: app.donVi,
      congViec: app.viTri,
      soHd: app.soHd,
      loaiHd: app.loaiHd,
      denNgay: app.ngayNghi,
      tinhTrang: 'Nghỉ việc',
      extraData: {
        soQuyetDinh: app.soQuyetDinh,
        ngayNghi: app.ngayNghi,
        ngayHenTraLuong: app.ngayHenTraLuong,
        thangBaoCao: app.thangBaoCao,
        lyDoNghi: app.lyDo || app.nhomLyDo,
        nhomLyDo: app.nhomLyDo || app.lyDo,
        nguoiDuyet: app.nguoiDuyet,
      },
    };
  };

  // Load applications from API
  const loadApplications = async () => {
    try {
      setIsLoading(true);
      const data = await api.getResignationApplications();
      setApplications(data);
    } catch (err) {
      console.error('Lỗi tải danh sách đơn nghỉ việc:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadApplications();
  }, []);

  // ==========================================
  // TẬP HỢP NHÂN SỰ ĐÃ TẠO ĐƠN NGHỈ VIỆC
  // (Đã tạo đơn thì không nằm ở bảng đầu nữa)
  // ==========================================
  const createdAppMsnvSet = useMemo(() => {
    const set = new Set<string>();
    applications.forEach((app) => {
      if (app.msnv) set.add(app.msnv.trim().toLowerCase());
      if (app.employeeId) set.add(app.employeeId.trim());
    });
    return set;
  }, [applications]);

  // ==========================================
  // TAB 1: DANH SÁCH NHÂN VIÊN NGHỈ VIỆC (CHƯA LẬP ĐƠN)
  // ==========================================
  const expiredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      // 1. Tuyệt đối không lấy những người đang làm việc (tinhTrang: 'LV' hoặc 'Đang làm việc')
      if (emp.tinhTrang === 'LV' || emp.tinhTrang === 'Đang làm việc') return false;

      // 2. Đã tạo đơn thì KHÔNG nằm ở bảng đầu nữa
      const msnvKey = (emp.msnv || '').trim().toLowerCase();
      if (createdAppMsnvSet.has(msnvKey) || createdAppMsnvSet.has(emp.id)) {
        return false;
      }

      // 3. Chỉ lấy những nhân sự có trạng thái đã chấm dứt hợp đồng / thôi việc / hết hiệu lực thực sự
      return isContractTerminated(emp);
    });
  }, [employees, createdAppMsnvSet]);

  // Bộ lọc danh mục phòng ban của HĐ hết hiệu lực
  const expiredDepts = useMemo(() => {
    const set = new Set<string>();
    expiredEmployees.forEach((e) => {
      const d = e.department || e.phongBan || e.boPhan;
      if (d) set.add(d);
    });
    return Array.from(set).sort();
  }, [expiredEmployees]);

  // Lọc danh sách HĐ hết hiệu lực
  const filteredExpiredEmployees = useMemo(() => {
    let result = expiredEmployees;

    if (expiredSearch.trim()) {
      const q = expiredSearch.toLowerCase().trim();
      result = result.filter(
        (emp) =>
          emp.fullName?.toLowerCase().includes(q) ||
          emp.msnv?.toLowerCase().includes(q) ||
          emp.soHd?.toLowerCase().includes(q) ||
          emp.department?.toLowerCase().includes(q)
      );
    }

    if (expiredDeptFilter !== 'ALL') {
      result = result.filter(
        (emp) => (emp.department || emp.phongBan || emp.boPhan) === expiredDeptFilter
      );
    }

    // Sắp xếp ngày nghỉ gần nhất lên đầu
    return [...result].sort((a, b) => {
      const dateA = parseFullDate(a.denNgay || (a.extraData as any)?.ngayNghi)?.getTime() || 0;
      const dateB = parseFullDate(b.denNgay || (b.extraData as any)?.ngayNghi)?.getTime() || 0;
      return dateB - dateA;
    });
  }, [expiredEmployees, expiredSearch, expiredDeptFilter]);

  // Phân trang HĐ hết hiệu lực
  const totalExpiredPages = Math.ceil(filteredExpiredEmployees.length / EXPIRED_PER_PAGE) || 1;
  const paginatedExpiredEmployees = useMemo(() => {
    const start = (expiredPage - 1) * EXPIRED_PER_PAGE;
    return filteredExpiredEmployees.slice(start, start + EXPIRED_PER_PAGE);
  }, [filteredExpiredEmployees, expiredPage]);

  // ==========================================
  // TAB 2: DANH SÁCH ĐƠN XIN NGHỈ VIỆC
  // (Đơn đã chuyển sang "Đã hoàn thành" sẽ mất ở trang này và chuyển sang Tab Thủ tục)
  // ==========================================
  const filteredApplications = useMemo(() => {
    let result = applications.filter((app) => app.trangThai !== 'Đã hoàn thành');

    if (appSearch.trim()) {
      const q = appSearch.toLowerCase().trim();
      result = result.filter(
        (app) =>
          app.fullName?.toLowerCase().includes(q) ||
          app.msnv?.toLowerCase().includes(q) ||
          app.donVi?.toLowerCase().includes(q)
      );
    }

    if (appStatusFilter !== 'ALL') {
      result = result.filter((app) => app.trangThai === appStatusFilter);
    }

    if (appReasonFilter !== 'ALL') {
      result = result.filter((app) => app.lyDo === appReasonFilter || app.nhomLyDo === appReasonFilter);
    }

    // Sắp xếp ngày nghỉ gần nhất lên đầu
    return [...result].sort((a, b) => {
      const dateA = parseFullDate(a.ngayNghi)?.getTime() || 0;
      const dateB = parseFullDate(b.ngayNghi)?.getTime() || 0;
      return dateB - dateA;
    });
  }, [applications, appSearch, appStatusFilter, appReasonFilter]);

  const totalAppPages = Math.ceil(filteredApplications.length / APPS_PER_PAGE) || 1;
  const paginatedApplications = useMemo(() => {
    const start = (appPage - 1) * APPS_PER_PAGE;
    return filteredApplications.slice(start, start + APPS_PER_PAGE);
  }, [filteredApplications, appPage]);

  // ==========================================
  // TAB 3: THỦ TỤC NGHỈ VIỆC & BÀN GIAO
  // (Đơn có trạng thái hoàn thành VÀ đơn có ngày nghỉ sắp tới trong vòng 10 ngày)
  // ==========================================
  const rawProcedureApplications = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return applications.filter((app) => {
      // 1. Trạng thái đã hoàn thành
      const isCompleted = app.trangThai === 'Đã hoàn thành';
      if (isCompleted) return true;

      // 2. Ngày nghỉ sắp tới trong vòng 10 ngày (kể cả hôm nay hoặc đã quá hạn mà chưa hoàn tất)
      const date = parseFullDate(app.ngayNghi);
      if (date) {
        date.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays <= 10) return true;
      }

      return false;
    });
  }, [applications]);

  const filteredProcedureApplications = useMemo(() => {
    let result = rawProcedureApplications;

    if (procedureSearch.trim()) {
      const q = procedureSearch.toLowerCase().trim();
      result = result.filter(
        (app) =>
          app.fullName?.toLowerCase().includes(q) ||
          app.msnv?.toLowerCase().includes(q) ||
          app.donVi?.toLowerCase().includes(q) ||
          app.viTri?.toLowerCase().includes(q)
      );
    }

    if (procedureFilter !== 'ALL') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (procedureFilter === 'COMPLETED') {
        result = result.filter((app) => app.trangThai === 'Đã hoàn thành');
      } else if (procedureFilter === 'UPCOMING') {
        result = result.filter((app) => {
          const isCompleted = app.trangThai === 'Đã hoàn thành';
          if (isCompleted) return false;
          const date = parseFullDate(app.ngayNghi);
          if (date) {
            date.setHours(0, 0, 0, 0);
            const diffDays = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            return diffDays >= 0 && diffDays <= 10;
          }
          return false;
        });
      }
    }

    // Sắp xếp ngày nghỉ gần nhất lên đầu
    return [...result].sort((a, b) => {
      const dateA = parseFullDate(a.ngayNghi)?.getTime() || 0;
      const dateB = parseFullDate(b.ngayNghi)?.getTime() || 0;
      return dateB - dateA;
    });
  }, [rawProcedureApplications, procedureSearch, procedureFilter]);

  const totalProcedurePages = Math.ceil(filteredProcedureApplications.length / PROCEDURES_PER_PAGE) || 1;
  const paginatedProcedureApplications = useMemo(() => {
    const start = (procedurePage - 1) * PROCEDURES_PER_PAGE;
    return filteredProcedureApplications.slice(start, start + PROCEDURES_PER_PAGE);
  }, [filteredProcedureApplications, procedurePage]);

  // Stats calculation
  const stats = useMemo(() => {
    const totalApps = applications.filter((a) => a.trangThai !== 'Đã hoàn thành').length;
    const inProgress = applications.filter((a) => a.trangThai === 'Đang thực hiện').length;
    const completed = applications.filter((a) => a.trangThai === 'Đã hoàn thành').length;
    const pending = applications.filter((a) => a.trangThai === 'Chờ duyệt').length;
    const totalExpired = expiredEmployees.length;
    const totalProcedures = rawProcedureApplications.length;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming10Days = applications.filter((a) => {
      const isComp = a.trangThai === 'Đã hoàn thành';
      if (isComp) return false;
      const d = parseFullDate(a.ngayNghi);
      if (d) {
        d.setHours(0, 0, 0, 0);
        const diff = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return diff >= 0 && diff <= 10;
      }
      return false;
    }).length;

    return { totalApps, inProgress, completed, pending, totalExpired, totalProcedures, upcoming10Days };
  }, [applications, expiredEmployees, rawProcedureApplications]);

  // Open Form to Create from an Expired Employee
  const handleCreateFromEmployee = (emp: Employee) => {
    const today = new Date();
    const currentMonth = `${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
    setEditingApplication({
      employeeId: emp.id,
      fullName: emp.fullName || '',
      msnv: emp.msnv || '',
      donVi: emp.donVi || 'CÔNG TY CỔ PHẦN ĐẦU TƯ MẶT TRỜI VIỆT - CN ĐỒNG NAI',
      viTri: emp.congViec || emp.jobTitle || emp.department || 'Công nhân may',
      soHd: emp.soHd || '',
      loaiHd: emp.loaiHd || 'HĐXĐTH',
      lyDo: 'Duyệt theo đơn',
      ngayNghi: emp.denNgay || '',
      ngayHenTraLuong: '',
      thangBaoCao: currentMonth,
      trangThai: 'Đang thực hiện',
    });
    setIsFormModalOpen(true);
  };

  // Save Application (Create or Update)
  const handleSaveApplication = async (appData: Partial<ResignationApplication>) => {
    try {
      const saved = await api.saveResignationApplication(appData);

      // Cập nhật state nội bộ
      setApplications((prev) => {
        const idx = prev.findIndex((a) => a.id === saved.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = saved;
          return next;
        }
        return [saved, ...prev];
      });

      // Nếu đơn có cập nhật trạng thái "Đã hoàn thành", đồng bộ trạng thái nhân viên sang 'Hết hiệu lực'
      if (saved.employeeId && saved.trangThai === 'Đã hoàn thành' && onUpdateEmployee) {
        try {
          await onUpdateEmployee(saved.employeeId, {
            tinhTrang: 'Hết hiệu lực',
            trangThaiHopDong: 'Hết hiệu lực',
            denNgay: saved.ngayNghi || undefined,
          });
        } catch (syncErr) {
          console.warn('Lỗi đồng bộ trạng thái nhân viên:', syncErr);
        }
      }

      setNotification({
        isOpen: true,
        type: 'success',
        title: 'Thao tác thành công',
        message: appData.id
          ? `Đã cập nhật Đơn xin thôi việc cho nhân viên ${saved.fullName} (${saved.msnv})`
          : `Đã tạo mới Đơn xin thôi việc cho nhân viên ${saved.fullName} (${saved.msnv})`,
        stats: [
          { label: 'Nhân viên', value: `${saved.fullName} (${saved.msnv})`, color: 'blue' },
          { label: 'Trạng thái đơn', value: saved.trangThai, color: 'emerald' },
          { label: 'Số việc bàn giao', value: `${saved.danhSachCongViec?.length || 0} việc`, color: 'slate' },
        ],
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi lưu đơn xin nghỉ việc';
      setNotification({
        isOpen: true,
        type: 'error',
        title: 'Lỗi lưu dữ liệu',
        message: msg,
      });
      throw err;
    }
  };

  // Trạng thái chọn nhiều nhân sự ở Tab 1 (Danh sách nhân viên nghỉ việc)
  const [selectedExpiredIds, setSelectedExpiredIds] = useState<Set<string>>(new Set());
  // Nhân sự cần khôi phục (trả về trạng thái bình thường)
  const [restoringEmployee, setRestoringEmployee] = useState<Employee | null>(null);
  const [isConfirmingBatchRestore, setIsConfirmingBatchRestore] = useState(false);
  const [isRestoringLoading, setIsRestoringLoading] = useState(false);

  // Xử lý chọn / bỏ chọn checkbox ở Tab 1
  const handleToggleSelectExpired = (id: string) => {
    setSelectedExpiredIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAllExpired = () => {
    if (selectedExpiredIds.size >= paginatedExpiredEmployees.length && paginatedExpiredEmployees.length > 0) {
      setSelectedExpiredIds(new Set());
    } else {
      setSelectedExpiredIds(new Set(paginatedExpiredEmployees.map((e) => e.id)));
    }
  };

  // Khôi phục 1 nhân viên ở Tab 1 về trạng thái bình thường
  const handleConfirmRestoreSingle = async () => {
    if (!restoringEmployee) return;
    setIsRestoringLoading(true);
    try {
      await api.restoreEmployeeStatus({ ids: [restoringEmployee.id] });

      const restoredExtra = {
        ...(restoringEmployee.extraData || {}),
        tinhTrangHopDong: 'Hiệu lực',
      };
      delete (restoredExtra as any).ngayNghi;
      delete (restoredExtra as any).ngayHenTraLuong;
      delete (restoredExtra as any).lyDoNghi;
      delete (restoredExtra as any).nhomLyDo;
      delete (restoredExtra as any).thangBaoCao;

      const updatedEmpData: Partial<Employee> = {
        tinhTrang: 'LV',
        trangThaiHopDong: 'Hiệu lực',
        extraData: restoredExtra,
      };

      if (onUpdateEmployee) {
        await onUpdateEmployee(restoringEmployee.id, updatedEmpData);
      } else if (onBatchUpdateEmployees) {
        onBatchUpdateEmployees([{ ...restoringEmployee, ...updatedEmpData }]);
      }

      // Xóa khỏi danh sách đơn thôi việc nếu có
      setApplications((prev) =>
        prev.filter((a) => a.employeeId !== restoringEmployee.id && a.msnv !== restoringEmployee.msnv)
      );
      setSelectedExpiredIds((prev) => {
        const next = new Set(prev);
        next.delete(restoringEmployee.id);
        return next;
      });

      setRestoringEmployee(null);
      setNotification({
        isOpen: true,
        type: 'success',
        title: 'Khôi phục nhân sự thành công',
        message: `Đã xóa khỏi danh sách nghỉ việc và trả về trạng thái bình thường (Đang làm việc - Hợp đồng hiệu lực) cho nhân viên ${restoringEmployee.fullName} (${restoringEmployee.msnv}).`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi khôi phục trạng thái nhân viên';
      setNotification({
        isOpen: true,
        type: 'error',
        title: 'Lỗi khôi phục',
        message: msg,
      });
    } finally {
      setIsRestoringLoading(false);
    }
  };

  // Khôi phục nhiều nhân viên ở Tab 1 về trạng thái bình thường
  const handleConfirmRestoreBatch = async () => {
    const ids = Array.from(selectedExpiredIds);
    if (ids.length === 0) return;
    setIsRestoringLoading(true);
    try {
      await api.restoreEmployeeStatus({ ids });
      const targetEmps = employees.filter((e) => ids.includes(e.id));
      const updatedList: Employee[] = targetEmps.map((emp) => {
        const restoredExtra = {
          ...(emp.extraData || {}),
          tinhTrangHopDong: 'Hiệu lực',
        };
        delete (restoredExtra as any).ngayNghi;
        delete (restoredExtra as any).ngayHenTraLuong;
        delete (restoredExtra as any).lyDoNghi;
        delete (restoredExtra as any).nhomLyDo;
        delete (restoredExtra as any).thangBaoCao;

        return {
          ...emp,
          tinhTrang: 'LV',
          trangThaiHopDong: 'Hiệu lực',
          extraData: restoredExtra,
        };
      });

      if (onBatchUpdateEmployees) {
        onBatchUpdateEmployees(updatedList);
      } else if (onUpdateEmployee) {
        for (const item of updatedList) {
          await onUpdateEmployee(item.id, item);
        }
      }

      // Xóa khỏi danh sách đơn nếu có
      const msnvSet = new Set(targetEmps.map((e) => e.msnv));
      setApplications((prev) =>
        prev.filter((a) => !ids.includes(a.employeeId || '') && !msnvSet.has(a.msnv))
      );
      setSelectedExpiredIds(new Set());
      setIsConfirmingBatchRestore(false);

      setNotification({
        isOpen: true,
        type: 'success',
        title: 'Khôi phục hàng loạt thành công',
        message: `Đã xóa khỏi danh sách nghỉ việc và trả về trạng thái bình thường cho ${updatedList.length} nhân sự.`,
        stats: [
          { label: 'Đã khôi phục', value: `${updatedList.length} nhân sự`, color: 'emerald' },
          { label: 'Trạng thái mới', value: 'LV (Hiệu lực)', color: 'blue' },
        ],
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi khôi phục hàng loạt nhân viên';
      setNotification({
        isOpen: true,
        type: 'error',
        title: 'Lỗi khôi phục',
        message: msg,
      });
    } finally {
      setIsRestoringLoading(false);
    }
  };

  // Delete Application (Xóa đơn thôi việc & trả về trạng thái bình thường cho người lao động)
  const handleDeleteApplication = async (id: string) => {
    try {
      const appToDelete = applications.find((a) => a.id === id);
      if (appToDelete?.trangThai === 'Đã hoàn thành') {
        setDeletingId(null);
        setNotification({
          isOpen: true,
          type: 'error',
          title: 'Không thể xóa',
          message: 'Đơn xin thôi việc đã chuyển sang trạng thái "Đã hoàn thành" nên không thể xóa khỏi hệ thống.',
        });
        return;
      }

      const res = await api.deleteResignationApplication(id);
      setApplications((prev) => prev.filter((a) => a.id !== id));
      setDeletingId(null);

      // Trả nhân viên về trạng thái bình thường (LV / Hiệu lực)
      const empIdToRestore =
        res?.restoredEmployee?.id ||
        appToDelete?.employeeId ||
        employees.find((e) => appToDelete?.msnv && e.msnv === appToDelete.msnv)?.id;

      if (empIdToRestore) {
        const targetEmp = employees.find((e) => e.id === empIdToRestore);
        const restoredExtra = {
          ...(targetEmp?.extraData || {}),
          ...(res?.restoredEmployee?.extraData || {}),
          tinhTrangHopDong: 'Hiệu lực',
        };
        delete (restoredExtra as any).ngayNghi;
        delete (restoredExtra as any).ngayHenTraLuong;
        delete (restoredExtra as any).lyDoNghi;
        delete (restoredExtra as any).nhomLyDo;
        delete (restoredExtra as any).thangBaoCao;

        const updatedEmpData: Partial<Employee> = {
          tinhTrang: 'LV',
          trangThaiHopDong: 'Hiệu lực',
          extraData: restoredExtra,
        };

        if (onUpdateEmployee) {
          await onUpdateEmployee(empIdToRestore, updatedEmpData);
        } else if (onBatchUpdateEmployees && targetEmp) {
          onBatchUpdateEmployees([{ ...targetEmp, ...updatedEmpData }]);
        }
      }

      setNotification({
        isOpen: true,
        type: 'success',
        title: 'Đã xóa đơn & Khôi phục nhân sự',
        message: appToDelete
          ? `Đã xóa đơn thôi việc và trả lại trạng thái bình thường (Đang làm việc - Hợp đồng hiệu lực) cho nhân viên ${appToDelete.fullName} (${appToDelete.msnv}).`
          : 'Đơn xin thôi việc đã được xóa khỏi hệ thống và người lao động đã được đưa về trạng thái bình thường.',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi xóa đơn xin nghỉ việc';
      setNotification({
        isOpen: true,
        type: 'error',
        title: 'Lỗi xóa đơn',
        message: msg,
      });
    }
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      {/* ======================================================== */}
      {/* 1. HEADER CHÍNH & TỔNG QUAN THỐNG KÊ                     */}
      {/* ======================================================== */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100 shadow-2xs">
              <UserMinus className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  Danh Sách Nhân Viên Nghỉ Việc
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-700 border border-rose-200">
                  Nghỉ việc
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Quản lý danh sách nhân sự thôi việc, theo dõi bàn giao công việc và đơn xin nghỉ việc
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={loadApplications}
              disabled={isLoading}
              className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 cursor-pointer transition-colors"
              title="Tải lại dữ liệu"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-blue-600' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => setIsExcelImportModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 shadow-2xs cursor-pointer transition-all"
              title="Nhập danh sách nhân viên thôi việc từ file Excel"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Nhập từ Excel</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingApplication(null);
                setIsFormModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 shadow-sm cursor-pointer transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm mới đơn xin nghỉ việc</span>
            </button>
          </div>
        </div>

        {/* 4 Thẻ Thống Kê Nhanh */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-100">
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4">
            <div className="flex items-center justify-between text-slate-500 text-xs">
              <span>Chưa lập đơn thôi việc</span>
              <AlertCircle className="w-4 h-4 text-rose-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-1 font-mono-num">
              {stats.totalExpired}
            </div>
            <span className="text-[11px] text-slate-400">Nhân viên nghỉ việc</span>
          </div>

          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4">
            <div className="flex items-center justify-between text-slate-500 text-xs">
              <span>Tổng số đơn đã tạo</span>
              <FileText className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-1 font-mono-num">
              {stats.totalApps}
            </div>
            <span className="text-[11px] text-slate-400">Đơn xin nghỉ việc</span>
          </div>

          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4">
            <div className="flex items-center justify-between text-slate-500 text-xs">
              <span>Đang thực hiện</span>
              <Clock className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-2xl font-bold text-blue-700 mt-1 font-mono-num">
              {stats.inProgress}
            </div>
            <span className="text-[11px] text-blue-500">Đang bàn giao công việc</span>
          </div>

          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4">
            <div className="flex items-center justify-between text-slate-500 text-xs">
              <span>Thủ tục cần theo dõi</span>
              <FileCheck className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-bold text-emerald-700 mt-1 font-mono-num">
              {stats.totalProcedures}
            </div>
            <span className="text-[11px] text-emerald-600">
              {stats.completed} đã hoàn thành, {stats.upcoming10Days} sắp nghỉ (≤10 ngày)
            </span>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. THANH CHUYỂN TAB CHÍNH (3 PHÂN HỆ RÕ RÀNG THEO YÊU CẦU) */}
      {/* ======================================================== */}
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 pt-2 rounded-t-2xl shadow-2xs">
        <button
          type="button"
          onClick={() => {
            setActiveSubTab('expired_contracts');
            setExpiredPage(1);
          }}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 cursor-pointer transition-all ${
            activeSubTab === 'expired_contracts'
              ? 'border-blue-700 text-blue-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <UserMinus className="w-4 h-4" />
          <span>Danh sách nhân viên nghỉ việc</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              activeSubTab === 'expired_contracts'
                ? 'bg-blue-100 text-blue-800'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {stats.totalExpired}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveSubTab('applications');
            setAppPage(1);
          }}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 cursor-pointer transition-all ${
            activeSubTab === 'applications'
              ? 'border-blue-700 text-blue-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Danh sách Đơn xin nghỉ việc</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              activeSubTab === 'applications'
                ? 'bg-blue-100 text-blue-800'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {stats.totalApps}
          </span>
        </button>

        {/* TAB 3: THỦ TỤC NGHỈ VIỆC & BÀN GIAO */}
        <button
          type="button"
          onClick={() => {
            setActiveSubTab('procedures');
            setProcedurePage(1);
          }}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 cursor-pointer transition-all ${
            activeSubTab === 'procedures'
              ? 'border-emerald-700 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ClipboardCheck className="w-4 h-4" />
          <span>Thủ tục</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              activeSubTab === 'procedures'
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {stats.totalProcedures}
          </span>
        </button>
      </div>

      {/* ======================================================== */}
      {/* 3. NỘI DUNG TAB 1: DANH SÁCH HỢP ĐỒNG HẾT HIỆU LỰC       */}
      {/* ======================================================== */}
      {activeSubTab === 'expired_contracts' && (
        <div className="bg-white border border-slate-200 rounded-b-2xl shadow-xs overflow-hidden -mt-6 pt-5">
          {/* Bộ lọc Toolbar Tab 1 */}
          <div className="px-6 pb-4 flex flex-col md:flex-row items-center justify-between gap-3 border-b border-slate-100">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={expiredSearch}
                onChange={(e) => {
                  setExpiredSearch(e.target.value);
                  setExpiredPage(1);
                }}
                placeholder="Tìm mã NV, họ tên, số HĐ..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <span className="hidden sm:inline">Phòng ban:</span>
              </div>
              <select
                value={expiredDeptFilter}
                onChange={(e) => {
                  setExpiredDeptFilter(e.target.value);
                  setExpiredPage(1);
                }}
                className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-800 cursor-pointer"
              >
                <option value="ALL">Tất cả phòng ban</option>
                {expiredDepts.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => handleOpenDocGenerator(filteredExpiredEmployees)}
                disabled={filteredExpiredEmployees.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl cursor-pointer shadow-2xs disabled:opacity-50 transition-colors"
                title="Tạo văn bản cho toàn bộ danh sách nhân viên đang hiển thị"
              >
                <Printer className="w-3.5 h-3.5 text-blue-600" />
                <span>Tạo văn bản ({filteredExpiredEmployees.length})</span>
              </button>
            </div>
          </div>

          {/* Thanh công cụ khi chọn nhiều nhân sự ở Tab 1 */}
          {selectedExpiredIds.size > 0 && (
            <div className="mx-6 my-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-900 animate-in fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>
                  Đã chọn <b>{selectedExpiredIds.size}</b> nhân sự trong danh sách nghỉ việc
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedExpiredIds(new Set())}
                  className="px-3 py-1.5 rounded-lg text-slate-600 hover:bg-emerald-100/60 font-semibold cursor-pointer"
                >
                  Bỏ chọn
                </button>
                <button
                  type="button"
                  onClick={() => setIsConfirmingBatchRestore(true)}
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold cursor-pointer flex items-center gap-1.5 shadow-2xs"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Trả về bình thường ({selectedExpiredIds.size})</span>
                </button>
              </div>
            </div>
          )}

          {/* Bảng dữ liệu HĐ hết hiệu lực */}
          <div className="overflow-x-auto min-h-[160px]">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={
                        paginatedExpiredEmployees.length > 0 &&
                        selectedExpiredIds.size >= paginatedExpiredEmployees.length
                      }
                      onChange={handleToggleSelectAllExpired}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      title="Chọn tất cả trên trang này"
                    />
                  </th>
                  <th className="py-3 px-4 w-12 text-center">STT</th>
                  <th className="py-3 px-4 w-28">Mã NV</th>
                  <th className="py-3 px-4">Họ và tên</th>
                  <th className="py-3 px-4">Đơn vị công tác</th>
                  <th className="py-3 px-4">Vị trí / Bộ phận</th>
                  <th className="py-3 px-4">Số hợp đồng</th>
                  <th className="py-3 px-4">Loại HĐ</th>
                  <th className="py-3 px-4">Ngày hết hạn</th>
                  <th className="py-3 px-4 text-center">Trạng thái</th>
                  <th className="py-3 px-4 text-center w-28">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {paginatedExpiredEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-slate-400 italic">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                        <span className="font-semibold text-slate-600">
                          Không có nhân viên nghỉ việc nào chưa tạo đơn
                        </span>
                        <span className="text-[11px] text-slate-400">
                          Tất cả nhân sự nghỉ việc đã được tạo đơn thôi việc và chuyển sang Tab "Danh sách Đơn xin nghỉ việc"
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedExpiredEmployees.map((emp, idx) => {
                    const rowNumber = (expiredPage - 1) * EXPIRED_PER_PAGE + idx + 1;
                    const isSelected = selectedExpiredIds.has(emp.id);
                    return (
                      <tr
                        key={emp.id}
                        className={`transition-colors ${
                          isSelected ? 'bg-emerald-50/50' : 'hover:bg-slate-50/80'
                        }`}
                      >
                        <td className="py-3 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelectExpired(emp.id)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>
                        <td className="py-3 px-4 text-center text-slate-400 font-mono">
                          {rowNumber}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-blue-700">
                          {emp.msnv}
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-bold text-slate-900 block">{emp.fullName}</span>
                          <span className="text-[10px] text-slate-400">Ngày vào: {emp.joinDate || '—'}</span>
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {emp.donVi || 'VIETSUN ĐỒNG NAI'}
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-semibold text-slate-800 block">
                            {emp.congViec || emp.jobTitle || 'Công nhân may'}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {emp.department || emp.phongBan || '—'}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-700">
                          {emp.soHd || '—'}
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                            {emp.loaiHd || 'HĐXĐTH'}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-semibold text-rose-700 font-mono-num">
                          {emp.denNgay || '—'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            Đã nghỉ việc
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => setRestoringEmployee(emp)}
                              className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 cursor-pointer transition-colors"
                              title="Xóa khỏi danh sách nghỉ việc & Trả về trạng thái bình thường (LV)"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleToggleActionMenu(e, emp.id, 'expired', emp)}
                              className={`p-1.5 rounded-lg cursor-pointer transition-colors ${
                                actionMenuState?.id === emp.id
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

          {/* Pagination Tab 1 */}
          {filteredExpiredEmployees.length > EXPIRED_PER_PAGE && (
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
              <span>
                Hiển thị {paginatedExpiredEmployees.length} / {filteredExpiredEmployees.length} nhân viên
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={expiredPage === 1}
                  onClick={() => setExpiredPage(1)}
                  className="p-1.5 rounded hover:bg-white disabled:opacity-30 cursor-pointer"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={expiredPage === 1}
                  onClick={() => setExpiredPage((p) => p - 1)}
                  className="p-1.5 rounded hover:bg-white disabled:opacity-30 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-3 py-1 font-bold">
                  Trang {expiredPage} / {totalExpiredPages}
                </span>
                <button
                  type="button"
                  disabled={expiredPage === totalExpiredPages}
                  onClick={() => setExpiredPage((p) => p + 1)}
                  className="p-1.5 rounded hover:bg-white disabled:opacity-30 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={expiredPage === totalExpiredPages}
                  onClick={() => setExpiredPage(totalExpiredPages)}
                  className="p-1.5 rounded hover:bg-white disabled:opacity-30 cursor-pointer"
                >
                  <ChevronsRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* 4. NỘI DUNG TAB 2: DANH SÁCH ĐƠN XIN NGHỈ VIỆC           */}
      {/* ======================================================== */}
      {activeSubTab === 'applications' && (
        <div className="bg-white border border-slate-200 rounded-b-2xl shadow-xs overflow-hidden -mt-6 pt-5">
          {/* Bộ lọc Toolbar Tab 2 */}
          <div className="px-6 pb-4 flex flex-col md:flex-row items-center justify-between gap-3 border-b border-slate-100">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={appSearch}
                onChange={(e) => {
                  setAppSearch(e.target.value);
                  setAppPage(1);
                }}
                placeholder="Tìm mã NV, họ tên, đơn vị..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              {/* Lọc theo trạng thái */}
              <select
                value={appStatusFilter}
                onChange={(e) => {
                  setAppStatusFilter(e.target.value);
                  setAppPage(1);
                }}
                className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-800 cursor-pointer"
              >
                <option value="ALL">Tất cả trạng thái</option>
                <option value="Đang thực hiện">Đang thực hiện</option>
                <option value="Chờ duyệt">Chờ duyệt</option>
                <option value="Từ chối">Từ chối</option>
              </select>

              {/* Lọc theo lý do nghỉ việc */}
              <select
                value={appReasonFilter}
                onChange={(e) => {
                  setAppReasonFilter(e.target.value);
                  setAppPage(1);
                }}
                className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-800 cursor-pointer font-medium"
              >
                <option value="ALL">Tất cả lý do</option>
                <option value="Cho thôi việc">Cho thôi việc</option>
                <option value="Bỏ việc">Bỏ việc</option>
                <option value="Đơn phương CDHĐLĐ">Đơn phương CDHĐLĐ</option>
                <option value="Duyệt theo đơn">Duyệt theo đơn</option>
                <option value="Kỷ luật">Kỷ luật</option>
                <option value="Rút hồ sơ">Rút hồ sơ</option>
              </select>

              <button
                type="button"
                onClick={() => handleOpenDocGenerator(filteredApplications.map(getEmployeeFromApp))}
                disabled={filteredApplications.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl cursor-pointer shadow-2xs disabled:opacity-50 transition-colors"
                title="Tạo văn bản cho các đơn đang hiển thị"
              >
                <Printer className="w-3.5 h-3.5 text-blue-600" />
                <span>Tạo văn bản ({filteredApplications.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setIsExcelImportModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl cursor-pointer shadow-2xs transition-colors ml-auto"
                title="Nhập danh sách thôi việc từ file Excel"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Nhập từ Excel</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setEditingApplication(null);
                  setIsFormModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-xl cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm đơn</span>
              </button>
            </div>
          </div>

          {/* Bảng dữ liệu Đơn xin nghỉ việc */}
          <div className="overflow-x-auto min-h-[160px]">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 w-12 text-center">STT</th>
                  <th className="py-3 px-4 w-28">Mã NV</th>
                  <th className="py-3 px-4">Họ và tên</th>
                  <th className="py-3 px-4">Đơn vị & Vị trí</th>
                  <th className="py-3 px-4">Ngày nghỉ việc</th>
                  <th className="py-3 px-4">Ngày hẹn trả lương</th>
                  <th className="py-3 px-4">Lý do</th>
                  <th className="py-3 px-4">Tháng báo cáo</th>
                  <th className="py-3 px-4 text-center">Trạng thái</th>
                  <th className="py-3 px-4 text-center w-24">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {paginatedApplications.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-slate-400 italic">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <FileText className="w-8 h-8 text-slate-300" />
                        <span className="font-semibold text-slate-600">
                          Chưa có đơn xin nghỉ việc nào được tạo
                        </span>
                        <span className="text-[11px] text-slate-400">
                          Bấm nút "+ Thêm mới đơn xin nghỉ việc" hoặc chuyển sang tab "Hợp đồng hết hiệu lực" để tạo đơn
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingApplication(null);
                            setIsFormModalOpen(true);
                          }}
                          className="mt-2 inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Tạo đơn xin nghỉ việc ngay</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedApplications.map((app, idx) => {
                    const rowNumber = (appPage - 1) * APPS_PER_PAGE + idx + 1;
                    return (
                      <tr key={app.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 text-center text-slate-400 font-mono">
                          {rowNumber}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-blue-700">
                          {app.msnv}
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-bold text-slate-900 block">{app.fullName}</span>
                          <span className="text-[11px] text-slate-400">Số HĐ: {app.soHd || '—'}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-semibold text-slate-800 block">{app.viTri || '—'}</span>
                          <span className="text-[11px] text-slate-500 truncate max-w-[180px] block" title={app.donVi}>
                            {app.donVi || '—'}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-900 font-mono-num">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>{app.ngayNghi || '—'}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-semibold text-emerald-700 font-mono-num">
                          {app.ngayHenTraLuong ? (
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-emerald-500" />
                              <span>{app.ngayHenTraLuong}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic font-normal">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-800 border border-slate-200">
                            {app.lyDo || app.nhomLyDo || '—'}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-700 text-xs">
                          {app.thangBaoCao ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-mono text-[11px] font-bold border border-blue-100">
                              {app.thangBaoCao}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic font-normal">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold ${
                              app.trangThai === 'Đã hoàn thành'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : app.trangThai === 'Đang thực hiện'
                                ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                : app.trangThai === 'Từ chối'
                                ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                : 'bg-amber-100 text-amber-800 border border-amber-200'
                            }`}
                          >
                            {app.trangThai}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            type="button"
                            onClick={(e) => handleToggleActionMenu(e, app.id, 'app', app)}
                            className={`p-1.5 rounded-lg cursor-pointer transition-colors ${
                              actionMenuState?.id === app.id
                                ? 'bg-blue-100 text-blue-700'
                                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200'
                            }`}
                            title="Bấm để mở các thao tác"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Tab 2 */}
          {filteredApplications.length > APPS_PER_PAGE && (
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
              <span>
                Hiển thị {paginatedApplications.length} / {filteredApplications.length} đơn
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={appPage === 1}
                  onClick={() => setAppPage(1)}
                  className="p-1.5 rounded hover:bg-white disabled:opacity-30 cursor-pointer"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={appPage === 1}
                  onClick={() => setAppPage((p) => p - 1)}
                  className="p-1.5 rounded hover:bg-white disabled:opacity-30 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-3 py-1 font-bold">
                  Trang {appPage} / {totalAppPages}
                </span>
                <button
                  type="button"
                  disabled={appPage === totalAppPages}
                  onClick={() => setAppPage((p) => p + 1)}
                  className="p-1.5 rounded hover:bg-white disabled:opacity-30 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={appPage === totalAppPages}
                  onClick={() => setAppPage(totalAppPages)}
                  className="p-1.5 rounded hover:bg-white disabled:opacity-30 cursor-pointer"
                >
                  <ChevronsRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* 4.5. NỘI DUNG TAB 3: THỦ TỤC NGHỈ VIỆC & BÀN GIAO        */}
      {/* ======================================================== */}
      {activeSubTab === 'procedures' && (
        <div className="bg-white border border-slate-200 rounded-b-2xl shadow-xs overflow-hidden -mt-6 pt-5">
          {/* Thanh chuyển chế độ xem: Thủ tục bàn giao vs Lịch sử vào làm */}
          <div className="mx-6 mb-4 flex items-center bg-slate-100 p-1 rounded-xl w-fit">
            <button
              type="button"
              onClick={() => setProcedureViewMode('tasks')}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                procedureViewMode === 'tasks'
                  ? 'bg-white text-emerald-800 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ClipboardCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Hồ sơ thủ tục & Bàn giao</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-700 font-bold">
                {stats.totalProcedures}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setProcedureViewMode('work_history')}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                procedureViewMode === 'work_history'
                  ? 'bg-white text-blue-800 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <History className="w-3.5 h-3.5 text-blue-600" />
              <span>Lịch sử vào làm & Tuyển lại</span>
            </button>
          </div>

          {procedureViewMode === 'work_history' ? (
            <div className="pt-2">
              <ResignationWorkHistorySection
                employees={employees}
                onUpdateEmployee={onUpdateEmployee}
              />
            </div>
          ) : (
            <>
              {/* Thông tin hướng dẫn Tab 3 */}
              <div className="mx-6 mb-4 p-3.5 bg-emerald-50/60 border border-emerald-200/80 rounded-xl flex items-center justify-between gap-3 text-xs text-emerald-900">
                <div className="flex items-center gap-2.5">
                  <ClipboardCheck className="w-5 h-5 text-emerald-700 shrink-0" />
                  <span>
                    <strong>Mục Thủ Tục:</strong> Tự động tổng hợp những đơn thôi việc đã có trạng thái{' '}
                    <span className="font-bold underline">Hoàn thành</span> hoặc có ngày nghỉ sắp tới trong vòng{' '}
                    <span className="font-bold underline">10 ngày</span>. Nhấp vào dấu 3 chấm để in Quyết định thôi việc, Biên bản bàn giao hoặc cập nhật tiến độ bàn giao.
                  </span>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 font-bold font-mono-num text-[11px] shrink-0">
                  {filteredProcedureApplications.length} hồ sơ thủ tục
                </span>
              </div>

          {/* Bộ lọc Toolbar Tab 3 */}
          <div className="px-6 pb-4 flex flex-col md:flex-row items-center justify-between gap-3 border-b border-slate-100">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={procedureSearch}
                onChange={(e) => {
                  setProcedureSearch(e.target.value);
                  setProcedurePage(1);
                }}
                placeholder="Tìm số QĐ, mã NV, họ tên, đơn vị..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              {/* Lọc theo nhóm thủ tục */}
              <select
                value={procedureFilter}
                onChange={(e) => {
                  setProcedureFilter(e.target.value as 'ALL' | 'COMPLETED' | 'UPCOMING');
                  setProcedurePage(1);
                }}
                className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-800 cursor-pointer"
              >
                <option value="ALL">Tất cả thủ tục ({rawProcedureApplications.length})</option>
                <option value="COMPLETED">Đã hoàn thành thủ tục ({stats.completed})</option>
                <option value="UPCOMING">Sắp tới ngày nghỉ (≤ 10 ngày) ({stats.upcoming10Days})</option>
              </select>

              <button
                type="button"
                onClick={() => handleOpenDocGenerator(filteredProcedureApplications.map(getEmployeeFromApp))}
                disabled={filteredProcedureApplications.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl cursor-pointer shadow-2xs disabled:opacity-50 transition-colors"
                title="Tạo văn bản cho các hồ sơ thủ tục đang hiển thị"
              >
                <Printer className="w-3.5 h-3.5 text-emerald-600" />
                <span>Tạo văn bản ({filteredProcedureApplications.length})</span>
              </button>
            </div>
          </div>

          {/* Bảng dữ liệu Thủ tục nghỉ việc */}
          <div className="overflow-x-auto min-h-[160px]">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 w-12 text-center">STT</th>
                  <th className="py-3 px-4 w-28">Mã NV</th>
                  <th className="py-3 px-4">Họ và tên</th>
                  <th className="py-3 px-4">Đơn vị & Vị trí</th>
                  <th className="py-3 px-4">Ngày nghỉ & Thời hạn</th>
                  <th className="py-3 px-4 text-center">Bàn giao công việc</th>
                  <th className="py-3 px-4 text-center">Trạng thái</th>
                  <th className="py-3 px-4 text-center w-24">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {paginatedProcedureApplications.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400 italic">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <ClipboardCheck className="w-8 h-8 text-slate-300" />
                        <span className="font-semibold text-slate-600">
                          Không có hồ sơ thủ tục nào phù hợp bộ lọc
                        </span>
                        <span className="text-[11px] text-slate-400">
                          Mục này sẽ tự động xuất hiện khi có đơn thôi việc đã hoàn thành hoặc có ngày nghỉ sắp tới trong vòng 10 ngày
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedProcedureApplications.map((app, idx) => {
                    const rowNumber = (procedurePage - 1) * PROCEDURES_PER_PAGE + idx + 1;
                    const completedTasks = app.danhSachCongViec?.filter((t) => t.status === 'Đã hoàn thành').length || 0;
                    const totalTasks = app.danhSachCongViec?.length || 0;

                    const isCompleted = app.trangThai === 'Đã hoàn thành';
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);

                    const date = parseFullDate(app.ngayNghi);
                    let diffDays: number | null = null;
                    if (date) {
                      date.setHours(0, 0, 0, 0);
                      diffDays = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    }

                    return (
                      <tr key={app.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 text-center text-slate-400 font-mono">
                          {rowNumber}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-blue-700">
                          {app.msnv}
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-bold text-slate-900 block">{app.fullName}</span>
                          <span className="text-[11px] text-slate-400">{app.viTri || 'Nhân viên'}</span>
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          <span className="truncate max-w-[200px] block" title={app.donVi}>
                            {app.donVi || 'VIETSUN ĐỒNG NAI'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900 font-mono-num flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>{app.ngayNghi || '—'}</span>
                          </div>
                          <div className="mt-1">
                            {isCompleted ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                Đã xong thủ tục
                              </span>
                            ) : diffDays === 0 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 animate-pulse">
                                <Clock className="w-3 h-3 text-rose-600" />
                                Hôm nay nghỉ việc
                              </span>
                            ) : diffDays !== null && diffDays > 0 && diffDays <= 10 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                                <Clock className="w-3 h-3 text-amber-600" />
                                Còn {diffDays} ngày nữa nghỉ
                              </span>
                            ) : diffDays !== null && diffDays < 0 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                <AlertCircle className="w-3 h-3 text-rose-600" />
                                Quá hạn {Math.abs(diffDays)} ngày
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {totalTasks > 0 ? (
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold ${
                                completedTasks === totalTasks
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  : 'bg-blue-100 text-blue-800 border border-blue-200'
                              }`}
                            >
                              {completedTasks}/{totalTasks} việc bàn giao
                            </span>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">Chưa tạo việc</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold ${
                              app.trangThai === 'Đã hoàn thành'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : app.trangThai === 'Đang thực hiện'
                                ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                : app.trangThai === 'Từ chối'
                                ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                : 'bg-amber-100 text-amber-800 border border-amber-200'
                            }`}
                          >
                            {app.trangThai}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            type="button"
                            onClick={(e) => handleToggleActionMenu(e, `proc_${app.id}`, 'procedure', app)}
                            className={`p-1.5 rounded-lg cursor-pointer transition-colors ${
                              actionMenuState?.id === `proc_${app.id}`
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200'
                            }`}
                            title="Bấm để mở các thao tác thủ tục"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Tab 3 */}
          {filteredProcedureApplications.length > PROCEDURES_PER_PAGE && (
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
              <span>
                Hiển thị {paginatedProcedureApplications.length} / {filteredProcedureApplications.length} hồ sơ thủ tục
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={procedurePage === 1}
                  onClick={() => setProcedurePage(1)}
                  className="p-1.5 rounded hover:bg-white disabled:opacity-30 cursor-pointer"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={procedurePage === 1}
                  onClick={() => setProcedurePage((p) => p - 1)}
                  className="p-1.5 rounded hover:bg-white disabled:opacity-30 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-3 py-1 font-bold">
                  Trang {procedurePage} / {totalProcedurePages}
                </span>
                <button
                  type="button"
                  disabled={procedurePage === totalProcedurePages}
                  onClick={() => setProcedurePage((p) => p + 1)}
                  className="p-1.5 rounded hover:bg-white disabled:opacity-30 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={procedurePage === totalProcedurePages}
                  onClick={() => setProcedurePage(totalProcedurePages)}
                  className="p-1.5 rounded hover:bg-white disabled:opacity-30 cursor-pointer"
                >
                  <ChevronsRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
          </>
        )}
        </div>
      )}

      {/* ======================================================== */}
      {/* 5. MODAL FORM: THÊM MỚI / SỬA ĐƠN XIN NGHỈ VIỆC         */}
      {/* ======================================================== */}
      <ResignationFormModal
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false);
          setEditingApplication(null);
        }}
        onSave={handleSaveApplication}
        initialData={editingApplication}
        employees={employees}
      />

      {/* ======================================================== */}
      {/* 5B. MODAL IMPORT EXCEL: DANH SÁCH GIẢM                  */}
      {/* ======================================================== */}
      <ResignationExcelImportModal
        isOpen={isExcelImportModalOpen}
        onClose={() => setIsExcelImportModalOpen(false)}
        employees={employees}
        onUpdateEmployee={onUpdateEmployee}
        onSuccess={async (updatedCount, skippedCount) => {
          await loadApplications();
          setNotification({
            isOpen: true,
            type: 'success',
            title: 'Import Excel thành công',
            message: `Đã chấm dứt hợp đồng và đưa qua Đơn xin nghỉ việc cho ${updatedCount} nhân viên hợp lệ. Đã bỏ qua ${skippedCount} nhân viên không có trong hệ thống.`,
            stats: [
              { label: 'Đã chấm dứt HĐ & lập đơn', value: `${updatedCount} nhân sự`, color: 'emerald' },
              { label: 'Trạng thái đơn', value: 'Đang thực hiện', color: 'blue' },
              { label: 'Bỏ qua (không tồn tại)', value: `${skippedCount} MSNV`, color: 'amber' },
            ],
          });
        }}
      />

      {/* ======================================================== */}
      {/* 6. MODAL XÁC NHẬN XÓA ĐƠN                              */}
      {/* ======================================================== */}
      {deletingId && (() => {
        const targetApp = applications.find((a) => a.id === deletingId);
        if (targetApp?.trangThai === 'Đã hoàn thành') {
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
              <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 space-y-4 shadow-xl">
                <h3 className="text-sm font-bold text-slate-900">Không thể xóa</h3>
                <div className="text-xs text-slate-600 space-y-2">
                  <p>
                    Đơn thôi việc của nhân viên <span className="font-bold text-slate-900">{targetApp.fullName}</span> (MSNV:{' '}
                    <span className="font-mono font-bold text-blue-700">{targetApp.msnv}</span>) đã chuyển sang trạng thái{' '}
                    <b className="text-emerald-700">Đã hoàn thành</b>.
                  </p>
                  <p className="text-slate-500">
                    Hồ sơ thôi việc đã hoàn tất quy trình không thể xóa khỏi hệ thống.
                  </p>
                </div>
                <div className="flex justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setDeletingId(null)}
                    className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                  >
                    Đóng
                  </button>
                </div>
              </div>
            </div>
          );
        }

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
            <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 space-y-4 shadow-xl">
              <h3 className="text-sm font-bold text-slate-900">Xác nhận xóa đơn thôi việc</h3>
              <div className="text-xs text-slate-600 space-y-2">
                <p>
                  Bạn có chắc chắn muốn xóa đơn xin thôi việc của nhân viên{' '}
                  <span className="font-bold text-slate-900">{targetApp?.fullName || 'nhân viên này'}</span>{' '}
                  (MSNV: <span className="font-mono font-bold text-blue-700">{targetApp?.msnv || '—'}</span>)?
                </p>
                <p className="text-slate-500">
                  Sau khi xóa, nhân viên sẽ tự động được <b>trả về trạng thái bình thường</b> (Đang làm việc, Hợp đồng còn hiệu lực).
                </p>
              </div>
              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setDeletingId(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteApplication(deletingId)}
                  className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg cursor-pointer"
                >
                  Xác nhận xóa & Khôi phục
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ======================================================== */}
      {/* 6.1. MODAL XÁC NHẬN TRẢ VỀ BÌNH THƯỜNG CHO 1 NHÂN VIÊN   */}
      {/* ======================================================== */}
      {restoringEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 space-y-4 shadow-xl">
            <h3 className="text-sm font-bold text-slate-900">Trả về trạng thái bình thường</h3>
            <div className="text-xs text-slate-600 space-y-2">
              <p>
                Bạn có chắc chắn muốn xóa nhân viên{' '}
                <span className="font-bold text-slate-900">{restoringEmployee.fullName}</span> (MSNV:{' '}
                <span className="font-mono font-bold text-blue-700">{restoringEmployee.msnv}</span>) khỏi danh sách nghỉ việc?
              </p>
              <p className="text-slate-500">
                Trạng thái người lao động sẽ được chuyển thành <b>Đang làm việc (LV)</b>, hợp đồng <b>Còn hiệu lực</b> và dọn sạch thông tin thôi việc.
              </p>
            </div>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isRestoringLoading}
                onClick={() => setRestoringEmployee(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={isRestoringLoading}
                onClick={handleConfirmRestoreSingle}
                className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer flex items-center gap-1.5"
              >
                {isRestoringLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                <span>Xác nhận trả về bình thường</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 6.2. MODAL XÁC NHẬN TRẢ VỀ BÌNH THƯỜNG HÀNG LOẠT         */}
      {/* ======================================================== */}
      {isConfirmingBatchRestore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 space-y-4 shadow-xl">
            <h3 className="text-sm font-bold text-slate-900">Trả về bình thường hàng loạt</h3>
            <div className="text-xs text-slate-600 space-y-2">
              <p>
                Bạn có chắc chắn muốn trả <b>{selectedExpiredIds.size}</b> nhân sự đã chọn về trạng thái làm việc bình thường?
              </p>
              <p className="text-slate-500">
                Các nhân sự được chọn sẽ được chuyển sang trạng thái <b>Đang làm việc (LV)</b>, hợp đồng <b>Hiệu lực</b> và xóa khỏi danh sách nghỉ việc.
              </p>
            </div>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isRestoringLoading}
                onClick={() => setIsConfirmingBatchRestore(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={isRestoringLoading}
                onClick={handleConfirmRestoreBatch}
                className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer flex items-center gap-1.5"
              >
                {isRestoringLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                <span>Xác nhận ({selectedExpiredIds.size} nhân sự)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* ======================================================== */}
      {/* 6.5. MODAL TẠO VĂN BẢN                                 */}
      {/* ======================================================== */}
      <ErrorBoundary
        fallbackTitle="Lỗi hiển thị cửa sổ Tạo văn bản"
        onReset={() => setIsDocGeneratorOpen(false)}
      >
        <DocumentGeneratorModal
          isOpen={isDocGeneratorOpen}
          onClose={() => setIsDocGeneratorOpen(false)}
          targetEmployees={generatorTargetEmployees}
        />
      </ErrorBoundary>
      
      {/* 7. DIALOG THÔNG BÁO CHUYÊN NGHIỆP                        */}
      {/* ======================================================== */}
      <NotificationModal
        isOpen={notification.isOpen}
        onClose={() => setNotification((prev) => ({ ...prev, isOpen: false }))}
        type={notification.type}
        title={notification.title}
        message={notification.message}
        stats={notification.stats}
      />

      {/* ======================================================== */}
      {/* 8. FLOATING ACTION MENU (FIXED POSITION - TRÁNH BỊ CẮT BỞI TABLE OVERFLOW) */}
      {/* ======================================================== */}
      {actionMenuState && (
        <>
          {/* Nền trong suốt để đóng menu khi bấm ra ngoài */}
          <div
            className="fixed inset-0 z-50 bg-transparent"
            onClick={(e) => {
              e.stopPropagation();
              setActionMenuState(null);
            }}
          />

          {/* Menu nổi cố định theo tọa độ nút ba chấm */}
          <div
            style={{
              position: 'fixed',
              top: actionMenuState.openUpwards ? undefined : actionMenuState.top,
              bottom: actionMenuState.openUpwards
                ? window.innerHeight - actionMenuState.top
                : undefined,
              right: actionMenuState.right,
            }}
            className="z-50 w-60 bg-white border border-slate-200 rounded-2xl shadow-2xl py-2 text-left text-xs animate-in fade-in zoom-in-95 duration-100"
          >
            {actionMenuState.type === 'expired' && (() => {
              const emp = actionMenuState.data as Employee;
              return (
                <>
                  <div className="px-3.5 py-1.5 border-b border-slate-100 flex items-center justify-between">
                    <span className="font-bold text-[10px] text-slate-400 uppercase tracking-wider">
                      Bảng thao tác
                    </span>
                    <span className="text-[10px] font-mono-num font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                      {emp.msnv}
                    </span>
                  </div>

                  <div className="px-3.5 py-1 font-bold text-slate-900 text-xs truncate">
                    {emp.fullName}
                  </div>

                  <div className="py-1">
                    <button
                      type="button"
                      onClick={() => {
                        setActionMenuState(null);
                        handleOpenDocGenerator([emp]);
                      }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-slate-700 hover:bg-blue-50 hover:text-blue-700 cursor-pointer transition-colors group"
                    >
                      <Printer className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600" />
                      <span className="font-medium">Tạo / In văn bản</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setActionMenuState(null);
                        handleCreateFromEmployee(emp);
                      }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 cursor-pointer transition-colors group"
                    >
                      <Plus className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600" />
                      <span className="font-medium">Lập đơn xin nghỉ việc</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setActionMenuState(null);
                        setRestoringEmployee(emp);
                      }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-emerald-700 hover:bg-emerald-50 cursor-pointer transition-colors group"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="font-medium">Trả về bình thường (LV)</span>
                    </button>
                  </div>
                </>
              );
            })()}

            {actionMenuState.type === 'app' && (() => {
              const app = actionMenuState.data as ResignationApplication;
              return (
                <>
                  <div className="px-3.5 py-1.5 border-b border-slate-100 flex items-center justify-between">
                    <span className="font-bold text-[10px] text-slate-400 uppercase tracking-wider">
                      Bảng thao tác
                    </span>
                    <span className="text-[10px] font-mono-num font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                      {app.msnv}
                    </span>
                  </div>

                  <div className="px-3.5 py-1 font-bold text-slate-900 text-xs truncate">
                    {app.fullName}
                  </div>

                  <div className="py-1">
                    <button
                      type="button"
                      onClick={() => {
                        setActionMenuState(null);
                        const targetEmp = getEmployeeFromApp(app);
                        handleOpenDocGenerator([targetEmp]);
                      }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-slate-700 hover:bg-blue-50 hover:text-blue-700 cursor-pointer transition-colors group"
                    >
                      <Printer className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600" />
                      <span className="font-medium">Tạo / In văn bản</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setActionMenuState(null);
                        setEditingApplication(app);
                        setIsFormModalOpen(true);
                      }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-slate-700 hover:bg-slate-100 hover:text-slate-900 cursor-pointer transition-colors group"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700" />
                      <span className="font-medium">Xem & Chỉnh sửa đơn</span>
                    </button>

                    {app.trangThai !== 'Đã hoàn thành' && (
                      <button
                        type="button"
                        onClick={() => {
                          setActionMenuState(null);
                          setDeletingId(app.id);
                        }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-rose-600 hover:bg-rose-50 cursor-pointer transition-colors group"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                        <span className="font-medium">Xóa đơn này</span>
                      </button>
                    )}
                  </div>
                </>
              );
            })()}

            {actionMenuState.type === 'procedure' && (() => {
              const app = actionMenuState.data as ResignationApplication;
              return (
                <>
                  <div className="px-3.5 py-1.5 border-b border-slate-100 flex items-center justify-between">
                    <span className="font-bold text-[10px] text-slate-400 uppercase tracking-wider">
                      Thủ tục thôi việc
                    </span>
                    <span className="text-[10px] font-mono-num font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                      {app.msnv}
                    </span>
                  </div>

                  <div className="px-3.5 py-1 font-bold text-slate-900 text-xs truncate">
                    {app.fullName}
                  </div>

                  <div className="py-1">
                    <button
                      type="button"
                      onClick={() => {
                        setActionMenuState(null);
                        const targetEmp = getEmployeeFromApp(app);
                        handleOpenDocGenerator([targetEmp]);
                      }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 cursor-pointer transition-colors group"
                    >
                      <Printer className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600" />
                      <span className="font-medium">Tạo / In văn bản</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setActionMenuState(null);
                        setEditingApplication(app);
                        setIsFormModalOpen(true);
                      }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-slate-700 hover:bg-blue-50 hover:text-blue-700 cursor-pointer transition-colors group"
                    >
                      <ClipboardCheck className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600" />
                      <span className="font-medium">Bàn giao & Thủ tục</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setActionMenuState(null);
                        setEditingApplication(app);
                        setIsFormModalOpen(true);
                      }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-slate-700 hover:bg-slate-100 hover:text-slate-900 cursor-pointer transition-colors group"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700" />
                      <span className="font-medium">Xem & Chỉnh sửa đơn</span>
                    </button>

                    {app.trangThai !== 'Đã hoàn thành' && (
                      <button
                        type="button"
                        onClick={() => {
                          setActionMenuState(null);
                          setDeletingId(app.id);
                        }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-rose-600 hover:bg-rose-50 cursor-pointer transition-colors group"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                        <span className="font-medium">Xóa đơn này</span>
                      </button>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </>
      )}
    </div>
  );
};
