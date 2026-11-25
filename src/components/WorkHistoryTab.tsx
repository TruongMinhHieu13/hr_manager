import React, { useState, useEffect } from 'react';
import {
  History,
  Calendar,
  Clock,
  UserX,
  UserCheck,
  ShieldAlert,
  AlertCircle
} from 'lucide-react';
import { WorkHistoryItem, WorkHistorySummary } from '../types';

interface WorkHistoryTabProps {
  employeeId: string;
  onOpenTerminateModal: () => void;
  onOpenRehireModal: () => void;
  userRole?: string;
}

export const WorkHistoryTab: React.FC<WorkHistoryTabProps> = ({
  employeeId,
  onOpenTerminateModal,
  onOpenRehireModal,
  userRole = 'HR',
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [histories, setHistories] = useState<WorkHistoryItem[]>([]);
  const [statistics, setStatistics] = useState<WorkHistorySummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isHrOrManager = ['admin', 'manager', 'hr', 'HR', 'Admin'].includes(userRole);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/work-history/by-employee/${employeeId}`, {
        headers: { 'x-user-role': userRole }
      });
      if (!res.ok) throw new Error('Không thể tải lịch sử làm việc');
      const data = await res.json();
      setHistories(data.histories || []);
      setStatistics(data.statistics || null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (employeeId) fetchHistory();
  }, [employeeId]);

  if (loading) {
    return (
      <div className="py-12 text-center text-slate-500">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent mb-3" />
        <p className="text-sm">Đang tải lịch sử công tác...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 text-red-700 rounded-lg flex items-center space-x-2 text-sm">
        <AlertCircle className="w-5 h-5 flex-shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  const hasActiveTurn = histories.some(h => h.status === 'active' || !h.endDate);

  return (
    <div className="space-y-6">
      {/* 1. THỐNG KÊ TỔNG QUAN & NÚT THAO TÁC */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-4">
          <span className="text-xs font-semibold uppercase text-blue-700 block mb-1">Tổng lần vào làm</span>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-blue-900">{statistics?.totalTurns || 0}</span>
            <span className="text-xs text-blue-600">đợt</span>
          </div>
        </div>

        <div className="bg-orange-50/70 border border-orange-200 rounded-xl p-4">
          <span className="text-xs font-semibold uppercase text-orange-700 block mb-1">Tổng lần nghỉ việc</span>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-orange-900">{statistics?.totalResignations || 0}</span>
            <span className="text-xs text-orange-600">lần</span>
          </div>
        </div>

        <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4">
          <span className="text-xs font-semibold uppercase text-emerald-700 block mb-1">Ngày làm cộng dồn</span>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-emerald-900">
              {(statistics?.cumulativeWorkingDays || 0).toLocaleString('vi-VN')}
            </span>
            <span className="text-xs text-emerald-600">ngày</span>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-center">
          <div className="flex gap-2">
            {hasActiveTurn ? (
              <button
                type="button"
                onClick={onOpenTerminateModal}
                className="w-full px-3 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm flex items-center justify-center space-x-1.5 transition cursor-pointer"
              >
                <UserX className="w-3.5 h-3.5" />
                <span>Cho nghỉ việc</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpenRehireModal}
                className="w-full px-3 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm flex items-center justify-center space-x-1.5 transition cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Tái tuyển dụng</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* NHÃN CẢNH BÁO TỰ ĐỘNG */}
      {statistics?.alerts && statistics.alerts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {statistics.alerts.map((alert, idx) => (
            <div
              key={idx}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300"
            >
              <ShieldAlert className="w-4 h-4 text-amber-600" />
              <span>{alert}</span>
            </div>
          ))}
        </div>
      )}

      {/* 2. TIMELINE / DANH SÁCH CHI TIẾT TỪNG ĐỢT LÀM VIỆC */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <History className="w-4 h-4 text-slate-600" />
            <h4 className="font-bold text-slate-800 text-sm">Chi tiết các đợt làm việc</h4>
          </div>
          <span className="text-xs text-slate-500 font-medium">Sắp xếp: Mới nhất trước</span>
        </div>

        <div className="divide-y divide-slate-100">
          {histories.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">Chưa có bản ghi lịch sử làm việc.</div>
          ) : (
            histories.map((item) => {
              const isActive = item.status === 'active' && !item.endDate;
              return (
                <div key={item.id} className="p-4 hover:bg-slate-50/80 transition">
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                    {/* Cột trái: Lần thứ & Thời gian */}
                    <div className="space-y-1.5 min-w-[200px]">
                      <div className="flex items-center space-x-2">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-blue-100 text-blue-800 border border-blue-200">
                          Lần thứ {item.turnNumber}
                        </span>
                        {isActive ? (
                          <span className="inline-flex items-center text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
                            Đang làm việc
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                            Đã kết thúc
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-slate-600 space-y-1">
                        <div className="flex items-center space-x-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>
                            {item.startDate} → {item.endDate || 'Hiện tại'}
                          </span>
                        </div>
                        <div className="flex items-center space-x-1 text-slate-500">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>Thời gian làm: <strong>{item.workingDays} ngày</strong></span>
                        </div>
                      </div>
                    </div>

                    {/* Cột giữa: Vị trí, phòng ban & Hợp đồng */}
                    <div className="flex-1 space-y-1 text-xs">
                      <div className="font-bold text-slate-800 text-sm flex items-center space-x-2">
                        <span>{item.position || 'Nhân viên'}</span>
                        <span className="text-slate-300">•</span>
                        <span className="text-slate-600 font-medium">{item.department}</span>
                      </div>
                      <div className="text-slate-500">
                        Loại hợp đồng: <span className="font-medium text-slate-700">{item.contractType}</span> (MSNV đợt: {item.msnv})
                      </div>
                    </div>

                    {/* Cột phải: Thông tin nghỉ việc & Phân quyền bảo mật */}
                    <div className="md:w-80 bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs space-y-1.5">
                      {item.endDate ? (
                        <>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-500">Hình thức nghỉ:</span>
                            <span className={`font-semibold ${item.resignationType === 'bo_viec' ? 'text-red-600' : 'text-slate-800'}`}>
                              {item.resignationType === 'tu_xin_nghi' && 'Tự xin nghỉ'}
                              {item.resignationType === 'cong_ty_cho_thoi_viec' && 'Công ty cho thôi việc'}
                              {item.resignationType === 'bo_viec' && 'Bỏ việc không báo'}
                              {item.resignationType === 'het_hop_dong' && 'Hết hạn hợp đồng'}
                              {item.resignationType === 'rut_ho_so' && 'Rút hồ sơ'}
                              {item.resignationType === 'khac' && 'Khác'}
                            </span>
                          </div>

                          {isHrOrManager ? (
                            <>
                              {item.resignationReason && (
                                <div className="text-slate-600 bg-white p-2 rounded border border-slate-200">
                                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Lý do nghỉ:</span>
                                  <p className="italic">{item.resignationReason}</p>
                                </div>
                              )}
                              <div className="flex justify-between items-center pt-1 border-t border-slate-200/60">
                                <span className="text-slate-500">Đánh giá tuyển lại:</span>
                                <span className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                                  item.rehireEligibility === 'eligible' ? 'bg-emerald-100 text-emerald-800' :
                                  item.rehireEligibility === 'consider' ? 'bg-amber-100 text-amber-800' :
                                  'bg-red-100 text-red-800'
                                }`}>
                                  {item.rehireEligibility === 'eligible' && '✓ Đủ điều kiện'}
                                  {item.rehireEligibility === 'consider' && '⚠ Cần cân nhắc'}
                                  {item.rehireEligibility === 'ineligible' && '✕ Không tuyển lại'}
                                </span>
                              </div>
                            </>
                          ) : (
                            <p className="text-[11px] text-slate-400 italic">
                              * Lý do và đánh giá tuyển lại chỉ hiển thị cho HR/Quản lý.
                            </p>
                          )}
                        </>
                      ) : (
                        <div className="text-emerald-700 font-medium py-1">
                          Đợt làm việc hiện hành đang hoạt động bình thường.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
