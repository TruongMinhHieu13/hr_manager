import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Calendar,
  ChevronDown,
  Check,
  AlertCircle,
  FileCheck,
  User,
  CreditCard,
  Briefcase,
  Building,
} from 'lucide-react';
import { Employee, ResignationApplication, RESIGNATION_REASONS } from '../types';

interface ResignationFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (app: Partial<ResignationApplication>) => Promise<void>;
  initialData?: Partial<ResignationApplication> | null;
  employees: Employee[];
}

export const ResignationFormModal: React.FC<ResignationFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  employees,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Search employee dropdown state
  const [searchEmployeeText, setSearchEmployeeText] = useState('');
  const [isEmployeeDropdownOpen, setIsEmployeeDropdownOpen] = useState(false);
  const employeeDropdownRef = useRef<HTMLDivElement>(null);

  // Form Fields (Tinh gọn đúng theo yêu cầu)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [fullName, setFullName] = useState('');
  const [msnv, setMsnv] = useState('');
  const [donVi, setDonVi] = useState('');
  const [viTri, setViTri] = useState('');
  const [soHd, setSoHd] = useState('');
  const [loaiHd, setLoaiHd] = useState('');
  const [trangThai, setTrangThai] = useState<'Chờ duyệt' | 'Đang thực hiện' | 'Đã hoàn thành' | 'Từ chối'>('Đang thực hiện');
  const [ngayNghi, setNgayNghi] = useState('');
  const [ngayHenTraLuong, setNgayHenTraLuong] = useState('');
  const [lyDo, setLyDo] = useState<string>('Duyệt theo đơn');
  const [thangBaoCao, setThangBaoCao] = useState('');

  function formatDateInput(date: Date): string {
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    return `${d}/${m}/${y}`;
  }

  function getCurrentMonthYear(): string {
    const now = new Date();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const y = now.getFullYear();
    return `${m}/${y}`;
  }

  // Khởi tạo hoặc reset form khi mở modal
  useEffect(() => {
    if (isOpen) {
      setErrorMessage('');
      if (initialData) {
        setSelectedEmployeeId(initialData.employeeId || '');
        setFullName(initialData.fullName || '');
        setMsnv(initialData.msnv || '');
        setDonVi(initialData.donVi || 'CÔNG TY CỔ PHẦN ĐẦU TƯ MẶT TRỜI VIỆT - CN ĐỒNG NAI');
        setViTri(initialData.viTri || '');
        setSoHd(initialData.soHd || '');
        setLoaiHd(initialData.loaiHd || '');
        setTrangThai(initialData.trangThai || 'Đang thực hiện');
        setNgayNghi(initialData.ngayNghi || formatDateInput(new Date()));
        setNgayHenTraLuong(initialData.ngayHenTraLuong || '');
        setLyDo(initialData.lyDo || 'Duyệt theo đơn');
        setThangBaoCao(initialData.thangBaoCao || getCurrentMonthYear());
        setSearchEmployeeText(initialData.fullName || '');
      } else {
        setSelectedEmployeeId('');
        setFullName('');
        setMsnv('');
        setDonVi('');
        setViTri('');
        setSoHd('');
        setLoaiHd('');
        setTrangThai('Đang thực hiện');
        setNgayNghi(formatDateInput(new Date()));
        setNgayHenTraLuong('');
        setLyDo('Duyệt theo đơn');
        setThangBaoCao(getCurrentMonthYear());
        setSearchEmployeeText('');
      }
    }
  }, [isOpen, initialData]);

  // Click outside listener for employee search dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (employeeDropdownRef.current && !employeeDropdownRef.current.contains(e.target as Node)) {
        setIsEmployeeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter employees for searchable select
  const filteredEmployees = useMemo(() => {
    if (!searchEmployeeText.trim()) return employees.slice(0, 50);
    const q = searchEmployeeText.toLowerCase().trim();
    return employees.filter(
      (emp) =>
        emp.fullName?.toLowerCase().includes(q) ||
        emp.msnv?.toLowerCase().includes(q) ||
        emp.department?.toLowerCase().includes(q)
    ).slice(0, 50);
  }, [employees, searchEmployeeText]);

  // Chọn nhân viên -> tự động điền các thông tin liên quan
  const handleSelectEmployee = (emp: Employee) => {
    setSelectedEmployeeId(emp.id);
    setFullName(emp.fullName || '');
    setMsnv(emp.msnv || '');
    setDonVi(emp.donVi || 'CÔNG TY CỔ PHẦN ĐẦU TƯ MẶT TRỜI VIỆT - CN ĐỒNG NAI');
    setViTri(emp.congViec || emp.jobTitle || emp.department || 'Công nhân may');
    setSoHd(emp.soHd || '');
    setLoaiHd(emp.loaiHd || 'HĐXĐTH');
    setSearchEmployeeText(emp.fullName || '');
    setIsEmployeeDropdownOpen(false);
  };

  // Submit form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!fullName.trim() || !msnv.trim()) {
      setErrorMessage('Vui lòng chọn hoặc nhập nhân viên làm đơn nghỉ việc.');
      return;
    }

    try {
      setIsSubmitting(true);
      const appData: Partial<ResignationApplication> = {
        ...(initialData?.id ? { id: initialData.id } : {}),
        employeeId: selectedEmployeeId,
        msnv: msnv.trim(),
        fullName: fullName.trim(),
        donVi: donVi.trim(),
        viTri: viTri.trim(),
        soHd: soHd.trim(),
        loaiHd: loaiHd.trim(),
        trangThai,
        ngayNghi: ngayNghi.trim(),
        ngayHenTraLuong: ngayHenTraLuong.trim(),
        lyDo: lyDo.trim(),
        nhomLyDo: lyDo.trim(),
        thangBaoCao: thangBaoCao.trim(),
        soQuyetDinh: '',
        // Giữ lại công việc / đính kèm cũ nếu có
        danhSachCongViec: initialData?.danhSachCongViec || [],
        taiLieuDinhKem: initialData?.taiLieuDinhKem || [],
      };

      await onSave(appData);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Có lỗi xảy ra khi lưu đơn nghỉ việc';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 md:p-6 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden my-auto">
        {/* Header Modal */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center border border-blue-200 font-bold shrink-0">
              <FileCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {initialData?.id ? 'Cập Nhật Đơn Xin Nghỉ Việc' : 'Thêm Mới Đơn Xin Nghỉ Việc'}
              </h2>
              <p className="text-xs text-slate-500">
                Khung đơn tinh gọn: thông tin nhân sự, ngày nghỉ, hẹn trả lương & lý do
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2.5 text-rose-700 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="font-medium">{errorMessage}</span>
          </div>
        )}

        {/* Form Body - Gọn gàng 2 cột */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 text-xs">
            {/* ================= CỘT TRÁI ================= */}
            <div className="space-y-4">
              {/* 1. Họ và tên * (Searchable Dropdown) */}
              <div className="relative" ref={employeeDropdownRef}>
                <label className="block text-slate-700 font-semibold mb-1.5">
                  Họ và tên <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={searchEmployeeText}
                    placeholder="-- Nhập tên hoặc mã NV để chọn --"
                    onChange={(e) => {
                      setSearchEmployeeText(e.target.value);
                      setFullName(e.target.value);
                      setIsEmployeeDropdownOpen(true);
                    }}
                    onFocus={() => setIsEmployeeDropdownOpen(true)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900 text-xs transition-colors pr-8 font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setIsEmployeeDropdownOpen(!isEmployeeDropdownOpen)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>

                {/* Dropdown danh sách nhân viên */}
                {isEmployeeDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-56 overflow-y-auto z-30 p-1">
                    {filteredEmployees.length === 0 ? (
                      <div className="p-3 text-center text-slate-400 text-xs italic">
                        Không tìm thấy nhân viên phù hợp
                      </div>
                    ) : (
                      filteredEmployees.map((emp) => (
                        <div
                          key={emp.id}
                          onClick={() => handleSelectEmployee(emp)}
                          className={`px-3 py-2 rounded-lg cursor-pointer flex items-center justify-between text-xs hover:bg-blue-50 transition-colors ${
                            selectedEmployeeId === emp.id ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-700'
                          }`}
                        >
                          <div>
                            <span className="font-semibold">{emp.fullName}</span>
                            <span className="text-slate-400 ml-2">({emp.msnv})</span>
                          </div>
                          <span className="text-[11px] text-slate-400">
                            {emp.phongBan || emp.department || '—'}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* 2. Đơn vị công tác */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1.5">
                  Đơn vị công tác
                </label>
                <input
                  type="text"
                  value={donVi}
                  onChange={(e) => setDonVi(e.target.value)}
                  placeholder="CÔNG TY CỔ PHẦN ĐẦU TƯ MẶT TRỜI VIỆT - CN ĐỒNG NAI"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-800 text-xs transition-colors"
                />
              </div>

              {/* 3. Số hợp đồng */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1.5">
                  Số hợp đồng
                </label>
                <input
                  type="text"
                  value={soHd}
                  onChange={(e) => setSoHd(e.target.value)}
                  placeholder="Số hợp đồng lao động"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-800 text-xs transition-colors"
                />
              </div>

              {/* 4. Ngày nghỉ việc */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1.5">
                  Ngày nghỉ việc <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={ngayNghi}
                    placeholder="dd/mm/yyyy"
                    onChange={(e) => setNgayNghi(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900 text-xs pr-14"
                  />
                  <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-slate-400">
                    {ngayNghi && (
                      <button
                        type="button"
                        onClick={() => setNgayNghi('')}
                        className="hover:text-slate-600 p-0.5 rounded cursor-pointer"
                        title="Xóa ngày"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <Calendar className="w-4 h-4 text-slate-500 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* 5. Lý do (Cố định 5 mục) */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1.5">
                  Lý do <span className="text-rose-500">*</span>
                </label>
                <select
                  value={lyDo}
                  onChange={(e) => setLyDo(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900 text-xs font-medium cursor-pointer"
                >
                  {RESIGNATION_REASONS.map((reason) => (
                    <option key={reason} value={reason}>
                      {reason}
                    </option>
                  ))}
                </select>
              </div>

              {/* 6. Trạng thái */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1.5">
                  Trạng thái <span className="text-rose-500">*</span>
                </label>
                <select
                  value={trangThai}
                  onChange={(e) => setTrangThai(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900 text-xs font-semibold cursor-pointer"
                >
                  <option value="Đang thực hiện">Đang thực hiện</option>
                  <option value="Chờ duyệt">Chờ duyệt</option>
                  <option value="Đã hoàn thành">Đã hoàn thành</option>
                  <option value="Từ chối">Từ chối</option>
                </select>
              </div>
            </div>

            {/* ================= CỘT PHẢI ================= */}
            <div className="space-y-4">
              {/* 1. Mã nhân viên */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1.5">
                  Mã nhân viên <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={msnv}
                  placeholder="Mã số nhân viên (ví dụ: NV0123)"
                  onChange={(e) => setMsnv(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900 text-xs font-mono font-bold"
                />
              </div>

              {/* 2. Vị trí công việc */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1.5">
                  Vị trí công việc
                </label>
                <input
                  type="text"
                  value={viTri}
                  onChange={(e) => setViTri(e.target.value)}
                  placeholder="Chức danh / vị trí (ví dụ: Công nhân may)"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-800 text-xs"
                />
              </div>

              {/* 3. Loại hợp đồng */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1.5">
                  Loại hợp đồng
                </label>
                <input
                  type="text"
                  value={loaiHd}
                  onChange={(e) => setLoaiHd(e.target.value)}
                  placeholder="HĐXĐTH / HĐKXDTH / Thử việc..."
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-800 text-xs"
                />
              </div>

              {/* 4. Ngày hẹn trả lương (MỚI) */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1.5">
                  Ngày hẹn trả lương
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={ngayHenTraLuong}
                    placeholder="dd/mm/yyyy (ví dụ: 10/12/2026)"
                    onChange={(e) => setNgayHenTraLuong(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900 text-xs pr-14"
                  />
                  <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-slate-400">
                    {ngayHenTraLuong && (
                      <button
                        type="button"
                        onClick={() => setNgayHenTraLuong('')}
                        className="hover:text-slate-600 p-0.5 rounded cursor-pointer"
                        title="Xóa ngày"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <Calendar className="w-4 h-4 text-slate-500 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* 5. Tháng báo cáo (MỚI) */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1.5">
                  Tháng báo cáo
                </label>
                <input
                  type="text"
                  value={thangBaoCao}
                  placeholder="MM/YYYY (ví dụ: 11/2026)"
                  onChange={(e) => setThangBaoCao(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900 text-xs font-semibold"
                />
              </div>
            </div>
          </div>

          {/* Modal Actions Footer */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-5 py-2.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl cursor-pointer transition-colors"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-xl shadow-sm cursor-pointer transition-colors disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>{isSubmitting ? 'Đang lưu...' : 'Lưu đơn xin nghỉ việc'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
