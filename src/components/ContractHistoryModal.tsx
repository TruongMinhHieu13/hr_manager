/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  FileSignature,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  DollarSign,
  Award,
  Building2,
  Briefcase,
  Plus,
  RefreshCw,
  Printer,
  ChevronRight,
  ShieldCheck,
  History,
} from 'lucide-react';
import { Employee, ContractRecord } from '../types';
import { api } from '../api';

interface ContractHistoryModalProps {
  isOpen: boolean;
  employee: Employee | null;
  onClose: () => void;
  onRenewContract?: (employee: Employee) => void;
  onOpenDocumentGenerator?: (
    employee: Employee,
    contractInfo: {
      contractType: string;
      contractTypeName: string;
      startDate: string;
      endDate: string | null;
      contractNumber?: string;
    }
  ) => void;
}

export const ContractHistoryModal: React.FC<ContractHistoryModalProps> = ({
  isOpen,
  employee,
  onClose,
  onRenewContract,
  onOpenDocumentGenerator,
}) => {
  const [contracts, setContracts] = useState<ContractRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = async () => {
    if (!employee) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getContractHistory(employee.id);
      if (data && data.length > 0) {
        setContracts(data);
      } else {
        // Fallback: nếu chưa có bản ghi trong bảng contracts, tạo bản ghi ảo từ thông tin hiện tại
        const fallbackContract: ContractRecord = {
          id: `virtual_${employee.id}`,
          employeeId: employee.id,
          msnv: employee.msnv,
          fullName: employee.fullName,
          contractNumber: employee.soHd || `${employee.msnv}/HĐLĐ`,
          contractType: employee.loaiHd || 'HĐXĐTH',
          contractTypeName: employee.loaiHd === 'HĐTV' ? 'Hợp đồng thử việc' : 'HĐLĐ xác định thời hạn',
          duration: employee.thoiHan || '12 THÁNG',
          startDate: employee.tuNgay || employee.ngayVao || employee.joinDate || '—',
          endDate: employee.denNgay || '—',
          status: employee.tinhTrang === 'Nghỉ việc' ? 'Hết hiệu lực' : (employee.trangThaiHopDong || 'Hiệu lực'),
          salary: employee.luongChinhThuc,
          probationSalary: employee.luongThuViec,
          bacLuong: employee.bacLuong,
          ngachLuong: employee.ngachLuong,
          department: employee.department || employee.phongBan || employee.boPhan,
          position: employee.chucVu || employee.congViec,
          note: employee.ghiChuHopDong || 'Hợp đồng hiện tại theo hồ sơ',
          createdAt: employee.createdAt,
        };
        setContracts([fallbackContract]);
      }
    } catch (err: unknown) {
      console.error('Lỗi khi tải lịch sử hợp đồng:', err);
      const msg = err instanceof Error ? err.message : 'Không thể tải lịch sử hợp đồng';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && employee) {
      loadHistory();
    }
  }, [isOpen, employee]);

  if (!isOpen || !employee) return null;

  const activeContract = contracts.find((c) => c.status === 'Hiệu lực');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* 1. Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-400">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Lịch Sử Hợp Đồng Lao Động</h3>
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30">
                  MSNV: {employee.msnv}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Nhân viên: <strong className="text-white">{employee.fullName}</strong> •{' '}
                {employee.chucVu || employee.congViec || 'Nhân viên'} (
                {employee.phongBanCon || employee.department || employee.phongBan || 'Chưa cập nhật'})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 2. Stats summary */}
        <div className="grid grid-cols-3 gap-3 p-4 bg-slate-50 border-b border-slate-200 shrink-0">
          <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Tổng số hợp đồng
            </span>
            <div className="text-lg font-bold text-slate-900 mt-0.5 font-mono-num flex items-center gap-1.5">
              <span>{contracts.length}</span>
              <span className="text-xs font-normal text-slate-500">hợp đồng đã ký</span>
            </div>
          </div>

          <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Hợp đồng hiện tại
            </span>
            <div className="text-lg font-bold mt-0.5 font-mono-num flex items-center gap-1.5">
              {activeContract ? (
                <span className="text-emerald-700 font-bold flex items-center gap-1 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  {activeContract.contractType} ({activeContract.duration || 'Hiệu lực'})
                </span>
              ) : (
                <span className="text-slate-500 text-sm font-normal">Chưa có HĐ hiệu lực</span>
              )}
            </div>
          </div>

          <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Ngày vào làm việc
            </span>
            <div className="text-lg font-bold text-slate-900 mt-0.5 font-mono-num text-sm flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-blue-600" />
              <span>{employee.ngayVao || employee.joinDate || '—'}</span>
            </div>
          </div>
        </div>

        {/* 3. Main Content: Contract History Timeline */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
              <p className="text-xs font-medium">Đang tải lịch sử hợp đồng...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
          ) : contracts.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs italic">
              Chưa có dữ liệu hợp đồng nào được lưu.
            </div>
          ) : (
            <div className="relative border-l-2 border-slate-200 ml-4 space-y-6 pb-2">
              {contracts.map((c, idx) => {
                const isActive = c.status === 'Hiệu lực';
                const isRenewed = c.status === 'Đã tái ký';
                const isTerminated = c.status === 'Hết hiệu lực' || c.status === 'Đã chấm dứt';

                return (
                  <div key={c.id || idx} className="relative pl-6">
                    {/* Timeline bullet icon */}
                    <div
                      className={`absolute -left-[11px] top-3 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        isActive
                          ? 'bg-emerald-500 border-white text-white shadow-sm ring-4 ring-emerald-100'
                          : isRenewed
                          ? 'bg-blue-500 border-white text-white shadow-2xs'
                          : 'bg-slate-300 border-white text-slate-600'
                      }`}
                    >
                      {isActive ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : (
                        <Clock className="w-2.5 h-2.5" />
                      )}
                    </div>

                    {/* Card Container */}
                    <div
                      className={`rounded-xl border p-4 transition-all shadow-2xs ${
                        isActive
                          ? 'bg-emerald-50/40 border-emerald-300 ring-1 ring-emerald-200/60'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {/* Top row: Số HĐ, Badge trạng thái, Thao tác */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm font-bold text-slate-900">
                            {c.contractNumber || 'HĐLĐ'}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              c.contractType === 'HĐTV'
                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                : c.contractType === 'HĐĐT'
                                ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                                : 'bg-blue-100 text-blue-800 border border-blue-200'
                            }`}
                          >
                            {c.contractType || 'HĐXĐTH'}
                          </span>
                          {c.duration && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                              {c.duration}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1 ${
                              isActive
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : isRenewed
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}
                          >
                            {isActive && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                            {c.status || 'Hiệu lực'}
                          </span>

                          {onOpenDocumentGenerator && (
                            <button
                              type="button"
                              onClick={() => {
                                onOpenDocumentGenerator(employee, {
                                  contractType: c.contractType,
                                  contractTypeName: c.contractTypeName || c.contractType,
                                  startDate: c.startDate,
                                  endDate: c.endDate || null,
                                  contractNumber: c.contractNumber,
                                });
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-white hover:bg-blue-50 border border-blue-200 rounded-lg cursor-pointer transition-colors shadow-2xs"
                              title="Tạo / in văn bản mẫu từ hợp đồng này"
                            >
                              <Printer className="w-3 h-3" />
                              <span>Trộn HĐ</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Middle row: Thông tin chi tiết */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-3 text-xs">
                        <div>
                          <span className="text-slate-400 block text-[11px]">Từ ngày</span>
                          <span className="font-semibold text-slate-800 font-mono-num">
                            {c.startDate || '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[11px]">Đến ngày (Hết hạn)</span>
                          <span className="font-semibold text-slate-800 font-mono-num">
                            {c.endDate || 'Không thời hạn'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[11px]">Chức vụ / Công việc</span>
                          <span className="font-semibold text-slate-800 truncate block">
                            {c.position || employee.chucVu || employee.congViec || '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[11px]">Bộ phận / Phòng ban</span>
                          <span className="font-semibold text-slate-800 truncate block">
                            {c.department || employee.department || employee.phongBan || '—'}
                          </span>
                        </div>
                      </div>

                      {/* Bottom row: Lương, Bậc, Ngạch, Ghi chú */}
                      <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-3 flex-wrap">
                          {(c.salary || c.probationSalary) && (
                            <div className="flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60 font-mono-num">
                              <DollarSign className="w-3 h-3 text-emerald-600" />
                              <span>
                                {c.salary ? `Lương chính thức: ${c.salary}` : `Lương TV: ${c.probationSalary}`}
                              </span>
                            </div>
                          )}
                          {(c.bacLuong || c.ngachLuong) && (
                            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                              {c.bacLuong && <span>Bậc: <strong>{c.bacLuong}</strong></span>}
                              {c.ngachLuong && <span>Ngạch: <strong>{c.ngachLuong}</strong></span>}
                            </div>
                          )}
                        </div>

                        {c.note && (
                          <div className="text-[11px] text-slate-500 italic max-w-sm truncate" title={c.note}>
                            Ghi chú: {c.note}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 4. Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500">
            Dữ liệu hợp đồng được bảo lưu toàn vẹn, không bị xóa sửa lịch sử.
          </div>
          <div className="flex items-center gap-2">
            {onRenewContract && (
              <button
                type="button"
                onClick={() => {
                  onRenewContract(employee);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl cursor-pointer transition-colors shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Ký mới / Tái ký hợp đồng</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl cursor-pointer transition-colors"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
