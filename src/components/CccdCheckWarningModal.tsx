import React from 'react';
import { AlertTriangle, UserCheck, ArrowRight, X } from 'lucide-react';

interface CccdCheckWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  cccd: string;
  summary: {
    totalTurns: number;
    totalResignations: number;
    totalAbandonments: number;
    hasActiveTurn: boolean;
    warningMessage: string | null;
    employee: any;
  };
  onSelectRehire: () => void;
  onContinueCreateNew?: () => void;
}

export const CccdCheckWarningModal: React.FC<CccdCheckWarningModalProps> = ({
  isOpen,
  onClose,
  cccd,
  summary,
  onSelectRehire,
}) => {
  if (!isOpen) return null;

  const isActive = summary.hasActiveTurn;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
      <div className={`bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border ${isActive ? 'border-red-300' : 'border-amber-200'}`}>
        {/* Header */}
        <div className={`${isActive ? 'bg-red-600' : 'bg-amber-500'} text-white px-6 py-4 flex items-center justify-between`}>
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-6 h-6 text-white animate-pulse" />
            <h3 className="text-lg font-bold">
              {isActive ? 'Cảnh báo: Nhân sự đang làm việc tại công ty' : 'Cảnh báo: Nhân sự từng làm tại công ty'}
            </h3>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nội dung thông báo */}
        <div className="p-6 space-y-4">
          <div className={`rounded-lg p-4 ${isActive ? 'bg-red-50 border border-red-200 text-red-900' : 'bg-amber-50 border border-amber-200 text-amber-900'}`}>
            <p className="font-semibold text-base mb-1">
              {summary.warningMessage || (isActive 
                ? `Số CCCD/CMND ${cccd} hiện thuộc về nhân viên đang làm việc!` 
                : `Số CCCD/CMND ${cccd} đã từng tồn tại trong hệ thống!`)}
            </p>
            <p className="text-sm">
              Họ tên: <strong>{summary.employee?.full_name || 'Đã có hồ sơ'}</strong> — MSNV: <strong>{summary.employee?.msnv || 'Chưa rõ'}</strong>
              {summary.employee?.department && (
                <> — Bộ phận: <strong>{summary.employee.department}</strong></>
              )}
            </p>
          </div>

          {isActive && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-800 text-sm">
              <span className="font-bold text-red-600">LƯU Ý:</span> Mỗi nhân sự chỉ có một số CCCD duy nhất. Vì nhân viên này đang làm việc, hệ thống <strong>không cho phép</strong> tạo hồ sơ mới hoặc lưu trùng số CCCD này.
            </div>
          )}

          {summary.totalAbandonments > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-800 flex items-start space-x-2 text-sm">
              <span className="font-bold text-red-600">CẢNH BÁO:</span>
              <span>Người này từng có <strong>{summary.totalAbandonments} lần bỏ việc không báo trước</strong>! Hãy cân nhắc kỹ trước khi tuyển dụng.</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="bg-slate-100 p-3 rounded-lg">
              <span className="text-xs text-slate-500 block">Số lần vào làm</span>
              <span className="text-xl font-bold text-blue-600">{summary.totalTurns} lần</span>
            </div>
            <div className="bg-slate-100 p-3 rounded-lg">
              <span className="text-xs text-slate-500 block">Số lần nghỉ việc</span>
              <span className="text-xl font-bold text-orange-600">{summary.totalResignations} lần</span>
            </div>
          </div>

          {!isActive && (
            <p className="text-xs text-slate-500 italic">
              * Lựa chọn "Tái tuyển dụng" giúp điền lại hồ sơ cũ, tự động tăng số lần làm lên đợt mới và giữ nguyên lịch sử công tác trước đó.
            </p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="bg-slate-50 px-6 py-4 flex flex-col sm:flex-row gap-2 justify-end border-t border-slate-100">
          {isActive ? (
            <button
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm transition"
            >
              Đã hiểu / Sửa lại số CCCD
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition"
              >
                Hủy / Nhập CCCD khác
              </button>
              <button
                onClick={onSelectRehire}
                className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm flex items-center justify-center space-x-2 transition"
              >
                <UserCheck className="w-4 h-4" />
                <span>Tái tuyển dụng (Dùng lại hồ sơ cũ)</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
