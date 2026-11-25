import React, { useState } from 'react';
import { X, UserMinus, UserCheck } from 'lucide-react';
import { ResignationType, RehireEligibility } from '../types';

// =============================================================================
// MODAL 1: CHO NGHỈ VIỆC (ĐÓNG ĐỢT LÀM VIỆC HIỆN TẠI)
// =============================================================================
interface TerminateModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: { id: string; fullName: string; msnv: string; department?: string };
  onSuccess: () => void;
}

export const TerminateModal: React.FC<TerminateModalProps> = ({
  isOpen,
  onClose,
  employee,
  onSuccess,
}) => {
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [resignationType, setResignationType] = useState<ResignationType>('tu_xin_nghi');
  const [reason, setReason] = useState<string>('');
  const [rehireEligibility, setRehireEligibility] = useState<RehireEligibility>('eligible');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!endDate || !reason.trim()) {
      setError('Bắt buộc nhập ngày nghỉ việc và ghi rõ lý do.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/work-history/terminate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: employee.id,
          endDate,
          resignationType,
          resignationReason: reason,
          rehireEligibility,
          approvedBy: 'Trưởng phòng HR',
          performedBy: 'HR_Admin',
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Có lỗi xảy ra khi cho nghỉ việc');

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden border border-slate-200">
        <div className="bg-rose-600 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <UserMinus className="w-5 h-5" />
            <h3 className="font-bold text-base">Thủ tục Cho nghỉ việc nhân sự</h3>
          </div>
          <button onClick={onClose} className="text-rose-100 hover:text-white transition"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg">{error}</div>}

          <div className="bg-slate-50 p-3 rounded-lg text-sm border border-slate-200">
            Nhân sự: <strong>{employee.fullName}</strong> — MSNV: <strong>{employee.msnv}</strong>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Ngày chính thức nghỉ việc *</label>
            <input
              type="date"
              required
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-rose-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Loại nghỉ việc *</label>
            <select
              value={resignationType}
              onChange={(e) => setResignationType(e.target.value as ResignationType)}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-rose-500"
            >
              <option value="tu_xin_nghi">Tự xin nghỉ việc</option>
              <option value="cong_ty_cho_thoi_viec">Công ty cho thôi việc / Sa thải</option>
              <option value="bo_viec">Bỏ việc không báo trước</option>
              <option value="het_hop_dong">Hết hạn hợp đồng</option>
              <option value="rut_ho_so">Rút hồ sơ</option>
              <option value="khac">Khác</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Lý do chi tiết *</label>
            <textarea
              required
              rows={3}
              placeholder="Ghi rõ lý do nghỉ việc để lưu nhật ký..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-rose-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Đánh giá tuyển lại sau này *</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'eligible', label: 'Có thể tuyển lại' },
                { id: 'consider', label: 'Cần cân nhắc' },
                { id: 'ineligible', label: 'Không tuyển lại' },
              ].map((item) => (
                <label key={item.id} className="flex items-center space-x-1.5 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="rehire"
                    checked={rehireEligibility === item.id}
                    onChange={() => setRehireEligibility(item.id as RehireEligibility)}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-4 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer">
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm cursor-pointer"
            >
              {loading ? 'Đang lưu...' : 'Xác nhận Cho nghỉ việc'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// =============================================================================
// MODAL 2: TÁI TUYỂN DỤNG (REHIRE)
// =============================================================================
interface RehireModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: { id: string; fullName: string; cccd: string; msnv: string; department?: string };
  onSuccess: () => void;
}

export const RehireModal: React.FC<RehireModalProps> = ({
  isOpen,
  onClose,
  employee,
  onSuccess,
}) => {
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [newMsnv, setNewMsnv] = useState<string>(employee.msnv || '');
  const [department, setDepartment] = useState<string>(employee.department || '');
  const [position, setPosition] = useState<string>('Công nhân');
  const [contractType, setContractType] = useState<string>('Thử việc');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleRehireSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/work-history/rehire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cccd: employee.cccd,
          newMsnv: newMsnv.trim(),
          startDate,
          department,
          position,
          contractType,
          performedBy: 'HR_Admin',
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Có lỗi xảy ra khi tái tuyển dụng');

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden border border-slate-200">
        <div className="bg-blue-600 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <UserCheck className="w-5 h-5" />
            <h3 className="font-bold text-base">Tái tuyển dụng nhân sự (Đợt làm mới)</h3>
          </div>
          <button onClick={onClose} className="text-blue-100 hover:text-white transition"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleRehireSubmit} className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg">{error}</div>}

          <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg text-xs text-blue-900">
            Hệ thống sẽ giữ nguyên toàn bộ hồ sơ gốc của <strong>{employee.fullName}</strong> (CCCD: {employee.cccd}), tự động tăng số lần vào làm lên đợt mới và kích hoạt lại trạng thái làm việc.
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Mã NV mới (hoặc giữ cũ)</label>
              <input
                type="text"
                value={newMsnv}
                onChange={(e) => setNewMsnv(e.target.value)}
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Ngày vào làm mới *</label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Phòng ban tiếp nhận *</label>
            <input
              type="text"
              required
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Vị trí / Chức vụ</label>
              <input
                type="text"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Loại hợp đồng</label>
              <select
                value={contractType}
                onChange={(e) => setContractType(e.target.value)}
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2"
              >
                <option value="Thử việc">Thử việc</option>
                <option value="Thời vụ">Thời vụ</option>
                <option value="Chính thức 12 tháng">Chính thức 12 tháng</option>
                <option value="Không xác định thời hạn">Không xác định thời hạn</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-4 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer">
              Hủy
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm cursor-pointer"
            >
              {loading ? 'Đang xử lý...' : 'Kích hoạt Tái tuyển dụng'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
