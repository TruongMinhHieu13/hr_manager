import React, { useState, useMemo } from 'react';
import {
  UserPlus,
  FileSpreadsheet,
  Download,
  Printer,
  Search,
  Edit3,
  Trash2,
  Eye,
  CheckSquare,
  Square,
  AlertCircle,
  Upload,
  X,
  Database,
  Calendar,
  Camera,
  CheckCircle2,
  ScanFace,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Building2,
  Plus,
  Check,
  FileText,
  User,
  Users,
  MapPin,
  Briefcase,
  Award,
  FileCheck,
  Phone,
  Heart,
  Shield,
  Home,
  MoreVertical,
  Copy,
  FileX,
  RefreshCw,
  History,
  FileSignature,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { CardTemplate, Department, Division, Employee, ParentDepartment, SubDepartment } from '../types';
import { IdCardPreview } from './IdCardPreview';
import { DocumentGeneratorModal } from './DocumentGeneratorModal';
import { TerminateContractModal } from './TerminateContractModal';
import { RenewContractModal } from './RenewContractModal';
import { ContractHistoryModal } from './ContractHistoryModal';
import { SyncVietSunModal } from './SyncVietSunModal';
import { WorkHistoryTab } from './WorkHistoryTab';
import { CccdCheckWarningModal } from './CccdCheckWarningModal';
import { TerminateModal, RehireModal } from './WorkHistoryModals';
import { ErrorBoundary } from './ErrorBoundary';
import {
  downloadSampleExcelTemplate,
  exportEmployeesToExcel,
} from './ExcelImportModal';
import {
  autoCropFileWithFaceAI,
  matchEmployeeByPhotoFileName,
} from '../utils/faceDetectionCrop';
import { DirectMsnvDropModal, FaceCropModal } from './FaceCropStudioView';
import {
  sortEmployeesNewestFirst,
  sortEmployeesByMsnv,
  compareEmployeeMsnv,
  isContractTerminated,
  parseFullDate,
} from '../utils/employeeUtils';

export async function compressImageTo3x4DataUrl(file: File): Promise<string> {
  const { dataUrl } = await autoCropFileWithFaceAI(file, 3 / 4, 354);
  return dataUrl;
}

export function parseDateToUtcTimestamp(dateStr: string): number | null {
  if (!dateStr) return null;
  const s = dateStr.trim();
  // Match DD/MM/YYYY or DD-MM-YYYY
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const d = parseInt(dmy[1], 10);
    const m = parseInt(dmy[2], 10);
    const y = parseInt(dmy[3], 10);
    return Date.UTC(y, m - 1, d);
  }
  // Match YYYY-MM-DD or YYYY/MM/DD
  const ymd = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (ymd) {
    const y = parseInt(ymd[1], 10);
    const m = parseInt(ymd[2], 10);
    const d = parseInt(ymd[3], 10);
    return Date.UTC(y, m - 1, d);
  }
  const parsed = Date.parse(s);
  return isNaN(parsed) ? null : parsed;
}

