/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  FileSignature,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Printer,
  ChevronDown,
  Info,
  Loader2,
  FileText,
  User,
  Building2,
  Clock,
  DollarSign,
  Award,
  Tag,
} from 'lucide-react';
import { Employee, RenewContractPayload } from '../types';
import { api } from '../api';
import {
  CONTRACT_TYPE_OPTIONS,
  ContractTypeOption,
  calculateRenewStartDate,
  calculateRenewEndDate,
  compareDates,
  dmyToYmd,
  ymdToDmy,
  parseAnyDate,
  formatDateDDMMYYYY,
} from '../utils/contractRenewalUtils';

interface RenewContractModalProps {
  isOpen: boolean;
  employee: Employee | null;
  onClose: () => void;
  onRenewSuccess: (updatedEmployee: Employee) => void;
  onOpenDocumentGenerator?: (
    employee: Employee,
    contractInfo: {
      contractType: string;
      contractTypeName: string;
      startDate: string;
      endDate: string | null;
      contractNumber?: string;
      salary?: string;
      bacLuong?: string;
      ngachLuong?: string;
    }
  ) => void;
  onShowToast?: (message: string, type?: 'success' | 'error') => void;
}

export const RenewContractModal: React.FC<RenewContractModalProps> = ({
  isOpen,
  employee,
  onClose,
  onRenewSuccess,
  onOpenDocumentGenerator,
  onShowToast,
}) => {
  // Form State
  const [selectedContractTypeId, setSelectedContractTypeId] = useState<string>('hdld_12m');
  const [contractNumberStr, setContractNumberStr] = useState<string>('');
  const [startDateStr, setStartDateStr] = useState<string>(''); // DD/MM/YYYY
  const [endDateStr, setEndDateStr] = useState<string>(''); // DD/MM/YYYY
  const [isEndDateManuallyEdited, setIsEndDateManuallyEdited] = useState<boolean>(false);
  const [contractNote, setContractNote] = useState<string>('');

  // Chế độ lương, Bậc & Ngạch
  const [salaryStr, setSalaryStr] = useState<string>('');
  const [bacLuongStr, setBacLuongStr] = useState<string>('');
  const [ngachLuongStr, setNgachLuongStr] = useState<string>('');

  // Validation errors
  const [errors, setErrors] = useState<{
    contractType?: string;
    startDate?: string;
    endDate?: string;
    general?: string;
  }>({});

  // Loading & Second Dialog State
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showPrintConfirmDialog, setShowPrintConfirmDialog] = useState<boolean>(false);
  const [savedEmployee, setSavedEmployee] = useState<Employee | null>(null);
  const [savedContractInfo, setSavedContractInfo] = useState<{
    contractType: string;
    contractTypeName: string;
    startDate: string;
    endDate: string | null;
    contractNumber?: string;
    salary?: string;
    bacLuong?: string;
    ngachLuong?: string;
  } | null>(null);

  // Hidden native date input refs for picking
  const startPickerRef = useRef<HTMLInputElement>(null);
  const endPickerRef = useRef<HTMLInputElement>(null);

  // Lựa chọn loại hợp đồng hiện tại
  const currentOption = useMemo<ContractTypeOption>(() => {
    return (
      CONTRACT_TYPE_OPTIONS.find((opt) => opt.id === selectedContractTypeId) ||
      CONTRACT_TYPE_OPTIONS[0]
    );
  }, [selectedContractTypeId]);

  const isIndefinite = currentOption.durationMonths === null;

  // Khởi tạo dữ liệu khi mở popup
  useEffect(() => {
    if (isOpen && employee) {
      setSelectedContractTypeId('hdld_12m');
      setContractNote('');
      setErrors({});
      setIsSubmitting(false);
      setShowPrintConfirmDialog(false);
      setSavedEmployee(null);
      setSavedContractInfo(null);
      setIsEndDateManuallyEdited(false);

      // Lương, Bậc, Ngạch mặc định lấy từ hồ sơ hiện tại của nhân viên
      const curSalary = (employee.luongChinhThuc || employee.luongThuViec || '').trim();
      if (curSalary && !curSalary.includes('%')) {
        const cleanDigits = curSalary.replace(/\D/g, '');
        setSalaryStr(cleanDigits ? Number(cleanDigits).toLocaleString('en-US') : curSalary);
      } else {
        setSalaryStr(curSalary);
      }
      setBacLuongStr(employee.bacLuong || '');
      setNgachLuongStr(employee.ngachLuong || '');

      // Ngày bắt đầu mặc định = Ngày hết hạn hiện tại + 1 ngày
      const initialStart = calculateRenewStartDate(employee.denNgay);
      setStartDateStr(initialStart);

      // Mặc định tính ngày hết hạn cho 12 tháng: Ngày bắt đầu + 12 tháng - 1 ngày
      const initialEnd = calculateRenewEndDate(initialStart, 12);
      setEndDateStr(initialEnd);

      // Tự động tải số hợp đồng tăng dần kế tiếp từ hệ thống
      api.getNextContractNumber()
        .then((res) => {
          const num = typeof res === 'string' ? res : res.nextContractNumber;
          setContractNumberStr(num || '1080');
        })
        .catch(() => {
          setContractNumberStr('1080');
        });
    }
  }, [isOpen, employee]);

  // Hỗ trợ phím Esc để đóng và Enter để xác nhận
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!isSubmitting) {
          handleCloseAll();
        }
      } else if (e.key === 'Enter') {
        // Chỉ submit nếu không bấm trong textarea hoặc đang mở confirm dialog
        const target = e.target as HTMLElement | null;
        if (target && target.tagName === 'TEXTAREA') return;

        if (showPrintConfirmDialog) {
          // Enter trong confirm dialog = Chọn "Có"
          e.preventDefault();
          handleConfirmPrint(true);
        } else if (!isSubmitting) {
          e.preventDefault();
          handleSubmit();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, showPrintConfirmDialog, isSubmitting, startDateStr, endDateStr, selectedContractTypeId]);

  if (!isOpen || !employee) return null;

  // Đóng toàn bộ
  const handleCloseAll = () => {
    setShowPrintConfirmDialog(false);
    onClose();
  };

  // Xử lý thay đổi loại hợp đồng
  const handleContractTypeChange = (newTypeId: string) => {
    setSelectedContractTypeId(newTypeId);
    setErrors((prev) => ({ ...prev, contractType: undefined, endDate: undefined }));

    const option = CONTRACT_TYPE_OPTIONS.find((opt) => opt.id === newTypeId);
    if (!option) return;

    if (option.durationMonths === null) {
      // Hợp đồng không xác định thời hạn: xoá và không yêu cầu ngày hết hạn
      setEndDateStr('');
    } else {
      // Hợp đồng có thời hạn: nếu chưa từng sửa tay hoặc vừa đổi từ không xác định sang thì tự tính lại
      const newEnd = calculateRenewEndDate(startDateStr, option.durationMonths);
      setEndDateStr(newEnd);
      setIsEndDateManuallyEdited(false);
    }
  };

  // Xử lý thay đổi ngày bắt đầu
  const handleStartDateChange = (val: string) => {
    setStartDateStr(val);
    setErrors((prev) => ({ ...prev, startDate: undefined, endDate: undefined }));

    // Nếu là hợp đồng có thời hạn và người dùng chưa từng sửa tay ngày hết hạn: tự động tính lại
    if (!isIndefinite && currentOption.durationMonths !== null) {
      if (!isEndDateManuallyEdited) {
        const autoEnd = calculateRenewEndDate(val, currentOption.durationMonths);
        setEndDateStr(autoEnd);
      }
    }
  };

  // Xử lý sửa tay ngày hết hạn
  const handleEndDateChange = (val: string) => {
    setEndDateStr(val);
    setIsEndDateManuallyEdited(true);
    setErrors((prev) => ({ ...prev, endDate: undefined }));
  };

  // Xử lý thay đổi mức lương: format phân tách hàng nghìn khi gõ số
  const handleSalaryChange = (val: string) => {
    if (val.includes('%')) {
      setSalaryStr(val);
      return;
    }
    const cleanDigits = val.replace(/\D/g, '');
    if (!cleanDigits) {
      setSalaryStr('');
      return;
    }
    setSalaryStr(Number(cleanDigits).toLocaleString('en-US'));
  };

  // Validate form
  const validateForm = (): boolean => {
    const newErrors: {
      contractType?: string;
      startDate?: string;
      endDate?: string;
    } = {};

    if (!selectedContractTypeId) {
      newErrors.contractType = 'Vui lòng chọn Loại HĐLĐ mới.';
    }

    if (!startDateStr.trim()) {
      newErrors.startDate = 'Vui lòng nhập hoặc chọn Ngày bắt đầu hợp đồng.';
    } else {
      const parsedStart = parseAnyDate(startDateStr);
      if (!parsedStart) {
        newErrors.startDate = 'Ngày bắt đầu không đúng định dạng (dd/mm/yyyy).';
      }
    }

    // Với hợp đồng có thời hạn: bắt buộc có Ngày hết hạn và phải lớn hơn Ngày bắt đầu
    if (!isIndefinite) {
      if (!endDateStr.trim()) {
        newErrors.endDate = 'Vui lòng nhập hoặc chọn Ngày hết hạn mới.';
      } else {
        const parsedEnd = parseAnyDate(endDateStr);
        if (!parsedEnd) {
          newErrors.endDate = 'Ngày hết hạn không đúng định dạng (dd/mm/yyyy).';
        } else if (startDateStr.trim()) {
          const diff = compareDates(endDateStr, startDateStr);
          if (diff <= 0) {
            newErrors.endDate = 'Ngày hết hạn mới phải lớn hơn Ngày bắt đầu.';
          }
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Xử lý submit
  const handleSubmit = async () => {
    if (isSubmitting) return;
    if (!validateForm()) return;

    setIsSubmitting(true);
    setErrors({});

    try {
      const payload: RenewContractPayload = {
        employeeId: employee.id,
        contractType: currentOption.code,
        contractTypeName: currentOption.name,
        duration: currentOption.durationLabel,
        startDate: startDateStr.trim(),
        endDate: isIndefinite ? null : endDateStr.trim(),
        note: contractNote.trim(),
        contractNumber: contractNumberStr.trim() || undefined,
        salary: salaryStr.trim() || undefined,
        bacLuong: bacLuongStr.trim() || undefined,
        ngachLuong: ngachLuongStr.trim() || undefined,
      };

      const result = await api.renewContract(payload);

      // Cập nhật state nhân viên đã lưu
      const updatedEmp = result.employee;
      setSavedEmployee(updatedEmp);
      setSavedContractInfo({
        contractType: currentOption.code,
        contractTypeName: currentOption.name,
        startDate: startDateStr.trim(),
        endDate: isIndefinite ? null : endDateStr.trim(),
        contractNumber: updatedEmp.soHd || contractNumberStr.trim(),
        salary: updatedEmp.luongChinhThuc || salaryStr.trim() || undefined,
        bacLuong: updatedEmp.bacLuong || bacLuongStr.trim() || undefined,
        ngachLuong: updatedEmp.ngachLuong || ngachLuongStr.trim() || undefined,
      });

      // Báo cập nhật danh sách cho component cha
      onRenewSuccess(updatedEmp);

      if (onShowToast) {
        onShowToast('Tái ký hợp đồng thành công!', 'success');
      }

      // Đóng form tái ký, chuyển sang hộp thoại xác nhận in hợp đồng
      setShowPrintConfirmDialog(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Có lỗi xảy ra khi tái ký hợp đồng';
      setErrors((prev) => ({ ...prev, general: msg }));
      if (onShowToast) {
        onShowToast(msg, 'error');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Xử lý hộp thoại in hợp đồng: "Có" hoặc "Không"
  const handleConfirmPrint = (shouldPrint: boolean) => {
    setShowPrintConfirmDialog(false);
    onClose();

    if (shouldPrint && savedEmployee && savedContractInfo) {
      if (onOpenDocumentGenerator) {
        onOpenDocumentGenerator(savedEmployee, savedContractInfo);
      }
    }
  };

  return (
    <>
      {/* 1. MODAL CHÍNH: TÁI KÝ HỢP ĐỒNG */}
      {!showPrintConfirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-100 flex flex-col max-h-[92vh] overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-labelledby="renew-modal-title"
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
                  <FileSignature className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="renew-modal-title" className="text-base font-bold text-slate-900">
                    Tái ký hợp đồng lao động
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Gia hạn hoặc ký mới hợp đồng cho nhân viên sắp / đã hết hạn
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseAll}
                disabled={isSubmitting}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                title="Đóng (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 overflow-y-auto space-y-4.5 text-xs text-slate-700">
              {/* Lỗi hệ thống nếu có */}
              {errors.general && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div className="flex-1 font-medium">{errors.general}</div>
                </div>
              )}

              {/* Phần thông tin nhân viên (chỉ đọc) */}
              <div className="p-4 bg-slate-50/90 rounded-xl border border-slate-200/80 space-y-2.5">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200/70">
                  <span className="font-bold text-[11px] uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-blue-600" />
                    Thông tin nhân viên hiện tại
                  </span>
                  <span className="font-mono-num font-bold text-xs bg-blue-100/80 text-blue-800 px-2 py-0.5 rounded-md">
                    MSNV: {employee.msnv || '—'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Họ và tên:</span>
                    <span className="font-bold text-slate-900 text-xs sm:text-sm">
                      {employee.fullName}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[11px]">Phòng ban / Bộ phận:</span>
                    <span className="font-semibold text-slate-800">
                      {employee.department || employee.phongBan || employee.boPhan || '—'}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[11px]">Loại HĐ hiện tại:</span>
                    <span className="inline-block mt-0.5 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 font-bold text-[11px]">
                      {employee.loaiHd || 'HĐTV'} {employee.thoiHan ? `(${employee.thoiHan})` : ''}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[11px]">Ngày hết hạn hiện tại:</span>
                    <span className="font-mono-num font-bold text-red-600 mt-0.5 inline-block">
                      {employee.denNgay || '—'}
                    </span>
                  </div>

                  {(employee.bacLuong || employee.ngachLuong) && (
                    <div>
                      <span className="text-slate-400 block text-[11px]">Bậc & Ngạch hiện tại:</span>
                      <span className="font-semibold text-slate-800 text-xs mt-0.5 inline-flex items-center gap-1.5 flex-wrap">
                        {employee.bacLuong && (
                          <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                            Bậc: {employee.bacLuong}
                          </span>
                        )}
                        {employee.ngachLuong && (
                          <span className="text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded border border-purple-200">
                            Ngạch: {employee.ngachLuong}
                          </span>
                        )}
                      </span>
                    </div>
                  )}

                  {(employee.luongChinhThuc || employee.luongThuViec) && (
                    <div>
                      <span className="text-slate-400 block text-[11px]">Lương hiện tại:</span>
                      <span className="font-mono-num font-semibold text-slate-800 text-xs mt-0.5 inline-block">
                        {employee.luongChinhThuc || employee.luongThuViec}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Form Tái Ký Mới */}
              <div className="space-y-4 pt-1">
                {/* 1. Loại HĐLĐ mới (dropdown, bắt buộc) */}
                <div>
                  <label className="block font-bold text-slate-800 mb-1.5">
                    Loại HĐLĐ mới <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      value={selectedContractTypeId}
                      onChange={(e) => handleContractTypeChange(e.target.value)}
                      disabled={isSubmitting}
                      className={`w-full appearance-none px-3.5 py-2.5 pr-10 text-xs font-semibold bg-white border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer ${
                        errors.contractType ? 'border-red-400 bg-red-50/20' : 'border-slate-300'
                      }`}
                    >
                      {CONTRACT_TYPE_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                  {errors.contractType && (
                    <p className="text-[11px] text-red-600 font-medium mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      {errors.contractType}
                    </p>
                  )}
                  {currentOption.description && (
                    <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                      <Info className="w-3 h-3 text-blue-500 shrink-0" />
                      {currentOption.description}
                    </p>
                  )}
                </div>

                {/* Số hợp đồng mới (tự động tăng dần) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="font-bold text-slate-800">
                      Số hợp đồng mới <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Tự động tăng dần
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      value={contractNumberStr}
                      onChange={(e) => setContractNumberStr(e.target.value)}
                      placeholder="Ví dụ: 1080"
                      disabled={isSubmitting}
                      className="w-full px-3.5 py-2.5 font-mono-num font-bold text-xs text-blue-700 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Số hợp đồng được tự động điền tiếp nối theo thứ tự tăng dần ({contractNumberStr || '1080'}). Bạn có thể chỉnh sửa nếu cần.
                  </p>
                </div>

                {/* 2. Ngày bắt đầu & Ngày hết hạn mới (Grid 2 cột) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {/* Ngày bắt đầu */}
                  <div>
                    <label className="block font-bold text-slate-800 mb-1.5">
                      Ngày bắt đầu <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={startDateStr}
                        onChange={(e) => handleStartDateChange(e.target.value)}
                        placeholder="dd/mm/yyyy"
                        disabled={isSubmitting}
                        className={`w-full px-3.5 py-2.5 pr-10 font-mono-num text-xs bg-white border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                          errors.startDate ? 'border-red-400 bg-red-50/20' : 'border-slate-300'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (startPickerRef.current) {
                            if (typeof startPickerRef.current.showPicker === 'function') {
                              startPickerRef.current.showPicker();
                            } else {
                              startPickerRef.current.focus();
                            }
                          }
                        }}
                        disabled={isSubmitting}
                        className="p-1 text-slate-400 hover:text-blue-600 absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer transition-colors"
                        title="Chọn ngày bắt đầu từ lịch"
                      >
                        <Calendar className="w-4 h-4" />
                      </button>
                      <input
                        ref={startPickerRef}
                        type="date"
                        tabIndex={-1}
                        value={dmyToYmd(startDateStr)}
                        onChange={(e) => {
                          if (e.target.value) {
                            handleStartDateChange(ymdToDmy(e.target.value));
                          }
                        }}
                        className="sr-only"
                      />
                    </div>
                    {errors.startDate ? (
                      <p className="text-[11px] text-red-600 font-medium mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 shrink-0" />
                        {errors.startDate}
                      </p>
                    ) : (
                      <p className="text-[10px] text-slate-400 mt-1">
                        Mặc định = Ngày hết hạn cũ + 1 ngày
                      </p>
                    )}
                  </div>

                  {/* Ngày hết hạn mới */}
                  <div>
                    <label className="block font-bold text-slate-800 mb-1.5 flex items-center justify-between">
                      <span>
                        Ngày hết hạn mới {!isIndefinite && <span className="text-red-500">*</span>}
                      </span>
                      {isEndDateManuallyEdited && !isIndefinite && (
                        <span className="text-[10px] font-normal text-amber-600 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                          Đã sửa tay
                        </span>
                      )}
                    </label>

                    {isIndefinite ? (
                      <div className="px-3.5 py-2.5 text-xs bg-slate-100 border border-slate-200 rounded-xl text-slate-400 italic">
                        Không xác định thời hạn
                      </div>
                    ) : (
                      <div className="relative">
                        <input
                          type="text"
                          value={endDateStr}
                          onChange={(e) => handleEndDateChange(e.target.value)}
                          placeholder="dd/mm/yyyy"
                          disabled={isSubmitting}
                          className={`w-full px-3.5 py-2.5 pr-10 font-mono-num text-xs bg-white border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                            errors.endDate ? 'border-red-400 bg-red-50/20' : 'border-slate-300'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (endPickerRef.current) {
                              if (typeof endPickerRef.current.showPicker === 'function') {
                                endPickerRef.current.showPicker();
                              } else {
                                endPickerRef.current.focus();
                              }
                            }
                          }}
                          disabled={isSubmitting}
                          className="p-1 text-slate-400 hover:text-blue-600 absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer transition-colors"
                          title="Chọn ngày hết hạn từ lịch"
                        >
                          <Calendar className="w-4 h-4" />
                        </button>
                        <input
                          ref={endPickerRef}
                          type="date"
                          tabIndex={-1}
                          value={dmyToYmd(endDateStr)}
                          onChange={(e) => {
                            if (e.target.value) {
                              handleEndDateChange(ymdToDmy(e.target.value));
                            }
                          }}
                          className="sr-only"
                        />
                      </div>
                    )}

                    {errors.endDate ? (
                      <p className="text-[11px] text-red-600 font-medium mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 shrink-0" />
                        {errors.endDate}
                      </p>
                    ) : isIndefinite ? (
                      <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                        <Info className="w-3 h-3 text-emerald-600 shrink-0" />
                        Hợp đồng không xác định thời hạn, không cần nhập ngày hết hạn.
                      </p>
                    ) : (
                      <p className="text-[10px] text-slate-400 mt-1">
                        Tự tính = Ngày bắt đầu + 12 tháng - 1 ngày (có thể sửa tay)
                      </p>
                    )}
                  </div>
                </div>

                {/* 3. Chế độ lương, Lương Bậc & Ngạch mới */}
                <div className="p-3.5 bg-slate-50/90 rounded-xl border border-slate-200/80 space-y-3">
                  <div className="flex items-center justify-between pb-1 border-b border-slate-200/70">
                    <span className="font-bold text-[11px] uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5 text-blue-600" />
                      Chế độ lương, Bậc & Ngạch (HĐ mới)
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Tùy chọn • Tự động lưu vào hợp đồng mới & hồ sơ
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Mức lương */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="font-bold text-slate-700 text-xs flex items-center gap-1">
                          <span>Mức lương</span>
                        </label>
                        {salaryStr && (
                          <button
                            type="button"
                            onClick={() => setSalaryStr('')}
                            className="text-[10px] text-rose-500 hover:text-rose-700 cursor-pointer font-medium"
                          >
                            Xóa
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          value={salaryStr}
                          onChange={(e) => handleSalaryChange(e.target.value)}
                          placeholder="VD: 6,000,000"
                          disabled={isSubmitting}
                          className="w-full px-3 py-2 text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono-num"
                        />
                      </div>
                      {/* Gợi ý nhanh lương */}
                      <div className="flex flex-wrap gap-1 pt-1.5">
                        {['5,000,000', '6,000,000', '7,000,000', '8,000,000'].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setSalaryStr(preset)}
                            className="px-1.5 py-0.5 text-[10px] rounded bg-white hover:bg-blue-50 hover:text-blue-600 text-slate-600 border border-slate-200 transition-colors cursor-pointer"
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Lương Bậc */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="font-bold text-slate-700 text-xs flex items-center gap-1">
                          <Award className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Lương Bậc</span>
                        </label>
                        {bacLuongStr && (
                          <button
                            type="button"
                            onClick={() => setBacLuongStr('')}
                            className="text-[10px] text-rose-500 hover:text-rose-700 cursor-pointer font-medium"
                          >
                            Xóa
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          value={bacLuongStr}
                          onChange={(e) => setBacLuongStr(e.target.value)}
                          placeholder="VD: Bậc 1, 1/7..."
                          disabled={isSubmitting}
                          className="w-full px-3 py-2 text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                        />
                      </div>
                      {/* Gợi ý nhanh Bậc */}
                      <div className="flex flex-wrap gap-1 pt-1.5">
                        {['Bậc 1', 'Bậc 2', 'Bậc 3', '1/7', '2/7'].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setBacLuongStr(preset)}
                            className="px-1.5 py-0.5 text-[10px] rounded bg-white hover:bg-emerald-50 hover:text-emerald-700 text-slate-600 border border-slate-200 transition-colors cursor-pointer"
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Ngạch lương */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="font-bold text-slate-700 text-xs flex items-center gap-1">
                          <Tag className="w-3.5 h-3.5 text-purple-600" />
                          <span>Ngạch</span>
                        </label>
                        {ngachLuongStr && (
                          <button
                            type="button"
                            onClick={() => setNgachLuongStr('')}
                            className="text-[10px] text-rose-500 hover:text-rose-700 cursor-pointer font-medium"
                          >
                            Xóa
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          value={ngachLuongStr}
                          onChange={(e) => setNgachLuongStr(e.target.value)}
                          placeholder="VD: Chuyên viên..."
                          disabled={isSubmitting}
                          className="w-full px-3 py-2 text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                        />
                      </div>
                      {/* Gợi ý nhanh Ngạch */}
                      <div className="flex flex-wrap gap-1 pt-1.5">
                        {['Công nhân', 'Nhân viên', 'Chuyên viên', 'Kỹ thuật viên'].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setNgachLuongStr(preset)}
                            className="px-1.5 py-0.5 text-[10px] rounded bg-white hover:bg-purple-50 hover:text-purple-700 text-slate-600 border border-slate-200 transition-colors cursor-pointer"
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 4. Ghi chú thêm (không bắt buộc) */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Ghi chú tái ký (tùy chọn)
                  </label>
                  <input
                    type="text"
                    value={contractNote}
                    onChange={(e) => setContractNote(e.target.value)}
                    placeholder="Ví dụ: Tái ký sau khi hoàn thành tốt hợp đồng 1 năm..."
                    disabled={isSubmitting}
                    className="w-full px-3.5 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3.5 border-t border-slate-100 flex items-center justify-end gap-2.5 bg-slate-50/70">
              <button
                type="button"
                onClick={handleCloseAll}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/80 rounded-xl cursor-pointer transition-colors"
              >
                Hủy
              </button>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md shadow-blue-500/20 flex items-center gap-2 cursor-pointer transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang lưu...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>OK</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. HỘP THOẠI XÁC NHẬN THỨ HAI: IN HỢP ĐỒNG */}
      {showPrintConfirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 animate-in fade-in duration-150">
          <div
            className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-xl animate-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
            aria-labelledby="print-dialog-title"
          >
            <h3 id="print-dialog-title" className="text-sm font-bold text-slate-900">
              In hợp đồng
            </h3>

            <p className="text-xs text-slate-600 leading-relaxed">
              Bạn có muốn in hợp đồng cho nhân viên{' '}
              <strong className="text-slate-900">{employee.fullName}</strong> không?
            </p>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-700 space-y-1">
              <div>
                • Số hợp đồng: <strong className="text-blue-700 font-mono-num">{savedEmployee?.soHd || contractNumberStr}</strong>
              </div>
              <div>
                • Hợp đồng mới: <strong>{currentOption.name}</strong>
              </div>
              <div>
                • Thời hạn: từ <strong>{startDateStr}</strong>
                {endDateStr ? ` đến ${endDateStr}` : ' (không xác định)'}
              </div>
              {(savedEmployee?.luongChinhThuc || salaryStr || savedEmployee?.bacLuong || bacLuongStr || savedEmployee?.ngachLuong || ngachLuongStr) && (
                <div>
                  • Chế độ: <strong>
                    {[
                      (savedEmployee?.luongChinhThuc || (salaryStr ? `${salaryStr} đ` : '')),
                      (savedEmployee?.bacLuong || bacLuongStr ? `Bậc ${savedEmployee?.bacLuong || bacLuongStr}` : ''),
                      (savedEmployee?.ngachLuong || ngachLuongStr ? `Ngạch: ${savedEmployee?.ngachLuong || ngachLuongStr}` : ''),
                    ].filter(Boolean).join(' | ')}
                  </strong>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => handleConfirmPrint(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer transition-colors"
              >
                Không
              </button>

              <button
                type="button"
                onClick={() => handleConfirmPrint(true)}
                className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer transition-colors"
              >
                In hợp đồng
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
