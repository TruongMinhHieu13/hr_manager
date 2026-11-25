/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { X, Calendar } from 'lucide-react';
import { Employee } from '../types';

interface TerminateContractModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: Employee | null;
  onConfirm: (updates: {
    tinhTrang: string;
    trangThaiHopDong: string;
    denNgay?: string;
  }) => Promise<void> | void;
}

function getTodayFormattedDDMMYYYY(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function dmyToYmd(dmy: string): string {
  if (!dmy) return '';
  const match = dmy.trim().match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (match) {
    const d = match[1].padStart(2, '0');
    const m = match[2].padStart(2, '0');
    const y = match[3];
    return `${y}-${m}-${d}`;
  }
  return '';
}

function ymdToDmy(ymd: string): string {
  if (!ymd) return '';
  const parts = ymd.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return ymd;
}

export const TerminateContractModal: React.FC<TerminateContractModalProps> = ({
  isOpen,
  onClose,
  employee,
  onConfirm,
}) => {
  const [updateExpiry, setUpdateExpiry] = useState<boolean>(true);
  const [expiryDate, setExpiryDate] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const hiddenDateInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setUpdateExpiry(true);
      setErrorMsg('');
      setIsSubmitting(false);
      // Mặc định chọn ngày hiện tại (hoặc ngày hết hạn cũ nếu có)
      setExpiryDate(getTodayFormattedDDMMYYYY());
    }
  }, [isOpen, employee]);

  if (!isOpen || !employee) return null;

  const handleOpenPicker = () => {
    if (!updateExpiry) return;
    if (hiddenDateInputRef.current) {
      if (typeof hiddenDateInputRef.current.showPicker === 'function') {
        hiddenDateInputRef.current.showPicker();
      } else {
        hiddenDateInputRef.current.focus();
      }
    }
  };

  const handleNativeDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val) {
      setExpiryDate(ymdToDmy(val));
      setErrorMsg('');
    }
  };

  const handleConfirm = async () => {
    setErrorMsg('');
    if (updateExpiry) {
      const cleanDate = expiryDate.trim();
      if (!cleanDate) {
        setErrorMsg('Vui lòng chọn hoặc nhập Ngày hết hạn hợp đồng.');
        return;
      }
      // Kiểm tra định dạng ngày DD/MM/YYYY cơ bản
      const dmyMatch = cleanDate.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
      if (!dmyMatch) {
        setErrorMsg('Định dạng ngày không hợp lệ. Vui lòng nhập dạng DD/MM/YYYY (VD: 26/02/2022).');
        return;
      }
      const d = parseInt(dmyMatch[1], 10);
      const m = parseInt(dmyMatch[2], 10);
      const y = parseInt(dmyMatch[3], 10);
      if (d < 1 || d > 31 || m < 1 || m > 12 || y < 1900 || y > 2100) {
        setErrorMsg('Ngày, tháng hoặc năm không hợp lệ.');
        return;
      }
    }

    try {
      setIsSubmitting(true);
      const updates: {
        tinhTrang: string;
        trangThaiHopDong: string;
        denNgay?: string;
      } = {
        tinhTrang: 'Hết hiệu lực',
        trangThaiHopDong: 'Hết hiệu lực',
      };

      if (updateExpiry) {
        updates.denNgay = expiryDate.trim();
      }

      await onConfirm(updates);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Có lỗi xảy ra khi chấm dứt hợp đồng';
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-2xl border border-slate-200 w-full max-w-[440px] overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-3 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">Chấm dứt hợp đồng</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-500 hover:text-slate-800 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
            title="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 pb-6 pt-1 space-y-3.5 text-slate-700 text-sm">
          <p className="leading-relaxed">
            Sau khi chấm dứt, hợp đồng sẽ chuyển sang trạng thái <strong>Hết hiệu lực.</strong>
          </p>

          <p className="leading-relaxed">
            Bạn có muốn cập nhật <strong>Ngày hết hạn</strong> của hợp đồng không?
          </p>

          <div className="space-y-3 pt-1">
            {/* Tùy chọn Có */}
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="radio"
                  id="radio_co"
                  name="update_expiry_radio"
                  checked={updateExpiry}
                  onChange={() => {
                    setUpdateExpiry(true);
                    setErrorMsg('');
                  }}
                  className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                />
                <span className="font-normal text-slate-800 text-sm">Có</span>
              </label>

              {/* Ô chọn ngày hết hạn */}
              <div
                className={`relative flex items-center border rounded-md px-2.5 py-1.5 transition-colors ${
                  updateExpiry
                    ? 'border-slate-300 bg-white hover:border-slate-400 focus-within:border-blue-600 focus-within:ring-1 focus-within:ring-blue-600'
                    : 'border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed'
                }`}
              >
                <input
                  type="text"
                  value={expiryDate}
                  disabled={!updateExpiry}
                  onChange={(e) => {
                    setExpiryDate(e.target.value);
                    setErrorMsg('');
                  }}
                  placeholder="DD/MM/YYYY"
                  className="w-28 text-sm text-slate-800 focus:outline-none bg-transparent font-medium"
                />

                {/* Nút xóa ngày */}
                {updateExpiry && expiryDate && (
                  <button
                    type="button"
                    onClick={() => setExpiryDate('')}
                    className="p-0.5 text-slate-400 hover:text-slate-600 cursor-pointer mr-1"
                    title="Xóa ngày"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* Nút mở lịch Calendar */}
                <button
                  type="button"
                  onClick={handleOpenPicker}
                  disabled={!updateExpiry}
                  className={`text-slate-500 hover:text-slate-700 transition-colors ${
                    updateExpiry ? 'cursor-pointer' : 'cursor-not-allowed'
                  }`}
                  title="Chọn ngày từ lịch"
                >
                  <Calendar className="w-4 h-4" />
                </button>

                {/* Native date picker ẩn */}
                <input
                  type="date"
                  ref={hiddenDateInputRef}
                  value={dmyToYmd(expiryDate)}
                  onChange={handleNativeDateChange}
                  className="absolute inset-0 opacity-0 pointer-events-none -z-10"
                  tabIndex={-1}
                />
              </div>
            </div>

            {/* Tùy chọn Không */}
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="radio"
                  id="radio_khong"
                  name="update_expiry_radio"
                  checked={!updateExpiry}
                  onChange={() => {
                    setUpdateExpiry(false);
                    setErrorMsg('');
                  }}
                  className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                />
                <span className="font-normal text-slate-800 text-sm">Không</span>
              </label>
            </div>
          </div>

          {/* Thông báo lỗi nếu có */}
          {errorMsg && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs font-medium text-red-600">
              {errorMsg}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-white border-t border-slate-200 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-5 py-2 text-sm font-normal text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer transition-colors"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="px-5 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-md cursor-pointer transition-colors shadow-xs"
          >
            {isSubmitting ? 'Đang chấm dứt...' : 'Chấm dứt'}
          </button>
        </div>
      </div>
    </div>
  );
};