function getTodayFormattedDDMMYYYY(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function stripViAccents(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .trim();
}


interface EmployeeManagementViewProps {
  employees: Employee[];
  divisions?: Division[];
  departments: Department[];
  subDepartments?: SubDepartment[];
  parentDepartments?: ParentDepartment[];
  selectedTemplate: CardTemplate;
  selectedEmployeeIds: Set<string>;
  onChangeSelectedIds: (ids: Set<string>) => void;
  onAddEmployee: (data: Partial<Employee> & {
    msnv: string;
    fullName: string;
    department: string;
    joinDate: string;
    photoUrl: string;
  }) => Promise<string | void>;
  onUpdateEmployee: (
    id: string,
    data: Partial<Employee>
  ) => Promise<void>;
  onDeleteEmployee: (id: string) => Promise<void>;
  onBatchDeleteEmployees: (ids: string[]) => Promise<void>;
  onAddDepartment: (data: string | Partial<Department>) => Promise<Department>;
  onUpdateDepartment: (id: string, updates: string | (Partial<Department> & { oldName?: string; oldCode?: string })) => Promise<void>;
  onDeleteDepartment: (id: string) => Promise<void>;
  onDeleteAllDepartments?: () => Promise<void>;
  onOpenImportModal: () => void;
  onGoToBatchPrint: () => void;
  onOpenPrintDialog: (employeeIds?: string[]) => void;
  onSeedSampleEmployees?: () => Promise<void>;
  onSyncComplete?: () => Promise<void> | void;
  initialViewingEmployeeId?: string | null;
  onClearInitialViewingEmployeeId?: () => void;
}

export const EmployeeManagementView: React.FC<EmployeeManagementViewProps> = ({
  employees,
  divisions = [],
  departments,
  subDepartments = [],
  parentDepartments = [],
  selectedTemplate,
  selectedEmployeeIds,
  onChangeSelectedIds,
  onAddEmployee,
  onUpdateEmployee,
  onDeleteEmployee,
  onBatchDeleteEmployees,
  onAddDepartment,
  onUpdateDepartment,
  onDeleteDepartment,
  onDeleteAllDepartments,
  onOpenImportModal,
  onGoToBatchPrint,
  onOpenPrintDialog,
  onSeedSampleEmployees,
  onSyncComplete,
  initialViewingEmployeeId,
  onClearInitialViewingEmployeeId,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [khoiFilter, setKhoiFilter] = useState('ALL');
  const [phongBanFilter, setPhongBanFilter] = useState('ALL');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [workStatusFilter, setWorkStatusFilter] = useState<'ALL' | 'ACTIVE' | 'RESIGNED'>('ALL');
  const [joinDateFrom, setJoinDateFrom] = useState('');
  const [joinDateTo, setJoinDateTo] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Tiêu chí sắp xếp danh sách nhân viên: Mặc định sắp xếp theo Mã số nhân viên (MSNV) giảm dần (số lớn nhất lên đầu)
  const [sortBy, setSortBy] = useState<'msnv' | 'fullName' | 'joinDate' | 'createdAt' | 'resignedDate'>('msnv');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Form 3 cấp cascading state
  const [formDivisionId, setFormDivisionId] = useState<string>('');
  const [formDeptId, setFormDeptId] = useState<string>('');
  const [formSubDeptId, setFormSubDeptId] = useState<string>('');

  // Xem chi tiết hồ sơ nhân sự đầy đủ
  const [viewingProfileEmployee, setViewingProfileEmployee] = useState<Employee | null>(null);
  const [profileViewTab, setProfileViewTab] = useState<'details' | 'work_history'>('details');

  // Tự động mở hồ sơ chi tiết khi chuyển từ báo cáo Lịch sử làm việc
  React.useEffect(() => {
    if (initialViewingEmployeeId && employees.length > 0) {
      const found = employees.find((e) => e.id === initialViewingEmployeeId);
      if (found) {
        setViewingProfileEmployee(found);
        setProfileViewTab('work_history');
      }
      if (onClearInitialViewingEmployeeId) {
        onClearInitialViewingEmployeeId();
      }
    }
  }, [initialViewingEmployeeId, employees, onClearInitialViewingEmployeeId]);

  // Lịch sử làm việc & Cảnh báo trùng CCCD
  const [showCccdWarningModal, setShowCccdWarningModal] = useState(false);
  const [cccdWarningData, setCccdWarningData] = useState<any>(null);
  const [terminatingWorkHistoryEmp, setTerminatingWorkHistoryEmp] = useState<Employee | null>(null);
  const [rehiringWorkHistoryEmp, setRehiringWorkHistoryEmp] = useState<any>(null);

  const handleCheckCccd = async (cccdVal: string) => {
    const clean = (cccdVal || '').trim();
    if (clean.length < 9) return;
    if (editingEmployee && editingEmployee.cccd && editingEmployee.cccd.trim().toLowerCase() === clean.toLowerCase()) {
      return;
    }
    try {
      const res = await fetch(`/api/work-history/check-cccd/${clean}`);
      const data = await res.json();
      if (data.exists && (data.employee || (data.summary && data.summary.totalTurns > 0))) {
        // Nếu đang sửa và trùng với chính mình thì bỏ qua
        if (editingEmployee && data.employee && data.employee.id === editingEmployee.id) {
          return;
        }
        setCccdWarningData({
          ...data.summary,
          employee: data.employee,
          cccd: clean,
        });
        setShowCccdWarningModal(true);
      }
    } catch (err) {
      console.error('Lỗi kiểm tra CCCD:', err);
    }
  };

  // Add/Edit Modal State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [msnv, setMsnv] = useState('');
  const [fullName, setFullName] = useState('');
  const [department, setDepartment] = useState('');
  const [joinDate, setJoinDate] = useState(() => getTodayFormattedDDMMYYYY());
  const [photoUrl, setPhotoUrl] = useState('');
  const [formFields, setFormFields] = useState<Partial<Employee>>({});
  const [formActiveTab, setFormActiveTab] = useState<'job' | 'personal' | 'cccd_address' | 'contract'>('job');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingPhotoEmpId, setUploadingPhotoEmpId] = useState<string | null>(null);
  const [bulkUploadProgress, setBulkUploadProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [photoStatusBanner, setPhotoStatusBanner] = useState<string | null>(null);

  // Quick Card Preview Modal
  const [previewEmployee, setPreviewEmployee] = useState<Employee | null>(null);

  // Interactive AI Face Cropper Modal State
  const [faceCropEmployee, setFaceCropEmployee] = useState<Employee | null>(null);
  const [isFaceCropModalOpen, setIsFaceCropModalOpen] = useState(false);
  const [isDirectMsnvModalOpen, setIsDirectMsnvModalOpen] = useState(false);

  // Delete Confirmation Modal
  const [deletingEmployee, setDeletingEmployee] = useState<Employee | null>(null);
  const [confirmBatchDelete, setConfirmBatchDelete] = useState(false);

  // Department Management Popup Modal State
  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  const [newDeptName, setNewDeptName] = useState('');
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);
  const [editingDeptName, setEditingDeptName] = useState('');
  const [deptModalError, setDeptModalError] = useState<string | null>(null);
  const [isSavingDept, setIsSavingDept] = useState(false);
  const [deletingDeptInModal, setDeletingDeptInModal] = useState<Department | null>(null);
  const [isConfirmingDeleteAllDeptsInModal, setIsConfirmingDeleteAllDeptsInModal] = useState(false);

  // Action Menu (3-dots) & Document Generator Modal State
  const [actionMenuState, setActionMenuState] = useState<{
    emp: Employee;
    top: number;
    bottom: number;
    right: number;
    openUpwards: boolean;
  } | null>(null);
  const [isDocGeneratorOpen, setIsDocGeneratorOpen] = useState(false);
  const [docGeneratorEmployees, setDocGeneratorEmployees] = useState<Employee[]>([]);

  // Modal Chấm dứt hợp đồng
  const [terminatingEmployee, setTerminatingEmployee] = useState<Employee | null>(null);

  // Modal Lịch sử hợp đồng & Tái ký hợp đồng
  const [viewingContractHistoryEmployee, setViewingContractHistoryEmployee] = useState<Employee | null>(null);
  const [renewingContractEmployee, setRenewingContractEmployee] = useState<Employee | null>(null);

  // Modal Đồng bộ API Việt Sun
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);

  const handleTerminateContract = async (updates: {
    tinhTrang: string;
    trangThaiHopDong: string;
    denNgay?: string;
  }) => {
    if (!terminatingEmployee) return;
    try {
      await onUpdateEmployee(terminatingEmployee.id, updates);
      if (viewingProfileEmployee && viewingProfileEmployee.id === terminatingEmployee.id) {
        setViewingProfileEmployee((prev) => (prev ? { ...prev, ...updates } : null));
      }
    } catch (err) {
      console.error('Lỗi khi chấm dứt hợp đồng:', err);
      throw err;
    }
  };

  // ==========================================
  // CẤU TRÚC 3 CẤP: OPTIONS LỌC & DANH MỤC
  // ==========================================

  // 1. Cấp 1: Danh sách Khối
  const availableKhoiOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    divisions.forEach((div) => {
      if (div.name?.trim()) {
        map.set(div.id || div.name.trim(), { id: div.id, name: div.name.trim() });
      }
    });
    employees.forEach((emp) => {
      const k = (emp.khoi || emp.khoi2 || '').trim();
      if (k && !Array.from(map.values()).some((x) => stripViAccents(x.name) === stripViAccents(k))) {
        map.set(k, { id: emp.divisionId || k, name: k });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  }, [divisions, employees]);

  // 2. Cấp 2: Danh sách Phòng ban (Bộ phận) - Tự động lọc theo Khối nếu có
  const availablePhongBanOptions = useMemo(() => {
    let list = departments;
    if (khoiFilter !== 'ALL') {
      const selectedDiv = divisions.find(
        (d) => d.id === khoiFilter || stripViAccents(d.name) === stripViAccents(khoiFilter)
      );
      list = departments.filter((d) => {
        if (selectedDiv) {
          return d.divisionId === selectedDiv.id || stripViAccents(d.divisionName || '') === stripViAccents(selectedDiv.name);
        }
        return stripViAccents(d.divisionName || '') === stripViAccents(khoiFilter);
      });
    }

    const map = new Map<string, { id: string; name: string; code?: string }>();
    list.forEach((d) => {
      if (d.name?.trim()) {
        map.set(d.id || d.name.trim(), { id: d.id, name: d.name.trim(), code: d.code });
      }
    });

    employees.forEach((emp) => {
      if (khoiFilter !== 'ALL') {
        const empK = (emp.khoi || emp.khoi2 || '').trim();
        if (emp.divisionId !== khoiFilter && stripViAccents(empK) !== stripViAccents(khoiFilter)) {
          return;
        }
      }
      const pb = (emp.phongBan || '').trim();
      if (pb && !Array.from(map.values()).some((x) => stripViAccents(x.name) === stripViAccents(pb))) {
        map.set(pb, { id: emp.departmentId || pb, name: pb, code: emp.kyHieuPb });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  }, [departments, divisions, employees, khoiFilter]);

  // 3. Cấp 3: Danh sách Phòng ban con (Bộ phận con) - Tự động lọc theo Phòng ban & Khối
  const availableSubDepts = useMemo(() => {
    let list = subDepartments;
    if (phongBanFilter !== 'ALL') {
      const selectedDept = departments.find(
        (d) => d.id === phongBanFilter || stripViAccents(d.name) === stripViAccents(phongBanFilter)
      );
      list = subDepartments.filter((s) => {
        if (selectedDept) {
          return s.departmentId === selectedDept.id || stripViAccents(s.departmentName || '') === stripViAccents(selectedDept.name);
        }
        return stripViAccents(s.departmentName || '') === stripViAccents(phongBanFilter);
      });
    } else if (khoiFilter !== 'ALL') {
      const selectedDiv = divisions.find(
        (d) => d.id === khoiFilter || stripViAccents(d.name) === stripViAccents(khoiFilter)
      );
      list = subDepartments.filter((s) => {
        if (selectedDiv) {
          return s.divisionId === selectedDiv.id || stripViAccents(s.divisionName || '') === stripViAccents(selectedDiv.name);
        }
        return stripViAccents(s.divisionName || '') === stripViAccents(khoiFilter);
      });
    }

    const map = new Map<string, { id: string; name: string }>();
    list.forEach((s) => {
      if (s.name?.trim()) {
        map.set(s.id || s.name.trim(), { id: s.id, name: s.name.trim() });
      }
    });

    employees.forEach((emp) => {
      if (phongBanFilter !== 'ALL') {
        const empPb = (emp.phongBan || '').trim();
        if (emp.departmentId !== phongBanFilter && stripViAccents(empPb) !== stripViAccents(phongBanFilter)) {
          return;
        }
      }
      const pbc = (emp.phongBanCon || emp.department || emp.boPhan || '').trim();
      if (pbc && !Array.from(map.values()).some((x) => stripViAccents(x.name) === stripViAccents(pbc))) {
        map.set(pbc, { id: emp.subDepartmentId || pbc, name: pbc });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  }, [subDepartments, departments, divisions, employees, phongBanFilter, khoiFilter]);

  const departmentNames = useMemo(() => {
    return departments.map((d) => d.name);
  }, [departments]);

  const employeeCountByDept = useMemo(() => {
    const counts = new Map<string, number>();
    employees.forEach((emp) => {
      const key = (emp.department || emp.phongBanCon || emp.phongBan || '').trim();
      if (key) {
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    });
    return counts;
  }, [employees]);

  // Đếm số lượng nhân sự đang làm vs đã nghỉ việc
  const workStatusCounts = useMemo(() => {
    let active = 0;
    let resigned = 0;
    for (const emp of employees) {
      if (isContractTerminated(emp)) {
        resigned++;
      } else {
        active++;
      }
    }
    return { active, resigned, total: employees.length };
  }, [employees]);

  // Bộ lọc danh sách nhân viên theo 3 cấp phân cấp
  const filteredEmployees = useMemo(() => {
    const fromTs = parseDateToUtcTimestamp(joinDateFrom);
    const toTs = parseDateToUtcTimestamp(joinDateTo);

    const list = employees.filter((emp) => {
      const q = searchQuery.trim().toLowerCase();
      const qNorm = stripViAccents(q);

      const matchQuery =
        !q ||
        emp.fullName.toLowerCase().includes(q) ||
        emp.msnv.toLowerCase().includes(q) ||
        stripViAccents(emp.fullName).includes(qNorm) ||
        stripViAccents(emp.msnv).includes(qNorm) ||
        (emp.department && (emp.department.toLowerCase().includes(q) || stripViAccents(emp.department).includes(qNorm))) ||
        (emp.phongBan && (emp.phongBan.toLowerCase().includes(q) || stripViAccents(emp.phongBan).includes(qNorm))) ||
        (emp.kyHieuPb && (emp.kyHieuPb.toLowerCase().includes(q) || stripViAccents(emp.kyHieuPb).includes(qNorm))) ||
        (emp.khoi && (emp.khoi.toLowerCase().includes(q) || stripViAccents(emp.khoi).includes(qNorm))) ||
        (emp.phongBanCon && (emp.phongBanCon.toLowerCase().includes(q) || stripViAccents(emp.phongBanCon).includes(qNorm))) ||
        (emp.boPhan && (emp.boPhan.toLowerCase().includes(q) || stripViAccents(emp.boPhan).includes(qNorm))) ||
        (emp.congViec && (emp.congViec.toLowerCase().includes(q) || stripViAccents(emp.congViec).includes(qNorm))) ||
        (emp.chucVu && (emp.chucVu.toLowerCase().includes(q) || stripViAccents(emp.chucVu).includes(qNorm))) ||
        (emp.cccd && emp.cccd.toLowerCase().includes(q)) ||
        (emp.soDienThoai && emp.soDienThoai.toLowerCase().includes(q));

      // 1. Lọc theo Khối (Cấp 1)
      let matchKhoi = true;
      if (khoiFilter !== 'ALL') {
        const kTarget = stripViAccents(khoiFilter);
        matchKhoi =
          emp.divisionId === khoiFilter ||
          stripViAccents(emp.khoi || '') === kTarget ||
          stripViAccents(emp.khoi2 || '') === kTarget;
      }

      // 2. Lọc theo Phòng ban (Bộ phận) (Cấp 2)
      let matchPhongBan = true;
      if (phongBanFilter !== 'ALL') {
        const pbTarget = stripViAccents(phongBanFilter);
        matchPhongBan =
          emp.departmentId === phongBanFilter ||
          stripViAccents(emp.phongBan || '') === pbTarget ||
          stripViAccents(emp.kyHieuPb || '') === pbTarget ||
          stripViAccents(emp.department || '') === pbTarget;
      }

      // 3. Lọc theo Phòng ban con (Bộ phận con) (Cấp 3)
      let matchDept = true;
      if (deptFilter !== 'ALL') {
        const deptTarget = stripViAccents(deptFilter);
        matchDept =
          emp.subDepartmentId === deptFilter ||
          stripViAccents(emp.department || '') === deptTarget ||
          stripViAccents(emp.phongBanCon || '') === deptTarget ||
          stripViAccents(emp.boPhan || '') === deptTarget ||
          stripViAccents(emp.phongBan || '') === deptTarget;
      }

      // 4. Lọc theo tình trạng làm việc (Đang làm / Đã nghỉ việc)
      let matchWorkStatus = true;
      if (workStatusFilter === 'ACTIVE') {
        matchWorkStatus = !isContractTerminated(emp);
      } else if (workStatusFilter === 'RESIGNED') {
        matchWorkStatus = isContractTerminated(emp);
      }

      // Lọc theo ngày vào làm
      let matchJoinDate = true;
      if (fromTs !== null || toTs !== null) {
        const empTs = parseDateToUtcTimestamp(emp.joinDate);
        if (empTs === null) {
          matchJoinDate = false;
        } else {
          if (fromTs !== null && empTs < fromTs) matchJoinDate = false;
          if (toTs !== null && empTs > toTs) matchJoinDate = false;
        }
      }

      return matchQuery && matchKhoi && matchPhongBan && matchDept && matchWorkStatus && matchJoinDate;
    });

    // Sắp xếp danh sách nhân viên theo tiêu chí lựa chọn (Mặc định: Mã số nhân viên MSNV tăng dần)
    return [...list].sort((a, b) => {
      if (sortBy === 'msnv') {
        return compareEmployeeMsnv(a, b, sortOrder);
      }
      if (sortBy === 'fullName') {
        const cmp = (a.fullName || '').localeCompare(b.fullName || '', 'vi', { sensitivity: 'base' });
        return sortOrder === 'asc' ? cmp : -cmp;
      }
      if (sortBy === 'joinDate') {
        const dateA = parseDateToUtcTimestamp(a.joinDate) || 0;
        const dateB = parseDateToUtcTimestamp(b.joinDate) || 0;
        if (dateA !== dateB) {
          return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        }
        return compareEmployeeMsnv(a, b, 'asc');
      }
      if (sortBy === 'resignedDate') {
        const dateA = parseFullDate(a.denNgay || (a.extraData as any)?.ngayNghi)?.getTime() || 0;
        const dateB = parseFullDate(b.denNgay || (b.extraData as any)?.ngayNghi)?.getTime() || 0;
        if (dateB !== dateA) {
          return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        }
        return compareEmployeeMsnv(a, b, 'asc');
      }
      if (sortBy === 'createdAt') {
        const cmp = sortEmployeesNewestFirst(a, b);
        return sortOrder === 'asc' ? -cmp : cmp;
      }
      // Mặc định: sắp xếp theo Mã số nhân viên
      return compareEmployeeMsnv(a, b, sortOrder);
    });
  }, [
    employees,
    searchQuery,
    khoiFilter,
    phongBanFilter,
    deptFilter,
    workStatusFilter,
    joinDateFrom,
    joinDateTo,
    sortBy,
    sortOrder,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredEmployees.length / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedEmployees = useMemo(() => {
    const startIdx = (safeCurrentPage - 1) * pageSize;
    return filteredEmployees.slice(startIdx, startIdx + pageSize);
  }, [filteredEmployees, safeCurrentPage, pageSize]);

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

  const openAddModal = () => {
    setEditingEmployee(null);
    setMsnv('');
    setFullName('');
    setJoinDate(getTodayFormattedDDMMYYYY());
    setPhotoUrl('');

    // Khởi tạo mặc định cấu trúc 3 cấp
    const activeDiv = divisions.find((d) => d.status !== 'inactive') || divisions[0];
    const divId = activeDiv?.id || '';
    const activeDept = departments.find(
      (d) => (divId ? d.divisionId === divId : true) && d.status !== 'inactive'
    ) || departments[0];
    const deptId = activeDept?.id || '';
    const activeSub = subDepartments.find(
      (s) => (deptId ? s.departmentId === deptId : true) && s.status !== 'inactive'
    ) || subDepartments[0];
    const subId = activeSub?.id || '';

    setFormDivisionId(divId);
    setFormDeptId(deptId);
    setFormSubDeptId(subId);

    const defaultSubName = activeSub?.name || activeDept?.name || departmentNames[0] || '';
    setDepartment(defaultSubName);

    setFormFields({
      donVi: 'XMAY 03',
      tinhTrang: 'LV',
      khoi: activeDiv?.name || 'Văn phòng',
      divisionId: divId,
      phongBan: activeDept?.name || '',
      departmentId: deptId,
      kyHieuPb: activeDept?.code || '',
      phongBanCon: defaultSubName,
      subDepartmentId: subId,
      boPhan: defaultSubName,
      gioiTinh: 'Nam',
      danToc: 'Kinh',
      tonGiao: 'Không',
      tinhTrangHonNhan: 'Độc thân',
      loaiHd: 'HĐXĐTH',
      phanLoai: 'THAM GIA',
    });
    setFormActiveTab('job');
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditModal = (emp: Employee) => {
    setEditingEmployee(emp);
    setMsnv(emp.msnv || '');
    setFullName(emp.fullName || '');
    setJoinDate(emp.joinDate || '');
    setPhotoUrl(emp.photoUrl || '');

    // Khớp Cấp 1: Khối
    let matchedDiv = divisions.find((d) => d.id === emp.divisionId);
    if (!matchedDiv && emp.khoi) {
      matchedDiv = divisions.find((d) => stripViAccents(d.name) === stripViAccents(emp.khoi || ''));
    }

    // Khớp Cấp 2: Phòng ban
    let matchedDept = departments.find((d) => d.id === emp.departmentId);
    if (!matchedDept && emp.kyHieuPb) {
      matchedDept = departments.find(
        (d) => d.code?.trim().toUpperCase() === emp.kyHieuPb?.trim().toUpperCase()
      );
    }
    if (!matchedDept && emp.phongBan) {
      matchedDept = departments.find(
        (d) => stripViAccents(d.name) === stripViAccents(emp.phongBan || '')
      );
    }
    if (!matchedDiv && matchedDept?.divisionId) {
      matchedDiv = divisions.find((d) => d.id === matchedDept?.divisionId);
    }

    // Khớp Cấp 3: Phòng ban con
    let matchedSub = subDepartments.find((s) => s.id === emp.subDepartmentId);
    const subTargetName = emp.phongBanCon || emp.department || emp.boPhan || '';
    if (!matchedSub && subTargetName) {
      matchedSub = subDepartments.find(
        (s) =>
          (matchedDept ? s.departmentId === matchedDept.id : true) &&
          stripViAccents(s.name) === stripViAccents(subTargetName)
      );
    }

    setFormDivisionId(matchedDiv?.id || '');
    setFormDeptId(matchedDept?.id || '');
    setFormSubDeptId(matchedSub?.id || '');
    setDepartment(subTargetName || matchedDept?.name || emp.department || '');

    setFormFields({
      ...emp,
      khoi: matchedDiv?.name || emp.khoi || '',
      divisionId: matchedDiv?.id || emp.divisionId || '',
      phongBan: matchedDept?.name || emp.phongBan || '',
      departmentId: matchedDept?.id || emp.departmentId || '',
      kyHieuPb: matchedDept?.code || emp.kyHieuPb || '',
      phongBanCon: matchedSub?.name || emp.phongBanCon || emp.department || '',
      subDepartmentId: matchedSub?.id || emp.subDepartmentId || '',
      boPhan: matchedSub?.name || emp.boPhan || emp.department || '',
    });
    setFormActiveTab('job');
    setFormError(null);
    setIsFormOpen(true);
  };

  // Cascading Selection Handlers cho Modal Thêm/Sửa nhân viên
  const handleFormDivisionChange = (divId: string) => {
    setFormDivisionId(divId);
    const selectedDiv = divisions.find((d) => d.id === divId);
    const divName = selectedDiv ? selectedDiv.name : '';
    setFormFields((f) => ({ ...f, khoi: divName, divisionId: divId }));

    // Tự động lọc phòng ban thuộc khối này
    const deptsInDiv = departments.filter((d) => d.divisionId === divId);
    if (deptsInDiv.length > 0) {
      const firstDept = deptsInDiv[0];
      setFormDeptId(firstDept.id);
      setFormFields((f) => ({
        ...f,
        phongBan: firstDept.name,
        departmentId: firstDept.id,
        kyHieuPb: firstDept.code || '',
      }));

      // Lọc phòng ban con thuộc phòng ban mới
      const subsInDept = subDepartments.filter((s) => s.departmentId === firstDept.id);
      if (subsInDept.length > 0) {
        const firstSub = subsInDept[0];
        setFormSubDeptId(firstSub.id);
        setDepartment(firstSub.name);
        setFormFields((f) => ({
          ...f,
          phongBanCon: firstSub.name,
          subDepartmentId: firstSub.id,
          boPhan: firstSub.name,
        }));
      } else {
        setFormSubDeptId('');
        setDepartment(firstDept.name);
        setFormFields((f) => ({
          ...f,
          phongBanCon: firstDept.name,
          subDepartmentId: '',
          boPhan: firstDept.name,
        }));
      }
    } else {
      setFormDeptId('');
      setFormSubDeptId('');
      setFormFields((f) => ({
        ...f,
        phongBan: '',
        departmentId: '',
        kyHieuPb: '',
        phongBanCon: '',
        subDepartmentId: '',
      }));
    }
  };

  const handleFormDepartmentChange = (deptId: string) => {
    setFormDeptId(deptId);
    const selectedDept = departments.find((d) => d.id === deptId);
    if (selectedDept) {
      if (selectedDept.divisionId && selectedDept.divisionId !== formDivisionId) {
        setFormDivisionId(selectedDept.divisionId);
        const parentDiv = divisions.find((div) => div.id === selectedDept.divisionId);
        if (parentDiv) {
          setFormFields((f) => ({ ...f, khoi: parentDiv.name, divisionId: parentDiv.id }));
        }
      }
      setFormFields((f) => ({
        ...f,
        phongBan: selectedDept.name,
        departmentId: selectedDept.id,
        kyHieuPb: selectedDept.code || '',
      }));

      // Lọc phòng ban con trực thuộc
      const subsInDept = subDepartments.filter((s) => s.departmentId === selectedDept.id);
      if (subsInDept.length > 0) {
        const firstSub = subsInDept[0];
        setFormSubDeptId(firstSub.id);
        setDepartment(firstSub.name);
        setFormFields((f) => ({
          ...f,
          phongBanCon: firstSub.name,
          subDepartmentId: firstSub.id,
          boPhan: firstSub.name,
        }));
      } else {
        setFormSubDeptId('');
        setDepartment(selectedDept.name);
        setFormFields((f) => ({
          ...f,
          phongBanCon: selectedDept.name,
          subDepartmentId: '',
          boPhan: selectedDept.name,
        }));
      }
    }
  };

  const handleFormSubDepartmentChange = (subId: string) => {
    setFormSubDeptId(subId);
    const selectedSub = subDepartments.find((s) => s.id === subId);
    if (selectedSub) {
      setDepartment(selectedSub.name);
      setFormFields((f) => ({
        ...f,
        phongBanCon: selectedSub.name,
        subDepartmentId: selectedSub.id,
        boPhan: selectedSub.name,
      }));
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageTo3x4DataUrl(file);
      setPhotoUrl(compressed);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Lỗi tải ảnh 3×4');
    } finally {
      e.target.value = '';
    }
  };

  // Direct 1-click 3x4 photo upload for a specific employee right from the table or preview modal
  const handleDirectEmployeePhotoUpload = async (
    emp: Employee,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhotoEmpId(emp.id);
    try {
      const compressed = await compressImageTo3x4DataUrl(file);
      await onUpdateEmployee(emp.id, {
        msnv: emp.msnv,
        fullName: emp.fullName,
        department: emp.department,
        joinDate: emp.joinDate,
        photoUrl: compressed,
      });
      if (previewEmployee?.id === emp.id) {
        setPreviewEmployee({ ...emp, photoUrl: compressed });
      }
      setPhotoStatusBanner(
        `Đã cập nhật hình 3×4 cho nhân viên ${emp.fullName} (MSNV: ${emp.msnv})!`
      );
      setTimeout(() => setPhotoStatusBanner(null), 4000);
    } finally {
      setUploadingPhotoEmpId(null);
      e.target.value = '';
    }
  };

  const handleRemoveEmployeePhoto = async (emp: Employee) => {
    setUploadingPhotoEmpId(emp.id);
    try {
      await onUpdateEmployee(emp.id, {
        msnv: emp.msnv,
        fullName: emp.fullName,
        department: emp.department,
        joinDate: emp.joinDate,
        photoUrl: '',
      });
      if (previewEmployee?.id === emp.id) {
        setPreviewEmployee({ ...emp, photoUrl: '' });
      }
      setPhotoStatusBanner(
        `Đã xóa hình 3×4 của nhân viên ${emp.fullName} (MSNV: ${emp.msnv}).`
      );
      setTimeout(() => setPhotoStatusBanner(null), 3500);
    } finally {
      setUploadingPhotoEmpId(null);
    }
  };

  // Direct no-preview photo upload matching filename with MSNV (works for 1 or many files)
  const handleBulkPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setBulkUploadProgress({ current: 0, total: files.length });
    const matchedNames: string[] = [];
    const unmatchedFiles: string[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setBulkUploadProgress({ current: i + 1, total: files.length });
        const matchedEmp = matchEmployeeByPhotoFileName(file.name, employees);
        if (matchedEmp) {
          try {
            const compressed = await compressImageTo3x4DataUrl(file);
            await onUpdateEmployee(matchedEmp.id, {
              msnv: matchedEmp.msnv,
              fullName: matchedEmp.fullName,
              department: matchedEmp.department,
              joinDate: matchedEmp.joinDate,
              photoUrl: compressed,
            });
            matchedNames.push(`${matchedEmp.msnv} (${matchedEmp.fullName})`);
          } catch {
            unmatchedFiles.push(file.name);
          }
        } else {
          unmatchedFiles.push(file.name);
        }
      }

      if (matchedNames.length > 0) {
        const listStr = matchedNames.slice(0, 5).join(', ');
        const extra =
          matchedNames.length > 5 ? ` và ${matchedNames.length - 5} NV khác` : '';
        setPhotoStatusBanner(
          `Đã thêm thẳng ${matchedNames.length}/${files.length} ảnh 3×4 theo MSNV (không cần preview): ${listStr}${extra}!`
        );
      } else {
        setPhotoStatusBanner(
          `Không tìm thấy nhân viên có MSNV trùng tên file ảnh (${unmatchedFiles.slice(0, 3).join(', ')}). Mẹo: Đặt tên ảnh là MSNV (VD: 06868.jpg).`
        );
      }
      setTimeout(() => setPhotoStatusBanner(null), 6500);
    } finally {
      setBulkUploadProgress(null);
      e.target.value = '';
    }
  };

  const handleSaveEmployeeForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const msnvClean = msnv.trim();
    const nameClean = fullName.trim();
    const deptClean = department.trim();
    const dateClean = joinDate.trim();

    if (!msnvClean || !nameClean || !deptClean || !dateClean) {
      setFormError('Vui lòng nhập đầy đủ MSNV, Họ và tên, Bộ phận và Ngày vào làm.');
      return;
    }

    // Duplicate MSNV check
    const duplicate = employees.find(
      (emp) =>
        emp.msnv.trim().toLowerCase() === msnvClean.toLowerCase() &&
        emp.id !== editingEmployee?.id
    );
    if (duplicate) {
      setFormError(
        `Mã số nhân viên "${msnvClean}" đã tồn tại trong hệ thống (Nhân viên: ${duplicate.fullName} - ${duplicate.department}). Vui lòng kiểm tra lại!`
      );
      return;
    }

    // Duplicate CCCD check
    const cccdClean = (formFields.cccd || '').trim();
    if (cccdClean) {
      const duplicateCccd = employees.find(
        (emp) =>
          emp.cccd &&
          emp.cccd.trim().toLowerCase() === cccdClean.toLowerCase() &&
          emp.id !== editingEmployee?.id
      );
      if (duplicateCccd) {
        setFormActiveTab('cccd_address');
        setFormError(
          `Số CCCD/CMND "${cccdClean}" đã tồn tại trong hệ thống (thuộc về nhân viên: ${duplicateCccd.fullName} - MSNV: ${duplicateCccd.msnv} - ${duplicateCccd.department} - Tình trạng: ${duplicateCccd.tinhTrang || 'Đang làm việc'}). Mỗi nhân sự chỉ có 1 số CCCD duy nhất, không thể lưu trùng!`
        );
        return;
      }
    }

    const parts = nameClean.split(/\s+/);
    const ten = formFields.ten || (parts.length > 1 ? parts[parts.length - 1] : nameClean);
    const ho = formFields.ho || (parts.length > 1 ? parts.slice(0, -1).join(' ') : '');

    const matchedDiv = divisions.find((d) => d.id === formDivisionId);
    const matchedDept = departments.find((d) => d.id === formDeptId);
    const matchedSub = subDepartments.find((s) => s.id === formSubDeptId);

    const completePayload: Partial<Employee> = {
      ...formFields,
      msnv: msnvClean,
      fullName: nameClean,
      department: deptClean,
      divisionId: formDivisionId || undefined,
      departmentId: formDeptId || undefined,
      subDepartmentId: formSubDeptId || undefined,
      khoi: matchedDiv?.name || formFields.khoi || '',
      phongBan: matchedDept?.name || formFields.phongBan || '',
      kyHieuPb: matchedDept?.code || formFields.kyHieuPb || '',
      phongBanCon: matchedSub?.name || formFields.phongBanCon || deptClean,
      boPhan: matchedSub?.name || formFields.boPhan || deptClean,
      joinDate: dateClean,
      ngayVao: formFields.ngayVao || dateClean,
      photoUrl,
      ho,
      ten,
    };

    setIsSubmitting(true);
    try {
      if (editingEmployee) {
        await onUpdateEmployee(editingEmployee.id, completePayload);
      } else {
        await onAddEmployee({
          ...completePayload,
          msnv: msnvClean,
          fullName: nameClean,
          department: deptClean,
          joinDate: dateClean,
          photoUrl,
        });
        setCurrentPage(1);
      }
      setIsFormOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Lỗi khi lưu thông tin nhân viên.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleSelectOne = (id: string) => {
    const next = new Set(selectedEmployeeIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onChangeSelectedIds(next);
  };

  const isAllFilteredSelected =
    filteredEmployees.length > 0 &&
    filteredEmployees.every((emp) => selectedEmployeeIds.has(emp.id));

  const toggleSelectAllFiltered = () => {
    const next = new Set(selectedEmployeeIds);
    if (isAllFilteredSelected) {
      filteredEmployees.forEach((emp) => next.delete(emp.id));
    } else {
      filteredEmployees.forEach((emp) => next.add(emp.id));
    }
    onChangeSelectedIds(next);
  };

  return (
    <div className="space-y-5">
      {/* Top Action Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            Danh Sách Nhân Viên ({employees.length} nhân sự)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Quản lý hồ sơ nhân viên, tải hình 3×4 trực tiếp cho từng nhân viên, nhập/xuất file Excel và in thẻ
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* NÚT ĐỒNG BỘ API VIỆT SUN (https://viet-sun-id-card.vercel.app/api/employees) */}
          <button
            type="button"
            onClick={() => setIsSyncModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-lg shadow-xs cursor-pointer transition-colors"
            title="Đồng bộ 2 danh sách nhân viên từ API https://viet-sun-id-card.vercel.app/api/employees"
          >
            <RefreshCw className="w-4 h-4" />
            ĐỒNG BỘ API VIỆT SUN
          </button>

          {/* IMPORT EXCEL BUTTON (Highlighted as requested) */}
          <button
            type="button"
            onClick={onOpenImportModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs cursor-pointer transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" />
            IMPORT EXCEL
          </button>



          <button
            type="button"
            disabled={employees.length === 0}
            onClick={() => exportEmployeesToExcel(employees)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg disabled:opacity-50 cursor-pointer transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Xuất Ra Excel (.xlsx)
          </button>



          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Thêm Nhân Viên Mới
          </button>
        </div>
      </div>

      {photoStatusBanner && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{photoStatusBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setPhotoStatusBanner(null)}
            className="p-1 text-emerald-700 hover:bg-emerald-100 rounded cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Filter & Batch Action Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 flex-1">
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Tìm theo Họ tên, MSNV, phòng ban, chức vụ..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none focus:border-blue-600"
              />
            </div>

            {/* CẤP 1: Lọc theo Khối */}
            <select
              value={khoiFilter}
              onChange={(e) => {
                setKhoiFilter(e.target.value);
                setPhongBanFilter('ALL');
                setDeptFilter('ALL');
                setCurrentPage(1);
              }}
              className="px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg font-medium text-slate-700 focus:bg-white focus:outline-none focus:border-blue-600"
              title="Lọc theo Khối (Cấp 1)"
            >
              <option value="ALL">Tất cả Khối ({availableKhoiOptions.length})</option>
              {availableKhoiOptions.map((k) => (
                <option key={k.id || k.name} value={k.id || k.name}>
                  {k.name}
                </option>
              ))}
            </select>

            {/* CẤP 2: Lọc theo Phòng ban (kèm Ký hiệu PB) */}
            <select
              value={phongBanFilter}
              onChange={(e) => {
                setPhongBanFilter(e.target.value);
                setDeptFilter('ALL');
                setCurrentPage(1);
              }}
              className="px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg font-medium text-slate-700 focus:bg-white focus:outline-none focus:border-blue-600"
              title="Lọc theo Phòng ban (Cấp 2)"
            >
              <option value="ALL">
                {khoiFilter === 'ALL'
                  ? `Tất cả phòng ban (${availablePhongBanOptions.length})`
                  : `Phòng ban thuộc Khối (${availablePhongBanOptions.length})`}
              </option>
              {availablePhongBanOptions.map((pb) => (
                <option key={pb.id || pb.name} value={pb.id || pb.name}>
                  {pb.code ? `[${pb.code}] ` : ''}{pb.name}
                </option>
              ))}
            </select>

            {/* CẤP 3: Lọc theo Phòng ban con / Bộ phận con */}
            <select
              value={deptFilter}
              onChange={(e) => {
                setDeptFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg font-medium text-slate-700 focus:bg-white focus:outline-none focus:border-blue-600"
              title="Lọc theo Phòng ban con (Cấp 3)"
            >
              <option value="ALL">
                {phongBanFilter === 'ALL'
                  ? `Tất cả bộ phận con (${availableSubDepts.length})`
                  : `Bộ phận con trực thuộc (${availableSubDepts.length})`}
              </option>
              {availableSubDepts.map((sub) => (
                <option key={sub.id || sub.name} value={sub.id || sub.name}>
                  {sub.name}
                </option>
              ))}
            </select>

            {/* Lọc theo Tình trạng làm việc (Đang làm / Đã nghỉ việc) */}
            <select
              value={workStatusFilter}
              onChange={(e) => {
                setWorkStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'RESIGNED');
                setCurrentPage(1);
              }}
              className="px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg font-medium text-slate-700 focus:bg-white focus:outline-none focus:border-blue-600"
              title="Lọc theo tình trạng làm việc"
            >
              <option value="ALL">Tất cả tình trạng ({workStatusCounts.total})</option>
              <option value="ACTIVE">Đang làm việc ({workStatusCounts.active})</option>
              <option value="RESIGNED">Đã nghỉ việc ({workStatusCounts.resigned})</option>
            </select>

            {/* Join Date Range Filter (Lọc theo khoảng ngày vào làm) */}
            <div className="flex flex-wrap items-center gap-2 bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs">
              <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                Ngày vào làm:
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">Từ</span>
                <input
                  type="date"
                  value={joinDateFrom}
                  onChange={(e) => setJoinDateFrom(e.target.value)}
                  className="px-2 py-0.5 bg-white border border-slate-300 rounded font-mono-num text-slate-800 focus:outline-none focus:border-blue-600"
                  title="Từ ngày vào làm"
                />
                <span className="text-slate-500">đến</span>
                <input
                  type="date"
                  value={joinDateTo}
                  onChange={(e) => setJoinDateTo(e.target.value)}
                  className="px-2 py-0.5 bg-white border border-slate-300 rounded font-mono-num text-slate-800 focus:outline-none focus:border-blue-600"
                  title="Đến ngày vào làm"
                />
                {(joinDateFrom || joinDateTo) && (
                  <button
                    type="button"
                    onClick={() => {
                      setJoinDateFrom('');
                      setJoinDateTo('');
                    }}
                    className="p-1 text-red-600 hover:bg-red-50 rounded cursor-pointer"
                    title="Xóa lọc ngày vào làm"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Sắp xếp danh sách */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs">
              <ArrowUpDown className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
              <span className="font-semibold text-slate-700 whitespace-nowrap">Sắp xếp:</span>
              <select
                value={`${sortBy}_${sortOrder}`}
                onChange={(e) => {
                  const [f, o] = e.target.value.split('_') as [any, any];
                  setSortBy(f);
                  setSortOrder(o);
                  setCurrentPage(1);
                }}
                className="bg-transparent border-none text-xs font-medium text-slate-700 focus:outline-none cursor-pointer pr-1"
                title="Chọn tiêu chí sắp xếp nhân viên"
              >
                <option value="msnv_desc">Mã NV: Số lớn nhất lên đầu (Giảm dần)</option>
                <option value="msnv_asc">Mã NV: Số nhỏ nhất lên đầu (Tăng dần)</option>
                <option value="fullName_asc">Họ và tên: A → Z</option>
                <option value="fullName_desc">Họ và tên: Z → A</option>
                <option value="joinDate_desc">Ngày vào làm: Mới nhất trước</option>
                <option value="joinDate_asc">Ngày vào làm: Cũ nhất trước</option>
                {workStatusFilter === 'RESIGNED' && (
                  <>
                    <option value="resignedDate_desc">Ngày nghỉ: Gần nhất trước</option>
                    <option value="resignedDate_asc">Ngày nghỉ: Cũ nhất trước</option>
                  </>
                )}
                <option value="createdAt_desc">Mới thêm vào hệ thống</option>
              </select>
            </div>
          </div>

          {/* Batch Selection Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {(joinDateFrom || joinDateTo || khoiFilter !== 'ALL' || deptFilter !== 'ALL' || phongBanFilter !== 'ALL' || workStatusFilter !== 'ALL' || searchQuery.trim() || sortBy !== 'msnv' || sortOrder !== 'desc') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setKhoiFilter('ALL');
                  setPhongBanFilter('ALL');
                  setDeptFilter('ALL');
                  setWorkStatusFilter('ALL');
                  setJoinDateFrom('');
                  setJoinDateTo('');
                  setSortBy('msnv');
                  setSortOrder('desc');
                  setCurrentPage(1);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer transition-colors"
                title="Xóa tất cả bộ lọc và quay về sắp xếp mặc định theo Mã NV số lớn nhất lên đầu"
              >
                <X className="w-3.5 h-3.5" />
                <span>Đặt lại lọc</span>
              </button>
            )}

            {filteredEmployees.length > 0 &&
              (joinDateFrom || joinDateTo || khoiFilter !== 'ALL' || deptFilter !== 'ALL' || phongBanFilter !== 'ALL' || workStatusFilter !== 'ALL' || searchQuery.trim()) && (
                <button
                  type="button"
                  onClick={() =>
                    onOpenPrintDialog(filteredEmployees.map((e) => e.id))
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  In {filteredEmployees.length} Thẻ Đang Lọc
                </button>
              )}

            {selectedEmployeeIds.size > 0 && (
              <>
                <span className="text-xs font-mono-num font-bold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200">
                  Đã chọn {selectedEmployeeIds.size} thẻ
                </span>
                <button
                  type="button"
                  onClick={() => onOpenPrintDialog(Array.from(selectedEmployeeIds))}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  In {selectedEmployeeIds.size} Thẻ Đã Chọn
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const selectedList = employees.filter((e) =>
                      selectedEmployeeIds.has(e.id)
                    );
                    setDocGeneratorEmployees(selectedList);
                    setIsDocGeneratorOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-blue-800 bg-blue-100/80 hover:bg-blue-200 border border-blue-300 rounded-lg cursor-pointer transition-colors"
                  title="Tạo văn bản cho các nhân viên đã chọn"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Tạo văn bản ({selectedEmployeeIds.size})
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmBatchDelete(true)}
                  className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Xóa mục chọn
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Employee Data Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {employees.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Users className="w-10 h-10 text-slate-300 mx-auto" />
            <div className="text-base font-bold text-slate-900">
              Chưa có dữ liệu nhân viên trong hệ thống
            </div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Bạn có thể bấm &quot;Import Từ File Excel&quot; để tải danh sách nhân viên từ file Excel hoặc bấm &quot;Thêm Nhân Viên&quot; để tạo hồ sơ mới.
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsSyncModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg cursor-pointer transition-colors shadow-xs"
              >
                <RefreshCw className="w-4 h-4" />
                Đồng Bộ Từ API Việt Sun
              </button>
              <button
                type="button"
                onClick={openAddModal}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer transition-colors shadow-xs"
              >
                <Plus className="w-4 h-4" />
                Thêm Nhân Viên Mới
              </button>
              <button
                type="button"
                onClick={onOpenImportModal}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg cursor-pointer transition-colors shadow-2xs"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Import Từ File Excel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 w-10 text-center">
                    <button
                      type="button"
                      onClick={toggleSelectAllFiltered}
                      className="text-blue-600 cursor-pointer"
                      title="Chọn tất cả nhân viên đang hiển thị"
                    >
                      {isAllFilteredSelected ? (
                        <CheckSquare className="w-4 h-4" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400" />
                      )}
                    </button>
                  </th>
                  <th className="py-3 px-3 w-24 text-center">Ảnh 3×4</th>
                  <th
                    onClick={() => {
                      if (sortBy === 'msnv') {
                        setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
                      } else {
                        setSortBy('msnv');
                        setSortOrder('desc');
                      }
                      setCurrentPage(1);
                    }}
                    className="py-3 px-4 w-28 font-mono-num cursor-pointer select-none hover:bg-slate-100 transition-colors group"
                    title="Sắp xếp theo Mã số nhân viên (Bấm để đảo chiều Lớn nhất / Nhỏ nhất lên đầu)"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={sortBy === 'msnv' ? 'text-blue-700 font-bold' : ''}>MSNV</span>
                      {sortBy === 'msnv' ? (
                        sortOrder === 'asc' ? (
                          <ArrowUp className="w-3.5 h-3.5 text-blue-600" />
                        ) : (
                          <ArrowDown className="w-3.5 h-3.5 text-blue-600" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => {
                      if (sortBy === 'fullName') {
                        setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
                      } else {
                        setSortBy('fullName');
                        setSortOrder('asc');
                      }
                      setCurrentPage(1);
                    }}
                    className="py-3 px-4 cursor-pointer select-none hover:bg-slate-100 transition-colors group"
                    title="Sắp xếp theo Họ và tên (Bấm để đảo chiều A-Z / Z-A)"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={sortBy === 'fullName' ? 'text-blue-700 font-bold' : ''}>Họ và tên</span>
                      {sortBy === 'fullName' ? (
                        sortOrder === 'asc' ? (
                          <ArrowUp className="w-3.5 h-3.5 text-blue-600" />
                        ) : (
                          <ArrowDown className="w-3.5 h-3.5 text-blue-600" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </div>
                  </th>
                  <th className="py-3 px-4 min-w-[200px]">Cơ cấu tổ chức (3 cấp)</th>
                  <th
                    onClick={() => {
                      if (sortBy === 'joinDate') {
                        setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
                      } else {
                        setSortBy('joinDate');
                        setSortOrder('asc');
                      }
                      setCurrentPage(1);
                    }}
                    className="py-3 px-4 w-32 font-mono-num cursor-pointer select-none hover:bg-slate-100 transition-colors group"
                    title="Sắp xếp theo Ngày vào làm (Bấm để đảo chiều Cũ/Mới)"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={sortBy === 'joinDate' ? 'text-blue-700 font-bold' : ''}>Ngày vào làm</span>
                      {sortBy === 'joinDate' ? (
                        sortOrder === 'asc' ? (
                          <ArrowUp className="w-3.5 h-3.5 text-blue-600" />
                        ) : (
                          <ArrowDown className="w-3.5 h-3.5 text-blue-600" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </div>
                  </th>
                  <th className="py-3 px-4 w-44 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {paginatedEmployees.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-10 px-4 text-center text-xs text-slate-500"
                    >
                      Không tìm thấy nhân viên nào khớp với bộ lọc hiện tại.
                    </td>
                  </tr>
                ) : (
                  paginatedEmployees.map((emp) => {
                  const isSelected = selectedEmployeeIds.has(emp.id);
                  const isUploadingThis = uploadingPhotoEmpId === emp.id;
                  return (
                    <tr
                      key={emp.id}
                      className={
                        isSelected
                          ? 'bg-blue-50/50 hover:bg-blue-50'
                          : 'hover:bg-slate-50 transition-colors'
                      }
                    >
                      <td className="py-2.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => toggleSelectOne(emp.id)}
                          className="text-blue-600 cursor-pointer"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400" />
                          )}
                        </button>
                      </td>
                      <td className="py-2 px-3 text-center">
                        <div className="relative inline-flex items-center justify-center group">
                          <label
                            className="w-10 h-13 rounded border border-slate-300 bg-white overflow-hidden flex flex-col items-center justify-center cursor-pointer hover:border-blue-600 transition-colors shadow-2xs relative"
                            title={`Bấm để tải hoặc đổi ảnh 3×4 cho ${emp.fullName}`}
                          >
                            {isUploadingThis ? (
                              <span className="text-[9px] font-bold text-blue-600 px-1">
                                Đang lưu...
                              </span>
                            ) : emp.photoUrl ? (
                              <>
                                <img
                                  src={emp.photoUrl}
                                  alt={emp.fullName}
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover"
                                />
                                <span className="absolute inset-0 bg-slate-900/55 text-white text-[9px] font-bold opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                  Đổi 3×4
                                </span>
                              </>
                            ) : (
                              <div className="flex flex-col items-center justify-center text-blue-700 hover:bg-blue-50 w-full h-full p-0.5">
                                <Camera className="w-3.5 h-3.5 mb-0.5 text-blue-600" />
                                <span className="text-[9px] font-bold leading-tight">
                                  + 3×4
                                </span>
                              </div>
                            )}
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) =>
                                handleDirectEmployeePhotoUpload(emp, e)
                              }
                              className="hidden"
                            />
                          </label>
                          {emp.photoUrl && !isUploadingThis && (
                            <button
                              type="button"
                              onClick={() => handleRemoveEmployeePhoto(emp)}
                              className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow-xs"
                              title="Xóa ảnh 3×4 của nhân viên này"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 font-mono-num font-bold text-blue-700">
                        {emp.msnv}
                      </td>
                      <td className="py-2.5 px-4 font-bold text-slate-900">
                        <button
                          type="button"
                          onClick={() => {
                            setViewingProfileEmployee(emp);
                            setProfileViewTab('details');
                          }}
                          className="text-left font-bold text-slate-900 hover:text-blue-700 hover:underline cursor-pointer flex flex-col items-start"
                          title="Bấm để xem toàn bộ hồ sơ nhân sự chi tiết"
                        >
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{emp.fullName}</span>
                            {(isContractTerminated(emp) || emp.tinhTrang === 'Hết hiệu lực' || emp.trangThaiHopDong === 'Hết hiệu lực' || emp.tinhTrang === 'Nghỉ việc') && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">
                                Đã nghỉ việc
                              </span>
                            )}
                          </div>
                          {(emp.congViec || emp.jobTitle || emp.chucVu) && (
                            <span className="text-[11px] font-normal text-slate-500">
                              {emp.congViec || emp.jobTitle || emp.chucVu}
                            </span>
                          )}
                        </button>
                      </td>
                      <td className="py-2.5 px-4 text-slate-700">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {emp.kyHieuPb && (
                            <span
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200"
                              title={`Ký hiệu PB: ${emp.kyHieuPb}`}
                            >
                              {emp.kyHieuPb}
                            </span>
                          )}
                          <span className="font-semibold text-slate-800">
                            {(emp.phongBanCon || emp.department || '—').replace(/^(?:bp\.?\s*){2,}/i, 'BP. ')}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                          <span>{emp.phongBan || 'Chưa phân PB'}</span>
                          {emp.khoi && (
                            <>
                              <span className="text-slate-300">•</span>
                              <span className="text-slate-400">{emp.khoi}</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 font-mono-num text-slate-700">
                        {emp.joinDate}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setViewingProfileEmployee(emp);
                              setProfileViewTab('details');
                            }}
                            className="p-1.5 text-blue-700 hover:bg-blue-100 rounded-lg cursor-pointer"
                            title="Xem chi tiết hồ sơ nhân sự"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(emp)}
                            className="p-1.5 text-slate-600 hover:bg-slate-200 rounded-lg cursor-pointer"
                            title="Sửa thông tin"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingEmployee(emp)}
                            className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg cursor-pointer"
                            title="Xóa nhân viên"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>

                          {/* Nút 3 chấm mở bảng thao tác mở rộng */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (actionMenuState && actionMenuState.emp.id === emp.id) {
                                setActionMenuState(null);
                                return;
                              }
                              const rect = e.currentTarget.getBoundingClientRect();
                              const menuHeight = 330;
                              const spaceBelow = window.innerHeight - rect.bottom;
                              const openUpwards = spaceBelow < menuHeight && rect.top > menuHeight;

                              setActionMenuState({
                                emp,
                                top: rect.bottom + 4,
                                bottom: window.innerHeight - rect.top + 4,
                                right: window.innerWidth - rect.right,
                                openUpwards,
                              });
                            }}
                            className={`p-1.5 rounded-lg cursor-pointer transition-colors ${
                              actionMenuState?.emp.id === emp.id
                                ? 'bg-blue-100 text-blue-700'
                                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200'
                            }`}
                            title="Bảng thao tác khác"
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

          {/* Pagination Footer Bar */}
          {filteredEmployees.length > 0 && (
              <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-3 text-slate-600">
                  <span>
                    Hiển thị{' '}
                    <strong className="font-mono-num text-slate-900">
                      {(safeCurrentPage - 1) * pageSize + 1}
                    </strong>
                    –
                    <strong className="font-mono-num text-slate-900">
                      {Math.min(safeCurrentPage * pageSize, filteredEmployees.length)}
                    </strong>{' '}
                    trong tổng số{' '}
                    <strong className="font-mono-num text-blue-700">
                      {filteredEmployees.length}
                    </strong>{' '}
                    nhân viên
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
              </div>
            )}
          </>
        )}
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
                Bảng thao tác
              </span>
              <span className="text-[10px] font-mono-num font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                {actionMenuState.emp.msnv}
              </span>
            </div>

            <div className="px-3.5 py-1 font-bold text-slate-900 text-xs truncate">
              {actionMenuState.emp.fullName}
            </div>

            <div className="py-1">
              {/* THAO TÁC: Xem nhanh lịch sử làm việc */}
              <button
                type="button"
                onClick={() => {
                  const targetEmp = actionMenuState.emp;
                  setActionMenuState(null);
                  setViewingProfileEmployee(targetEmp);
                  setProfileViewTab('work_history');
                }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-blue-700 hover:bg-blue-50 cursor-pointer transition-colors font-semibold"
              >
                <div className="p-1 rounded-md bg-blue-100 text-blue-700 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <Briefcase className="w-3.5 h-3.5" />
                </div>
                <span>Lịch sử làm việc</span>
              </button>

              {/* THAO TÁC: Xem lịch sử hợp đồng */}
              <button
                type="button"
                onClick={() => {
                  const targetEmp = actionMenuState.emp;
                  setActionMenuState(null);
                  setViewingContractHistoryEmployee(targetEmp);
                }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-indigo-700 hover:bg-indigo-50 cursor-pointer transition-colors font-semibold"
              >
                <div className="p-1 rounded-md bg-indigo-100 text-indigo-700 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                  <History className="w-3.5 h-3.5" />
                </div>
                <span>Lịch sử hợp đồng</span>
              </button>

              {/* THAO TÁC 1: TẠO VĂN BẢN (Theo yêu cầu người dùng) */}
              <button
                type="button"
                onClick={() => {
                  const targetEmp = actionMenuState.emp;
                  setActionMenuState(null);
                  setDocGeneratorEmployees([targetEmp]);
                  setIsDocGeneratorOpen(true);
                }}
                className="w-full flex items-start gap-2.5 px-3.5 py-2.5 text-slate-800 hover:bg-blue-50 hover:text-blue-700 cursor-pointer transition-colors group"
              >
                <div className="p-1.5 rounded-lg bg-blue-100 text-blue-700 group-hover:bg-blue-600 group-hover:text-white transition-colors shrink-0 mt-0.5">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="flex-1 text-left">
                  <div className="font-bold text-xs text-slate-900 group-hover:text-blue-700 flex items-center gap-1.5">
                    <span>Tạo văn bản</span>
                    <span className="text-[9px] font-bold px-1.5 py-0.2 bg-blue-100 text-blue-700 rounded-full">
                      Mới
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                    Trộn file Word mẫu, hợp đồng, quyết định...
                  </div>
                </div>
              </button>

              {/* THAO TÁC 2: In thẻ nhân viên này */}
              <button
                type="button"
                onClick={() => {
                  const targetEmp = actionMenuState.emp;
                  setActionMenuState(null);
                  onOpenPrintDialog([targetEmp.id]);
                }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-slate-700 hover:bg-slate-50 hover:text-slate-900 cursor-pointer transition-colors"
              >
                <Printer className="w-3.5 h-3.5 text-slate-400" />
                <span>In thẻ nhân viên này</span>
              </button>

              {/* THAO TÁC 3: Cắt ảnh thẻ 3x4 bằng AI */}
              <button
                type="button"
                onClick={() => {
                  const targetEmp = actionMenuState.emp;
                  setActionMenuState(null);
                  setFaceCropEmployee(targetEmp);
                  setIsFaceCropModalOpen(true);
                }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-slate-700 hover:bg-slate-50 hover:text-slate-900 cursor-pointer transition-colors"
              >
                <ScanFace className="w-3.5 h-3.5 text-slate-400" />
                <span>Cắt ảnh thẻ 3×4 bằng AI</span>
              </button>

              {/* THAO TÁC 4: Sao chép thông tin hồ sơ */}
              <button
                type="button"
                onClick={() => {
                  const targetEmp = actionMenuState.emp;
                  setActionMenuState(null);
                  const text = `MSNV: ${targetEmp.msnv}\nHọ tên: ${targetEmp.fullName}\nBộ phận: ${targetEmp.department}\nNgày vào: ${targetEmp.joinDate}\nCCCD: ${targetEmp.cccd || ''}\nSĐT: ${targetEmp.soDienThoai || ''}`;
                  navigator.clipboard.writeText(text);
                  alert(`Đã sao chép thông tin của ${targetEmp.fullName} vào bộ nhớ tạm!`);
                }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-slate-700 hover:bg-slate-50 hover:text-slate-900 cursor-pointer transition-colors"
              >
                <Copy className="w-3.5 h-3.5 text-slate-400" />
                <span>Sao chép thông tin hồ sơ</span>
              </button>

              {/* THAO TÁC 5: Chấm dứt hợp đồng (chỉ hiển thị khi hợp đồng chưa chấm dứt) */}
              {!isContractTerminated(actionMenuState.emp) && (
                <div className="pt-1 mt-1 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      const targetEmp = actionMenuState.emp;
                      setActionMenuState(null);
                      setTerminatingEmployee(targetEmp);
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

      {/* Modal 0: Chi Tiết Toàn Bộ Hồ Sơ Nhân Sự */}
      {viewingProfileEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="px-6 py-4 bg-blue-700 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-11 h-14 rounded border border-white/30 bg-white/10 overflow-hidden flex items-center justify-center shrink-0">
                  {viewingProfileEmployee.photoUrl ? (
                    <img
                      src={viewingProfileEmployee.photoUrl}
                      alt={viewingProfileEmployee.fullName}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-6 h-6 text-blue-200" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold">
                      {viewingProfileEmployee.fullName}
                    </h3>
                    <span className="px-2 py-0.5 rounded text-[11px] font-mono-num font-bold bg-white/20 text-white">
                      MSNV: {viewingProfileEmployee.msnv}
                    </span>
                  </div>
                  <div className="text-xs text-blue-100 flex flex-wrap items-center gap-2 mt-0.5">
                    <span>
                      {viewingProfileEmployee.department}
                      {viewingProfileEmployee.phongBan && viewingProfileEmployee.phongBan !== viewingProfileEmployee.department
                        ? ` (${viewingProfileEmployee.phongBan})`
                        : ''}
                    </span>
                    <span>·</span>
                    <span>{viewingProfileEmployee.congViec || viewingProfileEmployee.jobTitle || viewingProfileEmployee.chucVu || 'Cán bộ nhân viên'}</span>
                    <span>·</span>
                    <span>Ngày vào: {viewingProfileEmployee.joinDate}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const emp = viewingProfileEmployee;
                    setViewingProfileEmployee(null);
                    openEditModal(emp);
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-white/15 hover:bg-white/25 text-white rounded-lg cursor-pointer transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Sửa hồ sơ</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const id = viewingProfileEmployee.id;
                    setViewingProfileEmployee(null);
                    onOpenPrintDialog([id]);
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold bg-white text-blue-700 hover:bg-blue-50 rounded-lg cursor-pointer transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>In thẻ</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewingProfileEmployee(null)}
                  className="p-1.5 rounded-lg hover:bg-white/15 text-white cursor-pointer"
                  title="Đóng"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Profile Navigation Tabs */}
            <div className="flex border-b border-slate-200 bg-white px-6 pt-2 gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setProfileViewTab('details')}
                className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
                  profileViewTab === 'details'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                1. Thông tin hồ sơ chi tiết
              </button>
              <button
                type="button"
                onClick={() => setProfileViewTab('work_history')}
                className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                  profileViewTab === 'work_history'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>2. Lịch sử làm việc & Tái tuyển dụng</span>
              </button>
            </div>

            {/* Profile Content Body */}
            <div className="p-6 overflow-y-auto space-y-6 text-xs bg-slate-50 flex-1">
              {profileViewTab === 'work_history' ? (
                <WorkHistoryTab
                  employeeId={viewingProfileEmployee.id}
                  onOpenTerminateModal={() => setTerminatingWorkHistoryEmp(viewingProfileEmployee)}
                  onOpenRehireModal={() => setRehiringWorkHistoryEmp(viewingProfileEmployee)}
                />
              ) : (
                <>
                  {/* Section 1: Công tác & Vị trí */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-sm border-b border-slate-100 pb-2">
                  <Briefcase className="w-4 h-4 text-blue-600" />
                  <h4>1. Thông Tin Công Tác & Vị Trí</h4>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Đơn vị</span>
                    <span className="font-semibold text-slate-800">{viewingProfileEmployee.donVi || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Tình trạng làm việc</span>
                    <span className="font-semibold text-slate-800">{viewingProfileEmployee.tinhTrang || '—'}</span>
                  </div>
                  <div className="bg-blue-50/70 p-2.5 rounded-lg border border-blue-100">
                    <span className="text-blue-700 block text-[11px] font-bold">Cấp 1: Khối</span>
                    <span className="font-bold text-slate-900">{viewingProfileEmployee.khoi || viewingProfileEmployee.khoi2 || '—'}</span>
                  </div>
                  <div className="bg-indigo-50/70 p-2.5 rounded-lg border border-indigo-100">
                    <span className="text-indigo-700 block text-[11px] font-bold">Ký hiệu PB</span>
                    <span className="inline-flex items-center px-2 py-0.5 mt-0.5 rounded text-xs font-mono font-bold bg-indigo-600 text-white">
                      {viewingProfileEmployee.kyHieuPb || '—'}
                    </span>
                  </div>
                  <div className="bg-indigo-50/70 p-2.5 rounded-lg border border-indigo-100 col-span-2">
                    <span className="text-indigo-700 block text-[11px] font-bold">Cấp 2: Phòng ban (Bộ phận)</span>
                    <span className="font-bold text-slate-900">{viewingProfileEmployee.phongBan || '—'}</span>
                  </div>
                  <div className="bg-emerald-50/70 p-2.5 rounded-lg border border-emerald-100 col-span-2">
                    <span className="text-emerald-700 block text-[11px] font-bold">Cấp 3: Phòng ban con (Bộ phận con)</span>
                    <span className="font-bold text-emerald-900">{viewingProfileEmployee.phongBanCon || viewingProfileEmployee.department || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Công việc</span>
                    <span className="font-semibold text-slate-800">{viewingProfileEmployee.congViec || viewingProfileEmployee.jobTitle || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Chức vụ</span>
                    <span className="font-semibold text-slate-800">{viewingProfileEmployee.chucVu || viewingProfileEmployee.congViec || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Ngày vào làm</span>
                    <span className="font-semibold text-slate-800 font-mono-num">{viewingProfileEmployee.ngayVao || viewingProfileEmployee.joinDate || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Số thứ tự (STT)</span>
                    <span className="font-semibold text-slate-800">{viewingProfileEmployee.stt || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Section 2: Thông tin cá nhân & Giới tính */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-sm border-b border-slate-100 pb-2">
                  <User className="w-4 h-4 text-emerald-600" />
                  <h4>2. Thông Tin Cá Nhân & Giới Tính</h4>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Họ và tên đệm</span>
                    <span className="font-semibold text-slate-800">{viewingProfileEmployee.ho || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Tên</span>
                    <span className="font-semibold text-slate-800">{viewingProfileEmployee.ten || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Giới tính</span>
                    <span className="font-semibold text-slate-800">{viewingProfileEmployee.gioiTinh || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Ngày sinh</span>
                    <span className="font-semibold text-slate-800">{viewingProfileEmployee.ngaySinh || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Nơi sinh</span>
                    <span className="font-semibold text-slate-800">{viewingProfileEmployee.noiSinh || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Nguyên quán</span>
                    <span className="font-semibold text-slate-800">{viewingProfileEmployee.nguyenQuan || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Dân tộc</span>
                    <span className="font-semibold text-slate-800">{viewingProfileEmployee.danToc || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Tôn giáo</span>
                    <span className="font-semibold text-slate-800">{viewingProfileEmployee.tonGiao || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Số điện thoại</span>
                    <span className="font-bold text-blue-700">{viewingProfileEmployee.soDienThoai || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Tình trạng hôn nhân</span>
                    <span className="font-semibold text-slate-800">{viewingProfileEmployee.tinhTrangHonNhan || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Sức khỏe</span>
                    <span className="font-semibold text-slate-800">{viewingProfileEmployee.sucKhoe || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Người giới thiệu</span>
                    <span className="font-semibold text-slate-800">{viewingProfileEmployee.gioiThieu || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Section 3: Căn cước công dân (CCCD) */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-sm border-b border-slate-100 pb-2">
                  <Shield className="w-4 h-4 text-indigo-600" />
                  <h4>3. Căn Cước Công Dân & Định Danh</h4>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="md:col-span-2">
                    <span className="text-slate-400 block text-[11px]">Số CCCD / Định danh</span>
                    <span className="font-mono-num font-bold text-sm text-slate-900">{viewingProfileEmployee.cccd || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Ngày cấp</span>
                    <span className="font-semibold text-slate-800">{viewingProfileEmployee.ngayCapCccd || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Nơi cấp</span>
                    <span className="font-semibold text-slate-800">{viewingProfileEmployee.noiCapCccd || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Ngày hết hạn</span>
                    <span className="font-semibold text-slate-800">{viewingProfileEmployee.ngayHetHanCccd || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Số CMND cũ</span>
                    <span className="font-semibold text-slate-800">{viewingProfileEmployee.soCmndCu || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Section 4: Địa chỉ Thường trú & Tạm trú */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-sm border-b border-slate-100 pb-2">
                  <Home className="w-4 h-4 text-amber-600" />
                  <h4>4. Hộ Khẩu Thường Trú & Tạm Trú</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                    <span className="font-bold text-slate-700 block text-xs">Hộ khẩu Thường trú</span>
                    <div className="grid grid-cols-3 gap-2 text-[11px]">
                      <div>
                        <span className="text-slate-400 block">Số nhà</span>
                        <span className="font-semibold text-slate-800">{viewingProfileEmployee.soNhaThuongTru || '—'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Phường/Xã</span>
                        <span className="font-semibold text-slate-800">{viewingProfileEmployee.phuongXaThuongTru || '—'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Tỉnh/TP</span>
                        <span className="font-semibold text-slate-800">{viewingProfileEmployee.tinhTpThuongTru || '—'}</span>
                      </div>
                    </div>
                    {viewingProfileEmployee.diaChiThuongTru && (
                      <div className="pt-1.5 border-t border-slate-200 text-[11px]">
                        <span className="text-slate-400 block">Địa chỉ đầy đủ:</span>
                        <span className="font-medium text-slate-800">{viewingProfileEmployee.diaChiThuongTru}</span>
                      </div>
                    )}
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                    <span className="font-bold text-slate-700 block text-xs">Nơi ở Tạm trú</span>
                    <div className="grid grid-cols-3 gap-2 text-[11px]">
                      <div>
                        <span className="text-slate-400 block">Số nhà</span>
                        <span className="font-semibold text-slate-800">{viewingProfileEmployee.soNhaTamTru || '—'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Phường/Xã</span>
                        <span className="font-semibold text-slate-800">{viewingProfileEmployee.phuongXaTamTru || '—'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Tỉnh/TP</span>
                        <span className="font-semibold text-slate-800">{viewingProfileEmployee.tinhTpTamTru || '—'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 5: Trình độ, Chuyên môn & Kỹ năng */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-sm border-b border-slate-100 pb-2">
                  <Award className="w-4 h-4 text-purple-600" />
                  <h4>5. Trình Độ, Học Vấn & Kỹ Năng</h4>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Trình độ văn hóa</span>
                    <span className="font-semibold text-slate-800">{viewingProfileEmployee.trinhDoVanHoa || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Trình độ chuyên môn</span>
                    <span className="font-semibold text-slate-800">{viewingProfileEmployee.trinhDoChuyenMon || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Ngoại ngữ</span>
                    <span className="font-semibold text-slate-800">{viewingProfileEmployee.trinhDoNgoaiNgu || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Tay nghề</span>
                    <span className="font-semibold text-slate-800">{viewingProfileEmployee.tayNghe || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Đào tạo</span>
                    <span className="font-semibold text-slate-800">{viewingProfileEmployee.daoTao || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Section 6: Hợp đồng lao động */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                    <FileCheck className="w-4 h-4 text-cyan-600" />
                    <h4>6. Hợp Đồng Lao Động</h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setViewingContractHistoryEmployee(viewingProfileEmployee);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200/80 rounded-xl cursor-pointer transition-colors shadow-2xs"
                    title="Xem toàn bộ các hợp đồng đã ký trong lịch sử của nhân sự này"
                  >
                    <History className="w-3.5 h-3.5 text-blue-600" />
                    <span>Xem toàn bộ lịch sử hợp đồng</span>
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Trạng thái HĐ</span>
                    <span
                      className={`font-bold text-xs ${
                        isContractTerminated(viewingProfileEmployee) || viewingProfileEmployee.tinhTrang === 'Hết hiệu lực' || viewingProfileEmployee.trangThaiHopDong === 'Hết hiệu lực' || viewingProfileEmployee.tinhTrang === 'Nghỉ việc'
                          ? 'text-red-600'
                          : 'text-emerald-700'
                      }`}
                    >
                      {isContractTerminated(viewingProfileEmployee) || viewingProfileEmployee.tinhTrang === 'Hết hiệu lực' || viewingProfileEmployee.trangThaiHopDong === 'Hết hiệu lực' || viewingProfileEmployee.tinhTrang === 'Nghỉ việc'
                        ? 'Đã nghỉ việc'
                        : (viewingProfileEmployee.trangThaiHopDong || 'Hiệu lực')}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Bộ phận HĐ</span>
                    <span className="font-semibold text-slate-800">{viewingProfileEmployee.boPhan || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Loại HĐ</span>
                    <span className="font-semibold text-slate-800">{viewingProfileEmployee.loaiHd || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Thời hạn</span>
                    <span className="font-semibold text-slate-800">{viewingProfileEmployee.thoiHan || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Phân loại</span>
                    <span className="font-semibold text-slate-800">{viewingProfileEmployee.phanLoai || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Số hợp đồng</span>
                    <span className="font-semibold text-slate-800">{viewingProfileEmployee.soHd || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Từ ngày</span>
                    <span className="font-semibold text-slate-800">{viewingProfileEmployee.tuNgay || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Đến ngày (Hết hạn)</span>
                    <span className="font-semibold text-slate-800">{viewingProfileEmployee.denNgay || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Khối HĐ</span>
                    <span className="font-semibold text-slate-800">{viewingProfileEmployee.khoi2 || '—'}</span>
                  </div>
                </div>
              </div>
              </>
            )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3.5 bg-white border-t border-slate-200 flex items-center justify-between shrink-0">
              <div className="text-xs text-slate-500">
                Lần in thẻ gần nhất: {viewingProfileEmployee.lastPrintedAt || 'Chưa in'} ({viewingProfileEmployee.printCount || 0} lần)
              </div>
              <button
                type="button"
                onClick={() => setViewingProfileEmployee(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 1: Add / Edit Employee (Full 4-tab Editor) */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="px-6 py-4 bg-blue-700 text-white flex items-center justify-between shrink-0">
              <h3 className="text-sm font-bold">
                {editingEmployee
                  ? `Cập Nhật Hồ Sơ Nhân Viên: ${editingEmployee.fullName} (MSNV: ${editingEmployee.msnv})`
                  : 'Thêm Mới Hồ Sơ Nhân Viên'}
              </h3>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="p-1 rounded hover:bg-blue-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form Tabs Navigation */}
            <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-2 gap-2 text-xs shrink-0">
              <button
                type="button"
                onClick={() => setFormActiveTab('job')}
                className={`px-3 py-2 font-bold rounded-t-lg transition-colors cursor-pointer ${
                  formActiveTab === 'job'
                    ? 'bg-white text-blue-700 border-t-2 border-t-blue-700 border-x border-slate-200 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                1. Công Tác & Thẻ NV
              </button>
              <button
                type="button"
                onClick={() => setFormActiveTab('personal')}
                className={`px-3 py-2 font-bold rounded-t-lg transition-colors cursor-pointer ${
                  formActiveTab === 'personal'
                    ? 'bg-white text-blue-700 border-t-2 border-t-blue-700 border-x border-slate-200 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                2. Cá Nhân & Liên Hệ
              </button>
              <button
                type="button"
                onClick={() => setFormActiveTab('cccd_address')}
                className={`px-3 py-2 font-bold rounded-t-lg transition-colors cursor-pointer ${
                  formActiveTab === 'cccd_address'
                    ? 'bg-white text-blue-700 border-t-2 border-t-blue-700 border-x border-slate-200 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                3. CCCD & Nơi Ở
              </button>
              <button
                type="button"
                onClick={() => setFormActiveTab('contract')}
                className={`px-3 py-2 font-bold rounded-t-lg transition-colors cursor-pointer ${
                  formActiveTab === 'contract'
                    ? 'bg-white text-blue-700 border-t-2 border-t-blue-700 border-x border-slate-200 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                4. Học Vấn & Hợp Đồng
              </button>
            </div>

            <form onSubmit={handleSaveEmployeeForm} className="p-6 overflow-y-auto space-y-4 text-xs flex-1">
              {formError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Tab 1: Công Tác & Thẻ NV */}
              {formActiveTab === 'job' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Mã số nhân viên (MSNV) *
                      </label>
                      <input
                        type="text"
                        required
                        value={msnv}
                        onChange={(e) => setMsnv(e.target.value)}
                        placeholder="VD: 10448"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num focus:outline-none focus:border-blue-600"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Ngày vào làm (DD/MM/YYYY) *
                      </label>
                      <input
                        type="text"
                        required
                        value={joinDate}
                        onChange={(e) => {
                          setJoinDate(e.target.value);
                          setFormFields((f) => ({ ...f, ngayVao: e.target.value }));
                        }}
                        placeholder={`VD: ${getTodayFormattedDDMMYYYY()}`}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num focus:outline-none focus:border-blue-600"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Họ và tên nhân viên *
                    </label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="VD: ĐỖ ĐẶNG QUỐC HUY"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 font-bold"
                    />
                  </div>

                  {/* CƠ CẤU TỔ CHỨC 3 CẤP (CASCADING SELECTION) */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                        <Building2 className="w-4 h-4 text-blue-600" />
                        <span>Cơ Cấu Tổ Chức & Vị Trí (3 Cấp)</span>
                      </div>
                      {formFields.kyHieuPb && (
                        <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-mono font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                          <span>Ký hiệu PB:</span>
                          <span className="font-extrabold">{formFields.kyHieuPb}</span>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {/* CẤP 1: KHỐI */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          1. Khối trực thuộc *
                        </label>
                        <select
                          required
                          value={formDivisionId}
                          onChange={(e) => handleFormDivisionChange(e.target.value)}
                          className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-blue-600 font-medium"
                        >
                          <option value="" disabled>-- Chọn Khối --</option>
                          {divisions.map((div) => (
                            <option key={div.id} value={div.id}>
                              {div.name} {div.status === 'inactive' ? '(Ngừng)' : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* CẤP 2: PHÒNG BAN (BỘ PHẬN) */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          2. Phòng ban (Bộ phận) *
                        </label>
                        <select
                          required
                          value={formDeptId}
                          onChange={(e) => handleFormDepartmentChange(e.target.value)}
                          className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-blue-600 font-medium"
                        >
                          <option value="" disabled>-- Chọn Phòng ban --</option>
                          {departments
                            .filter((d) => (!formDivisionId ? true : d.divisionId === formDivisionId))
                            .map((dept) => (
                              <option key={dept.id} value={dept.id}>
                                [{dept.code || 'PB'}] {dept.name} {dept.status === 'inactive' ? '(Ngừng)' : ''}
                              </option>
                            ))}
                        </select>
                      </div>

                      {/* CẤP 3: PHÒNG BAN CON (BỘ PHẬN CON) */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          3. Phòng ban con (Bộ phận con) *
                        </label>
                        <select
                          required
                          value={formSubDeptId}
                          onChange={(e) => handleFormSubDepartmentChange(e.target.value)}
                          className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-blue-600 font-medium"
                        >
                          <option value="" disabled>-- Chọn Phòng ban con --</option>
                          {subDepartments
                            .filter((s) => (!formDeptId ? true : s.departmentId === formDeptId))
                            .map((sub) => (
                              <option key={sub.id} value={sub.id}>
                                {sub.name} {sub.status === 'inactive' ? '(Ngừng)' : ''}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Công việc / Chức danh
                      </label>
                      <input
                        type="text"
                        value={formFields.congViec || ''}
                        onChange={(e) =>
                          setFormFields((f) => ({
                            ...f,
                            congViec: e.target.value,
                            jobTitle: e.target.value,
                            chucVu: e.target.value,
                          }))
                        }
                        placeholder="VD: Trưởng phòng / Chuyên viên"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Đơn vị</label>
                      <input
                        type="text"
                        value={formFields.donVi || ''}
                        onChange={(e) => setFormFields((f) => ({ ...f, donVi: e.target.value }))}
                        placeholder="VD: XMAY 03"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Tình trạng</label>
                      <input
                        type="text"
                        value={formFields.tinhTrang || ''}
                        onChange={(e) => setFormFields((f) => ({ ...f, tinhTrang: e.target.value }))}
                        placeholder="VD: LV"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>

                  {/* Photo Section */}
                  <div className="pt-2 border-t border-slate-200 flex items-center gap-4">
                    <div className="w-16 h-20 rounded border border-slate-300 bg-white overflow-hidden shrink-0 flex items-center justify-center text-slate-400 font-bold">
                      {photoUrl ? (
                        <img
                          src={photoUrl}
                          alt="Preview"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span>3×4</span>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <div className="font-semibold text-slate-800">
                        Ảnh chân dung 3×4 (Không bắt buộc)
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 cursor-pointer">
                          <Upload className="w-3.5 h-3.5" />
                          Chọn ảnh 3×4 từ máy tính
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handlePhotoUpload}
                            className="hidden"
                          />
                        </label>
                        {photoUrl && (
                          <button
                            type="button"
                            onClick={() => setPhotoUrl('')}
                            className="text-red-600 hover:underline cursor-pointer"
                          >
                            Xóa ảnh
                          </button>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Ảnh sẽ tự động căn chuẩn tỷ lệ khung 3×4 trên thẻ nhân viên.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Thông Tin Cá Nhân & Liên Hệ */}
              {formActiveTab === 'personal' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Giới tính</label>
                      <select
                        value={formFields.gioiTinh || 'Nam'}
                        onChange={(e) => setFormFields((f) => ({ ...f, gioiTinh: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="Nam">Nam</option>
                        <option value="Nữ">Nữ</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Ngày sinh (DD/MM/YYYY)</label>
                      <input
                        type="text"
                        value={formFields.ngaySinh || ''}
                        onChange={(e) => setFormFields((f) => ({ ...f, ngaySinh: e.target.value }))}
                        placeholder="VD: 10/07/1986"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Nơi sinh</label>
                      <input
                        type="text"
                        value={formFields.noiSinh || ''}
                        onChange={(e) => setFormFields((f) => ({ ...f, noiSinh: e.target.value }))}
                        placeholder="VD: Đồng Nai"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Nguyên quán</label>
                      <input
                        type="text"
                        value={formFields.nguyenQuan || ''}
                        onChange={(e) => setFormFields((f) => ({ ...f, nguyenQuan: e.target.value }))}
                        placeholder="VD: Quảng Ngãi"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Dân tộc</label>
                      <input
                        type="text"
                        value={formFields.danToc || ''}
                        onChange={(e) => setFormFields((f) => ({ ...f, danToc: e.target.value }))}
                        placeholder="VD: Kinh"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Tôn giáo</label>
                      <input
                        type="text"
                        value={formFields.tonGiao || ''}
                        onChange={(e) => setFormFields((f) => ({ ...f, tonGiao: e.target.value }))}
                        placeholder="VD: Không / Công Giáo"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Số điện thoại</label>
                      <input
                        type="text"
                        value={formFields.soDienThoai || ''}
                        onChange={(e) => setFormFields((f) => ({ ...f, soDienThoai: e.target.value }))}
                        placeholder="VD: 0938813801"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Tình trạng hôn nhân</label>
                      <select
                        value={formFields.tinhTrangHonNhan || 'Độc thân'}
                        onChange={(e) => setFormFields((f) => ({ ...f, tinhTrangHonNhan: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="Độc thân">Độc thân</option>
                        <option value="Đã kết hôn">Đã kết hôn</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Sức khỏe</label>
                      <input
                        type="text"
                        value={formFields.sucKhoe || ''}
                        onChange={(e) => setFormFields((f) => ({ ...f, sucKhoe: e.target.value }))}
                        placeholder="VD: Tốt / Loại I / II"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Người giới thiệu</label>
                      <input
                        type="text"
                        value={formFields.gioiThieu || ''}
                        onChange={(e) => setFormFields((f) => ({ ...f, gioiThieu: e.target.value }))}
                        placeholder="VD: Tên người giới thiệu"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 3: CCCD & Nơi Ở */}
              {formActiveTab === 'cccd_address' && (
                <div className="space-y-4">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                    <span className="font-bold text-slate-800 block text-xs">Căn cước công dân (CCCD) / CMND</span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[11px] text-slate-600 mb-1">Số CCCD</label>
                        <input
                          type="text"
                          value={formFields.cccd || ''}
                          onChange={(e) => setFormFields((f) => ({ ...f, cccd: e.target.value }))}
                          onBlur={() => handleCheckCccd(formFields.cccd || '')}
                          placeholder="VD: 075086021801"
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md font-mono-num font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-600 mb-1">Ngày cấp</label>
                        <input
                          type="text"
                          value={formFields.ngayCapCccd || ''}
                          onChange={(e) => setFormFields((f) => ({ ...f, ngayCapCccd: e.target.value }))}
                          placeholder="VD: 11/05/2026"
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md font-mono-num"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-600 mb-1">Nơi cấp</label>
                        <input
                          type="text"
                          value={formFields.noiCapCccd || ''}
                          onChange={(e) => setFormFields((f) => ({ ...f, noiCapCccd: e.target.value }))}
                          placeholder="VD: Cục CSQLHCVTTXH"
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-600 mb-1">Ngày hết hạn</label>
                        <input
                          type="text"
                          value={formFields.ngayHetHanCccd || ''}
                          onChange={(e) => setFormFields((f) => ({ ...f, ngayHetHanCccd: e.target.value }))}
                          placeholder="VD: 10/07/2046"
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md font-mono-num"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                    <span className="font-bold text-slate-800 block text-xs">Hộ khẩu Thường trú</span>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] text-slate-600 mb-1">Số nhà / Ấp / Thôn</label>
                        <input
                          type="text"
                          value={formFields.soNhaThuongTru || ''}
                          onChange={(e) => setFormFields((f) => ({ ...f, soNhaThuongTru: e.target.value }))}
                          placeholder="VD: Ấp Xuân Tâm"
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-600 mb-1">Phường / Xã</label>
                        <input
                          type="text"
                          value={formFields.phuongXaThuongTru || ''}
                          onChange={(e) => setFormFields((f) => ({ ...f, phuongXaThuongTru: e.target.value }))}
                          placeholder="VD: Xã Xuân Hòa"
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-600 mb-1">Tỉnh / Thành phố</label>
                        <input
                          type="text"
                          value={formFields.tinhTpThuongTru || ''}
                          onChange={(e) => setFormFields((f) => ({ ...f, tinhTpThuongTru: e.target.value }))}
                          placeholder="VD: Tỉnh Đồng Nai"
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-600 mb-1">Địa chỉ thường trú đầy đủ</label>
                      <input
                        type="text"
                        value={formFields.diaChiThuongTru || ''}
                        onChange={(e) => setFormFields((f) => ({ ...f, diaChiThuongTru: e.target.value }))}
                        placeholder="VD: Ấp Xuân Tâm, Xã Xuân Hòa, Tỉnh Đồng Nai"
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md"
                      />
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                    <span className="font-bold text-slate-800 block text-xs">Nơi ở Tạm trú</span>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] text-slate-600 mb-1">Số nhà / Ấp</label>
                        <input
                          type="text"
                          value={formFields.soNhaTamTru || ''}
                          onChange={(e) => setFormFields((f) => ({ ...f, soNhaTamTru: e.target.value }))}
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-600 mb-1">Phường / Xã</label>
                        <input
                          type="text"
                          value={formFields.phuongXaTamTru || ''}
                          onChange={(e) => setFormFields((f) => ({ ...f, phuongXaTamTru: e.target.value }))}
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-600 mb-1">Tỉnh / TP</label>
                        <input
                          type="text"
                          value={formFields.tinhTpTamTru || ''}
                          onChange={(e) => setFormFields((f) => ({ ...f, tinhTpTamTru: e.target.value }))}
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 4: Học Vấn & Hợp Đồng */}
              {formActiveTab === 'contract' && (
                <div className="space-y-4">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                    <span className="font-bold text-slate-800 block text-xs">Học vấn, Chuyên môn & Kỹ năng</span>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                      <div>
                        <label className="block text-[11px] text-slate-600 mb-1">Trình độ văn hóa</label>
                        <input
                          type="text"
                          value={formFields.trinhDoVanHoa || ''}
                          onChange={(e) => setFormFields((f) => ({ ...f, trinhDoVanHoa: e.target.value }))}
                          placeholder="VD: 12/12"
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-600 mb-1">Chuyên môn</label>
                        <input
                          type="text"
                          value={formFields.trinhDoChuyenMon || ''}
                          onChange={(e) => setFormFields((f) => ({ ...f, trinhDoChuyenMon: e.target.value }))}
                          placeholder="VD: Đại học / Cử nhân"
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-600 mb-1">Ngoại ngữ</label>
                        <input
                          type="text"
                          value={formFields.trinhDoNgoaiNgu || ''}
                          onChange={(e) => setFormFields((f) => ({ ...f, trinhDoNgoaiNgu: e.target.value }))}
                          placeholder="VD: Tiếng Anh B"
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-600 mb-1">Tay nghề</label>
                        <input
                          type="text"
                          value={formFields.tayNghe || ''}
                          onChange={(e) => setFormFields((f) => ({ ...f, tayNghe: e.target.value }))}
                          placeholder="VD: x"
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-600 mb-1">Đào tạo</label>
                        <input
                          type="text"
                          value={formFields.daoTao || ''}
                          onChange={(e) => setFormFields((f) => ({ ...f, daoTao: e.target.value }))}
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                    <span className="font-bold text-slate-800 block text-xs">Hợp đồng lao động</span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[11px] text-slate-600 mb-1">Loại hợp đồng</label>
                        <input
                          type="text"
                          value={formFields.loaiHd || ''}
                          onChange={(e) => setFormFields((f) => ({ ...f, loaiHd: e.target.value }))}
                          placeholder="VD: HĐKXĐ / HĐXĐTH"
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md font-semibold"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-600 mb-1">Thời hạn HĐ</label>
                        <input
                          type="text"
                          value={formFields.thoiHan || ''}
                          onChange={(e) => setFormFields((f) => ({ ...f, thoiHan: e.target.value }))}
                          placeholder="VD: 12 THÁNG"
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-600 mb-1">Phân loại</label>
                        <input
                          type="text"
                          value={formFields.phanLoai || ''}
                          onChange={(e) => setFormFields((f) => ({ ...f, phanLoai: e.target.value }))}
                          placeholder="VD: THAM GIA"
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-600 mb-1">Số HĐ</label>
                        <input
                          type="text"
                          value={formFields.soHd || ''}
                          onChange={(e) => setFormFields((f) => ({ ...f, soHd: e.target.value }))}
                          placeholder="VD: 0448"
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md font-mono-num font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-600 mb-1">Từ ngày</label>
                        <input
                          type="text"
                          value={formFields.tuNgay || ''}
                          onChange={(e) => setFormFields((f) => ({ ...f, tuNgay: e.target.value }))}
                          placeholder="VD: 01/09/2025"
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md font-mono-num"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-600 mb-1">Đến ngày</label>
                        <input
                          type="text"
                          value={formFields.denNgay || ''}
                          onChange={(e) => setFormFields((f) => ({ ...f, denNgay: e.target.value }))}
                          placeholder="VD: 31/08/2026"
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md font-mono-num"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-600 mb-1">Khối HĐ</label>
                        <input
                          type="text"
                          value={formFields.khoi2 || ''}
                          onChange={(e) => setFormFields((f) => ({ ...f, khoi2: e.target.value }))}
                          placeholder="VD: BOD"
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-600 mb-1">Chức vụ HĐ</label>
                        <input
                          type="text"
                          value={formFields.chucVu || ''}
                          onChange={(e) => setFormFields((f) => ({ ...f, chucVu: e.target.value }))}
                          placeholder="VD: Giám đốc"
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-lg disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {isSubmitting
                    ? 'Đang lưu...'
                    : editingEmployee
                      ? 'Lưu Cập Nhật Hồ Sơ'
                      : 'Thêm Hồ Sơ Nhân Viên'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Quick Single-Employee Card Preview */}
      {previewEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl overflow-hidden shadow-xl">
            <div className="px-6 py-4 bg-blue-700 text-white flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold">
                  Xem Trước Thẻ Nhân Viên: {previewEmployee.fullName} (MSNV: {previewEmployee.msnv})
                </h3>
                <p className="text-xs text-blue-100">
                  Mẫu thẻ đang áp dụng: {selectedTemplate.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewEmployee(null)}
                className="p-1 rounded hover:bg-blue-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-8 bg-slate-100 flex flex-col items-center justify-center overflow-x-auto">
              <div className="flex flex-col items-center">
                <span className="text-xs font-bold text-slate-600 uppercase mb-2.5">
                  Thẻ Nhân Viên Chuẩn In (Kích thước 145%)
                </span>
                <div
                  style={{
                    width: `${(selectedTemplate.orientation === 'portrait' ? 54 : 85.6) * 1.45}mm`,
                    height: `${(selectedTemplate.orientation === 'portrait' ? 85.6 : 54) * 1.45}mm`,
                  }}
                  className="shadow-md bg-white"
                >
                  <IdCardPreview
                    employee={previewEmployee}
                    template={selectedTemplate}
                    scale={1.45}
                  />
                </div>
              </div>
            </div>

            <div className="px-6 py-3.5 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const id = previewEmployee.id;
                    setPreviewEmployee(null);
                    onOpenPrintDialog([id]);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  In Thẻ Nhân Viên Này Ngay (Ctrl + P)
                </button>

                <label className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg cursor-pointer">
                  <Camera className="w-3.5 h-3.5" />
                  {previewEmployee.photoUrl ? 'Đổi Ảnh 3×4' : 'Chọn Ảnh 3×4'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) =>
                      handleDirectEmployeePhotoUpload(previewEmployee, e)
                    }
                    className="hidden"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={() => setPreviewEmployee(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Delete Single Employee Confirmation */}
      {deletingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 space-y-4 shadow-xl">
            <h3 className="text-sm font-bold text-slate-900">
              Xác nhận xóa nhân viên
            </h3>
            <p className="text-xs text-slate-600">
              Bạn có chắc chắn muốn xóa nhân viên{' '}
              <strong>{deletingEmployee.fullName}</strong> (MSNV:{' '}
              <strong>{deletingEmployee.msnv}</strong>) khỏi hệ thống?
            </p>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeletingEmployee(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={async () => {
                  const id = deletingEmployee.id;
                  setDeletingEmployee(null);
                  await onDeleteEmployee(id);
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg cursor-pointer"
              >
                Xác Nhận Xóa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 4: Batch Delete Confirmation */}
      {confirmBatchDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 space-y-4 shadow-xl">
            <h3 className="text-sm font-bold text-slate-900">
              Xác nhận xóa {selectedEmployeeIds.size} nhân viên đã chọn
            </h3>
            <p className="text-xs text-slate-600">
              Bạn có chắc chắn muốn xóa {selectedEmployeeIds.size} nhân viên đang chọn khỏi cơ sở dữ liệu?
            </p>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmBatchDelete(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={async () => {
                  const ids = Array.from(selectedEmployeeIds);
                  setConfirmBatchDelete(false);
                  await onBatchDeleteEmployees(ids);
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg cursor-pointer"
              >
                Xóa {selectedEmployeeIds.size} Nhân Viên
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 5: AI Face Detection & 3x4 Photo Cropper */}
      <FaceCropModal
        isOpen={isFaceCropModalOpen}
        onClose={() => setIsFaceCropModalOpen(false)}
        employees={employees}
        selectedTemplate={selectedTemplate}
        targetEmployee={faceCropEmployee}
        onUpdateEmployeePhoto={async (emp, newPhotoUrl) => {
          await onUpdateEmployee(emp.id, {
            msnv: emp.msnv,
            fullName: emp.fullName,
            department: emp.department,
            joinDate: emp.joinDate,
            photoUrl: newPhotoUrl,
          });
          setPhotoStatusBanner(
            `Đã cắt AI và lưu hình 3×4 cho nhân viên ${emp.fullName} (MSNV: ${emp.msnv})!`
          );
          setTimeout(() => setPhotoStatusBanner(null), 4000);
        }}
        onOpenPrintDialog={onOpenPrintDialog}
      />

      {/* Modal 6: Direct Drag & Drop Upload by MSNV (No Preview + Detailed Error Report) */}
      <DirectMsnvDropModal
        isOpen={isDirectMsnvModalOpen}
        onClose={() => setIsDirectMsnvModalOpen(false)}
        employees={employees}
        onUpdateEmployeePhoto={async (emp, newPhotoUrl) => {
          await onUpdateEmployee(emp.id, {
            msnv: emp.msnv,
            fullName: emp.fullName,
            department: emp.department,
            joinDate: emp.joinDate,
            photoUrl: newPhotoUrl,
          });
        }}
      />

      {/* Modal 7: Department Management Popup Modal */}
      {isDeptModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg overflow-hidden shadow-xl flex flex-col max-h-[85vh]">
            <div className="px-5 py-4 bg-blue-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                <div>
                  <h3 className="text-sm font-bold">
                    Quản Lý Danh Sách Bộ Phận ({departments.length})
                  </h3>
                  <p className="text-[11px] text-blue-100">
                    Dữ liệu bộ phận tại đây được đồng bộ cho toàn bộ mục Nhân viên và In thẻ
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDeptModalOpen(false)}
                className="p-1 rounded hover:bg-blue-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {deptModalError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 flex items-start gap-2 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{deptModalError}</span>
                </div>
              )}

              {/* Add New Department Form */}
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setDeptModalError(null);
                  const clean = newDeptName.trim();
                  if (!clean) {
                    setDeptModalError('Vui lòng nhập tên bộ phận mới.');
                    return;
                  }
                  setIsSavingDept(true);
                  try {
                    const created = await onAddDepartment(clean);
                    setNewDeptName('');
                    if (isFormOpen && !department) {
                      setDepartment(created.name);
                    }
                  } catch (err) {
                    setDeptModalError(
                      err instanceof Error ? err.message : 'Lỗi khi thêm bộ phận.'
                    );
                  } finally {
                    setIsSavingDept(false);
                  }
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={newDeptName}
                  onChange={(e) => setNewDeptName(e.target.value)}
                  placeholder="Nhập tên bộ phận mới (VD: Hành chính nhân sự, BGĐ...)"
                  className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                />
                <button
                  type="submit"
                  disabled={isSavingDept}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-lg disabled:opacity-50 cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Thêm Bộ Phận
                </button>
              </form>

              {/* Existing Departments List Header */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs font-bold text-slate-700">
                  Danh sách bộ phận ({departments.length})
                </span>
                {onDeleteAllDepartments && departments.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsConfirmingDeleteAllDeptsInModal(true)}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600 hover:text-red-700 hover:underline cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Xóa tất cả</span>
                  </button>
                )}
              </div>

              {/* Existing Departments List */}
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-200 max-h-80 overflow-y-auto">
                {departments.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    Chưa có bộ phận nào. Hãy thêm bộ phận đầu tiên ở trên.
                  </div>
                ) : (
                  departments.map((dept, idx) => {
                    const empCount = employeeCountByDept.get(dept.name) || 0;
                    const isEditing = editingDeptId === dept.id;

                    return (
                      <div
                        key={dept.id}
                        className="px-3.5 py-2.5 flex items-center justify-between gap-2 hover:bg-slate-50"
                      >
                        {isEditing ? (
                          <div className="flex items-center gap-2 flex-1">
                            <input
                              type="text"
                              value={editingDeptName}
                              onChange={(e) => setEditingDeptName(e.target.value)}
                              className="flex-1 px-2.5 py-1 text-xs border border-blue-500 rounded focus:outline-none"
                              autoFocus
                            />
                            <button
                              type="button"
                              disabled={isSavingDept}
                              onClick={async () => {
                                setDeptModalError(null);
                                const clean = editingDeptName.trim();
                                if (!clean) {
                                  setDeptModalError('Tên bộ phận không được để trống.');
                                  return;
                                }
                                setIsSavingDept(true);
                                try {
                                  const oldName = dept.name;
                                  await onUpdateDepartment(dept.id, clean);
                                  if (deptFilter === oldName) {
                                    setDeptFilter(clean);
                                  }
                                  if (department === oldName) {
                                    setDepartment(clean);
                                  }
                                  setEditingDeptId(null);
                                } catch (err) {
                                  setDeptModalError(
                                    err instanceof Error
                                      ? err.message
                                      : 'Lỗi khi cập nhật bộ phận.'
                                  );
                                } finally {
                                  setIsSavingDept(false);
                                }
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                              Lưu
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingDeptId(null)}
                              className="px-2 py-1 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded cursor-pointer"
                            >
                              Hủy
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-5 h-5 flex items-center justify-center text-[10px] font-bold font-mono-num rounded-md bg-slate-100 text-slate-600 shrink-0">
                                {idx + 1}
                              </span>
                              <span className="text-xs font-bold text-slate-800 truncate">
                                {dept.name}
                              </span>
                              <span className="px-2 py-0.5 text-[10px] font-semibold bg-blue-50 text-blue-700 rounded">
                                {empCount} NV
                              </span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setDeptModalError(null);
                                  setEditingDeptId(dept.id);
                                  setEditingDeptName(dept.name);
                                }}
                                className="p-1.5 text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded cursor-pointer"
                                title="Đổi tên bộ phận"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={isSavingDept}
                                onClick={() => {
                                  setDeptModalError(null);
                                  setDeletingDeptInModal(dept);
                                }}
                                className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer"
                                title="Xóa bộ phận khỏi danh sách"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                Khi đổi tên bộ phận, các nhân viên thuộc bộ phận đó cũng được cập nhật theo.
              </span>
              <button
                type="button"
                onClick={() => setIsDeptModalOpen(false)}
                className="px-4 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 8: Delete Department Confirmation Popup */}
      {deletingDeptInModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 bg-red-100 text-red-600 rounded-xl shrink-0">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-slate-900">
                  Xác nhận xóa bộ phận
                </h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Bạn có chắc chắn muốn xóa bộ phận <strong className="text-slate-900 font-semibold">"{deletingDeptInModal.name}"</strong> khỏi hệ thống?
                </p>
              </div>
            </div>

            {(() => {
              const count = employees.filter(
                (e) => (e.department || '').trim().toLowerCase() === deletingDeptInModal.name.trim().toLowerCase()
              ).length;
              if (count > 0) {
                return (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs">
                    <div className="font-semibold flex items-center gap-1.5 text-amber-900">
                      <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                      Lưu ý: Có {count} nhân sự thuộc bộ phận này
                    </div>
                    <p className="mt-1 text-[11px] text-amber-700 leading-normal">
                      Việc xóa bộ phận sẽ không xóa nhân sự, nhưng các nhân sự này sẽ không còn thuộc bộ phận "{deletingDeptInModal.name}" nữa.
                    </p>
                  </div>
                );
              }
              return (
                <p className="text-xs text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  Hành động này sẽ xóa hoàn toàn bộ phận khỏi danh mục và không thể hoàn tác.
                </p>
              );
            })()}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isSavingDept}
                onClick={() => setDeletingDeptInModal(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={isSavingDept}
                onClick={async () => {
                  const dept = deletingDeptInModal;
                  setDeletingDeptInModal(null);
                  setDeptModalError(null);
                  setIsSavingDept(true);
                  try {
                    await onDeleteDepartment(dept.id);
                    if (deptFilter === dept.name) {
                      setDeptFilter('ALL');
                    }
                  } catch (err) {
                    setDeptModalError(
                      err instanceof Error
                        ? err.message
                        : 'Lỗi khi xóa bộ phận.'
                    );
                  } finally {
                    setIsSavingDept(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-xl cursor-pointer transition-colors shadow-xs"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isSavingDept ? 'Đang xóa...' : 'Xác Nhận Xóa'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 8.1: Delete All Departments Confirmation Popup */}
      {isConfirmingDeleteAllDeptsInModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 bg-red-100 text-red-600 rounded-xl shrink-0">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-slate-900">
                  Xác nhận xóa TẤT CẢ bộ phận
                </h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Bạn có chắc chắn muốn xóa toàn bộ <strong className="text-red-600 font-bold">{departments.length} bộ phận</strong> khỏi danh mục?
                </p>
              </div>
            </div>

            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs space-y-1">
              <div className="font-semibold flex items-center gap-1.5 text-red-900">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                Cảnh báo quan trọng:
              </div>
              <p className="text-[11px] text-red-700 leading-normal">
                Dữ liệu và hồ sơ nhân sự vẫn được giữ an toàn. Hành động này không thể hoàn tác.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isSavingDept}
                onClick={() => setIsConfirmingDeleteAllDeptsInModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={isSavingDept}
                onClick={async () => {
                  if (!onDeleteAllDepartments) return;
                  setIsConfirmingDeleteAllDeptsInModal(false);
                  setIsSavingDept(true);
                  try {
                    await onDeleteAllDepartments();
                    setDeptFilter('ALL');
                  } catch (err) {
                    setDeptModalError(
                      err instanceof Error ? err.message : 'Lỗi khi xóa tất cả bộ phận.'
                    );
                  } finally {
                    setIsSavingDept(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-xl cursor-pointer transition-colors shadow-xs"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isSavingDept ? 'Đang xóa...' : 'Xác Nhận Xóa Tất Cả'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Tạo văn bản từ file Word mẫu (Khớp với 2 ảnh mẫu của người dùng) */}
      <ErrorBoundary fallbackTitle="Lỗi hiển thị cửa sổ Tạo văn bản" onReset={() => setIsDocGeneratorOpen(false)}>
        <DocumentGeneratorModal
          isOpen={isDocGeneratorOpen}
          onClose={() => setIsDocGeneratorOpen(false)}
          targetEmployees={docGeneratorEmployees}
        />
      </ErrorBoundary>

      {/* Modal Chấm dứt hợp đồng (Khớp chuẩn xác với giao diện mẫu của người dùng) */}
      <ErrorBoundary fallbackTitle="Lỗi hiển thị cửa sổ Chấm dứt hợp đồng" onReset={() => setTerminatingEmployee(null)}>
        <TerminateContractModal
          isOpen={!!terminatingEmployee}
          employee={terminatingEmployee}
          onClose={() => setTerminatingEmployee(null)}
          onConfirm={handleTerminateContract}
        />
      </ErrorBoundary>

      {/* Modal Đồng bộ API Nhân viên Việt Sun (https://viet-sun-id-card.vercel.app/api/employees) */}
      <ErrorBoundary fallbackTitle="Lỗi hiển thị cửa sổ Đồng bộ API" onReset={() => setIsSyncModalOpen(false)}>
        <SyncVietSunModal
          isOpen={isSyncModalOpen}
          onClose={() => setIsSyncModalOpen(false)}
          onSyncSuccess={async (result) => {
            setPhotoStatusBanner(result.message);
            if (onSyncComplete) {
              await onSyncComplete();
            }
          }}
        />
      </ErrorBoundary>

      {/* Modal Lịch sử hợp đồng */}
      <ContractHistoryModal
        isOpen={!!viewingContractHistoryEmployee}
        employee={viewingContractHistoryEmployee}
        onClose={() => setViewingContractHistoryEmployee(null)}
        onRenewContract={(emp) => {
          setViewingContractHistoryEmployee(null);
          setRenewingContractEmployee(emp);
        }}
        onOpenDocumentGenerator={(emp) => {
          setDocGeneratorEmployees([emp]);
          setIsDocGeneratorOpen(true);
        }}
      />

      {/* Modal Tái ký hợp đồng */}
      {renewingContractEmployee && (
        <RenewContractModal
          isOpen={!!renewingContractEmployee}
          employee={renewingContractEmployee}
          onClose={() => setRenewingContractEmployee(null)}
          onRenewSuccess={(updatedEmp) => {
            onUpdateEmployee(updatedEmp.id, updatedEmp);
            setViewingProfileEmployee(updatedEmp);
          }}
          onOpenDocumentGenerator={(emp) => {
            setDocGeneratorEmployees([emp]);
            setIsDocGeneratorOpen(true);
          }}
        />
      )}

      {/* MODAL CẢNH BÁO TRÙNG CCCD KHI NHẬP FORM */}
      {showCccdWarningModal && cccdWarningData && (
        <CccdCheckWarningModal
          isOpen={showCccdWarningModal}
          onClose={() => setShowCccdWarningModal(false)}
          cccd={cccdWarningData.cccd}
          summary={cccdWarningData}
          onSelectRehire={() => {
            setShowCccdWarningModal(false);
            setIsFormOpen(false);
            setRehiringWorkHistoryEmp(cccdWarningData.employee);
          }}
        />
      )}

      {/* MODAL CHO NGHỈ VIỆC (ĐÓNG ĐỢT LÀM VIỆC) */}
      {terminatingWorkHistoryEmp && (
        <TerminateModal
          isOpen={!!terminatingWorkHistoryEmp}
          employee={terminatingWorkHistoryEmp}
          onClose={() => setTerminatingWorkHistoryEmp(null)}
          onSuccess={() => {
            setTerminatingWorkHistoryEmp(null);
            // Refresh employee status
            onUpdateEmployee(terminatingWorkHistoryEmp.id, { tinhTrang: 'Đã nghỉ việc' });
            if (viewingProfileEmployee) {
              setViewingProfileEmployee((prev) => (prev ? { ...prev, tinhTrang: 'Đã nghỉ việc' } : null));
            }
          }}
        />
      )}

      {/* MODAL TÁI TUYỂN DỤNG (MỞ ĐỢT LÀM MỚI THEO CCCD) */}
      {rehiringWorkHistoryEmp && (
        <RehireModal
          isOpen={!!rehiringWorkHistoryEmp}
          employee={rehiringWorkHistoryEmp}
          onClose={() => setRehiringWorkHistoryEmp(null)}
          onSuccess={() => {
            setRehiringWorkHistoryEmp(null);
            onUpdateEmployee(rehiringWorkHistoryEmp.id, { tinhTrang: 'Đang làm việc' });
            if (viewingProfileEmployee) {
              setViewingProfileEmployee((prev) => (prev ? { ...prev, tinhTrang: 'Đang làm việc' } : null));
            }
          }}
        />
      )}
    </div>
  );
};

