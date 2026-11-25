/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Cake,
  Calendar,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Printer,
  Sparkles,
  Gift,
  Building2,
  Users,
  Clock,
  ArrowRight,
  Filter,
} from 'lucide-react';
import { ActiveTab, Employee } from '../types';
import { stripViAccents } from './EmployeeManagementView';
import { isContractTerminated } from '../utils/employeeUtils';

interface BirthdayManagementViewProps {
  employees: Employee[];
  onNavigate: (tab: ActiveTab) => void;
  onOpenPrintDialog?: (employeeIds?: string[]) => void;
}

// Helper: Phân tích ngày sinh chuẩn xác
function parseBirthday(dateStr?: string): { day: number; month: number; year: number } | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const clean = dateStr.trim();
  if (!clean) return null;

  // DD/MM/YYYY hoặc DD-MM-YYYY hoặc DD.MM.YYYY
  const dmyMatch = clean.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10);
    const year = parseInt(dmyMatch[3], 10);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return { day, month, year };
    }
  }

  // YYYY-MM-DD hoặc YYYY/MM/DD
  const ymdMatch = clean.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10);
    const day = parseInt(ymdMatch[3], 10);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return { day, month, year };
    }
  }

  return null;
}

export const BirthdayManagementView: React.FC<BirthdayManagementViewProps> = ({
  employees,
  onNavigate,
  onOpenPrintDialog,
}) => {
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentDay = currentDate.getDate();
  const currentYear = currentDate.getFullYear();

  // State
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [deptFilter, setDeptFilter] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Chỉ lấy danh sách nhân sự đang làm việc (loại bỏ nhân viên đã nghỉ việc / chấm dứt HĐ)
  const activeEmployees = useMemo(() => {
    return employees.filter((emp) => !isContractTerminated(emp));
  }, [employees]);

  // Danh sách phòng ban duy nhất
  const uniqueDepartments = useMemo(() => {
    const set = new Set<string>();
    for (const emp of activeEmployees) {
      const d = (emp.department || emp.phongBanCon || emp.boPhan || '').trim();
      if (d) set.add(d);
      const pb = (emp.phongBan || '').trim();
      if (pb) set.add(pb);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [activeEmployees]);

  // Thống kê sinh nhật theo tháng đã chọn
  const birthdayList = useMemo(() => {
    const list: Array<{
      employee: Employee;
      day: number;
      month: number;
      year: number;
      ageTurning: number;
      status: 'today' | 'upcoming' | 'passed';
      daysLeft: number;
    }> = [];

    for (const emp of activeEmployees) {
      const parsed = parseBirthday(emp.ngaySinh);
      if (!parsed) continue;

      if (parsed.month === selectedMonth) {
        const ageTurning = currentYear - parsed.year;
        let status: 'today' | 'upcoming' | 'passed' = 'upcoming';
        let daysLeft = 0;

        if (selectedMonth === currentMonth) {
          if (parsed.day === currentDay) {
            status = 'today';
            daysLeft = 0;
          } else if (parsed.day > currentDay) {
            status = 'upcoming';
            daysLeft = parsed.day - currentDay;
          } else {
            status = 'passed';
            daysLeft = currentDay - parsed.day;
          }
        }

        list.push({
          employee: emp,
          day: parsed.day,
          month: parsed.month,
          year: parsed.year,
          ageTurning,
          status,
          daysLeft,
        });
      }
    }

    // Sắp xếp ngày tăng dần
    list.sort((a, b) => a.day - b.day);
    return list;
  }, [activeEmployees, selectedMonth, currentMonth, currentDay, currentYear]);

  // Lọc theo điều kiện
  const filteredBirthdayList = useMemo(() => {
    let result = birthdayList;
    if (searchQuery.trim()) {
      const term = searchQuery.trim().toLowerCase();
      result = result.filter(
        (b) =>
          b.employee.fullName.toLowerCase().includes(term) ||
          b.employee.msnv.toLowerCase().includes(term) ||
          (b.employee.department || '').toLowerCase().includes(term)
      );
    }
    if (deptFilter !== 'ALL') {
      const target = stripViAccents(deptFilter);
      result = result.filter(
        (b) =>
          stripViAccents(b.employee.department || '') === target ||
          stripViAccents(b.employee.phongBanCon || '') === target ||
          stripViAccents(b.employee.boPhan || '') === target ||
          stripViAccents(b.employee.phongBan || '') === target
      );
    }
    return result;
  }, [birthdayList, searchQuery, deptFilter]);

  // Phân trang
  const totalPages = Math.max(1, Math.ceil(filteredBirthdayList.length / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedBirthdays = useMemo(() => {
    const startIdx = (safeCurrentPage - 1) * pageSize;
    return filteredBirthdayList.slice(startIdx, startIdx + pageSize);
  }, [filteredBirthdayList, safeCurrentPage, pageSize]);

  const visiblePageNumbers = useMemo(() => {
    const pages: (number | 'ellipsis-start' | 'ellipsis-end')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
      return pages;
    }
    pages.push(1);
    if (safeCurrentPage > 3) {
      pages.push('ellipsis-start');
    }
    const start = Math.max(2, safeCurrentPage - 1);
    const end = Math.min(totalPages - 1, safeCurrentPage + 1);
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    if (safeCurrentPage < totalPages - 2) {
      pages.push('ellipsis-end');
    }
    pages.push(totalPages);
    return pages;
  }, [totalPages, safeCurrentPage]);

  // Sinh nhật hôm nay
  const todayBirthdaysCount = useMemo(() => {
    return activeEmployees.filter((emp) => {
      const parsed = parseBirthday(emp.ngaySinh);
      return parsed && parsed.month === currentMonth && parsed.day === currentDay;
    }).length;
  }, [activeEmployees, currentMonth, currentDay]);

  // Sinh nhật tháng này
  const thisMonthCount = useMemo(() => {
    return activeEmployees.filter((emp) => {
      const parsed = parseBirthday(emp.ngaySinh);
      return parsed && parsed.month === currentMonth;
    }).length;
  }, [activeEmployees, currentMonth]);

  return (
    <div className="space-y-6">
      {/* Banner Tiêu đề & Tác vụ */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-600 text-white rounded-2xl shadow-xs">
            <Cake className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-slate-900 leading-tight">
                Sinh Nhật Nhân Sự
              </h1>
              <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-emerald-100 text-emerald-800">
                Tháng {selectedMonth}: {filteredBirthdayList.length} nhân sự
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Theo dõi danh sách ngày sinh nhật của nhân sự để kịp thời chúc mừng, chuẩn bị quà tặng và chế độ phúc lợi công đoàn
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          {onOpenPrintDialog && filteredBirthdayList.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const ids = filteredBirthdayList.map((b) => b.employee.id);
                onOpenPrintDialog(ids);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-xl shadow-xs cursor-pointer transition-colors"
            >
              <Printer className="w-4 h-4" />
              In thẻ sinh nhật ({filteredBirthdayList.length})
            </button>
          )}
        </div>
      </div>

      {/* Thẻ Thống kê nhanh */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Hôm nay */}
        <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold shrink-0">
            <Gift className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">Sinh nhật hôm nay ({currentDay}/{currentMonth})</div>
            <div className="text-xl font-bold font-mono-num text-rose-600 mt-0.5">
              {todayBirthdaysCount} nhân sự
            </div>
          </div>
        </div>

        {/* Tháng này */}
        <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold shrink-0">
            <Cake className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">Trong Tháng {currentMonth} này</div>
            <div className="text-xl font-bold font-mono-num text-emerald-700 mt-0.5">
              {thisMonthCount} nhân sự
            </div>
          </div>
        </div>

        {/* Tháng đang chọn */}
        <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">Đang chọn xem Tháng {selectedMonth}</div>
            <div className="text-xl font-bold font-mono-num text-slate-900 mt-0.5">
              {birthdayList.length} nhân sự
            </div>
          </div>
        </div>
      </div>

      {/* Bảng Dữ Liệu Sinh Nhật */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        {/* Thanh chọn 12 tháng */}
        <div className="p-5 border-b border-slate-200 space-y-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1">
            <span className="text-xs font-bold text-slate-600 shrink-0 mr-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              Chọn tháng:
            </span>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
              const isSelected = selectedMonth === m;
              const isCurrent = currentMonth === m;

              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setSelectedMonth(m);
                    setCurrentPage(1);
                  }}
                  className={`px-3.5 py-1.5 text-xs font-bold rounded-xl cursor-pointer transition-all shrink-0 flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : isCurrent
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <span>Tháng {m}</span>
                  {isCurrent && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Tháng hiện tại" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Toolbar Lọc & Tìm kiếm */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Tìm nhân sự sinh nhật theo Họ tên, MSNV, Bộ phận..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-blue-600 transition-colors"
              />
            </div>

            <div className="relative w-full sm:w-60">
              <select
                value={deptFilter}
                onChange={(e) => {
                  setDeptFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-3 pr-8 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-blue-600 cursor-pointer appearance-none"
              >
                <option value="ALL">Tất cả các bộ phận ({uniqueDepartments.length})</option>
                {uniqueDepartments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 rotate-90 pointer-events-none" />
            </div>

            {(searchQuery || deptFilter !== 'ALL') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setDeptFilter('ALL');
                  setCurrentPage(1);
                }}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer shrink-0 transition-colors"
              >
                Xóa lọc
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase text-[11px] tracking-wider">
                <th className="py-3.5 px-4 w-12 text-center">STT</th>
                <th className="py-3.5 px-4 min-w-[220px]">Nhân Viên</th>
                <th className="py-3.5 px-4 min-w-[180px]">Bộ Phận / Phòng Ban</th>
                <th className="py-3.5 px-4 w-32 text-center">Ngày Sinh</th>
                <th className="py-3.5 px-4 w-36 text-center">Sinh Nhật Trong Tháng</th>
                <th className="py-3.5 px-4 w-28 text-center">Tuổi</th>
                <th className="py-3.5 px-4 w-36 text-center">Trạng Thái</th>
                <th className="py-3.5 px-4 w-28 text-center">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredBirthdayList.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-400">
                    <Cake className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                    <p className="font-semibold text-sm text-slate-600">
                      Không có nhân sự nào có sinh nhật trong Tháng {selectedMonth}
                      {searchQuery || deptFilter !== 'ALL' ? ' khớp với bộ lọc' : ''}.
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Hãy chọn tháng khác ở thanh chọn tháng phía trên hoặc điều chỉnh lại bộ lọc.
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedBirthdays.map((item, idx) => {
                  const emp = item.employee;
                  const isToday = item.status === 'today';

                  return (
                    <tr
                      key={emp.id || idx}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isToday ? 'bg-rose-50/50' : ''
                      }`}
                    >
                      <td className="py-3.5 px-4 text-center font-mono-num text-slate-400 text-xs">
                        {(safeCurrentPage - 1) * pageSize + idx + 1}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                              isToday
                                ? 'bg-rose-100 text-rose-700 shadow-2xs'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {emp.fullName
                              ? emp.fullName
                                  .split(' ')
                                  .filter(Boolean)
                                  .slice(-2)
                                  .map((n) => n[0])
                                  .join('')
                                  .toUpperCase()
                              : 'NV'}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 truncate flex items-center gap-1.5">
                              <span>{emp.fullName}</span>
                              {isToday && (
                                <span className="text-[10px] bg-rose-500 text-white font-bold px-1.5 py-0.2 rounded-full">
                                  Hôm nay 🎉
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono-num mt-0.5">
                              MSNV: <strong>{emp.msnv || '—'}</strong>
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-slate-700">
                        <span className="font-semibold block truncate" title={emp.department || emp.phongBan}>
                          {emp.department || emp.phongBan || '—'}
                        </span>
                        {emp.phongBanCon && (
                          <span className="text-[11px] text-slate-400 block truncate">
                            {emp.phongBanCon}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-center font-mono-num text-slate-700">
                        {emp.ngaySinh || '—'}
                      </td>

                      <td className="py-3.5 px-4 text-center font-mono-num">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-lg font-bold text-xs ${
                            isToday
                              ? 'bg-rose-600 text-white shadow-2xs animate-pulse'
                              : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          }`}
                        >
                          Ngày {item.day} Tháng {item.month}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-center font-mono-num text-slate-700 font-bold">
                        {item.ageTurning > 0 ? `${item.ageTurning} tuổi` : '—'}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        {selectedMonth === currentMonth ? (
                          isToday ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300 shadow-2xs">
                              <Sparkles className="w-3.5 h-3.5 text-rose-600" />
                              Sinh nhật hôm nay!
                            </span>
                          ) : item.status === 'upcoming' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <Clock className="w-3 h-3 text-emerald-600" />
                              Còn {item.daysLeft} ngày
                            </span>
                          ) : (
                            <span className="inline-block px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
                              Đã qua ({item.daysLeft} ngày trước)
                            </span>
                          )
                        ) : (
                          <span className="inline-block px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                            Tháng {selectedMonth}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        {onOpenPrintDialog && (
                          <button
                            type="button"
                            onClick={() => onOpenPrintDialog([emp.id])}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:text-blue-700 hover:bg-blue-50 rounded-lg border border-slate-200 transition-colors cursor-pointer"
                            title="In thẻ nhân viên này"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>In thẻ</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Phân trang */}
        {filteredBirthdayList.length > 0 && (
          <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
            <div className="flex flex-wrap items-center gap-3">
              <span>
                Đang xem{' '}
                <strong className="font-mono-num text-slate-800">
                  {filteredBirthdayList.length === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1}
                </strong>{' '}
                -{' '}
                <strong className="font-mono-num text-slate-800">
                  {Math.min(safeCurrentPage * pageSize, filteredBirthdayList.length)}
                </strong>{' '}
                trong tổng số{' '}
                <strong className="font-mono-num text-emerald-700">
                  {filteredBirthdayList.length}
                </strong>{' '}
                nhân sự
              </span>

              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">Số dòng:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs font-mono-num font-semibold text-slate-700 focus:outline-none focus:border-emerald-600 cursor-pointer"
                >
                  <option value={10}>10 / trang</option>
                  <option value={20}>20 / trang</option>
                  <option value={50}>50 / trang</option>
                  <option value={100}>100 / trang</option>
                </select>
              </div>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={safeCurrentPage <= 1}
                  onClick={() => setCurrentPage(1)}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                  title="Trang đầu"
                >
                  <ChevronsLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={safeCurrentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Trước</span>
                </button>

                {visiblePageNumbers.map((item) =>
                  typeof item === 'number' ? (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setCurrentPage(item)}
                      className={`min-w-[30px] h-7 px-2 rounded-lg font-mono-num font-bold text-xs transition-colors cursor-pointer ${
                        item === safeCurrentPage
                          ? 'bg-emerald-700 text-white shadow-2xs'
                          : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {item}
                    </button>
                  ) : (
                    <span
                      key={item}
                      className="px-1.5 text-slate-400 font-mono-num select-none"
                    >
                      ...
                    </span>
                  )
                )}

                <button
                  type="button"
                  disabled={safeCurrentPage >= totalPages}
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                >
                  <span>Sau</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={safeCurrentPage >= totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                  title="Trang cuối"
                >
                  <ChevronsRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
