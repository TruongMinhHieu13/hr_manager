import React, { useState, useEffect } from 'react';
import {
  Search,
  Filter,
  FileSpreadsheet,
  History,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  UserCheck,
  Eye,
  X
} from 'lucide-react';
import ExcelJS from 'exceljs';
import { Employee } from '../types';
import { WorkHistoryTab } from './WorkHistoryTab';
import { RehireModal, TerminateModal } from './WorkHistoryModals';

interface ResignationWorkHistorySectionProps {
  employees: Employee[];
  onUpdateEmployee?: (id: string, updates: Partial<Employee>) => Promise<unknown>;
}

export const ResignationWorkHistorySection: React.FC<ResignationWorkHistorySectionProps> = ({
  employees,
  onUpdateEmployee,
}) => {
  const [minTurns, setMinTurns] = useState<number>(1);
  const [keyword, setKeyword] = useState<string>('');
  const [resignationType, setResignationType] = useState<string>('');
  const [dataList, setDataList] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // Modal xem chi tiết timeline của 1 nhân sự
  const [viewingHistoryEmployee, setViewingHistoryEmployee] = useState<{ id: string; fullName: string; cccd: string } | null>(null);

  // Modal Tái tuyển dụng
  const [rehiringEmployee, setRehiringEmployee] = useState<any | null>(null);

  const fetchReport = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (minTurns) params.append('minTurns', minTurns.toString());
      if (keyword) params.append('keyword', keyword.trim());
      if (resignationType) params.append('resignationType', resignationType);

      const res = await fetch(`/api/work-history/report?${params.toString()}`);
      const json = await res.json();
      setDataList(json.data || []);
    } catch (error) {
      console.error('Lỗi khi tải báo cáo lịch sử làm việc:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [minTurns, resignationType]);

  const exportToExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Lich_su_lam_viec');

    worksheet.columns = [
      { header: 'STT', key: 'stt', width: 6 },
      { header: 'CCCD/CMND', key: 'cccd', width: 16 },
      { header: 'Mã NV', key: 'msnv', width: 12 },
      { header: 'Họ và tên', key: 'fullName', width: 22 },
      { header: 'Phòng ban', key: 'department', width: 20 },
      { header: 'Số ĐT', key: 'phone', width: 14 },
      { header: 'Số lần vào', key: 'totalTurns', width: 12 },
      { header: 'Số lần nghỉ', key: 'totalResignations', width: 12 },
      { header: 'Tổng ngày làm', key: 'workingDays', width: 14 },
      { header: 'Lần bỏ việc', key: 'abandonments', width: 12 },
      { header: 'Ngày nghỉ gần nhất', key: 'lastEndDate', width: 16 },
      { header: 'Lý do nghỉ gần nhất', key: 'lastReason', width: 26 },
      { header: 'Đánh giá tuyển lại', key: 'rehire', width: 18 },
    ];

    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '1E40AF' },
    };

    dataList.forEach((item, index) => {
      worksheet.addRow({
        stt: index + 1,
        cccd: item.cccd,
        msnv: item.currentMsnv,
        fullName: item.fullName,
        department: item.currentDepartment,
        phone: item.phoneNumber,
        totalTurns: item.total_turns,
        totalResignations: item.total_resignations,
        workingDays: item.total_working_days,
        abandonments: item.total_abandonments,
        lastEndDate: item.lastEndDate || '',
        lastReason: item.lastResignationReason || '',
        rehire: item.lastRehireEligibility === 'eligible' ? 'Đủ điều kiện' :
                item.lastRehireEligibility === 'consider' ? 'Cân nhắc' :
                item.lastRehireEligibility === 'ineligible' ? 'Không tuyển lại' : 'Chưa đánh giá',
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Lich_su_lam_viec_nhan_su.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Thanh tìm kiếm & Bộ lọc nhanh gọn */}
      <div className="px-6 pb-4 flex flex-col md:flex-row items-center justify-between gap-3 border-b border-slate-100">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchReport()}
            placeholder="Tìm theo CCCD, họ tên, mã NV, SĐT..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          {/* Lọc số lần vào */}
          <select
            value={minTurns}
            onChange={(e) => setMinTurns(parseInt(e.target.value, 10))}
            className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-800 cursor-pointer font-medium"
          >
            <option value={1}>Tất cả số lần vào</option>
            <option value={2}>Vào làm từ 2 lần trở lên</option>
            <option value={3}>Vào làm từ 3 lần trở lên</option>
          </select>

          {/* Lọc loại nghỉ việc */}
          <select
            value={resignationType}
            onChange={(e) => setResignationType(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-800 cursor-pointer"
          >
            <option value="">Tất cả hình thức nghỉ</option>
            <option value="tu_xin_nghi">Tự xin nghỉ</option>
            <option value="bo_viec">Bỏ việc không báo</option>
            <option value="cong_ty_cho_thoi_viec">Công ty cho thôi việc</option>
            <option value="het_hop_dong">Hết hạn hợp đồng</option>
            <option value="rut_ho_so">Rút hồ sơ</option>
          </select>

          <button
            type="button"
            onClick={fetchReport}
            className="p-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition cursor-pointer"
            title="Tải lại dữ liệu"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={exportToExcel}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl cursor-pointer shadow-2xs transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Xuất Excel</span>
          </button>
        </div>
      </div>

      {/* Bảng danh sách Lịch sử làm việc gọn gàng */}
      <div className="overflow-x-auto min-h-[160px]">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
            <tr>
              <th className="py-3 px-4 w-10 text-center">STT</th>
              <th className="py-3 px-4">Nhân sự & Mã NV</th>
              <th className="py-3 px-4 w-32 font-mono">CCCD / CMND</th>
              <th className="py-3 px-4 text-center w-28">Số lần Vào / Nghỉ</th>
              <th className="py-3 px-4 text-center w-28">Tổng ngày làm</th>
              <th className="py-3 px-4">Lần nghỉ gần nhất</th>
              <th className="py-3 px-4 w-36">Đánh giá tuyển lại</th>
              <th className="py-3 px-4 text-center w-28">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {loading ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-400 italic">
                  Đang tải dữ liệu lịch sử làm việc...
                </td>
              </tr>
            ) : dataList.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-400 italic">
                  Không tìm thấy hồ sơ lịch sử làm việc nào phù hợp.
                </td>
              </tr>
            ) : (
              dataList.map((row, idx) => (
                <tr key={row.cccd} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-4 text-center font-mono-num text-slate-400">
                    {idx + 1}
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-900">{row.fullName}</div>
                    <div className="text-[11px] text-slate-500">
                      MSNV: {row.currentMsnv || '—'} • {row.currentDepartment}
                    </div>
                  </td>
                  <td className="py-3 px-4 font-mono font-bold text-slate-700">
                    {row.cccd}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="inline-block px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold text-[11px]">
                      {row.total_turns} vào
                    </span>
                    <span className="mx-1 text-slate-300">/</span>
                    <span className="inline-block px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 font-bold text-[11px]">
                      {row.total_resignations} nghỉ
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center font-bold text-slate-800">
                    {parseInt(row.total_working_days || '0', 10).toLocaleString('vi-VN')} ngày
                  </td>
                  <td className="py-3 px-4">
                    {row.lastEndDate ? (
                      <div>
                        <div className="font-semibold text-slate-800">{row.lastEndDate}</div>
                        <div className="text-slate-500 italic text-[11px] max-w-[200px] truncate" title={row.lastResignationReason}>
                          {row.lastResignationReason || 'Không ghi lý do'}
                        </div>
                      </div>
                    ) : (
                      <span className="text-emerald-600 font-medium text-[11px]">Đang làm việc</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                      row.lastRehireEligibility === 'eligible' ? 'bg-emerald-100 text-emerald-800' :
                      row.lastRehireEligibility === 'consider' ? 'bg-amber-100 text-amber-800' :
                      row.lastRehireEligibility === 'ineligible' ? 'bg-red-100 text-red-800' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {row.lastRehireEligibility === 'eligible' && 'Đủ điều kiện'}
                      {row.lastRehireEligibility === 'consider' && 'Cân nhắc'}
                      {row.lastRehireEligibility === 'ineligible' && 'Không tuyển lại'}
                      {(!row.lastRehireEligibility || !['eligible', 'consider', 'ineligible'].includes(row.lastRehireEligibility)) && 'Chưa đánh giá'}
                    </span>
                    {row.total_abandonments > 0 && (
                      <div className="mt-1">
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.2 bg-red-100 text-red-800 rounded text-[10px] font-bold">
                          <AlertTriangle className="w-2.5 h-2.5 text-red-600" />
                          <span>Bỏ việc {row.total_abandonments}L</span>
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setViewingHistoryEmployee({
                            id: row.employeeId,
                            fullName: row.fullName,
                            cccd: row.cccd,
                          });
                        }}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                        title="Xem toàn bộ timeline lịch sử các đợt làm việc"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      {row.lastEndDate && (
                        <button
                          type="button"
                          onClick={() => {
                            setRehiringEmployee({
                              id: row.employeeId,
                              fullName: row.fullName,
                              cccd: row.cccd,
                              msnv: row.currentMsnv,
                              department: row.currentDepartment,
                            });
                          }}
                          className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition cursor-pointer"
                          title="Tái tuyển dụng (Mở đợt làm việc mới)"
                        >
                          <UserCheck className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL XEM CHI TIẾT LỊCH SỬ CỦA 1 NHÂN SỰ */}
      {viewingHistoryEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
            <div className="bg-blue-600 text-white px-5 py-3.5 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2">
                <History className="w-5 h-5 text-blue-100" />
                <h3 className="font-bold text-sm">
                  Lịch sử công tác: {viewingHistoryEmployee.fullName} (CCCD: {viewingHistoryEmployee.cccd})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setViewingHistoryEmployee(null)}
                className="text-blue-100 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 bg-slate-50">
              <WorkHistoryTab
                employeeId={viewingHistoryEmployee.id}
                onOpenTerminateModal={() => {}}
                onOpenRehireModal={() => {
                  const emp = viewingHistoryEmployee;
                  setViewingHistoryEmployee(null);
                  setRehiringEmployee(emp);
                }}
              />
            </div>

            <div className="px-5 py-3 bg-white border-t border-slate-200 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setViewingHistoryEmployee(null)}
                className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer transition"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL TÁI TUYỂN DỤNG TRỰC TIẾP TẠI ĐÂY */}
      {rehiringEmployee && (
        <RehireModal
          isOpen={!!rehiringEmployee}
          employee={rehiringEmployee}
          onClose={() => setRehiringEmployee(null)}
          onSuccess={() => {
            setRehiringEmployee(null);
            if (onUpdateEmployee && rehiringEmployee.id) {
              onUpdateEmployee(rehiringEmployee.id, { tinhTrang: 'Đang làm việc' });
            }
            fetchReport();
          }}
        />
      )}
    </div>
  );
};
