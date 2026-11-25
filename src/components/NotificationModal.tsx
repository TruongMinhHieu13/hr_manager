/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

export interface NotificationStat {
  label: string;
  value: string | number;
  sublabel?: string;
  color?: 'emerald' | 'amber' | 'blue' | 'rose' | 'slate';
}

export interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  type?: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  stats?: NotificationStat[];
  details?: string[];
  note?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
}

export const NotificationModal: React.FC<NotificationModalProps> = ({
  isOpen,
  onClose,
  type = 'info',
  title,
  message,
  stats,
  details,
  note,
  confirmText = 'Đóng',
  cancelText,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm();
    } else {
      onClose();
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      onClose();
    }
  };

  const getButtonBg = () => {
    switch (type) {
      case 'error':
        return 'bg-red-600 hover:bg-red-700';
      case 'warning':
        return 'bg-amber-600 hover:bg-amber-700';
      case 'success':
        return 'bg-emerald-600 hover:bg-emerald-700';
      case 'info':
      default:
        return 'bg-blue-600 hover:bg-blue-700';
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 animate-in fade-in duration-150"
      onClick={handleCancel}
    >
      <div
        className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 space-y-4 shadow-xl animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Tiêu đề đơn giản căn trái */}
        <h3 className="text-sm font-bold text-slate-900">
          {title}
        </h3>

        {/* Nội dung thông báo căn trái */}
        {message && (
          <p className="text-xs text-slate-600 leading-relaxed">
            {message}
          </p>
        )}

        {/* Thống kê đơn giản (nếu có) */}
        {stats && stats.length > 0 && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5 text-xs text-slate-700">
            {stats.map((s, idx) => (
              <div key={idx} className="flex justify-between items-center">
                <span className="text-slate-600">{s.label}:</span>
                <span className="font-semibold text-slate-900 font-mono-num">
                  {s.value}{' '}
                  {s.sublabel && (
                    <span className="font-normal text-slate-500 text-[11px]">
                      ({s.sublabel})
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Danh sách chi tiết (nếu có) */}
        {details && details.length > 0 && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1 text-xs text-slate-600">
            {details.map((d, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5 shrink-0" />
                <span>{d}</span>
              </div>
            ))}
          </div>
        )}

        {/* Ghi chú (nếu có) */}
        {note && (
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 leading-relaxed">
            {note}
          </div>
        )}

        {/* Nút hành động căn phải góc dưới */}
        <div className="flex justify-end gap-2.5 pt-2">
          {cancelText && (
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer transition-colors"
            >
              {cancelText}
            </button>
          )}
          <button
            type="button"
            onClick={handleConfirm}
            className={`px-4 py-2 text-xs font-bold text-white rounded-lg cursor-pointer transition-colors ${getButtonBg()}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
