import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Save,
  Upload,
  FileText,
  Trash2,
  Search,
  AlertCircle,
  Calendar,
  Building2,
  UserCheck,
  Briefcase,
} from 'lucide-react';
import {
  AppointmentDecision,
  DecisionType,
  Department,
  Division,
  Employee,
  SubDepartment,
  UserRole,
} from '../types';
import { api } from '../api';

interface AppointmentFormModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  decisionType: DecisionType;
  initialDecision?: AppointmentDecision | null;
  employees: Employee[];
  divisions: Division[];
  departments: Department[];
  subDepartments: SubDepartment[];
  userRole: UserRole;
  onClose: () => void;
  onSaved: (message: string) => void;
}

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB

export const AppointmentFormModal: React.FC<AppointmentFormModalProps> = ({
  isOpen,
  mode,
  decisionType,
  initialDecision,
  employees,
  divisions,
  departments,
  subDepartments,
  userRole,
  onClose,
  onSaved,
}) => {
  const todayStr = new Date().toISOString().slice(0, 10);

  const [employeeSearch, setEmployeeSearch] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [showEmpDropdown, setShowEmpDropdown] = useState(false);

  const [positionTitle, setPositionTitle] = useState('');
  const [divisionId, setDivisionId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [departmentName, setDepartmentName] = useState('');
  const [subDepartmentId, setSubDepartmentId] = useState('');
  const [subDepartmentName, setSubDepartmentName] = useState('');

  const [decisionNumber, setDecisionNumber] = useState('');
  const [signDate, setSignDate] = useState(todayStr);
  const [effectiveDate, setEffectiveDate] = useState(todayStr);
  const [endDate, setEndDate] = useState('');
  const [signerName, setSignerName] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  const [attachmentFile, setAttachmentFile] = useState<{
    name: string;
    mime: string;
    base64: string;
    size: number;
  } | null>(null);
  const [existingAttachmentName, setExistingAttachmentName] = useState('');
  const [removeAttachment, setRemoveAttachment] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Gợi ý danh sách chức vụ / công việc hiện có từ hồ sơ nhân viên
  const existingPositions = useMemo(() => {
    const set = new Set<string>();
    employees.forEach((e) => {
      const pos = (e.congViec || e.jobTitle || e.chucVu || '').trim();
      if (pos) set.add(pos);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [employees]);

  const selectedEmployee = useMemo(
    () => employees.find((e) => e.id === selectedEmployeeId) || null,
    [employees, selectedEmployeeId]
  );

  const filteredEmployees = useMemo(() => {
    const q = employeeSearch.trim().toLowerCase();
    const list = employees.filter((e) => {
      if (!q) return true;
      return (
        e.fullName.toLowerCase().includes(q) ||
        e.msnv.toLowerCase().includes(q) ||
        (e.department || '').toLowerCase().includes(q)
      );
    });
    return list.slice(0, 30);
  }, [employees, employeeSearch]);

  const filteredDepartments = useMemo(() => {
    if (!divisionId) return departments;
    return departments.filter((d) => d.divisionId === divisionId);
  }, [departments, divisionId]);

  const filteredSubDepartments = useMemo(() => {
    if (!departmentId) return [];
    return subDepartments.filter((s) => s.departmentId === departmentId);
  }, [subDepartments, departmentId]);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setAttachmentFile(null);
    setRemoveAttachment(false);

    if (mode === 'edit' && initialDecision) {
      setSelectedEmployeeId(initialDecision.employeeId);
      setEmployeeSearch(`${initialDecision.msnv} - ${initialDecision.fullName}`);
      setPositionTitle(initialDecision.positionTitle || '');
      setDivisionId(initialDecision.divisionId || '');
      setDepartmentId(initialDecision.departmentId || '');
      setDepartmentName(initialDecision.departmentName || '');
      setSubDepartmentId(initialDecision.subDepartmentId || '');
      setSubDepartmentName(initialDecision.subDepartmentName || '');
      setDecisionNumber(initialDecision.decisionNumber || '');
      setSignDate(initialDecision.signDate || todayStr);
      setEffectiveDate(initialDecision.effectiveDate || todayStr);
      setEndDate(initialDecision.endDate || '');
      setSignerName(initialDecision.signerName || '');
      setReason(initialDecision.reason || '');
      setNotes(initialDecision.notes || '');
      setExistingAttachmentName(initialDecision.attachmentName || '');
    } else {
      setSelectedEmployeeId('');
      setEmployeeSearch('');
      setPositionTitle('');
      setDivisionId('');
      setDepartmentId('');
      setDepartmentName('');
      setSubDepartmentId('');
      setSubDepartmentName('');
      setDecisionNumber('');
      setSignDate(todayStr);
      setEffectiveDate(todayStr);
      setEndDate('');
      setSignerName('');
      setReason('');
      setNotes('');
      setExistingAttachmentName('');
    }
  }, [isOpen, mode, initialDecision, todayStr]);

  const handleSelectEmployee = (emp: Employee) => {
    setSelectedEmployeeId(emp.id);
    setEmployeeSearch(`${emp.msnv} - ${emp.fullName}`);
    setShowEmpDropdown(false);

    // Tự động điền đơn vị hiện tại
    const matchedDept = departments.find(
      (d) => d.id === emp.departmentId || d.name === emp.department
    );
    if (matchedDept) {
      setDivisionId(matchedDept.divisionId || '');
      setDepartmentId(matchedDept.id);
      setDepartmentName(matchedDept.name);
    } else {
      setDepartmentId('');
      setDepartmentName(emp.department || '');
    }

    if (decisionType === 'mien_nhiem') {
      setPositionTitle(emp.congViec || emp.jobTitle || emp.chucVu || '');
    }
  };

  const handleDepartmentChange = (deptId: string) => {
    setDepartmentId(deptId);
    setSubDepartmentId('');
    setSubDepartmentName('');
    const dept = departments.find((d) => d.id === deptId);
    if (dept) {
      setDepartmentName(dept.name);
      if (dept.divisionId) setDivisionId(dept.divisionId);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!['pdf', 'doc', 'docx'].includes(ext)) {
      setError('Chỉ hỗ trợ tải lên file quyết định định dạng PDF hoặc Word (.pdf, .doc, .docx).');
      e.target.value = '';
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError('Dung lượng file đính kèm không được vượt quá 15MB.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setAttachmentFile({
        name: file.name,
        mime: file.type || 'application/octet-stream',
        base64: String(reader.result || ''),
        size: file.size,
      });
      setRemoveAttachment(false);
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedEmployeeId) {
      setError('Vui lòng chọn nhân sự.');
      return;
    }
    if (!positionTitle.trim()) {
      setError(
        decisionType === 'bo_nhiem'
          ? 'Vui lòng nhập chức vụ được bổ nhiệm.'
          : 'Vui lòng nhập chức vụ bị miễn nhiệm.'
      );
      return;
    }
    if (!departmentName.trim()) {
      setError('Vui lòng chọn đơn vị/phòng ban công tác.');
      return;
    }
    if (!decisionNumber.trim()) {
      setError('Vui lòng nhập số quyết định.');
      return;
    }
    if (!signDate || !effectiveDate) {
      setError('Vui lòng nhập đầy đủ ngày ký và ngày hiệu lực.');
      return;
    }
    if (decisionType === 'bo_nhiem' && endDate && endDate < effectiveDate) {
      setError('Ngày kết thúc nhiệm kỳ phải lớn hơn hoặc bằng ngày bắt đầu có hiệu lực.');
      return;
    }
    if (decisionType === 'mien_nhiem' && !reason.trim()) {
      setError('Vui lòng nhập lý do miễn nhiệm.');
      return;
    }

    const selectedDiv = divisions.find((d) => d.id === divisionId);

    const payload: Record<string, unknown> = {
      decisionType,
      employeeId: selectedEmployeeId,
      positionTitle: positionTitle.trim(),
      divisionId,
      divisionName: selectedDiv?.name || '',
      departmentId,
      departmentName: departmentName.trim(),
      subDepartmentId,
      subDepartmentName,
      decisionNumber: decisionNumber.trim(),
      signDate,
      effectiveDate,
      endDate: decisionType === 'bo_nhiem' ? endDate || null : null,
      signerName: signerName.trim(),
      reason: decisionType === 'mien_nhiem' ? reason.trim() : '',
      notes: notes.trim(),
      removeAttachment,
    };

    if (attachmentFile) {
      payload.attachmentBase64 = attachmentFile.base64;
      payload.attachmentName = attachmentFile.name;
      payload.attachmentMime = attachmentFile.mime;
    }

    try {
      setSubmitting(true);
      if (mode === 'create') {
        const res = await api.createAppointment(payload, userRole);
        onSaved(res.message);
      } else if (initialDecision) {
        const res = await api.updateAppointment(initialDecision.id, payload, userRole);
        onSaved(res.message);
      }
    } catch (err: any) {
      setError(err.message || 'Có lỗi xảy ra khi lưu quyết định.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const isFutureEffective = effectiveDate > todayStr;
  const isAppointment = decisionType === 'bo_nhiem';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                isAppointment ? 'bg-blue-100 text-blue-700' : 'bg-rose-100 text-rose-700'
              }`}
            >
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {mode === 'create'
                  ? isAppointment
                    ? 'Thêm quyết định bổ nhiệm'
                    : 'Thêm quyết định miễn nhiệm'
                  : isAppointment
                    ? 'Chỉnh sửa quyết định bổ nhiệm'
                    : 'Chỉnh sửa quyết định miễn nhiệm'}
              </h3>
              <p className="text-xs text-slate-500">
                {isAppointment
                  ? 'Hệ thống tự động cập nhật chức vụ & phòng ban theo ngày hiệu lực'
                  : 'Hệ thống cập nhật trạng thái chức vụ và lưu lịch sử công tác'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {isFutureEffective && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
              <Calendar className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Ngày hiệu lực nằm trong tương lai ({effectiveDate}). Quyết định sẽ được lưu ở trạng thái{' '}
                <strong>Chờ hiệu lực</strong> và tự động cập nhật hồ sơ nhân sự khi đến ngày.
              </span>
            </div>
          )}

          {/* Chọn nhân sự */}
          <div className="relative">
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              {isAppointment ? 'Người được bổ nhiệm' : 'Người được miễn nhiệm'}{' '}
              <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={employeeSearch}
                disabled={mode === 'edit'}
                onFocus={() => mode === 'create' && setShowEmpDropdown(true)}
                onChange={(e) => {
                  setEmployeeSearch(e.target.value);
                  setShowEmpDropdown(true);
                  if (selectedEmployeeId) setSelectedEmployeeId('');
                }}
                placeholder="Tìm theo MSNV, Họ và tên hoặc Phòng ban..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-600"
              />
            </div>

            {showEmpDropdown && mode === 'create' && (
              <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl max-h-56 overflow-y-auto">
                {filteredEmployees.length === 0 ? (
                  <div className="p-3 text-xs text-slate-500 text-center">Không tìm thấy nhân sự phù hợp</div>
                ) : (
                  filteredEmployees.map((emp) => (
                    <button
                      key={emp.id}
                      type="button"
                      onClick={() => handleSelectEmployee(emp)}
                      className="w-full px-3 py-2 text-left hover:bg-blue-50 flex items-center justify-between gap-2 border-b border-slate-100 last:border-0 cursor-pointer"
                    >
                      <div>
                        <div className="text-xs font-bold text-slate-800">
                          {emp.msnv} - {emp.fullName}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {emp.department || 'Chưa phân bổ'} • Công việc/Chức vụ: {emp.congViec || emp.jobTitle || emp.chucVu || 'Chưa có'}
                        </div>
                      </div>
                      <UserCheck className="w-4 h-4 text-blue-600 shrink-0" />
                    </button>
                  ))
                )}
              </div>
            )}

            {selectedEmployee && (
              <div className="mt-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
                <span>
                  MSNV: <strong className="text-slate-800">{selectedEmployee.msnv}</strong>
                </span>
                <span>
                  Đơn vị hiện tại: <strong className="text-slate-800">{selectedEmployee.department || 'Chưa có'}</strong>
                </span>
                <span>
                  Công việc/Chức vụ hiện tại:{' '}
                  <strong className="text-blue-700">{selectedEmployee.congViec || selectedEmployee.jobTitle || selectedEmployee.chucVu || 'Chưa có'}</strong>
                </span>
              </div>
            )}
          </div>

          {/* Chức vụ & Số quyết định */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {isAppointment ? 'Chức vụ được bổ nhiệm' : 'Chức vụ bị miễn nhiệm'}{' '}
                <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                list="position-suggestions"
                value={positionTitle}
                onChange={(e) => setPositionTitle(e.target.value)}
                placeholder="VD: Trưởng phòng, Tổ trưởng, Giám đốc..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <datalist id="position-suggestions">
                {existingPositions.map((pos) => (
                  <option key={pos} value={pos} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Số quyết định <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={decisionNumber}
                onChange={(e) => setDecisionNumber(e.target.value)}
                placeholder={isAppointment ? 'VD: 12/QĐ-BN-2026' : 'VD: 15/QĐ-MN-2026'}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Đơn vị / Phòng ban */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <Building2 className="w-4 h-4 text-blue-600" />
              <span>Đơn vị / Phòng ban công tác</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Khối</label>
                <select
                  value={divisionId}
                  onChange={(e) => {
                    setDivisionId(e.target.value);
                    setDepartmentId('');
                    setSubDepartmentId('');
                  }}
                  className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Tất cả khối --</option>
                  {divisions.map((div) => (
                    <option key={div.id} value={div.id}>
                      {div.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Phòng ban / Đơn vị <span className="text-rose-500">*</span>
                </label>
                <select
                  value={departmentId}
                  onChange={(e) => handleDepartmentChange(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Chọn phòng ban --</option>
                  {filteredDepartments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
                {!departmentId && departmentName && (
                  <p className="text-[11px] text-slate-500 mt-1">Đang chọn: {departmentName}</p>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Bộ phận con</label>
                <select
                  value={subDepartmentId}
                  disabled={filteredSubDepartments.length === 0}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSubDepartmentId(id);
                    const sub = filteredSubDepartments.find((s) => s.id === id);
                    setSubDepartmentName(sub?.name || '');
                  }}
                  className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
                >
                  <option value="">-- Không chọn --</option>
                  {filteredSubDepartments.map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      {sub.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Các mốc thời gian & Người ký */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Ngày ký quyết định <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={signDate}
                onChange={(e) => setSignDate(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Ngày có hiệu lực <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {isAppointment && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Ngày kết thúc nhiệm kỳ
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            <div className={isAppointment ? '' : 'sm:col-span-2'}>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Người ký quyết định
              </label>
              <input
                type="text"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="VD: Giám đốc / Tổng Giám đốc"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Lý do miễn nhiệm */}
          {!isAppointment && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Lý do miễn nhiệm <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Nhập lý do miễn nhiệm (VD: Điều chuyển công tác, Hết nhiệm kỳ, Theo nguyện vọng cá nhân...)"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {/* File đính kèm */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              File đính kèm quyết định (PDF, Word - Tối đa 15MB)
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                <Upload className="w-4 h-4 text-blue-600" />
                <span>Chọn file PDF / Word</span>
              </button>

              {attachmentFile ? (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-800">
                  <FileText className="w-4 h-4" />
                  <span className="max-w-[240px] truncate">{attachmentFile.name}</span>
                  <button
                    type="button"
                    onClick={() => setAttachmentFile(null)}
                    className="text-rose-600 hover:text-rose-800 cursor-pointer"
                    title="Bỏ file đã chọn"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : existingAttachmentName && !removeAttachment ? (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-700">
                  <FileText className="w-4 h-4 text-slate-600" />
                  <span className="max-w-[240px] truncate">{existingAttachmentName}</span>
                  <button
                    type="button"
                    onClick={() => setRemoveAttachment(true)}
                    className="text-rose-600 hover:text-rose-800 cursor-pointer"
                    title="Xóa file đính kèm"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <span className="text-xs text-slate-400">Chưa có file đính kèm</span>
              )}
            </div>
          </div>

          {/* Ghi chú */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Ghi chú</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ghi chú bổ sung (nếu có)..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </form>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-100 cursor-pointer"
          >
            Hủy bỏ
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={handleSubmit}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white text-xs font-bold shadow-xs cursor-pointer disabled:opacity-60 ${
              isAppointment
                ? 'bg-blue-700 hover:bg-blue-800'
                : 'bg-rose-600 hover:bg-rose-700'
            }`}
          >
            <Save className="w-4 h-4" />
            <span>{submitting ? 'Đang lưu...' : mode === 'create' ? 'Lưu quyết định' : 'Cập nhật quyết định'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
