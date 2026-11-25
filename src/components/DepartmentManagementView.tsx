/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Building2,
  FolderTree,
  Network,
  Plus,
  Search,
  Edit3,
  Trash2,
  Check,
  X,
  Users,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Sparkles,
  ExternalLink,
  Layers,
  Power,
  Info,
  Maximize2,
  Minimize2,
  SlidersHorizontal,
  ShieldAlert,
  ArrowRight,
  GitBranch,
  Building,
  Briefcase,
  Hash,
  Eye,
} from 'lucide-react';
import { Department, Division, Employee, SubDepartment } from '../types';

interface DepartmentManagementViewProps {
  divisions: Division[];
  departments: Department[];
  subDepartments: SubDepartment[];
  employees: Employee[];

  // Handlers Cấp 1: Khối
  onAddDivision: (data: Partial<Division>) => Promise<Division>;
  onUpdateDivision: (id: string, updates: Partial<Division> & { oldName?: string }) => Promise<void>;
  onDeleteDivision: (id: string) => Promise<void>;
  onReorderDivisions?: (list: Division[]) => Promise<void>;

  // Handlers Cấp 2: Phòng ban (có Ký hiệu PB)
  onAddDepartment: (data: Partial<Department>) => Promise<Department>;
  onUpdateDepartment: (
    id: string,
    updates: Partial<Department> & { oldName?: string; oldCode?: string }
  ) => Promise<void>;
  onDeleteDepartment: (id: string) => Promise<void>;
  onReorderDepartments?: (list: Department[]) => Promise<void>;

  // Handlers Cấp 3: Phòng ban con
  onAddSubDepartment: (data: Partial<SubDepartment>) => Promise<SubDepartment>;
  onUpdateSubDepartment: (id: string, updates: Partial<SubDepartment> & { oldName?: string }) => Promise<void>;
  onDeleteSubDepartment: (id: string) => Promise<void>;
  onReorderSubDepartments?: (list: SubDepartment[]) => Promise<void>;

  // Navigation
  onPrintDepartment?: (departmentName: string) => void;
  onNavigateToEmployees?: (filter?: { khoi?: string; phongBan?: string; phongBanCon?: string }) => void;
}

type ViewMode = 'tree' | 'divisions' | 'departments' | 'subDepartments' | 'orgChart';

