/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { flushSync } from 'react-dom';
import {
  LayoutDashboard,
  Users,
  Palette,
  Printer,
  History,
  Settings,
  FileSpreadsheet,
  ScanFace,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Building2,
  Menu,
  X,
  Database,
  FileText,
  ScrollText,
  Clock,
  Cake,
  AlertTriangle,
  GraduationCap,
  UserMinus,
  FileCheck,
  ShieldCheck,
} from 'lucide-react';
import { api } from './api';
import {
  ActiveTab,
  AppSettings,
  CardTemplate,
  DEFAULT_CARD_TEMPLATES,
  Department,
  Division,
  DocumentTemplate,
  Employee,
  ImportHistory,
  OFFICIAL_VIETSUN_FAVICON,
  OFFICIAL_VIETSUN_LOGO,
  ParentDepartment,
  PrintHistory,
  SAMPLE_EMPLOYEES_SEED,
  SubDepartment,
  generateDeptCode,
} from './types';
import { DashboardView } from './components/DashboardView';
import { EmployeeManagementView } from './components/EmployeeManagementView';
import { CardDesignerView } from './components/CardDesignerView';
import { BatchPrintView } from './components/BatchPrintView';
import { HistoryView } from './components/HistoryView';
import { SettingsView } from './components/SettingsView';
import { AiRulesView } from './components/AiRulesView';
import {
  ExcelImportModal,
  ParsedExcelRow,
} from './components/ExcelImportModal';
import { FaceCropStudioView } from './components/FaceCropStudioView';
import { DepartmentManagementView } from './components/DepartmentManagementView';
import { DocumentTemplateManagementView } from './components/DocumentTemplateManagementView';
import { ContractManagementView } from './components/ContractManagementView';
import { CreatedContractsView } from './components/CreatedContractsView';
import { ExpiringContractsView } from './components/ExpiringContractsView';
import { BirthdayManagementView } from './components/BirthdayManagementView';
import { ResignationManagementView } from './components/ResignationManagementView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { triggerBrowserCtrlP } from './utils/nativePrint';
import { sortEmployeesNewestFirst, sortEmployeesByMsnv, isContractTerminated } from './utils/employeeUtils';
import {
  getTabFromUrl,
  getPathForTab,
  updateDocumentTitle,
} from './utils/navigation';

const WORKSPACE_ID = 'vietsun_workspace';

function generateSafeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export default function App() {
  const [activeTab, setActiveTabState] = useState<ActiveTab>(() => getTabFromUrl());

  const setActiveTab = React.useCallback(
    (
      newTabOrUpdater: ActiveTab | ((prev: ActiveTab) => ActiveTab),
      replace = false
    ) => {
      setActiveTabState((prev) => {
        const nextTab =
          typeof newTabOrUpdater === 'function'
            ? newTabOrUpdater(prev)
            : newTabOrUpdater;

        if (
          nextTab === 'probation_contracts' ||
          nextTab === 'training_contracts' ||
          nextTab === 'created_contracts'
        ) {
          setIsContractGroupOpen(true);
        } else if (['face_crop', 'designer', 'print', 'history'].includes(nextTab)) {
          setIsCardGroupOpen(true);
        }

        const targetPath = getPathForTab(nextTab);
        try {
          if (replace) {
            window.history.replaceState({ tab: nextTab }, '', targetPath);
          } else if (window.location.pathname !== targetPath || window.location.hash) {
            window.history.pushState({ tab: nextTab }, '', targetPath);
          }
        } catch {
          // Bỏ qua lỗi history nếu môi trường chặn
        }

        updateDocumentTitle(nextTab);
        return nextTab;
      });
    },
    []
  );

  useEffect(() => {
    const initialTab = getTabFromUrl();
    updateDocumentTitle(initialTab);

    if (
      initialTab === 'probation_contracts' ||
      initialTab === 'training_contracts' ||
      initialTab === 'created_contracts'
    ) {
      setIsContractGroupOpen(true);
    } else if (['face_crop', 'designer', 'print', 'history'].includes(initialTab)) {
      setIsCardGroupOpen(true);
    }

    const currentPath = window.location.pathname;
    const canonicalPath = getPathForTab(initialTab);
    if (currentPath !== canonicalPath) {
      try {
        window.history.replaceState({ tab: initialTab }, '', canonicalPath);
      } catch {
        // Bỏ qua lỗi
      }
    }

    const handlePopState = () => {
      const currentTab = getTabFromUrl();
      setActiveTabState(currentTab);
      updateDocumentTitle(currentTab);
      if (
        currentTab === 'probation_contracts' ||
        currentTab === 'training_contracts' ||
        currentTab === 'created_contracts'
      ) {
        setIsContractGroupOpen(true);
      } else if (['face_crop', 'designer', 'print', 'history'].includes(currentTab)) {
        setIsCardGroupOpen(true);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCardGroupOpen, setIsCardGroupOpen] = useState(true);
  const [isContractGroupOpen, setIsContractGroupOpen] = useState(true);
  const [initialViewingEmployeeId, setInitialViewingEmployeeId] = useState<string | null>(null);

  // PostgreSQL synced state
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [subDepartments, setSubDepartments] = useState<SubDepartment[]>([]);
  const [parentDepartments, setParentDepartments] = useState<ParentDepartment[]>([]);
  const [documentTemplates, setDocumentTemplates] = useState<DocumentTemplate[]>([]);
  const [templates, setTemplates] = useState<CardTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [importLogs, setImportLogs] = useState<ImportHistory[]>([]);
  const [printLogs, setPrintLogs] = useState<PrintHistory[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(() => {
    try {
      const raw = localStorage.getItem('vietsun_system_settings_v1');
      if (raw) {
        return JSON.parse(raw) as AppSettings;
      }
    } catch {
      // ignore storage read error
    }
    return null;
  });

  // Selected employees for batch printing
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(
    new Set()
  );

  const hasBootstrappedRef = useRef<boolean>(false);

  // Synchronously switch to the print sheet view and open the native browser Ctrl+P dialog
  const handleOpenPrintDialog = (specificIds?: string[]) => {
    flushSync(() => {
      if (specificIds && specificIds.length > 0) {
        setSelectedEmployeeIds(new Set(specificIds));
      } else if (selectedEmployeeIds.size === 0) {
        setSelectedEmployeeIds(new Set(employees.map((e) => e.id)));
      }
      setIsImportModalOpen(false);
      setActiveTab('print');
    });
    triggerBrowserCtrlP();
  };

  // Tải dữ liệu từ Backend PostgreSQL
  const loadWorkspaceData = async () => {
    try {
      const [data, docTpls] = await Promise.all([
        api.getWorkspace(),
        api.getDocumentTemplates().catch((e) => {
          console.warn('Lỗi tải mẫu văn bản:', e);
          return [] as DocumentTemplate[];
        }),
      ]);
      const empList = (data.employees || []).sort(sortEmployeesByMsnv);
      setEmployees(empList);
      setDivisions(data.divisions || []);
      setDepartments(data.departments || []);
      setSubDepartments(data.subDepartments || []);
      setParentDepartments(data.parentDepartments || []);
      setDocumentTemplates(docTpls);
      setTemplates(data.templates || []);
      if (data.templates && data.templates.length > 0) {
        setSelectedTemplateId((prev) => {
          if (prev && data.templates.some((t: CardTemplate) => t.id === prev)) return prev;
          const def = data.templates.find((t: CardTemplate) => t.isDefault) || data.templates[0];
          return def.id;
        });
      }
      setImportLogs(data.importLogs || []);
      setPrintLogs(data.printLogs || []);
      if (data.settings) {
        setSettings(data.settings);
        try {
          localStorage.setItem(
            'vietsun_system_settings_v1',
            JSON.stringify(data.settings)
          );
        } catch {}
      }
      return;
    } catch (err) {
      console.error('Lỗi tải dữ liệu PostgreSQL:', err);
    }
  };

  const handleRefreshDocumentTemplates = async () => {
    try {
      const docTpls = await api.getDocumentTemplates();
      setDocumentTemplates(docTpls);
    } catch (err) {
      console.error('Lỗi tải lại mẫu văn bản:', err);
    }
  };



  useEffect(() => {
    document.title = 'VietSun Human Resources Management';
    void loadWorkspaceData();
  }, []);

  const handleSeedSampleEmployees = async () => {
    try {
      await api.seedSampleEmployees();
      await loadWorkspaceData();
    } catch (err) {
      console.error('Lỗi nạp nhân viên mẫu:', err);
    }
  };

  // Employee CRUD Handlers (PostgreSQL)
  const handleAddEmployee = async (
    data: Partial<Employee> & {
      msnv: string;
      fullName: string;
      department: string;
      joinDate: string;
      photoUrl?: string;
    }
  ): Promise<string> => {
    const id = generateSafeId('emp');
    const nowMs = Date.now();
    const newEmp: Employee = {
      ...data,
      id,
      msnv: data.msnv.slice(0, 50),
      fullName: data.fullName.slice(0, 120),
      department: data.department.slice(0, 120),
      joinDate: data.joinDate.slice(0, 30),
      photoUrl: (data.photoUrl || '').slice(0, 500000),
      printCount: 0,
      lastPrintedAt: '',
      ownerId: WORKSPACE_ID,
      createdAt: nowMs,
      updatedAt: nowMs,
    };
    flushSync(() => {
      setEmployees((prev) => {
        const next = [newEmp, ...prev];
        next.sort(sortEmployeesByMsnv);
        return next;
      });
    });
    try {
      const saved = await api.saveEmployee(newEmp);
      setEmployees((prev) =>
        prev.map((e) => (e.id === id ? { ...e, ...saved } : e))
      );
    } catch (err) {
      console.error('Lỗi thêm nhân viên PostgreSQL:', err);
    }
    return id;
  };

  const handleUpdateEmployee = async (
    id: string,
    data: Partial<Employee>
  ) => {
    const updatedFields: Partial<Employee> = {
      ...data,
      ...(data.msnv ? { msnv: data.msnv.slice(0, 50) } : {}),
      ...(data.fullName ? { fullName: data.fullName.slice(0, 120) } : {}),
      ...(data.department ? { department: data.department.slice(0, 120) } : {}),
      ...(data.joinDate ? { joinDate: data.joinDate.slice(0, 30) } : {}),
      ...(data.photoUrl !== undefined ? { photoUrl: (data.photoUrl || '').slice(0, 500000) } : {}),
    };
    setEmployees((prev) => {
      const next = prev.map((emp) =>
        emp.id === id ? { ...emp, ...updatedFields } : emp
      );
      next.sort(sortEmployeesByMsnv);
      return next;
    });
    try {
      await api.updateEmployee(id, updatedFields);
    } catch (err) {
      console.error('Lỗi cập nhật nhân viên PostgreSQL:', err);
    }
  };

  const handleBatchUpdateEmployees = (updatedList: Employee[]) => {
    if (!updatedList || updatedList.length === 0) return;
    const map = new Map(updatedList.map((e) => [e.id, e]));
    setEmployees((prev) => {
      const next = prev.map((emp) => (map.has(emp.id) ? { ...emp, ...map.get(emp.id)! } : emp));
      next.sort(sortEmployeesByMsnv);
      return next;
    });
  };

  const handleDeleteEmployee = async (id: string) => {
    setEmployees((prev) => prev.filter((emp) => emp.id !== id));
    setSelectedEmployeeIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    try {
      await api.deleteEmployee(id);
    } catch (err) {
      console.error('Lỗi xóa nhân viên PostgreSQL:', err);
    }
  };

  const handleBatchDeleteEmployees = async (ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    setEmployees((prev) => prev.filter((emp) => !idSet.has(emp.id)));
    setSelectedEmployeeIds(new Set());
    try {
      await api.batchDeleteEmployees(ids);
    } catch (err) {
      console.error('Lỗi xóa nhiều nhân viên PostgreSQL:', err);
    }
  };

  // ===========================================================================
  // CẤP 1: KHỐI (DIVISIONS - PostgreSQL)
  // ===========================================================================
  const handleAddDivision = async (data: Partial<Division>): Promise<Division> => {
    const saved = await api.saveDivision(data);
    setDivisions((prev) => [...prev, saved]);
    return saved;
  };

  const handleUpdateDivision = async (
    id: string,
    updates: Partial<Division> & { oldName?: string }
  ): Promise<void> => {
    const saved = await api.updateDivision(id, updates);
    setDivisions((prev) => prev.map((d) => (d.id === id ? { ...d, ...saved } : d)));

    if (updates.name && updates.oldName && updates.name !== updates.oldName) {
      setDepartments((prev) =>
        prev.map((d) => (d.divisionId === id ? { ...d, divisionName: updates.name } : d))
      );
      setSubDepartments((prev) =>
        prev.map((s) => (s.divisionId === id ? { ...s, divisionName: updates.name } : s))
      );
      setEmployees((prev) =>
        prev.map((e) =>
          e.divisionId === id || e.khoi === updates.oldName
            ? { ...e, khoi: updates.name }
            : e
        )
      );
    }
  };

  const handleDeleteDivision = async (id: string): Promise<void> => {
    await api.deleteDivision(id);
    setDivisions((prev) => prev.filter((d) => d.id !== id));
  };

  // ===========================================================================
  // CẤP 2: PHÒNG BAN (DEPARTMENTS - CÓ KÝ HIỆU PB - PostgreSQL)
  // ===========================================================================
  const handleAddDepartment = async (data: string | Partial<Department>): Promise<Department> => {
    const payload = typeof data === 'string' ? { name: data } : data;
    const saved = await api.saveDepartment(payload);
    setDepartments((prev) => [...prev, saved]);
    return saved;
  };

  const handleUpdateDepartment = async (
    id: string,
    updates: string | (Partial<Department> & { oldName?: string; oldCode?: string })
  ): Promise<void> => {
    const payload = typeof updates === 'string' ? { name: updates } : updates;
    const saved = await api.updateDepartment(id, payload);
    setDepartments((prev) => prev.map((d) => (d.id === id ? { ...d, ...saved } : d)));

    if (payload.name && payload.oldName && payload.name !== payload.oldName) {
      setSubDepartments((prev) =>
        prev.map((s) => (s.departmentId === id ? { ...s, departmentName: payload.name } : s))
      );
      setEmployees((prev) =>
        prev.map((e) =>
          e.departmentId === id || e.phongBan === payload.oldName
            ? { ...e, phongBan: payload.name, kyHieuPb: payload.code || e.kyHieuPb }
            : e
        )
      );
    } else if (payload.code && payload.oldCode && payload.code !== payload.oldCode) {
      setEmployees((prev) =>
        prev.map((e) =>
          e.departmentId === id || e.kyHieuPb === payload.oldCode
            ? { ...e, kyHieuPb: payload.code }
            : e
        )
      );
    }
  };

  const handleDeleteDepartment = async (id: string): Promise<void> => {
    await api.deleteDepartment(id);
    setDepartments((prev) => prev.filter((d) => d.id !== id));
  };

  // ===========================================================================
  // CẤP 3: PHÒNG BAN CON (SUB-DEPARTMENTS - PostgreSQL)
  // ===========================================================================
  const handleAddSubDepartment = async (data: Partial<SubDepartment>): Promise<SubDepartment> => {
    const saved = await api.saveSubDepartment(data);
    setSubDepartments((prev) => [...prev, saved]);
    return saved;
  };

  const handleUpdateSubDepartment = async (
    id: string,
    updates: Partial<SubDepartment> & { oldName?: string }
  ): Promise<void> => {
    const saved = await api.updateSubDepartment(id, updates);
    setSubDepartments((prev) => prev.map((s) => (s.id === id ? { ...s, ...saved } : s)));

    if (updates.name && updates.oldName && updates.name !== updates.oldName) {
      setEmployees((prev) =>
        prev.map((e) =>
          e.subDepartmentId === id || e.phongBanCon === updates.oldName || e.boPhan === updates.oldName
            ? { ...e, phongBanCon: updates.name, boPhan: updates.name }
            : e
        )
      );
    }
  };

  const handleDeleteSubDepartment = async (id: string): Promise<void> => {
    await api.deleteSubDepartment(id);
    setSubDepartments((prev) => prev.filter((s) => s.id !== id));
  };

  // Legacy Parent Departments (Tương thích ngược)
  const handleAddParentDepartment = async (rawName: string): Promise<ParentDepartment> => {
    const cleanName = rawName.trim().slice(0, 120);
    const id = generateSafeId('parent_dept');
    const newParentDept: ParentDepartment = {
      id,
      name: cleanName,
      ownerId: WORKSPACE_ID,
      orderIndex: parentDepartments.length + 1,
    };
    setParentDepartments((prev) => [...prev, newParentDept]);
    try {
      const saved = await api.saveParentDepartment(newParentDept);
      return saved;
    } catch (err) {
      console.error('Lỗi thêm phòng ban cha PostgreSQL:', err);
    }
    return newParentDept;
  };

  const handleUpdateParentDepartment = async (
    id: string,
    newRawName: string
  ): Promise<void> => {
    const cleanName = newRawName.trim().slice(0, 120);
    if (!cleanName) return;
    const oldDept = parentDepartments.find((d) => d.id === id);
    const oldName = oldDept?.name;

    setParentDepartments((prev) =>
      prev.map((d) => (d.id === id ? { ...d, name: cleanName } : d))
    );

    try {
      await api.updateParentDepartment(id, cleanName, oldName);
    } catch (err) {
      console.error('Lỗi cập nhật phòng ban cha PostgreSQL:', err);
    }
  };

  const handleDeleteParentDepartment = async (id: string): Promise<void> => {
    setParentDepartments((prev) => prev.filter((d) => d.id !== id));
    try {
      await api.deleteParentDepartment(id);
    } catch (err) {
      console.error('Lỗi xóa phòng ban cha PostgreSQL:', err);
    }
  };

  const handleDeleteAllParentDepartments = async (): Promise<void> => {
    setParentDepartments([]);
    try {
      await api.deleteAllParentDepartments();
    } catch (err) {
      console.error('Lỗi xóa tất cả phòng ban cha PostgreSQL:', err);
    }
  };

  const handleReorderParentDepartments = async (
    newOrdered: ParentDepartment[]
  ): Promise<void> => {
    setParentDepartments(newOrdered);
  };

  const handleDeleteAllDepartments = async (): Promise<void> => {
    setDepartments([]);
    try {
      await api.deleteAllDepartments();
    } catch (err) {
      console.error('Lỗi xóa tất cả phòng ban PostgreSQL:', err);
    }
  };

  const handleReorderDepartments = async (
    newOrderedDepartments: Department[]
  ): Promise<void> => {
    setDepartments(newOrderedDepartments);
    try {
      const orders = newOrderedDepartments.map((d, index) => ({
        id: d.id,
        orderIndex: d.orderIndex ?? (index + 1),
      }));
      await api.reorderDepartments(orders);
    } catch (err) {
      console.error('Lỗi lưu thứ tự bộ phận:', err);
    }
  };

  // Excel Batch Import Handler (PostgreSQL)
  const handleConfirmExcelImport = async (
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
    triggerPrintImmediately = false
  ): Promise<string[]> => {
    const importedIds: string[] = [];
    const preparedRows = rowsToImport.map((row) => {
      const resolvedId =
        row.status === 'valid_update' && row.existingEmployeeId
          ? row.existingEmployeeId
          : generateSafeId('emp');
      importedIds.push(resolvedId);
      return {
        ...row,
        resolvedId,
      };
    });

    const logId = generateSafeId('imp');
    const newImportLog: ImportHistory = {
      id: logId,
      fileName: (fileName || 'DanhSach.xlsx').slice(0, 200),
      importMode,
      totalRows: stats.totalRows,
      validCount: stats.validCount,
      errorCount: stats.errorCount,
      importedCount: stats.importedCount,
      updatedCount: stats.updatedCount,
      summaryNote: `Thêm mới ${stats.importedCount} NV, cập nhật ${stats.updatedCount} NV, bỏ qua ${stats.errorCount} dòng lỗi`,
      ownerId: WORKSPACE_ID,
      createdAt: new Date().toISOString(),
    };

    // Tạo các phòng ban mới nếu có trong Excel
    const existingDeptNamesLower = new Set(
      departments.map((d) => d.name.trim().toLowerCase())
    );
    const newDeptsToCreate: Department[] = [];
    preparedRows.forEach((row) => {
      // Ưu tiên đúng cột PHÒNG BAN (Cấp 2), không lấy tên Phòng ban con
      const deptClean = (row.phongBan || row.department || row.boPhan || '').trim().slice(0, 120);
      if (
        deptClean &&
        !existingDeptNamesLower.has(deptClean.toLowerCase())
      ) {
        existingDeptNamesLower.add(deptClean.toLowerCase());
        newDeptsToCreate.push({
          id: generateSafeId('dept'),
          name: deptClean,
          code: (row.kyHieuPb || '').trim() || generateDeptCode(deptClean),
          ownerId: WORKSPACE_ID,
          createdAt: Date.now(),
        });
      }
    });

    const employeesToUpsert: Partial<Employee>[] = preparedRows.map((row) => ({
      ...row,
      id: row.resolvedId,
      msnv: row.msnv.slice(0, 50),
      fullName: row.fullName.slice(0, 120),
      khoi: (row.khoi || '').trim(),
      kyHieuPb: (row.kyHieuPb || '').trim(),
      phongBan: (row.phongBan || '').trim(),
      phongBanCon: (row.phongBanCon || row.department || '').trim(),
      department: (row.phongBanCon || row.phongBan || 'Chưa phân loại').slice(0, 120),
      joinDate: (row.joinDate || row.ngayVao || new Date().toLocaleDateString('vi-VN')).slice(0, 30),
      photoUrl: (row.photoUrl || '').slice(0, 500000),
      printCount: 0,
      lastPrintedAt: '',
      ownerId: WORKSPACE_ID,
    }));

    if (importedIds.length > 0) {
      flushSync(() => {
        setSelectedEmployeeIds(new Set(importedIds));
        if (triggerPrintImmediately) {
          setIsImportModalOpen(false);
          setActiveTab('print');
        }
      });
      if (triggerPrintImmediately) {
        triggerBrowserCtrlP();
      }
    }

    try {
      for (const dept of newDeptsToCreate) {
        try {
          await api.saveDepartment(dept);
        } catch (deptErr) {
          console.warn('Cảnh báo tạo phòng ban phụ:', deptErr);
        }
      }
      await api.batchUpsertEmployees(employeesToUpsert, importMode);
      await api.saveImportLog(newImportLog);
      await loadWorkspaceData();
    } catch (err: any) {
      console.error('Lỗi import Excel PostgreSQL:', err);
      alert('Lỗi lưu dữ liệu import vào hệ thống: ' + (err?.message || 'Vui lòng kiểm tra lại kết nối'));
      throw err;
    }
    return importedIds;
  };

  // Template Save / Delete Handlers (PostgreSQL)
  const handleSaveTemplate = async (template: CardTemplate, asNew: boolean) => {
    const id = asNew ? generateSafeId('tpl') : template.id;
    const cleanTemplate: CardTemplate = {
      ...template,
      id,
      ownerId: WORKSPACE_ID,
    };

    if (asNew) {
      setTemplates((prev) => [...prev, cleanTemplate]);
      setSelectedTemplateId(id);
    } else {
      setTemplates((prev) =>
        prev.map((t) => (t.id === id ? cleanTemplate : t))
      );
    }

    try {
      await api.saveTemplate(cleanTemplate);
      await loadWorkspaceData();
    } catch (err) {
      console.error('Lỗi lưu mẫu thẻ PostgreSQL:', err);
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (templates.length <= 1) return;
    setTemplates((prev) => {
      const remaining = prev.filter((t) => t.id !== templateId);
      if (selectedTemplateId === templateId && remaining.length > 0) {
        setSelectedTemplateId(remaining[0].id);
      }
      return remaining;
    });
    try {
      await api.deleteTemplate(templateId);
    } catch (err) {
      console.error('Lỗi xóa mẫu thẻ PostgreSQL:', err);
    }
  };

  // Record Print Job & Increment Employee Print Counts (PostgreSQL)
  const handleRecordPrintJob = async (
    printedEmployees: Employee[],
    printMode: 'a4_grid' | 'cr80_direct' | 'pdf_export',
    templateName: string,
    totalPages: number,
    paperSize: string,
    duplex: boolean
  ) => {
    if (printedEmployees.length === 0) return;
    const todayStr = new Date().toLocaleDateString('vi-VN');
    const summary = printedEmployees
      .map((e) => `${e.msnv} - ${e.fullName}`)
      .join(', ')
      .slice(0, 1950);
    const logId = generateSafeId('prt');
    const printedIdSet = new Set(printedEmployees.map((e) => e.id));

    setEmployees((prev) =>
      prev.map((emp) =>
        printedIdSet.has(emp.id)
          ? {
              ...emp,
              printCount: (emp.printCount || 0) + 1,
              lastPrintedAt: todayStr,
            }
          : emp
      )
    );
    const newLog: PrintHistory = {
      id: logId,
      printMode,
      templateName: templateName.slice(0, 100),
      totalCards: printedEmployees.length,
      totalPages: Math.max(1, totalPages),
      paperSize: paperSize.slice(0, 30),
      duplex: Boolean(duplex),
      employeeSummary: summary,
      ownerId: WORKSPACE_ID,
      createdAt: new Date().toISOString(),
    };
    setPrintLogs((prev) => [newLog, ...prev]);

    try {
      await api.batchPrintEmployees(printedEmployees.map((e) => e.id));
      await api.savePrintLog(newLog);
    } catch (err) {
      console.error('Lỗi lưu nhật ký in PostgreSQL:', err);
    }
  };

  // Clear All History (PostgreSQL)
  const handleClearAllHistory = async () => {
    setImportLogs([]);
    setPrintLogs([]);
    setEmployees((prev) =>
      prev.map((emp) => ({
        ...emp,
        printCount: 0,
        lastPrintedAt: '',
      }))
    );

    try {
      await api.clearAllHistory();
    } catch (err) {
      console.error('Lỗi xóa lịch sử PostgreSQL:', err);
    }
  };

  // Save System Settings (PostgreSQL)
  const handleSaveSettings = async (updated: AppSettings) => {
    const docId =
      updated.id && updated.id !== 'default-settings'
        ? updated.id
        : 'settings_vietsun_default';
    const nextSettings: AppSettings = {
      ...updated,
      id: docId,
      ownerId: WORKSPACE_ID,
    };
    setSettings(nextSettings);
    try {
      localStorage.setItem(
        'vietsun_system_settings_v1',
        JSON.stringify(nextSettings)
      );
    } catch {}
    try {
      await api.saveSettings(nextSettings);
    } catch (err) {
      console.error('Lỗi lưu cài đặt PostgreSQL:', err);
    }
  };

  const activeTemplate: CardTemplate =
    templates.find((t) => t.id === selectedTemplateId) ||
    templates[0] || {
      id: 'default-fallback',
      ownerId: WORKSPACE_ID,
      ...DEFAULT_CARD_TEMPLATES[0],
    };

  const activeSettings: AppSettings = settings || {
    id: 'settings_vietsun_main',
    companyName: 'CHI NHÁNH CÔNG TY CỔ PHẦN',
    companyBranch: 'VIETSUN ĐỒNG NAI',
    companySubName: 'ĐẦU TƯ MẶT TRỜI VIỆT',
    logoUrl: OFFICIAL_VIETSUN_LOGO,
    defaultPaperSize: 'A4',
    defaultCols: 2,
    defaultRows: 4,
    defaultGapMm: 4,
    defaultMarginMm: 10,
    cardWidthMm: 85.6,
    cardHeightMm: 54,
    ownerId: WORKSPACE_ID,
  };

  const isContractGroupActive =
    activeTab === 'probation_contracts' ||
    activeTab === 'training_contracts' ||
    activeTab === 'created_contracts';

  const hdtvEmployeesCount = useMemo(() => {
    return employees.filter((e) => {
      if (isContractTerminated(e)) return false;
      const loai = (e.loaiHd || '').trim().toUpperCase();
      return loai === 'HĐTV' || loai.includes('THỬ VIỆC') || loai.includes('THU VIEC');
    }).length;
  }, [employees]);

  const hddtEmployeesCount = useMemo(() => {
    return employees.filter((e) => {
      if (isContractTerminated(e)) return false;
      const loai = (e.loaiHd || '').trim().toUpperCase();
      return loai === 'HĐĐT' || loai === 'HDDT' || loai.includes('ĐÀO TẠO') || loai.includes('DAO TAO');
    }).length;
  }, [employees]);

  // Đếm số lượng hợp đồng cần xử lý (quá hạn hoặc đến hạn trong 30 ngày) - Bỏ qua nhân viên đã nghỉ việc / chấm dứt HĐ
  const expiringContractsCount = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let count = 0;
    for (const emp of employees) {
      if (isContractTerminated(emp)) continue;
      const denNgayStr = (emp.denNgay || '').trim();
      if (!denNgayStr) continue;

      let expiry: Date | null = null;
      const dmyMatch = denNgayStr.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
      if (dmyMatch) {
        expiry = new Date(parseInt(dmyMatch[3], 10), parseInt(dmyMatch[2], 10) - 1, parseInt(dmyMatch[1], 10));
      } else {
        const ymdMatch = denNgayStr.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
        if (ymdMatch) {
          expiry = new Date(parseInt(ymdMatch[1], 10), parseInt(ymdMatch[2], 10) - 1, parseInt(ymdMatch[3], 10));
        } else if (/^\d{5}$/.test(denNgayStr)) {
          const serial = parseInt(denNgayStr, 10);
          expiry = new Date(new Date(1899, 11, 30).getTime() + serial * 86400000);
        }
      }

      if (!expiry || isNaN(expiry.getTime())) continue;
      expiry.setHours(0, 0, 0, 0);
      const diffDays = Math.round((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays <= 30) {
        count++;
      }
    }
    return count;
  }, [employees]);

  // Đếm số lượng sinh nhật trong tháng hiện tại (chỉ tính nhân sự đang làm việc)
  const thisMonthBirthdayCount = useMemo(() => {
    const currentMonth = new Date().getMonth() + 1;
    let count = 0;
    for (const emp of employees) {
      if (isContractTerminated(emp)) continue;
      const bStr = (emp.ngaySinh || '').trim();
      if (!bStr) continue;
      const dmyMatch = bStr.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
      if (dmyMatch) {
        if (parseInt(dmyMatch[2], 10) === currentMonth) count++;
      } else {
        const ymdMatch = bStr.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
        if (ymdMatch && parseInt(ymdMatch[2], 10) === currentMonth) count++;
      }
    }
    return count;
  }, [employees]);

  const contractSubItems = [
    {
      id: 'probation_contracts' as const,
      label: 'Hợp đồng thử việc',
      icon: Clock,
      badge: hdtvEmployeesCount > 0 ? `${hdtvEmployeesCount}` : undefined,
    },
    {
      id: 'training_contracts' as const,
      label: 'Hợp đồng đào tạo',
      icon: GraduationCap,
      badge: hddtEmployeesCount > 0 ? `${hddtEmployeesCount}` : undefined,
    },
    {
      id: 'created_contracts' as const,
      label: 'Hợp đồng đã tạo',
      icon: FileCheck,
    },
  ];

  const isCardGroupActive = [
    'face_crop',
    'designer',
    'print',
    'history',
  ].includes(activeTab);

  const cardSubItems = [
    {
      id: 'face_crop' as const,
      label: 'Cắt ảnh 3×4',
      icon: ScanFace,
    },
    {
      id: 'designer' as const,
      label: 'Thiết kế mẫu thẻ',
      icon: Palette,
      badge: templates.length > 0 ? templates.length : undefined,
    },
    {
      id: 'print' as const,
      label: 'In thẻ',
      icon: Printer,
      badge:
        selectedEmployeeIds.size > 0
          ? `${selectedEmployeeIds.size}`
          : undefined,
    },
    {
      id: 'history' as const,
      label: 'Lịch sử in & import',
      icon: History,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white print:min-h-0 flex print:block">
      {/* Mobile Top Header (Chỉ hiện trên điện thoại / màn hình nhỏ) */}
      <div className="no-print md:hidden fixed top-0 left-0 right-0 h-14 bg-white border-b border-slate-200 z-40 px-4 flex items-center justify-between shadow-xs">
        <div
          onClick={() => {
            setActiveTab('dashboard');
            setIsMobileMenuOpen(false);
          }}
          className="flex items-center gap-2.5 cursor-pointer"
          title="VietSun Human Resources Management"
        >
          <img
            src={OFFICIAL_VIETSUN_FAVICON}
            alt="VietSun Icon"
            className="w-7 h-7 object-contain shrink-0"
          />
          <img
            src={OFFICIAL_VIETSUN_LOGO}
            alt="VietSun Logo"
            className="h-7 max-w-[150px] object-contain"
          />
        </div>
        <button
          type="button"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer"
          aria-label="Toggle menu"
        >
          {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Backdrop for mobile */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden no-print"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Menu Header chuyển sang Sidebar bên trái */}
      <aside
        className={`no-print fixed md:sticky top-0 left-0 h-screen z-50 md:z-30 bg-white border-r border-slate-200 flex flex-col justify-between shrink-0 shadow-xs transition-all duration-200 ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        } ${isSidebarCollapsed ? 'w-20' : 'w-64'}`}
      >
        <div className="flex flex-col flex-1 overflow-y-auto">
          {/* Logo, Thương hiệu & Nút thu gọn */}
          <div className="p-3 border-b border-slate-100 flex items-center justify-between gap-1.5 min-h-16 shrink-0">
            <div
              onClick={() => {
                setActiveTab('dashboard');
                setIsMobileMenuOpen(false);
              }}
              className={`flex items-center cursor-pointer flex-1 min-w-0 ${
                isSidebarCollapsed ? 'justify-center' : 'justify-center gap-2.5'
              }`}
              title="VietSun Human Resources Management"
            >
              <img
                src={OFFICIAL_VIETSUN_FAVICON}
                alt="VietSun Round Icon"
                referrerPolicy="no-referrer"
                className="w-8 h-8 object-contain shrink-0"
              />
              {!isSidebarCollapsed && (
                <img
                  src={OFFICIAL_VIETSUN_LOGO}
                  alt="VietSun Logo"
                  referrerPolicy="no-referrer"
                  className="h-8 max-w-[140px] object-contain"
                />
              )}
            </div>
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="hidden md:flex p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg shrink-0 cursor-pointer transition-colors"
              title={isSidebarCollapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
            >
              {isSidebarCollapsed ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronLeft className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Danh sách các mục Menu */}
          <nav className="px-2.5 py-3 space-y-1.5 flex-1">
            {/* 1. Dashboard */}
            <button
              type="button"
              onClick={() => {
                setActiveTab('dashboard');
                setIsMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-semibold rounded-xl cursor-pointer transition-all ${
                isSidebarCollapsed ? 'justify-center px-0' : ''
              } ${
                activeTab === 'dashboard'
                  ? 'bg-blue-700 text-white shadow-xs font-bold'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
              title="Dashboard"
            >
              <LayoutDashboard
                className={`w-4 h-4 shrink-0 ${
                  activeTab === 'dashboard' ? 'text-white' : 'text-slate-500'
                }`}
              />
              {!isSidebarCollapsed && (
                <span className="truncate flex-1 text-left font-medium">Dashboard</span>
              )}
            </button>

            {/* 2. Quản lý nhân viên (Mục riêng) */}
            <button
              type="button"
              onClick={() => {
                setActiveTab('employees');
                setIsMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-semibold rounded-xl cursor-pointer transition-all ${
                isSidebarCollapsed ? 'justify-center px-0' : ''
              } ${
                activeTab === 'employees'
                  ? 'bg-blue-700 text-white shadow-xs font-bold'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
              title="Quản lý nhân viên"
            >
              <Users
                className={`w-4 h-4 shrink-0 ${
                  activeTab === 'employees' ? 'text-white' : 'text-slate-500'
                }`}
              />
              {!isSidebarCollapsed && (
                <>
                  <span className="truncate flex-1 text-left font-medium">
                    Quản lý nhân viên
                  </span>
                  {employees.length > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold shrink-0 ${
                        activeTab === 'employees'
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {employees.length}
                    </span>
                  )}
                </>
              )}
            </button>

            {/* 3. Quản lý phòng ban & bộ phận (Trang trực tiếp) */}
            <button
              type="button"
              onClick={() => {
                setActiveTab('departments');
                setIsMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-semibold rounded-xl cursor-pointer transition-all ${
                isSidebarCollapsed ? 'justify-center px-0' : ''
              } ${
                activeTab === 'departments'
                  ? 'bg-blue-700 text-white shadow-xs font-bold'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
              title="Quản lý phòng ban & bộ phận"
            >
              <Building2
                className={`w-4 h-4 shrink-0 ${
                  activeTab === 'departments' ? 'text-white' : 'text-slate-500'
                }`}
              />
              {!isSidebarCollapsed && (
                <>
                  <span className="truncate flex-1 text-left font-medium">
                    Phòng ban & Bộ phận
                  </span>
                  {divisions.length > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold shrink-0 ${
                        activeTab === 'departments'
                          ? 'bg-white/20 text-white'
                          : 'bg-blue-50 text-blue-700'
                      }`}
                      title={`${divisions.length} Khối, ${departments.length} Phòng ban, ${subDepartments.length} Phòng ban con`}
                    >
                      {divisions.length} Khối • {departments.length} PB
                    </span>
                  )}
                </>
              )}
            </button>

            {/* 3.1. Hết hạn hợp đồng */}
            <button
              type="button"
              onClick={() => {
                setActiveTab('expiring_contracts');
                setIsMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-semibold rounded-xl cursor-pointer transition-all ${
                isSidebarCollapsed ? 'justify-center px-0' : ''
              } ${
                activeTab === 'expiring_contracts'
                  ? 'bg-blue-700 text-white shadow-xs font-bold'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
              title="Danh sách hợp đồng sắp hết hạn"
            >
              <ScrollText
                className={`w-4 h-4 shrink-0 ${
                  activeTab === 'expiring_contracts' ? 'text-white' : 'text-slate-500'
                }`}
              />
              {!isSidebarCollapsed && (
                <>
                  <span className="truncate flex-1 text-left font-medium">
                    Hết hạn hợp đồng
                  </span>
                  {expiringContractsCount > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold shrink-0 ${
                        activeTab === 'expiring_contracts'
                          ? 'bg-white/20 text-white'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {expiringContractsCount} HĐ
                    </span>
                  )}
                </>
              )}
            </button>

            {/* 3.2. Sinh nhật nhân sự */}
            <button
              type="button"
              onClick={() => {
                setActiveTab('birthdays');
                setIsMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-semibold rounded-xl cursor-pointer transition-all ${
                isSidebarCollapsed ? 'justify-center px-0' : ''
              } ${
                activeTab === 'birthdays'
                  ? 'bg-blue-700 text-white shadow-xs font-bold'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
              title="Sinh nhật nhân sự"
            >
              <Cake
                className={`w-4 h-4 shrink-0 ${
                  activeTab === 'birthdays' ? 'text-white' : 'text-slate-500'
                }`}
              />
              {!isSidebarCollapsed && (
                <>
                  <span className="truncate flex-1 text-left font-medium">
                    Sinh nhật nhân sự
                  </span>
                  {thisMonthBirthdayCount > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold shrink-0 ${
                        activeTab === 'birthdays'
                          ? 'bg-white/20 text-white'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {thisMonthBirthdayCount} SN
                    </span>
                  )}
                </>
              )}
            </button>

            {/* 3.1. Mục lớn: Hợp đồng (Bao gồm Hợp đồng thử việc HĐTV) */}
            {!isSidebarCollapsed ? (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsContractGroupOpen(!isContractGroupOpen);
                    if (!isContractGroupActive) {
                      setActiveTab('probation_contracts');
                    }
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-bold rounded-xl cursor-pointer transition-all ${
                    isContractGroupActive
                      ? 'text-blue-900 bg-blue-50/80 border border-blue-200/60 shadow-2xs'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                  title="Quản lý hợp đồng lao động"
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <ScrollText
                      className={`w-4 h-4 shrink-0 ${
                        isContractGroupActive ? 'text-blue-700' : 'text-slate-500'
                      }`}
                    />
                    <span className="truncate uppercase tracking-wide text-[11px]">
                      Hợp đồng
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isContractGroupOpen ? (
                      <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </div>
                </button>

                {/* Các mục con bên trong Hợp đồng */}
                {isContractGroupOpen && (
                  <div className="mt-1 ml-3.5 pl-3 border-l-2 border-slate-200 space-y-1 py-1">
                    {contractSubItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setActiveTab(item.id);
                            setIsMobileMenuOpen(false);
                          }}
                          className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-semibold rounded-lg cursor-pointer transition-all ${
                            isActive
                              ? 'bg-blue-700 text-white shadow-xs font-bold'
                              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                          }`}
                          title={item.label}
                        >
                          <Icon
                            className={`w-4 h-4 shrink-0 ${
                              isActive ? 'text-white' : 'text-slate-500'
                            }`}
                          />
                          <span className="truncate flex-1 text-left font-medium">
                            {item.label}
                          </span>
                          {item.badge !== undefined && (
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold shrink-0 ${
                                isActive
                                  ? 'bg-white/20 text-white'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {item.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              /* Dạng thu nhỏ (Icon only) */
              <div className="pt-2 border-t border-slate-100 my-1 space-y-1">
                {contractSubItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(item.id);
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-center py-2.5 text-xs font-semibold rounded-xl cursor-pointer transition-all ${
                        isActive
                          ? 'bg-blue-700 text-white shadow-xs font-bold'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                      title={`Hợp đồng: ${item.label}`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}

            {/* 3.3. Mục lớn: Danh sách nhân viên nghỉ việc */}
            <button
              type="button"
              onClick={() => {
                setActiveTab('resignation');
                setIsMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-semibold rounded-xl cursor-pointer transition-all ${
                isSidebarCollapsed ? 'justify-center px-0' : ''
              } ${
                activeTab === 'resignation'
                  ? 'bg-blue-700 text-white shadow-xs font-bold'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
              title="Danh sách nhân viên nghỉ việc"
            >
              <UserMinus
                className={`w-4 h-4 shrink-0 ${
                  activeTab === 'resignation' ? 'text-white' : 'text-slate-500'
                }`}
              />
              {!isSidebarCollapsed && (
                <>
                  <span className="truncate flex-1 text-left font-medium">
                    Nhân viên nghỉ việc
                  </span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold shrink-0 ${
                      activeTab === 'resignation'
                        ? 'bg-white/20 text-white'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    Nghỉ việc
                  </span>
                </>
              )}
            </button>

            {/* 4. Quản lý mẫu văn bản & hợp đồng */}
            <button
              type="button"
              onClick={() => {
                setActiveTab('document_templates');
                setIsMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-semibold rounded-xl cursor-pointer transition-all ${
                isSidebarCollapsed ? 'justify-center px-0' : ''
              } ${
                activeTab === 'document_templates'
                  ? 'bg-blue-700 text-white shadow-xs font-bold'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
              title="Quản lý mẫu văn bản"
            >
              <FileText
                className={`w-4 h-4 shrink-0 ${
                  activeTab === 'document_templates' ? 'text-white' : 'text-slate-500'
                }`}
              />
              {!isSidebarCollapsed && (
                <>
                  <span className="truncate flex-1 text-left font-medium">
                    Mẫu văn bản
                  </span>
                  {documentTemplates.length > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold shrink-0 ${
                        activeTab === 'document_templates'
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {documentTemplates.length}
                    </span>
                  )}
                </>
              )}
            </button>

            {/* 3. Mục lớn: Quản Lý & In Thẻ NV */}
            {!isSidebarCollapsed ? (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setIsCardGroupOpen(!isCardGroupOpen)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-bold rounded-xl cursor-pointer transition-all ${
                    isCardGroupActive
                      ? 'text-blue-900 bg-blue-50/80 border border-blue-200/60 shadow-2xs'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                  title="Quản Lý & In Thẻ NV"
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <CreditCard
                      className={`w-4 h-4 shrink-0 ${
                        isCardGroupActive ? 'text-blue-700' : 'text-slate-500'
                      }`}
                    />
                    <span className="truncate uppercase tracking-wide text-[11px]">
                      Quản Lý &amp; In Thẻ NV
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {selectedEmployeeIds.size > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-blue-600 text-white">
                        {selectedEmployeeIds.size}
                      </span>
                    )}
                    {isCardGroupOpen ? (
                      <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </div>
                </button>

                {/* Các mục con bên trong Quản Lý & In Thẻ NV */}
                {isCardGroupOpen && (
                  <div className="mt-1 ml-3.5 pl-3 border-l-2 border-slate-200 space-y-1 py-1">
                    {cardSubItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setActiveTab(item.id);
                            setIsMobileMenuOpen(false);
                          }}
                          className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-semibold rounded-lg cursor-pointer transition-all ${
                            isActive
                              ? 'bg-blue-700 text-white shadow-xs font-bold'
                              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                          }`}
                          title={item.label}
                        >
                          <Icon
                            className={`w-4 h-4 shrink-0 ${
                              isActive ? 'text-white' : 'text-slate-500'
                            }`}
                          />
                          <span className="truncate flex-1 text-left font-medium">
                            {item.label}
                          </span>
                          {item.badge !== undefined && (
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold shrink-0 ${
                                isActive
                                  ? 'bg-white/20 text-white'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {item.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              /* Dạng thu nhỏ (Icon only) */
              <div className="pt-2 border-t border-slate-100 my-1 space-y-1">
                {cardSubItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(item.id);
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-center py-2.5 text-xs font-semibold rounded-xl cursor-pointer transition-all ${
                        isActive
                          ? 'bg-blue-700 text-white shadow-xs font-bold'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                      title={`Quản Lý & In Thẻ NV: ${item.label}`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}

            {/* 4. Cài đặt hệ thống */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('settings');
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-semibold rounded-xl cursor-pointer transition-all ${
                  isSidebarCollapsed ? 'justify-center px-0' : ''
                } ${
                  activeTab === 'settings'
                    ? 'bg-blue-700 text-white shadow-xs font-bold'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
                title="Cài đặt hệ thống"
              >
                <Settings
                  className={`w-4 h-4 shrink-0 ${
                    activeTab === 'settings' ? 'text-white' : 'text-slate-500'
                  }`}
                />
                {!isSidebarCollapsed && (
                  <span className="truncate flex-1 text-left font-medium">Cài đặt hệ thống</span>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('ai_rules');
                  setIsMobileMenuOpen(false);
                }}
                className={`mt-1 w-full flex items-center gap-3 px-3 py-2.5 text-xs font-semibold rounded-xl cursor-pointer transition-all ${
                  isSidebarCollapsed ? 'justify-center px-0' : ''
                } ${
                  activeTab === 'ai_rules'
                    ? 'bg-blue-700 text-white shadow-xs font-bold'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
                title="Quy tắc AI Code"
              >
                <ShieldCheck
                  className={`w-4 h-4 shrink-0 ${
                    activeTab === 'ai_rules' ? 'text-white' : 'text-slate-500'
                  }`}
                />
                {!isSidebarCollapsed && (
                  <span className="truncate flex-1 text-left font-medium">Quy tắc AI Code</span>
                )}
              </button>
            </div>
          </nav>
        </div>

        {/* Trạng thái kết nối PostgreSQL phía dưới cùng */}
        <div className="p-3 border-t border-slate-100 shrink-0">
          {!isSidebarCollapsed ? (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-center gap-2.5">
              <div className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </div>
              <div className="truncate">
                <div className="text-[11px] font-bold text-slate-800 flex items-center gap-1">
                  <Database className="w-3 h-3 text-slate-500" /> PostgreSQL
                </div>
                <div className="text-[10px] text-slate-500 truncate">
                  hr_manager @ 5432
                </div>
              </div>
            </div>
          ) : (
            <div
              className="flex justify-center py-2"
              title="PostgreSQL: hr_manager @ 5432"
            >
              <div className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Vùng nội dung chính (Bên phải - Phủ rộng 100% theo màn hình) */}
      <div className="flex-1 min-w-0 flex flex-col min-h-screen print:min-h-0 print:block pt-14 md:pt-0">
        <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-6 print:p-0 print:m-0 print:max-w-none">
          <ErrorBoundary>
            {activeTab === 'dashboard' && (
          <DashboardView
            employees={employees}
            departments={departments}
            templates={templates}
            selectedTemplate={activeTemplate}
            importLogs={importLogs}
            printLogs={printLogs}
            onNavigate={setActiveTab}
            onOpenImportModal={() => setIsImportModalOpen(true)}
            onPrintDepartment={(deptName) => {
              const deptIds = employees
                .filter((e) => e.department === deptName)
                .map((e) => e.id);
              handleOpenPrintDialog(deptIds);
            }}
            onSeedSampleEmployees={handleSeedSampleEmployees}
            onOpenPrintDialog={handleOpenPrintDialog}
          />
        )}

        {activeTab === 'employees' && (
          <EmployeeManagementView
            employees={employees}
            divisions={divisions}
            departments={departments}
            subDepartments={subDepartments}
            parentDepartments={parentDepartments}
            selectedTemplate={activeTemplate}
            selectedEmployeeIds={selectedEmployeeIds}
            onChangeSelectedIds={setSelectedEmployeeIds}
            onAddEmployee={handleAddEmployee}
            onUpdateEmployee={handleUpdateEmployee}
            onDeleteEmployee={handleDeleteEmployee}
            onBatchDeleteEmployees={handleBatchDeleteEmployees}
            onAddDepartment={handleAddDepartment}
            onUpdateDepartment={handleUpdateDepartment}
            onDeleteDepartment={handleDeleteDepartment}
            onDeleteAllDepartments={handleDeleteAllDepartments}
            onOpenImportModal={() => setIsImportModalOpen(true)}
            onGoToBatchPrint={() => setActiveTab('print')}
            onOpenPrintDialog={handleOpenPrintDialog}
            onSeedSampleEmployees={handleSeedSampleEmployees}
            onSyncComplete={loadWorkspaceData}
            initialViewingEmployeeId={initialViewingEmployeeId}
            onClearInitialViewingEmployeeId={() => setInitialViewingEmployeeId(null)}
          />
        )}

        {activeTab === 'departments' && (
          <DepartmentManagementView
            divisions={divisions}
            departments={departments}
            subDepartments={subDepartments}
            employees={employees}
            onAddDivision={handleAddDivision}
            onUpdateDivision={handleUpdateDivision}
            onDeleteDivision={handleDeleteDivision}
            onAddDepartment={handleAddDepartment}
            onUpdateDepartment={handleUpdateDepartment}
            onDeleteDepartment={handleDeleteDepartment}
            onAddSubDepartment={handleAddSubDepartment}
            onUpdateSubDepartment={handleUpdateSubDepartment}
            onDeleteSubDepartment={handleDeleteSubDepartment}
            onPrintDepartment={(deptName) => {
              const deptIds = employees
                .filter((e) => e.department === deptName || e.phongBan === deptName)
                .map((e) => e.id);
              handleOpenPrintDialog(deptIds);
            }}
            onNavigateToEmployees={(filter) => {
              setActiveTab('employees');
            }}
          />
        )}

        {activeTab === 'probation_contracts' && (
          <ContractManagementView
            contractType="probation"
            employees={employees}
            divisions={divisions}
            departments={departments}
            subDepartments={subDepartments}
            onUpdateEmployee={handleUpdateEmployee}
            onBatchUpdateEmployees={handleBatchUpdateEmployees}
            onRefreshData={loadWorkspaceData}
            onNavigateToEmployees={() => setActiveTab('employees')}
          />
        )}

        {activeTab === 'training_contracts' && (
          <ContractManagementView
            contractType="training"
            employees={employees}
            divisions={divisions}
            departments={departments}
            subDepartments={subDepartments}
            onUpdateEmployee={handleUpdateEmployee}
            onBatchUpdateEmployees={handleBatchUpdateEmployees}
            onRefreshData={loadWorkspaceData}
            onNavigateToEmployees={() => setActiveTab('employees')}
          />
        )}

        {activeTab === 'created_contracts' && (
          <CreatedContractsView
            employees={employees}
            onRefreshData={loadWorkspaceData}
            onBatchUpdateEmployees={handleBatchUpdateEmployees}
          />
        )}

        {activeTab === 'expiring_contracts' && (
          <ExpiringContractsView
            employees={employees}
            onNavigate={setActiveTab}
            onOpenPrintDialog={handleOpenPrintDialog}
            onUpdateEmployee={handleUpdateEmployee}
          />
        )}

        {activeTab === 'birthdays' && (
          <BirthdayManagementView
            employees={employees}
            onNavigate={setActiveTab}
            onOpenPrintDialog={handleOpenPrintDialog}
          />
        )}

        {activeTab === 'resignation' && (
          <ResignationManagementView
            employees={employees}
            onNavigate={setActiveTab}
            onUpdateEmployee={handleUpdateEmployee}
            onBatchUpdateEmployees={handleBatchUpdateEmployees}
          />
        )}

        {activeTab === 'document_templates' && (
          <DocumentTemplateManagementView
            employees={employees}
            documentTemplates={documentTemplates}
            onRefreshTemplates={handleRefreshDocumentTemplates}
            onNavigateToEmployees={() => setActiveTab('employees')}
          />
        )}

        {activeTab === 'face_crop' && (
          <FaceCropStudioView
            employees={employees}
            selectedTemplate={activeTemplate}
            onUpdateEmployeePhoto={(emp, photoUrl) =>
              handleUpdateEmployee(emp.id, {
                msnv: emp.msnv,
                fullName: emp.fullName,
                department: emp.department,
                joinDate: emp.joinDate,
                photoUrl,
              })
            }
            onOpenPrintDialog={handleOpenPrintDialog}
          />
        )}

        {activeTab === 'designer' && (
          <CardDesignerView
            templates={templates}
            selectedTemplate={activeTemplate}
            onSelectTemplate={(tpl) => setSelectedTemplateId(tpl.id)}
            onSaveTemplate={handleSaveTemplate}
            onDeleteTemplate={handleDeleteTemplate}
            employees={employees}
          />
        )}

        {activeTab === 'print' && (
          <BatchPrintView
            employees={employees}
            departments={departments}
            templates={templates}
            selectedTemplate={activeTemplate}
            onSelectTemplate={(tpl) => setSelectedTemplateId(tpl.id)}
            selectedEmployeeIds={selectedEmployeeIds}
            onChangeSelectedIds={setSelectedEmployeeIds}
            settings={activeSettings}
            onSaveSettings={handleSaveSettings}
            onAddEmployee={handleAddEmployee}
            onUpdateEmployeePhoto={(emp, photoUrl) =>
              handleUpdateEmployee(emp.id, {
                msnv: emp.msnv,
                fullName: emp.fullName,
                department: emp.department,
                joinDate: emp.joinDate,
                photoUrl,
              })
            }
            onRecordPrintJob={handleRecordPrintJob}
            onOpenPrintDialog={handleOpenPrintDialog}
          />
        )}

        {activeTab === 'history' && (
          <HistoryView
            employees={employees}
            importLogs={importLogs}
            printLogs={printLogs}
            onReprintEmployee={(empId) => {
              handleOpenPrintDialog([empId]);
            }}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            settings={activeSettings}
            onSaveSettings={handleSaveSettings}
          />
        )}

        {activeTab === 'ai_rules' && <AiRulesView />}
          </ErrorBoundary>
      </main>
      </div>

      {/* Excel Batch Import Modal */}
      <ExcelImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        existingEmployees={employees}
        onConfirmImport={handleConfirmExcelImport}
        onGoToPrintWithIds={(ids) => {
          handleOpenPrintDialog(ids);
        }}
      />
    </div>
  );
}