export const DepartmentManagementView: React.FC<DepartmentManagementViewProps> = ({
  divisions,
  departments,
  subDepartments,
  employees,
  onAddDivision,
  onUpdateDivision,
  onDeleteDivision,
  onAddDepartment,
  onUpdateDepartment,
  onDeleteDepartment,
  onAddSubDepartment,
  onUpdateSubDepartment,
  onDeleteSubDepartment,
  onNavigateToEmployees,
}) => {
  // Navigation View Tab
  const [viewMode, setViewMode] = useState<ViewMode>('tree');

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDivisionFilter, setSelectedDivisionFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'active' | 'inactive'>('ALL');

  // Accordion Expand/Collapse state
  // Mặc định mở tất cả các Khối và Phòng ban để người dùng quan sát toàn cảnh
  const [collapsedDivisionIds, setCollapsedDivisionIds] = useState<Set<string>>(new Set());
  const [collapsedDeptIds, setCollapsedDeptIds] = useState<Set<string>>(new Set());

  // Form State: Modal Thêm/Sửa Cấp 1 (Khối)
  const [isDivisionModalOpen, setIsDivisionModalOpen] = useState(false);
  const [editingDivision, setEditingDivision] = useState<Division | null>(null);
  const [divisionFormName, setDivisionFormName] = useState('');
  const [divisionFormCode, setDivisionFormCode] = useState('');
  const [divisionFormDesc, setDivisionFormDesc] = useState('');
  const [divisionFormStatus, setDivisionFormStatus] = useState<'active' | 'inactive'>('active');

  // Form State: Modal Thêm/Sửa Cấp 2 (Phòng ban)
  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deptFormDivId, setDeptFormDivId] = useState('');
  const [deptFormCode, setDeptFormCode] = useState('');
  const [deptFormName, setDeptFormName] = useState('');
  const [deptFormDesc, setDeptFormDesc] = useState('');
  const [deptFormStatus, setDeptFormStatus] = useState<'active' | 'inactive'>('active');
  const [deptCodeError, setDeptCodeError] = useState<string | null>(null);

  // Form State: Modal Thêm/Sửa Cấp 3 (Phòng ban con)
  const [isSubDeptModalOpen, setIsSubDeptModalOpen] = useState(false);
  const [editingSubDept, setEditingSubDept] = useState<SubDepartment | null>(null);
  const [subDeptFormDivId, setSubDeptFormDivId] = useState('');
  const [subDeptFormDeptId, setSubDeptFormDeptId] = useState('');
  const [subDeptFormName, setSubDeptFormName] = useState('');
  const [subDeptFormDesc, setSubDeptFormDesc] = useState('');
  const [subDeptFormStatus, setSubDeptFormStatus] = useState<'active' | 'inactive'>('active');

  // Safety Delete Warning / Blocked Modal State
  const [safetyDeleteModal, setSafetyDeleteModal] = useState<{
    isOpen: boolean;
    level: 1 | 2 | 3;
    item: Division | Department | SubDepartment | null;
    childCount: number;
    empCount: number;
    canDelete: boolean;
  }>({
    isOpen: false,
    level: 1,
    item: null,
    childCount: 0,
    empCount: 0,
    canDelete: false,
  });

  // Status & Notifications
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // =========================================================================
  // Derived Data & Mappings
  // =========================================================================

  // Phân bổ nhân viên theo từng cấp
  const employeesByDivision = useMemo(() => {
    const map = new Map<string, Employee[]>();
    for (const emp of employees) {
      const k = (emp.khoi || '').trim();
      if (!k) continue;
      const list = map.get(k) || [];
      list.push(emp);
      map.set(k, list);
    }
    return map;
  }, [employees]);

  const employeesByDepartment = useMemo(() => {
    const map = new Map<string, Employee[]>();
    for (const emp of employees) {
      const pb = (emp.phongBan || '').trim();
      const code = (emp.kyHieuPb || '').trim().toUpperCase();
      if (pb) {
        const list = map.get(pb) || [];
        list.push(emp);
        map.set(pb, list);
      }
      if (code && code !== pb) {
        const list = map.get(code) || [];
        list.push(emp);
        map.set(code, list);
      }
    }
    return map;
  }, [employees]);

  const employeesBySubDept = useMemo(() => {
    const map = new Map<string, Employee[]>();
    for (const emp of employees) {
      const sub = (emp.phongBanCon || emp.boPhan || emp.department || '').trim();
      if (!sub) continue;
      const list = map.get(sub) || [];
      list.push(emp);
      map.set(sub, list);
    }
    return map;
  }, [employees]);

  // Map departments theo division_id
  const deptsByDivisionId = useMemo(() => {
    const map = new Map<string, Department[]>();
    for (const d of departments) {
      const divId = d.divisionId || 'UNASSIGNED';
      const list = map.get(divId) || [];
      list.push(d);
      map.set(divId, list);
    }
    return map;
  }, [departments]);

  // Map sub_departments theo department_id
  const subDeptsByDeptId = useMemo(() => {
    const map = new Map<string, SubDepartment[]>();
    for (const s of subDepartments) {
      const deptId = s.departmentId || 'UNASSIGNED';
      const list = map.get(deptId) || [];
      list.push(s);
      map.set(deptId, list);
    }
    return map;
  }, [subDepartments]);

  // Danh sách Khối đã lọc
  const filteredDivisions = useMemo(() => {
    return divisions.filter((div) => {
      if (selectedDivisionFilter !== 'ALL' && div.id !== selectedDivisionFilter) {
        return false;
      }
      if (statusFilter !== 'ALL' && (div.status || 'active') !== statusFilter) {
        return false;
      }
      if (searchTerm.trim()) {
        const q = searchTerm.trim().toLowerCase();
        const matchDiv =
          div.name.toLowerCase().includes(q) ||
          (div.code || '').toLowerCase().includes(q) ||
          (div.description || '').toLowerCase().includes(q);

        if (matchDiv) return true;

        const relatedDepts = deptsByDivisionId.get(div.id) || [];
        const hasMatchingDept = relatedDepts.some((dept) => {
          const matchDept =
            dept.name.toLowerCase().includes(q) ||
            (dept.code || '').toLowerCase().includes(q);
          if (matchDept) return true;
          const relatedSubs = subDeptsByDeptId.get(dept.id) || [];
          return relatedSubs.some((sub) => sub.name.toLowerCase().includes(q));
        });

        return hasMatchingDept;
      }
      return true;
    });
  }, [divisions, selectedDivisionFilter, statusFilter, searchTerm, deptsByDivisionId, subDeptsByDeptId]);

  // Toggle Collapse / Expand
  const toggleDivisionCollapse = (id: string) => {
    setCollapsedDivisionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleDeptCollapse = (id: string) => {
    setCollapsedDeptIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    setCollapsedDivisionIds(new Set());
    setCollapsedDeptIds(new Set());
  };

  const collapseAll = () => {
    setCollapsedDivisionIds(new Set(divisions.map((d) => d.id)));
    setCollapsedDeptIds(new Set(departments.map((d) => d.id)));
  };

  // Helper tính số lượng nhân viên
  const getDivisionEmployeeCount = (div: Division): number => {
    const directEmps = employeesByDivision.get(div.name) || [];
    const relatedDepts = deptsByDivisionId.get(div.id) || [];
    const empIds = new Set<string>();
    directEmps.forEach((e) => empIds.add(e.id));

    relatedDepts.forEach((dept) => {
      const deptEmps = employeesByDepartment.get(dept.name) || employeesByDepartment.get(dept.code || '') || [];
      deptEmps.forEach((e) => empIds.add(e.id));
      const relatedSubs = subDeptsByDeptId.get(dept.id) || [];
      relatedSubs.forEach((sub) => {
        const subEmps = employeesBySubDept.get(sub.name) || [];
        subEmps.forEach((e) => empIds.add(e.id));
      });
    });

    return empIds.size;
  };

  const getDepartmentEmployeeCount = (dept: Department): number => {
    const empIds = new Set<string>();
    const byName = employeesByDepartment.get(dept.name) || [];
    const byCode = employeesByDepartment.get(dept.code || '') || [];
    byName.forEach((e) => empIds.add(e.id));
    byCode.forEach((e) => empIds.add(e.id));

    const relatedSubs = subDeptsByDeptId.get(dept.id) || [];
    relatedSubs.forEach((sub) => {
      const subEmps = employeesBySubDept.get(sub.name) || [];
      subEmps.forEach((e) => empIds.add(e.id));
    });

    return empIds.size;
  };

  const getSubDeptEmployeeCount = (sub: SubDepartment): number => {
    const byName = employeesBySubDept.get(sub.name) || [];
    return byName.length;
  };

  // =========================================================================
  // Handlers Modal Thêm / Sửa Cấp 1: KHỐI
  // =========================================================================

  const openAddDivisionModal = () => {
    setEditingDivision(null);
    setDivisionFormName('');
    setDivisionFormCode('');
    setDivisionFormDesc('');
    setDivisionFormStatus('active');
    setModalError(null);
    setIsDivisionModalOpen(true);
  };

  const openEditDivisionModal = (div: Division) => {
    setEditingDivision(div);
    setDivisionFormName(div.name);
    setDivisionFormCode(div.code || '');
    setDivisionFormDesc(div.description || '');
    setDivisionFormStatus(div.status || 'active');
    setModalError(null);
    setIsDivisionModalOpen(true);
  };

  const handleSaveDivision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!divisionFormName.trim()) {
      setModalError('Vui lòng nhập tên Khối');
      return;
    }
    setIsSubmitting(true);
    setModalError(null);
    try {
      if (editingDivision) {
        await onUpdateDivision(editingDivision.id, {
          name: divisionFormName.trim(),
          code: divisionFormCode.trim().toUpperCase(),
          description: divisionFormDesc.trim(),
          status: divisionFormStatus,
          oldName: editingDivision.name,
        });
        showToast(`Đã cập nhật Khối "${divisionFormName.trim()}" thành công!`);
      } else {
        await onAddDivision({
          name: divisionFormName.trim(),
          code: divisionFormCode.trim().toUpperCase(),
          description: divisionFormDesc.trim(),
          status: divisionFormStatus,
        });
        showToast(`Đã thêm mới Khối "${divisionFormName.trim()}" thành công!`);
      }
      setIsDivisionModalOpen(false);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Lỗi khi lưu Khối');
    } finally {
      setIsSubmitting(false);
    }
  };

  // =========================================================================
  // Handlers Modal Thêm / Sửa Cấp 2: PHÒNG BAN (KÝ HIỆU PB)
  // =========================================================================

  const openAddDeptModal = (defaultDivId?: string) => {
    setEditingDept(null);
    setDeptFormDivId(defaultDivId || (divisions[0]?.id ?? ''));
    setDeptFormCode('');
    setDeptFormName('');
    setDeptFormDesc('');
    setDeptFormStatus('active');
    setDeptCodeError(null);
    setModalError(null);
    setIsDeptModalOpen(true);
  };

  const openEditDeptModal = (dept: Department) => {
    setEditingDept(dept);
    setDeptFormDivId(dept.divisionId || (divisions[0]?.id ?? ''));
    setDeptFormCode(dept.code || '');
    setDeptFormName(dept.name);
    setDeptFormDesc(dept.description || '');
    setDeptFormStatus(dept.status || 'active');
    setDeptCodeError(null);
    setModalError(null);
    setIsDeptModalOpen(true);
  };

  const handleDeptCodeChange = (codeVal: string) => {
    const upper = codeVal.trim().toUpperCase();
    setDeptFormCode(upper);
    if (!upper) {
      setDeptCodeError('Ký hiệu PB là bắt buộc');
      return;
    }
    const duplicate = departments.find(
      (d) => (d.code || '').toUpperCase() === upper && d.id !== editingDept?.id
    );
    if (duplicate) {
      setDeptCodeError(`Ký hiệu PB "${upper}" đã được sử dụng bởi "${duplicate.name}"`);
    } else {
      setDeptCodeError(null);
    }
  };

  const handleSaveDept = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = deptFormCode.trim().toUpperCase();
    const cleanName = deptFormName.trim();

    if (!deptFormDivId) {
      setModalError('Vui lòng chọn Khối trực thuộc');
      return;
    }
    if (!cleanCode) {
      setModalError('Vui lòng nhập Ký hiệu PB');
      return;
    }
    if (!cleanName) {
      setModalError('Vui lòng nhập tên Phòng ban');
      return;
    }

    const duplicate = departments.find(
      (d) => (d.code || '').toUpperCase() === cleanCode && d.id !== editingDept?.id
    );
    if (duplicate) {
      setModalError(`Ký hiệu PB "${cleanCode}" đã bị trùng với "${duplicate.name}". Vui lòng chọn ký hiệu khác!`);
      return;
    }

    const selectedDiv = divisions.find((d) => d.id === deptFormDivId);

    setIsSubmitting(true);
    setModalError(null);
    try {
      if (editingDept) {
        await onUpdateDepartment(editingDept.id, {
          code: cleanCode,
          name: cleanName,
          divisionId: deptFormDivId,
          divisionName: selectedDiv?.name || '',
          description: deptFormDesc.trim(),
          status: deptFormStatus,
          oldName: editingDept.name,
          oldCode: editingDept.code,
        });
        showToast(`Đã cập nhật Phòng ban "${cleanName}" (${cleanCode})!`);
      } else {
        await onAddDepartment({
          code: cleanCode,
          name: cleanName,
          divisionId: deptFormDivId,
          divisionName: selectedDiv?.name || '',
          description: deptFormDesc.trim(),
          status: deptFormStatus,
        });
        showToast(`Đã thêm mới Phòng ban "${cleanName}" (${cleanCode})!`);
      }
      setIsDeptModalOpen(false);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Lỗi khi lưu Phòng ban');
    } finally {
      setIsSubmitting(false);
    }
  };

  // =========================================================================
  // Handlers Modal Thêm / Sửa Cấp 3: PHÒNG BAN CON (BỘ PHẬN CON)
  // =========================================================================

  const openAddSubDeptModal = (defaultDeptId?: string) => {
    setEditingSubDept(null);
    let targetDept = departments.find((d) => d.id === defaultDeptId);
    if (!targetDept && departments.length > 0) targetDept = departments[0];

    setSubDeptFormDivId(targetDept?.divisionId || (divisions[0]?.id ?? ''));
    setSubDeptFormDeptId(targetDept?.id || '');
    setSubDeptFormName('');
    setSubDeptFormDesc('');
    setSubDeptFormStatus('active');
    setModalError(null);
    setIsSubDeptModalOpen(true);
  };

  const openEditSubDeptModal = (sub: SubDepartment) => {
    setEditingSubDept(sub);
    const parentDept = departments.find((d) => d.id === sub.departmentId);
    setSubDeptFormDivId(parentDept?.divisionId || sub.divisionId || (divisions[0]?.id ?? ''));
    setSubDeptFormDeptId(sub.departmentId);
    setSubDeptFormName(sub.name);
    setSubDeptFormDesc(sub.description || '');
    setSubDeptFormStatus(sub.status || 'active');
    setModalError(null);
    setIsSubDeptModalOpen(true);
  };

  const handleSubDeptDivChange = (divId: string) => {
    setSubDeptFormDivId(divId);
    const availableDepts = departments.filter((d) => d.divisionId === divId);
    if (availableDepts.length > 0) {
      setSubDeptFormDeptId(availableDepts[0].id);
    } else {
      setSubDeptFormDeptId('');
    }
  };

  const handleSaveSubDept = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = subDeptFormName.trim();

    if (!subDeptFormDeptId) {
      setModalError('Vui lòng chọn Phòng ban cấp 2 trực thuộc');
      return;
    }
    if (!cleanName) {
      setModalError('Vui lòng nhập tên Phòng ban con');
      return;
    }

    const selectedDept = departments.find((d) => d.id === subDeptFormDeptId);
    const selectedDiv = divisions.find((d) => d.id === (selectedDept?.divisionId || subDeptFormDivId));

    setIsSubmitting(true);
    setModalError(null);
    try {
      if (editingSubDept) {
        await onUpdateSubDepartment(editingSubDept.id, {
          name: cleanName,
          departmentId: subDeptFormDeptId,
          departmentName: selectedDept?.name || '',
          divisionId: selectedDiv?.id || null,
          divisionName: selectedDiv?.name || '',
          description: subDeptFormDesc.trim(),
          status: subDeptFormStatus,
          oldName: editingSubDept.name,
        });
        showToast(`Đã cập nhật Phòng ban con "${cleanName}"!`);
      } else {
        await onAddSubDepartment({
          name: cleanName,
          departmentId: subDeptFormDeptId,
          departmentName: selectedDept?.name || '',
          divisionId: selectedDiv?.id || null,
          divisionName: selectedDiv?.name || '',
          description: subDeptFormDesc.trim(),
          status: subDeptFormStatus,
        });
        showToast(`Đã thêm mới Phòng ban con "${cleanName}"!`);
      }
      setIsSubDeptModalOpen(false);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Lỗi khi lưu Phòng ban con');
    } finally {
      setIsSubmitting(false);
    }
  };

  // =========================================================================
  // Safety Delete & Toggle Status Handlers
  // =========================================================================

  const requestDelete = (level: 1 | 2 | 3, item: Division | Department | SubDepartment) => {
    let childCount = 0;
    let empCount = 0;

    if (level === 1) {
      const div = item as Division;
      const relatedDepts = deptsByDivisionId.get(div.id) || [];
      childCount = relatedDepts.length;
      empCount = getDivisionEmployeeCount(div);
    } else if (level === 2) {
      const dept = item as Department;
      const relatedSubs = subDeptsByDeptId.get(dept.id) || [];
      childCount = relatedSubs.length;
      empCount = getDepartmentEmployeeCount(dept);
    } else if (level === 3) {
      const sub = item as SubDepartment;
      childCount = 0;
      empCount = getSubDeptEmployeeCount(sub);
    }

    const canDelete = childCount === 0 && empCount === 0;

    setSafetyDeleteModal({
      isOpen: true,
      level,
      item,
      childCount,
      empCount,
      canDelete,
    });
  };

  const confirmDelete = async () => {
    const { level, item, canDelete } = safetyDeleteModal;
    if (!item || !canDelete) return;

    setIsSubmitting(true);
    try {
      if (level === 1) {
        await onDeleteDivision(item.id);
        showToast(`Đã xóa Khối "${item.name}"`);
      } else if (level === 2) {
        await onDeleteDepartment(item.id);
        showToast(`Đã xóa Phòng ban "${item.name}"`);
      } else if (level === 3) {
        await onDeleteSubDepartment(item.id);
        showToast(`Đã xóa Phòng ban con "${item.name}"`);
      }
      setSafetyDeleteModal({ isOpen: false, level: 1, item: null, childCount: 0, empCount: 0, canDelete: false });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Lỗi khi xóa dữ liệu', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickDeactivate = async () => {
    const { level, item } = safetyDeleteModal;
    if (!item) return;

    setIsSubmitting(true);
    try {
      if (level === 1) {
        await onUpdateDivision(item.id, { status: 'inactive' });
        showToast(`Đã chuyển Khối "${item.name}" sang trạng thái Ngừng hoạt động`);
      } else if (level === 2) {
        await onUpdateDepartment(item.id, { status: 'inactive' });
        showToast(`Đã chuyển Phòng ban "${item.name}" sang trạng thái Ngừng hoạt động`);
      } else if (level === 3) {
        await onUpdateSubDepartment(item.id, { status: 'inactive' });
        showToast(`Đã chuyển Phòng ban con "${item.name}" sang trạng thái Ngừng hoạt động`);
      }
      setSafetyDeleteModal({ isOpen: false, level: 1, item: null, childCount: 0, empCount: 0, canDelete: false });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Lỗi khi cập nhật trạng thái', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleStatus = async (level: 1 | 2 | 3, item: Division | Department | SubDepartment) => {
    const newStatus = (item.status || 'active') === 'active' ? 'inactive' : 'active';
    try {
      if (level === 1) {
        await onUpdateDivision(item.id, { status: newStatus });
        showToast(`Đã ${newStatus === 'active' ? 'kích hoạt' : 'ngừng hoạt động'} Khối "${item.name}"`);
      } else if (level === 2) {
        await onUpdateDepartment(item.id, { status: newStatus });
        showToast(`Đã ${newStatus === 'active' ? 'kích hoạt' : 'ngừng hoạt động'} Phòng ban "${item.name}"`);
      } else if (level === 3) {
        await onUpdateSubDepartment(item.id, { status: newStatus });
        showToast(`Đã ${newStatus === 'active' ? 'kích hoạt' : 'ngừng hoạt động'} Phòng ban con "${item.name}"`);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Lỗi khi đổi trạng thái', 'error');
    }
  };

  const totalDivisions = divisions.length;
  const totalDepartments = departments.length;
  const totalSubDepartments = subDepartments.length;
  const totalEmployees = employees.length;

  return (
    <div className="space-y-6">
      {/* Toast thông báo */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-xl flex items-center gap-3 text-sm font-semibold transition-all transform animate-in fade-in slide-in-from-bottom-4 ${
            toastMessage.type === 'success'
              ? 'bg-emerald-600 text-white'
              : 'bg-red-600 text-white'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* TOP HEADER: Tiêu đề + Thống kê nhanh + Nút thêm mới 3 cấp */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-blue-700 uppercase tracking-wider mb-1">
              <FolderTree className="w-4 h-4" />
              <span>Mô Hình Tổ Chức 3 Cấp Mới</span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Quản Lý Khối, Phòng Ban & Bộ Phận
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Phân cấp chuẩn hóa: Cấp 1 (Khối) → Cấp 2 (Phòng ban kèm Ký hiệu PB) → Cấp 3 (Phòng ban con). Tích hợp đồng bộ toàn diện với Hồ sơ nhân sự.
            </p>
          </div>

          {/* Action buttons thêm mới từng cấp */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openAddDivisionModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-bold rounded-xl shadow-sm transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm Khối (Cấp 1)</span>
            </button>

            <button
              type="button"
              onClick={() => openAddDeptModal()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-xl shadow-sm transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm Phòng Ban (Cấp 2)</span>
            </button>

            <button
              type="button"
              onClick={() => openAddSubDeptModal()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm Phòng Ban Con (Cấp 3)</span>
            </button>
          </div>
        </div>

        {/* Thẻ đếm số liệu 4 khối */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-100">
          <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-3.5">
            <div className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              <span>Cấp 1: Khối Quản Lý</span>
            </div>
            <div className="text-2xl font-black text-indigo-950 mt-1">
              {totalDivisions}
            </div>
            <div className="text-[11px] text-indigo-600 mt-0.5">Khối hoạt động cao nhất</div>
          </div>

          <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-3.5">
            <div className="text-[11px] font-bold text-blue-700 uppercase tracking-wider flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" />
              <span>Cấp 2: Phòng Ban (Ký hiệu)</span>
            </div>
            <div className="text-2xl font-black text-blue-950 mt-1">
              {totalDepartments}
            </div>
            <div className="text-[11px] text-blue-600 mt-0.5">Mỗi phòng ban có mã Ký hiệu riêng</div>
          </div>

          <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-3.5">
            <div className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
              <GitBranch className="w-3.5 h-3.5" />
              <span>Cấp 3: Phòng Ban Con</span>
            </div>
            <div className="text-2xl font-black text-emerald-950 mt-1">
              {totalSubDepartments}
            </div>
            <div className="text-[11px] text-emerald-600 mt-0.5">Bộ phận / Tổ / Nhóm trực thuộc</div>
          </div>

          <div className="bg-amber-50/60 border border-amber-100 rounded-xl p-3.5">
            <div className="text-[11px] font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              <span>Tổng Nhân Sự Đã Gán</span>
            </div>
            <div className="text-2xl font-black text-amber-950 mt-1">
              {totalEmployees}
            </div>
            <div className="text-[11px] text-amber-600 mt-0.5">Đã đồng bộ vào cơ cấu mới</div>
          </div>
        </div>
      </div>

      {/* FILTER & TOOLBAR */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* View mode tabs */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold text-slate-600 shrink-0 overflow-x-auto">
            <button
              type="button"
              onClick={() => setViewMode('tree')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ${
                viewMode === 'tree' ? 'bg-white text-blue-700 shadow-xs' : 'hover:text-slate-900'
              }`}
            >
              <FolderTree className="w-3.5 h-3.5" />
              <span>Cây Phân Cấp (3 Tầng)</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('divisions')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ${
                viewMode === 'divisions' ? 'bg-white text-indigo-700 shadow-xs' : 'hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Khối ({totalDivisions})</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('departments')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ${
                viewMode === 'departments' ? 'bg-white text-blue-700 shadow-xs' : 'hover:text-slate-900'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Phòng Ban ({totalDepartments})</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('subDepartments')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ${
                viewMode === 'subDepartments' ? 'bg-white text-emerald-700 shadow-xs' : 'hover:text-slate-900'
              }`}
            >
              <GitBranch className="w-3.5 h-3.5" />
              <span>Phòng Ban Con ({totalSubDepartments})</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('orgChart')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ${
                viewMode === 'orgChart' ? 'bg-white text-violet-700 shadow-xs' : 'hover:text-slate-900'
              }`}
            >
              <Network className="w-3.5 h-3.5" />
              <span>Sơ Đồ Tổ Chức</span>
            </button>
          </div>

          {/* Quick Expand / Collapse buttons in Tree view */}
          {viewMode === 'tree' && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={expandAll}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-200 cursor-pointer"
                title="Mở rộng toàn bộ cấu trúc cây"
              >
                <Maximize2 className="w-3 h-3 text-slate-500" />
                <span>Mở rộng tất cả</span>
              </button>

              <button
                type="button"
                onClick={collapseAll}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-200 cursor-pointer"
                title="Thu gọn toàn bộ cấu trúc cây"
              >
                <Minimize2 className="w-3 h-3 text-slate-500" />
                <span>Thu gọn tất cả</span>
              </button>
            </div>
          )}
        </div>

        {/* Search & Filter inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-2">
          {/* Ô tìm kiếm */}
          <div className="sm:col-span-6 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm theo tên Khối, Ký hiệu PB, tên Phòng ban, Phòng ban con..."
              className="w-full pl-9 pr-8 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-blue-600 bg-slate-50 focus:bg-white transition-colors"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Lọc theo Khối */}
          <div className="sm:col-span-3">
            <select
              value={selectedDivisionFilter}
              onChange={(e) => setSelectedDivisionFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-blue-600 font-medium"
            >
              <option value="ALL">-- Tất cả Khối (Cấp 1) --</option>
              {divisions.map((div) => (
                <option key={div.id} value={div.id}>
                  {div.code ? `[${div.code}] ` : ''}{div.name}
                </option>
              ))}
            </select>
          </div>

          {/* Lọc theo trạng thái */}
          <div className="sm:col-span-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'active' | 'inactive')}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-blue-600 font-medium"
            >
              <option value="ALL">-- Trạng thái: Tất cả --</option>
              <option value="active">Đang hoạt động</option>
              <option value="inactive">Ngừng hoạt động</option>
            </select>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 1. CHẾ ĐỘ XEM: CÂY PHÂN CẤP 3 TẦNG (TREE VIEW - GIAO DIỆN CHÍNH)       */}
      {/* ===================================================================== */}
      {viewMode === 'tree' && (
        <div className="space-y-4">
          {filteredDivisions.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
              <FolderTree className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <div className="text-sm font-bold text-slate-700">
                Không tìm thấy đơn vị tổ chức nào phù hợp
              </div>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Thử thay đổi từ khóa tìm kiếm hoặc bấm Thêm Khối để bắt đầu tạo cơ cấu tổ chức mới.
              </p>
              <button
                type="button"
                onClick={openAddDivisionModal}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm Khối Đầu Tiên</span>
              </button>
            </div>
          ) : (
            filteredDivisions.map((division) => {
              const isDivCollapsed = collapsedDivisionIds.has(division.id);
              const relatedDepts = (deptsByDivisionId.get(division.id) || []).filter((dept) => {
                if (statusFilter !== 'ALL' && (dept.status || 'active') !== statusFilter) {
                  return false;
                }
                if (searchTerm.trim()) {
                  const q = searchTerm.trim().toLowerCase();
                  const matchDept =
                    dept.name.toLowerCase().includes(q) ||
                    (dept.code || '').toLowerCase().includes(q) ||
                    (dept.description || '').toLowerCase().includes(q);
                  if (matchDept) return true;
                  const subs = subDeptsByDeptId.get(dept.id) || [];
                  return subs.some((s) => s.name.toLowerCase().includes(q));
                }
                return true;
              });

              const divEmpCount = getDivisionEmployeeCount(division);
              const isInactive = (division.status || 'active') === 'inactive';

              return (
                <div
                  key={division.id}
                  className={`bg-white border rounded-2xl overflow-hidden shadow-xs transition-all ${
                    isInactive ? 'border-slate-200 opacity-80' : 'border-indigo-200'
                  }`}
                >
                  {/* CẤP 1 HEADER (KHỐI) */}
                  <div
                    className={`px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3 border-b ${
                      isInactive
                        ? 'bg-slate-100 text-slate-700 border-slate-200'
                        : 'bg-gradient-to-r from-indigo-900 via-indigo-800 to-indigo-900 text-white border-indigo-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => toggleDivisionCollapse(division.id)}
                        className={`p-1 rounded-lg transition-transform cursor-pointer ${
                          isInactive ? 'hover:bg-slate-200 text-slate-600' : 'hover:bg-indigo-700/60 text-indigo-200'
                        }`}
                        title={isDivCollapsed ? 'Mở rộng Khối' : 'Thu gọn Khối'}
                      >
                        {isDivCollapsed ? (
                          <ChevronRight className="w-5 h-5" />
                        ) : (
                          <ChevronDown className="w-5 h-5" />
                        )}
                      </button>

                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-white/20 text-white">
                          Cấp 1 • Khối
                        </span>
                        {division.code && (
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-amber-400 text-amber-950">
                            {division.code}
                          </span>
                        )}
                        <h2 className="text-base font-black tracking-tight">
                          {division.name}
                        </h2>
                        {isInactive && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-300 text-slate-700">
                            Ngừng hoạt động
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end md:self-center">
                      {/* Thống kê phòng ban & nhân viên trong khối */}
                      <div className="flex items-center gap-3 text-xs">
                        <span className={`flex items-center gap-1 ${isInactive ? 'text-slate-600' : 'text-indigo-200'}`}>
                          <Building2 className="w-3.5 h-3.5" />
                          <b className={isInactive ? 'text-slate-900' : 'text-white'}>{relatedDepts.length}</b> Phòng ban
                        </span>

                        <button
                          type="button"
                          onClick={() => onNavigateToEmployees?.({ khoi: division.name })}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                            isInactive
                              ? 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                              : 'bg-indigo-700/50 hover:bg-indigo-600 text-white'
                          }`}
                          title="Bấm để xem danh sách nhân sự thuộc Khối này"
                        >
                          <Users className="w-3.5 h-3.5" />
                          <b>{divEmpCount}</b> nhân viên
                          <ArrowRight className="w-3 h-3 ml-0.5" />
                        </button>
                      </div>

                      {/* Các nút thao tác với Khối */}
                      <div className="flex items-center gap-1 border-l pl-3 border-indigo-700/60">
                        <button
                          type="button"
                          onClick={() => openAddDeptModal(division.id)}
                          className="p-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1 px-2.5 transition-colors cursor-pointer"
                          title="Thêm Phòng ban trực thuộc Khối này"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Thêm PB</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => openEditDivisionModal(division)}
                          className="p-1.5 rounded-lg hover:bg-white/10 text-indigo-100 transition-colors cursor-pointer"
                          title="Sửa thông tin Khối"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => toggleStatus(1, division)}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                            isInactive ? 'text-emerald-300 hover:bg-white/10' : 'text-amber-300 hover:bg-white/10'
                          }`}
                          title={isInactive ? 'Kích hoạt lại Khối' : 'Ngừng hoạt động Khối'}
                        >
                          <Power className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => requestDelete(1, division)}
                          className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-200 hover:text-white transition-colors cursor-pointer"
                          title="Xóa Khối"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* CẤP 2 VÀ CẤP 3: CÁC PHÒNG BAN TRỰC THUỘC KHỐI */}
                  {!isDivCollapsed && (
                    <div className="p-4 bg-slate-50/50 space-y-3">
                      {relatedDepts.length === 0 ? (
                        <div className="py-8 text-center text-slate-400 text-xs bg-white rounded-xl border border-dashed border-slate-200">
                          <Building2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                          <span>Khối này hiện chưa có Phòng ban trực thuộc nào.</span>
                          <div className="mt-2">
                            <button
                              type="button"
                              onClick={() => openAddDeptModal(division.id)}
                              className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:text-blue-800 hover:underline cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Thêm Phòng ban vào Khối ngay
                            </button>
                          </div>
                        </div>
                      ) : (
                        relatedDepts.map((department) => {
                          const isDeptCollapsed = collapsedDeptIds.has(department.id);
                          const relatedSubs = (subDeptsByDeptId.get(department.id) || []).filter((sub) => {
                            if (statusFilter !== 'ALL' && (sub.status || 'active') !== statusFilter) {
                              return false;
                            }
                            if (searchTerm.trim()) {
                              const q = searchTerm.trim().toLowerCase();
                              return sub.name.toLowerCase().includes(q) || (sub.description || '').toLowerCase().includes(q);
                            }
                            return true;
                          });

                          const deptEmpCount = getDepartmentEmployeeCount(department);
                          const isDeptInactive = (department.status || 'active') === 'inactive';

                          return (
                            <div
                              key={department.id}
                              className={`bg-white border rounded-xl overflow-hidden shadow-2xs transition-all ${
                                isDeptInactive ? 'border-slate-200 opacity-80' : 'border-blue-200'
                              }`}
                            >
                              {/* CẤP 2 HEADER (PHÒNG BAN) */}
                              <div className="px-4 py-3 bg-white border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="flex items-center gap-2.5">
                                  <button
                                    type="button"
                                    onClick={() => toggleDeptCollapse(department.id)}
                                    className="p-1 rounded-md hover:bg-slate-100 text-slate-500 cursor-pointer"
                                    title={isDeptCollapsed ? 'Mở rộng Phòng ban' : 'Thu gọn Phòng ban'}
                                  >
                                    {isDeptCollapsed ? (
                                      <ChevronRight className="w-4 h-4" />
                                    ) : (
                                      <ChevronDown className="w-4 h-4" />
                                    )}
                                  </button>

                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                      Cấp 2
                                    </span>

                                    {/* KÝ HIỆU PB NỔI BẬT */}
                                    <span
                                      className="px-2.5 py-0.5 rounded-md text-xs font-mono font-black bg-blue-700 text-white tracking-wide shadow-2xs"
                                      title="Ký hiệu Phòng ban"
                                    >
                                      {department.code || 'CHƯA CÓ MÃ'}
                                    </span>

                                    <h3 className="text-sm font-bold text-slate-900">
                                      {department.name}
                                    </h3>

                                    {department.description && (
                                      <span className="text-xs text-slate-400 font-normal hidden lg:inline">
                                        • {department.description}
                                      </span>
                                    )}

                                    {isDeptInactive && (
                                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-500">
                                        Ngừng hoạt động
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 self-end sm:self-center">
                                  {/* Thống kê con & nhân viên */}
                                  <div className="flex items-center gap-2 text-xs">
                                    <span className="text-slate-500">
                                      <b className="text-slate-800">{relatedSubs.length}</b> PB con
                                    </span>

                                    <button
                                      type="button"
                                      onClick={() => onNavigateToEmployees?.({ phongBan: department.name })}
                                      className="flex items-center gap-1 px-2 py-1 rounded bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 transition-colors cursor-pointer text-xs"
                                      title="Xem danh sách nhân viên thuộc Phòng ban này"
                                    >
                                      <Users className="w-3 h-3 text-slate-400" />
                                      <b>{deptEmpCount}</b> NV
                                    </button>
                                  </div>

                                  {/* Nút hành động cho Phòng ban */}
                                  <div className="flex items-center gap-1 border-l pl-2 border-slate-200">
                                    <button
                                      type="button"
                                      onClick={() => openAddSubDeptModal(department.id)}
                                      className="p-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-bold flex items-center gap-1 px-2 transition-colors cursor-pointer"
                                      title="Thêm Phòng ban con vào Phòng ban này"
                                    >
                                      <Plus className="w-3 h-3" />
                                      <span>Thêm con</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => openEditDeptModal(department)}
                                      className="p-1 rounded hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
                                      title="Sửa Phòng ban"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => toggleStatus(2, department)}
                                      className={`p-1 rounded transition-colors cursor-pointer ${
                                        isDeptInactive ? 'text-emerald-600 hover:bg-emerald-50' : 'text-amber-600 hover:bg-amber-50'
                                      }`}
                                      title={isDeptInactive ? 'Kích hoạt lại Phòng ban' : 'Ngừng hoạt động Phòng ban'}
                                    >
                                      <Power className="w-3.5 h-3.5" />
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => requestDelete(2, department)}
                                      className="p-1 rounded hover:bg-red-50 text-red-600 transition-colors cursor-pointer"
                                      title="Xóa Phòng ban"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              </div>

                              {/* CẤP 3: CÁC PHÒNG BAN CON TRỰC THUỘC */}
                              {!isDeptCollapsed && (
                                <div className="p-3 bg-slate-50/70 border-t border-slate-100 space-y-2">
                                  {relatedSubs.length === 0 ? (
                                    <div className="py-4 text-center text-slate-400 text-xs italic">
                                      Chưa có Phòng ban con nào. Bấm "+ Thêm con" để thêm bộ phận hoặc tổ trực thuộc.
                                    </div>
                                  ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                      {relatedSubs.map((subDept) => {
                                        const subEmpCount = getSubDeptEmployeeCount(subDept);
                                        const isSubInactive = (subDept.status || 'active') === 'inactive';

                                        return (
                                          <div
                                            key={subDept.id}
                                            className={`p-2.5 rounded-lg border bg-white flex items-center justify-between gap-2 shadow-2xs hover:border-emerald-300 transition-all ${
                                              isSubInactive ? 'border-slate-200 opacity-70' : 'border-slate-200'
                                            }`}
                                          >
                                            <div className="min-w-0 flex-1">
                                              <div className="flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                                <span className="text-xs font-bold text-slate-800 truncate" title={subDept.name}>
                                                  {subDept.name}
                                                </span>
                                              </div>
                                              <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400 pl-3.5">
                                                <span>Cấp 3</span>
                                                {isSubInactive && (
                                                  <span className="text-amber-600 font-medium">Ngừng HĐ</span>
                                                )}
                                                {subDept.description && (
                                                  <span className="truncate max-w-[120px]" title={subDept.description}>
                                                    • {subDept.description}
                                                  </span>
                                                )}
                                              </div>
                                            </div>

                                            <div className="flex items-center gap-1 shrink-0">
                                              <button
                                                type="button"
                                                onClick={() => onNavigateToEmployees?.({ phongBanCon: subDept.name })}
                                                className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-700 text-[11px] font-bold transition-colors cursor-pointer flex items-center gap-1"
                                                title="Xem nhân viên thuộc Phòng ban con này"
                                              >
                                                <Users className="w-3 h-3 text-slate-400" />
                                                <span>{subEmpCount}</span>
                                              </button>

                                              <button
                                                type="button"
                                                onClick={() => openEditSubDeptModal(subDept)}
                                                className="p-1 rounded hover:bg-slate-100 text-slate-500 cursor-pointer"
                                                title="Sửa Phòng ban con"
                                              >
                                                <Edit3 className="w-3 h-3" />
                                              </button>

                                              <button
                                                type="button"
                                                onClick={() => toggleStatus(3, subDept)}
                                                className={`p-1 rounded cursor-pointer ${
                                                  isSubInactive ? 'text-emerald-600 hover:bg-emerald-50' : 'text-amber-600 hover:bg-amber-50'
                                                }`}
                                                title={isSubInactive ? 'Kích hoạt lại' : 'Ngừng hoạt động'}
                                              >
                                                <Power className="w-3 h-3" />
                                              </button>

                                              <button
                                                type="button"
                                                onClick={() => requestDelete(3, subDept)}
                                                className="p-1 rounded hover:bg-red-50 text-red-500 cursor-pointer"
                                                title="Xóa Phòng ban con"
                                              >
                                                <Trash2 className="w-3 h-3" />
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* 2. CHẾ ĐỘ XEM: DANH SÁCH BẢNG CẤP 1: KHỐI (DIVISIONS TABLE)           */}
      {/* ===================================================================== */}
      {viewMode === 'divisions' && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-700" />
              <span>Danh mục Khối Quản Lý (Cấp 1)</span>
            </h3>
            <button
              type="button"
              onClick={openAddDivisionModal}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-bold rounded-lg cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Thêm Khối Mới</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4 w-12 text-center">STT</th>
                  <th className="py-3 px-4 w-28">Mã Khối</th>
                  <th className="py-3 px-4">Tên Khối (Cấp 1)</th>
                  <th className="py-3 px-4">Mô tả</th>
                  <th className="py-3 px-4 text-center">Số Phòng Ban</th>
                  <th className="py-3 px-4 text-center">Tổng Nhân Sự</th>
                  <th className="py-3 px-4 text-center">Trạng Thái</th>
                  <th className="py-3 px-4 text-center w-28">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {divisions.map((div, idx) => {
                  const depts = deptsByDivisionId.get(div.id) || [];
                  const empCount = getDivisionEmployeeCount(div);
                  const isInactive = (div.status || 'active') === 'inactive';

                  return (
                    <tr key={div.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 text-center font-mono text-slate-400">{idx + 1}</td>
                      <td className="py-3 px-4 font-mono font-bold text-indigo-700">
                        {div.code || '—'}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900 text-sm">
                        {div.name}
                      </td>
                      <td className="py-3 px-4 text-slate-500 max-w-xs truncate">
                        {div.description || '—'}
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-slate-800">
                        {depts.length}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center gap-1 font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                          <Users className="w-3 h-3" />
                          {empCount}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isInactive
                              ? 'bg-slate-100 text-slate-500'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {isInactive ? 'Ngừng HĐ' : 'Đang hoạt động'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditDivisionModal(div)}
                            className="p-1 rounded hover:bg-slate-100 text-slate-600 cursor-pointer"
                            title="Sửa"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleStatus(1, div)}
                            className={`p-1 rounded cursor-pointer ${
                              isInactive ? 'text-emerald-600 hover:bg-emerald-50' : 'text-amber-600 hover:bg-amber-50'
                            }`}
                            title={isInactive ? 'Kích hoạt' : 'Ngừng HĐ'}
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => requestDelete(1, div)}
                            className="p-1 rounded hover:bg-red-50 text-red-600 cursor-pointer"
                            title="Xóa"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 3. CHẾ ĐỘ XEM: DANH SÁCH BẢNG CẤP 2: PHÒNG BAN (DEPARTMENTS TABLE)    */}
      {/* ===================================================================== */}
      {viewMode === 'departments' && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-700" />
              <span>Danh mục Phòng Ban (Cấp 2) – Quản lý Ký hiệu PB</span>
            </h3>
            <button
              type="button"
              onClick={() => openAddDeptModal()}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-lg cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Thêm Phòng Ban</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4 w-12 text-center">STT</th>
                  <th className="py-3 px-4 w-28">Ký Hiệu PB</th>
                  <th className="py-3 px-4">Tên Phòng Ban (Cấp 2)</th>
                  <th className="py-3 px-4">Khối Trực Thuộc (Cấp 1)</th>
                  <th className="py-3 px-4">Mô tả</th>
                  <th className="py-3 px-4 text-center">Số PB Con</th>
                  <th className="py-3 px-4 text-center">Tổng Nhân Sự</th>
                  <th className="py-3 px-4 text-center">Trạng Thái</th>
                  <th className="py-3 px-4 text-center w-28">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {departments.map((dept, idx) => {
                  const div = divisions.find((d) => d.id === dept.divisionId);
                  const subs = subDeptsByDeptId.get(dept.id) || [];
                  const empCount = getDepartmentEmployeeCount(dept);
                  const isInactive = (dept.status || 'active') === 'inactive';

                  return (
                    <tr key={dept.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 text-center font-mono text-slate-400">{idx + 1}</td>
                      <td className="py-3 px-4">
                        <span className="px-2.5 py-1 rounded bg-blue-700 text-white font-mono font-black text-xs">
                          {dept.code || '—'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900 text-sm">
                        {dept.name}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                          <Layers className="w-3 h-3" />
                          {div?.name || dept.divisionName || 'Chưa gán Khối'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-500 max-w-xs truncate">
                        {dept.description || '—'}
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-slate-800">
                        {subs.length}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center gap-1 font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                          <Users className="w-3 h-3" />
                          {empCount}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isInactive
                              ? 'bg-slate-100 text-slate-500'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {isInactive ? 'Ngừng HĐ' : 'Đang hoạt động'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditDeptModal(dept)}
                            className="p-1 rounded hover:bg-slate-100 text-slate-600 cursor-pointer"
                            title="Sửa"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleStatus(2, dept)}
                            className={`p-1 rounded cursor-pointer ${
                              isInactive ? 'text-emerald-600 hover:bg-emerald-50' : 'text-amber-600 hover:bg-amber-50'
                            }`}
                            title={isInactive ? 'Kích hoạt' : 'Ngừng HĐ'}
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => requestDelete(2, dept)}
                            className="p-1 rounded hover:bg-red-50 text-red-600 cursor-pointer"
                            title="Xóa"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 4. CHẾ ĐỘ XEM: DANH SÁCH BẢNG CẤP 3: PHÒNG BAN CON (SUB-DEPTS TABLE) */}
      {/* ===================================================================== */}
      {viewMode === 'subDepartments' && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-emerald-700" />
              <span>Danh mục Phòng Ban Con / Bộ Phận Con (Cấp 3)</span>
            </h3>
            <button
              type="button"
              onClick={() => openAddSubDeptModal()}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Thêm Phòng Ban Con</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4 w-12 text-center">STT</th>
                  <th className="py-3 px-4">Tên Phòng Ban Con (Cấp 3)</th>
                  <th className="py-3 px-4">Phòng Ban Trực Thuộc (Cấp 2)</th>
                  <th className="py-3 px-4">Khối Quản Lý (Cấp 1)</th>
                  <th className="py-3 px-4">Mô tả</th>
                  <th className="py-3 px-4 text-center">Số Nhân Sự</th>
                  <th className="py-3 px-4 text-center">Trạng Thái</th>
                  <th className="py-3 px-4 text-center w-28">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {subDepartments.map((sub, idx) => {
                  const parentDept = departments.find((d) => d.id === sub.departmentId);
                  const div = divisions.find((d) => d.id === (parentDept?.divisionId || sub.divisionId));
                  const empCount = getSubDeptEmployeeCount(sub);
                  const isInactive = (sub.status || 'active') === 'inactive';

                  return (
                    <tr key={sub.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 text-center font-mono text-slate-400">{idx + 1}</td>
                      <td className="py-3 px-4 font-bold text-slate-900 text-sm">
                        {sub.name}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          {parentDept?.code && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-100 text-blue-800">
                              {parentDept.code}
                            </span>
                          )}
                          <span className="font-semibold text-blue-700">
                            {parentDept?.name || sub.departmentName || 'Chưa gán'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-slate-600">
                          {div?.name || sub.divisionName || '—'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-500 max-w-xs truncate">
                        {sub.description || '—'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                          <Users className="w-3 h-3" />
                          {empCount}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isInactive
                              ? 'bg-slate-100 text-slate-500'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {isInactive ? 'Ngừng HĐ' : 'Đang hoạt động'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditSubDeptModal(sub)}
                            className="p-1 rounded hover:bg-slate-100 text-slate-600 cursor-pointer"
                            title="Sửa"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleStatus(3, sub)}
                            className={`p-1 rounded cursor-pointer ${
                              isInactive ? 'text-emerald-600 hover:bg-emerald-50' : 'text-amber-600 hover:bg-amber-50'
                            }`}
                            title={isInactive ? 'Kích hoạt' : 'Ngừng HĐ'}
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => requestDelete(3, sub)}
                            className="p-1 rounded hover:bg-red-50 text-red-600 cursor-pointer"
                            title="Xóa"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 5. CHẾ ĐỘ XEM: SƠ ĐỒ TỔ CHỨC TRỰC QUAN (ORG CHART VIEW)                */}
      {/* ===================================================================== */}
      {viewMode === 'orgChart' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-8">
          <div className="text-center max-w-xl mx-auto">
            <h3 className="text-base font-black text-slate-900">
              Sơ Đồ Phân Cấp Cơ Cấu Tổ Chức Doanh Nghiệp
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Mô hình trực quan 3 cấp phân cấp điều hành: Khối (Cấp 1) → Phòng Ban (Cấp 2) → Bộ Phận Con (Cấp 3).
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {divisions.map((div) => {
              const depts = deptsByDivisionId.get(div.id) || [];
              const divEmp = getDivisionEmployeeCount(div);

              return (
                <div
                  key={div.id}
                  className="border-2 border-indigo-200 rounded-2xl p-4 bg-indigo-50/20 flex flex-col justify-between"
                >
                  <div>
                    {/* Block Khối */}
                    <div className="bg-gradient-to-r from-indigo-900 to-indigo-800 text-white p-3 rounded-xl shadow-xs">
                      <div className="flex items-center justify-between text-[11px] font-bold text-indigo-200 mb-0.5">
                        <span>CẤP 1: KHỐI</span>
                        {div.code && <span className="bg-amber-400 text-amber-950 px-1.5 py-0.2 rounded font-mono">{div.code}</span>}
                      </div>
                      <h4 className="text-sm font-black tracking-tight">{div.name}</h4>
                      <div className="text-[11px] text-indigo-300 mt-1 flex items-center justify-between">
                        <span>{depts.length} phòng ban</span>
                        <span>{divEmp} nhân viên</span>
                      </div>
                    </div>

                    {/* Danh sách phòng ban */}
                    <div className="mt-4 space-y-3 pl-3 border-l-2 border-indigo-200">
                      {depts.map((dept) => {
                        const subs = subDeptsByDeptId.get(dept.id) || [];
                        const deptEmp = getDepartmentEmployeeCount(dept);

                        return (
                          <div key={dept.id} className="relative">
                            <div className="bg-white border border-blue-200 rounded-xl p-2.5 shadow-2xs">
                              <div className="flex items-center justify-between gap-1">
                                <span className="px-1.5 py-0.5 rounded bg-blue-700 text-white font-mono font-bold text-[10px]">
                                  {dept.code || 'PB'}
                                </span>
                                <span className="text-[11px] font-semibold text-slate-500">
                                  {deptEmp} NV
                                </span>
                              </div>
                              <div className="text-xs font-bold text-slate-900 mt-1">
                                {dept.name}
                              </div>

                              {/* Danh sách các sub dept */}
                              {subs.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-slate-100 flex flex-wrap gap-1">
                                  {subs.map((s) => (
                                    <span
                                      key={s.id}
                                      className="text-[10px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded"
                                    >
                                      {s.name}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 1: THÊM / SỬA KHỐI (CẤP 1)                                      */}
      {/* ===================================================================== */}
      {isDivisionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-indigo-900 to-indigo-800 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-300" />
                <span>{editingDivision ? 'Chỉnh Sửa Khối (Cấp 1)' : 'Thêm Mới Khối Quản Lý (Cấp 1)'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsDivisionModalOpen(false)}
                className="p-1 rounded hover:bg-white/10 text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveDivision} className="p-6 space-y-4 text-xs">
              {modalError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{modalError}</span>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Tên Khối *
                </label>
                <input
                  type="text"
                  required
                  value={divisionFormName}
                  onChange={(e) => setDivisionFormName(e.target.value)}
                  placeholder="VD: Khối Văn Phòng, Khối Sản Xuất, Khối Kinh Doanh..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:border-indigo-600 font-semibold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Mã Khối (Mã ký hiệu nội bộ)
                </label>
                <input
                  type="text"
                  value={divisionFormCode}
                  onChange={(e) => setDivisionFormCode(e.target.value.toUpperCase())}
                  placeholder="VD: VP, KTSX, BOD, KD..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:border-indigo-600 font-mono uppercase"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Mã ngắn gọn để nhận diện trên hệ thống (không bắt buộc).
                </span>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Mô tả chức năng / Nhiệm vụ
                </label>
                <textarea
                  rows={2}
                  value={divisionFormDesc}
                  onChange={(e) => setDivisionFormDesc(e.target.value)}
                  placeholder="Mô tả phạm vi quản lý và trách nhiệm của Khối..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Trạng thái hoạt động
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDivisionFormStatus('active')}
                    className={`py-2 px-3 rounded-xl border text-center font-bold transition-colors cursor-pointer ${
                      divisionFormStatus === 'active'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                        : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    Đang hoạt động
                  </button>
                  <button
                    type="button"
                    onClick={() => setDivisionFormStatus('inactive')}
                    className={`py-2 px-3 rounded-xl border text-center font-bold transition-colors cursor-pointer ${
                      divisionFormStatus === 'inactive'
                        ? 'bg-slate-200 border-slate-300 text-slate-800'
                        : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    Ngừng hoạt động
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsDivisionModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-indigo-700 hover:bg-indigo-800 text-white font-bold rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Đang lưu...' : editingDivision ? 'Lưu Thay Đổi' : 'Tạo Khối Mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 2: THÊM / SỬA PHÒNG BAN (CẤP 2 - CÓ KÝ HIỆU PB)                 */}
      {/* ===================================================================== */}
      {isDeptModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-blue-800 to-blue-700 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-200" />
                <span>{editingDept ? 'Chỉnh Sửa Phòng Ban (Cấp 2)' : 'Thêm Mới Phòng Ban (Cấp 2)'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsDeptModalOpen(false)}
                className="p-1 rounded hover:bg-white/10 text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveDept} className="p-6 space-y-4 text-xs">
              {modalError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{modalError}</span>
                </div>
              )}

              {/* Chọn Khối trực thuộc */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Chọn Khối Trực Thuộc (Cấp 1) *
                </label>
                <select
                  required
                  value={deptFormDivId}
                  onChange={(e) => setDeptFormDivId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:border-blue-600 bg-white font-semibold"
                >
                  <option value="" disabled>-- Chọn Khối quản lý trực thuộc --</option>
                  {divisions.map((div) => (
                    <option key={div.id} value={div.id}>
                      {div.code ? `[${div.code}] ` : ''}{div.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* KÝ HIỆU PB - BẮT BUỘC & VALIDATE TRÙNG */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Ký Hiệu PB (Department Code) *
                </label>
                <input
                  type="text"
                  required
                  value={deptFormCode}
                  onChange={(e) => handleDeptCodeChange(e.target.value)}
                  placeholder="VD: P6, BGĐ, HCNS, KTTC, QC, SXKT..."
                  className={`w-full px-3 py-2 border rounded-xl focus:outline-none font-mono font-black text-sm uppercase transition-colors ${
                    deptCodeError
                      ? 'border-red-500 bg-red-50/50 text-red-900 focus:border-red-600'
                      : 'border-slate-300 focus:border-blue-600'
                  }`}
                />
                {deptCodeError ? (
                  <span className="text-[11px] text-red-600 mt-1 block font-semibold">
                    {deptCodeError}
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    Ký hiệu PB dùng để nhận diện và in trên thẻ nhân viên (phải là duy nhất).
                  </span>
                )}
              </div>

              {/* Tên Phòng ban */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Tên Phòng Ban (Bộ Phận) *
                </label>
                <input
                  type="text"
                  required
                  value={deptFormName}
                  onChange={(e) => setDeptFormName(e.target.value)}
                  placeholder="VD: Phòng Bảo trì vận hành, Phòng Hành chính - Nhân sự..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:border-blue-600 font-semibold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Mô tả / Ghi chú
                </label>
                <textarea
                  rows={2}
                  value={deptFormDesc}
                  onChange={(e) => setDeptFormDesc(e.target.value)}
                  placeholder="Mô tả chức năng chuyên môn..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Trạng thái hoạt động
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDeptFormStatus('active')}
                    className={`py-2 px-3 rounded-xl border text-center font-bold transition-colors cursor-pointer ${
                      deptFormStatus === 'active'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                        : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    Đang hoạt động
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeptFormStatus('inactive')}
                    className={`py-2 px-3 rounded-xl border text-center font-bold transition-colors cursor-pointer ${
                      deptFormStatus === 'inactive'
                        ? 'bg-slate-200 border-slate-300 text-slate-800'
                        : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    Ngừng hoạt động
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsDeptModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !!deptCodeError}
                  className="px-5 py-2 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Đang lưu...' : editingDept ? 'Lưu Thay Đổi' : 'Tạo Phòng Ban'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 3: THÊM / SỬA PHÒNG BAN CON (CẤP 3)                             */}
      {/* ===================================================================== */}
      {isSubDeptModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-emerald-800 to-emerald-700 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-emerald-200" />
                <span>{editingSubDept ? 'Chỉnh Sửa Phòng Ban Con (Cấp 3)' : 'Thêm Mới Phòng Ban Con (Cấp 3)'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsSubDeptModalOpen(false)}
                className="p-1 rounded hover:bg-white/10 text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSubDept} className="p-6 space-y-4 text-xs">
              {modalError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{modalError}</span>
                </div>
              )}

              {/* Chọn Khối */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Khối Quản Lý (Cấp 1)
                </label>
                <select
                  value={subDeptFormDivId}
                  onChange={(e) => handleSubDeptDivChange(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-600 bg-white"
                >
                  <option value="">-- Tất cả các Khối --</option>
                  {divisions.map((div) => (
                    <option key={div.id} value={div.id}>
                      {div.code ? `[${div.code}] ` : ''}{div.name}
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Chọn Khối để lọc nhanh danh sách Phòng ban cha ở bên dưới.
                </span>
              </div>

              {/* Chọn Phòng ban cấp 2 trực thuộc (Tự động lọc theo Khối) */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Phòng Ban (Bộ Phận) Trực Thuộc (Cấp 2) *
                </label>
                <select
                  required
                  value={subDeptFormDeptId}
                  onChange={(e) => setSubDeptFormDeptId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-600 bg-white font-semibold"
                >
                  <option value="" disabled>-- Chọn Phòng ban cấp 2 trực thuộc --</option>
                  {departments
                    .filter((d) => !subDeptFormDivId || d.divisionId === subDeptFormDivId)
                    .map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        [{dept.code || 'PB'}] {dept.name}
                      </option>
                    ))}
                </select>
              </div>

              {/* Tên Phòng ban con */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Tên Phòng Ban Con (Bộ Phận Con) *
                </label>
                <input
                  type="text"
                  required
                  value={subDeptFormName}
                  onChange={(e) => setSubDeptFormName(e.target.value)}
                  placeholder="VD: BP. Bảo trì vận hành, BP. Cơ điện, Xưởng May 01..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-600 font-semibold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Mô tả / Ghi chú
                </label>
                <textarea
                  rows={2}
                  value={subDeptFormDesc}
                  onChange={(e) => setSubDeptFormDesc(e.target.value)}
                  placeholder="Mô tả công việc của bộ phận con này..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Trạng thái hoạt động
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSubDeptFormStatus('active')}
                    className={`py-2 px-3 rounded-xl border text-center font-bold transition-colors cursor-pointer ${
                      subDeptFormStatus === 'active'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                        : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    Đang hoạt động
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubDeptFormStatus('inactive')}
                    className={`py-2 px-3 rounded-xl border text-center font-bold transition-colors cursor-pointer ${
                      subDeptFormStatus === 'inactive'
                        ? 'bg-slate-200 border-slate-300 text-slate-800'
                        : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    Ngừng hoạt động
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsSubDeptModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Đang lưu...' : editingSubDept ? 'Lưu Thay Đổi' : 'Tạo Phòng Ban Con'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 4: CẢNH BÁO XÓA AN TOÀN (SAFETY DELETE MODAL)                    */}
      {/* ===================================================================== */}
      {safetyDeleteModal.isOpen && safetyDeleteModal.item && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div
              className={`px-6 py-4 flex items-center justify-between text-white ${
                safetyDeleteModal.canDelete
                  ? 'bg-red-600'
                  : 'bg-gradient-to-r from-amber-600 to-amber-700'
              }`}
            >
              <h3 className="text-sm font-bold flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-white" />
                <span>
                  {safetyDeleteModal.canDelete ? 'Xác Nhận Xóa Đơn Vị' : 'Cảnh Báo Dữ Liệu Ràng Buộc'}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setSafetyDeleteModal((prev) => ({ ...prev, isOpen: false }))}
                className="p-1 rounded hover:bg-white/10 text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="font-semibold text-slate-800 text-sm">
                Đơn vị:{' '}
                <span className="font-black text-slate-900">
                  {safetyDeleteModal.item.name}
                </span>{' '}
                {('code' in safetyDeleteModal.item && safetyDeleteModal.item.code) && (
                  <span className="font-mono px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-xs">
                    {(safetyDeleteModal.item as Department).code}
                  </span>
                )}
              </div>

              {safetyDeleteModal.canDelete ? (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">
                  Đơn vị này hiện không có đơn vị cấp dưới và không có nhân viên trực thuộc nào. Bạn có chắc chắn muốn xóa vĩnh viễn không? Thao tác này không thể hoàn tác.
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs space-y-1.5">
                    <div className="font-bold flex items-center gap-1.5 text-amber-800">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Không thể xóa do đang có dữ liệu liên kết:</span>
                    </div>
                    <ul className="list-disc pl-5 space-y-1 text-amber-900">
                      {safetyDeleteModal.childCount > 0 && (
                        <li>
                          Đang có <b>{safetyDeleteModal.childCount}</b> đơn vị cấp dưới trực thuộc.
                        </li>
                      )}
                      {safetyDeleteModal.empCount > 0 && (
                        <li>
                          Đang có <b>{safetyDeleteModal.empCount}</b> nhân viên đang gắn với đơn vị này.
                        </li>
                      )}
                    </ul>
                  </div>

                  <p className="text-slate-600">
                    Để đảm bảo an toàn và tính toàn vẹn của hồ sơ nhân sự, hệ thống khuyến nghị bạn nên sử dụng cơ chế <b>"Ngừng hoạt động"</b> thay vì xóa dữ liệu thực tế. Đơn vị sẽ được ẩn khỏi các bộ chọn thông thường nhưng toàn bộ dữ liệu lịch sử nhân viên vẫn được bảo lưu trọn vẹn.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSafetyDeleteModal((prev) => ({ ...prev, isOpen: false }))}
                  className="px-4 py-2 border border-slate-300 rounded-xl font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Đóng
                </button>

                {!safetyDeleteModal.canDelete && (
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleQuickDeactivate}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
                  >
                    {isSubmitting ? 'Đang xử lý...' : 'Chuyển Sang Ngừng Hoạt Động'}
                  </button>
                )}

                {safetyDeleteModal.canDelete && (
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={confirmDelete}
                    className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
                  >
                    {isSubmitting ? 'Đang xóa...' : 'Xác Nhận Xóa'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
