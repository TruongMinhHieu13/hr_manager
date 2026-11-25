/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Users,
  Building2,
  Cake,
  PieChart,
  BarChart3,
  BarChartHorizontal,
  Search,
  Heart,
  ArrowRight,
  ScrollText,
  Sparkles,
} from 'lucide-react';
import {
  ActiveTab,
  CardTemplate,
  Department,
  Employee,
  ImportHistory,
  PrintHistory,
} from '../types';
import { isContractTerminated } from '../utils/employeeUtils';

interface DashboardViewProps {
  employees: Employee[];
  departments?: Department[];
  templates?: CardTemplate[];
  selectedTemplate?: CardTemplate;
  importLogs?: ImportHistory[];
  printLogs?: PrintHistory[];
  onNavigate: (tab: ActiveTab) => void;
  onOpenImportModal?: () => void;
  onPrintDepartment?: (department: string) => void;
  onSeedSampleEmployees?: () => Promise<void>;
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

// Helper: Phân tích ngày tháng năm đầy đủ (DD/MM/YYYY, YYYY-MM-DD, Excel serial)
function parseFullDate(dateStr?: string): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const clean = dateStr.trim();
  if (!clean) return null;

  // DD/MM/YYYY hoặc DD-MM-YYYY hoặc DD.MM.YYYY
  const dmyMatch = clean.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  // YYYY-MM-DD
  const ymdMatch = clean.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  // Excel serial number
  if (/^\d{5}$/.test(clean)) {
    const serial = parseInt(clean, 10);
    const excelEpoch = new Date(1899, 11, 30);
    const d = new Date(excelEpoch.getTime() + serial * 86400000);
    if (!isNaN(d.getTime())) return d;
  }

  const parsed = new Date(clean);
  return !isNaN(parsed.getTime()) ? parsed : null;
}

// Bảng màu đẹp mắt cho các thành phần dân tộc
const ETHNIC_COLORS = [
  { bg: 'bg-blue-600', text: 'text-blue-700', light: 'bg-blue-50', hex: '#2563eb' },
  { bg: 'bg-emerald-600', text: 'text-emerald-700', light: 'bg-emerald-50', hex: '#059669' },
  { bg: 'bg-amber-500', text: 'text-amber-700', light: 'bg-amber-50', hex: '#f59e0b' },
  { bg: 'bg-purple-600', text: 'text-purple-700', light: 'bg-purple-50', hex: '#9333ea' },
  { bg: 'bg-rose-500', text: 'text-rose-700', light: 'bg-rose-50', hex: '#f43f5e' },
  { bg: 'bg-cyan-600', text: 'text-cyan-700', light: 'bg-cyan-50', hex: '#0891b2' },
  { bg: 'bg-indigo-600', text: 'text-indigo-700', light: 'bg-indigo-50', hex: '#4f46e5' },
  { bg: 'bg-orange-500', text: 'text-orange-700', light: 'bg-orange-50', hex: '#ea580c' },
  { bg: 'bg-teal-600', text: 'text-teal-700', light: 'bg-teal-50', hex: '#0d9488' },
  { bg: 'bg-slate-600', text: 'text-slate-700', light: 'bg-slate-100', hex: '#475569' },
];

export const DashboardView: React.FC<DashboardViewProps> = ({
  employees,
  departments = [],
  onNavigate,
  onOpenPrintDialog,
}) => {
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1; // 1 - 12
  const currentDay = currentDate.getDate();
  const currentYear = currentDate.getFullYear();

  // State cho biểu đồ phòng ban (Mặc định là thanh ngang & luôn show tất cả)
  const [deptSearchTerm, setDeptSearchTerm] = useState<string>('');
  const [deptChartType, setDeptChartType] = useState<'column' | 'bar'>('bar');
  const [deptStackGender, setDeptStackGender] = useState<boolean>(true);
  const [hoveredDept, setHoveredDept] = useState<{
    name: string;
    count: number;
    male: number;
    female: number;
    percentage: number;
  } | null>(null);

  // Chỉ lấy danh sách nhân viên đang làm việc (loại bỏ nhân viên đã nghỉ việc / chấm dứt HĐ)
  const activeEmployees = useMemo(() => {
    return employees.filter((emp) => !isContractTerminated(emp));
  }, [employees]);

  // 1. Thống kê tổng quan (chỉ tính nhân sự đang làm việc)
  const totalEmployees = activeEmployees.length;

  // 2. Thống kê theo phòng ban
  const deptStats = useMemo(() => {
    const map = new Map<string, { count: number; male: number; female: number }>();
    for (const emp of activeEmployees) {
      const d = (emp.department || emp.phongBan || 'Chưa phân bổ').trim();
      const item = map.get(d) || { count: 0, male: 0, female: 0 };
      item.count++;
      const gender = (emp.gioiTinh || '').toLowerCase();
      if (gender.includes('nữ') || gender.includes('nu')) {
        item.female++;
      } else if (gender.includes('nam')) {
        item.male++;
      }
      map.set(d, item);
    }

    const list = Array.from(map.entries()).map(([name, data]) => ({
      name,
      count: data.count,
      male: data.male,
      female: data.female,
      percentage: totalEmployees > 0 ? (data.count / totalEmployees) * 100 : 0,
    }));

    // Sắp xếp phòng ban đông nhân sự nhất lên đầu
    list.sort((a, b) => b.count - a.count);
    return list;
  }, [activeEmployees, totalEmployees]);

  // Bộ lọc phòng ban hiển thị trên biểu đồ (Luôn luôn show tất cả phòng ban)
  const displayedDeptStats = useMemo(() => {
    let list = deptStats;
    if (deptSearchTerm.trim()) {
      const term = deptSearchTerm.trim().toLowerCase();
      list = list.filter((d) => d.name.toLowerCase().includes(term));
    }
    return list;
  }, [deptStats, deptSearchTerm]);

  const maxDeptCount = deptStats[0]?.count || 1;

  // Tính toán thang đo trục số cho biểu đồ (Scale & Ticks)
  const chartMaxCount = useMemo(() => {
    const maxVal = Math.max(1, ...(displayedDeptStats.length ? displayedDeptStats.map((d) => d.count) : [1]));
    if (maxVal <= 10) return Math.ceil(maxVal / 2) * 2 || 10;
    if (maxVal <= 25) return Math.ceil(maxVal / 5) * 5 || 25;
    if (maxVal <= 50) return Math.ceil(maxVal / 10) * 10 || 50;
    if (maxVal <= 100) return Math.ceil(maxVal / 20) * 20 || 100;
    return Math.ceil(maxVal / 50) * 50;
  }, [displayedDeptStats]);

  const chartTicks = useMemo(() => {
    const step =
      chartMaxCount <= 10
        ? 2
        : chartMaxCount <= 25
        ? 5
        : chartMaxCount <= 50
        ? 10
        : chartMaxCount <= 100
        ? 20
        : 50;
    const ticks: number[] = [];
    for (let i = 0; i <= chartMaxCount; i += step) {
      ticks.push(i);
    }
    return ticks;
  }, [chartMaxCount]);

  // 3. Thống kê theo giới tính
  const genderStats = useMemo(() => {
    let female = 0;
    let male = 0;
    let other = 0;

    for (const emp of activeEmployees) {
      const g = (emp.gioiTinh || '').toLowerCase().trim();
      if (g.includes('nữ') || g.includes('nu')) {
        female++;
      } else if (g.includes('nam')) {
        male++;
      } else {
        other++;
      }
    }

    const femalePercent = totalEmployees > 0 ? (female / totalEmployees) * 100 : 0;
    const malePercent = totalEmployees > 0 ? (male / totalEmployees) * 100 : 0;
    const otherPercent = totalEmployees > 0 ? (other / totalEmployees) * 100 : 0;

    return {
      female,
      male,
      other,
      femalePercent,
      malePercent,
      otherPercent,
    };
  }, [activeEmployees, totalEmployees]);

  // 4. Thống kê theo dân tộc
  const ethnicityStats = useMemo(() => {
    const map = new Map<string, number>();
    for (const emp of activeEmployees) {
      const e = (emp.danToc || 'Chưa cập nhật').trim();
      map.set(e, (map.get(e) || 0) + 1);
    }

    const list = Array.from(map.entries()).map(([name, count], index) => {
      const color = ETHNIC_COLORS[index % ETHNIC_COLORS.length];
      const percentage = totalEmployees > 0 ? (count / totalEmployees) * 100 : 0;
      return {
        name,
        count,
        percentage,
        color,
      };
    });

    // Sắp xếp số lượng giảm dần
    list.sort((a, b) => b.count - a.count);
    return list;
  }, [activeEmployees, totalEmployees]);

  // 5. Thống kê sinh nhật trong tháng hiện tại
  const thisMonthBirthdayCount = useMemo(() => {
    return activeEmployees.filter((emp) => {
      const parsed = parseBirthday(emp.ngaySinh);
      return parsed && parsed.month === currentMonth;
    }).length;
  }, [activeEmployees, currentMonth]);

  // Sinh nhật hôm nay
  const todayBirthdaysCount = useMemo(() => {
    return activeEmployees.filter((emp) => {
      const parsed = parseBirthday(emp.ngaySinh);
      return parsed && parsed.month === currentMonth && parsed.day === currentDay;
    }).length;
  }, [activeEmployees, currentMonth, currentDay]);

  // 6. Tính toán thống kê hợp đồng sắp hết hạn
  const contractStats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let expired = 0;
    let within7Days = 0;
    let within30Days = 0;
    let totalWithContract = 0;

    for (const emp of activeEmployees) {
      const denNgayStr = (emp.denNgay || '').trim();
      if (!denNgayStr) continue;

      const expiry = parseFullDate(denNgayStr);
      if (!expiry) continue;
      expiry.setHours(0, 0, 0, 0);

      totalWithContract++;
      const diffDays = Math.round((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays < 0) {
        expired++;
      } else {
        if (diffDays <= 7) within7Days++;
        if (diffDays <= 30) within30Days++;
      }
    }

    return {
      expired,
      within7Days,
      within30Days,
      totalNeedAction: expired + within30Days,
      total: totalWithContract,
    };
  }, [activeEmployees]);

  return (
    <div className="space-y-6">
      {/* 1. Header & KPI Cards */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-blue-700 text-white rounded-xl shadow-xs">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 leading-tight">
                Báo Cáo Thống Kê Nhân Sự & Lao Động
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Tổng quan dữ liệu nhân lực theo phòng ban, cơ cấu giới tính, thành phần dân tộc và sinh nhật nhân sự
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          <button
            type="button"
            onClick={() => onNavigate('employees')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer transition-colors"
          >
            <Users className="w-4 h-4 text-slate-500" />
            Quản lý nhân viên
            <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
          </button>
          <button
            type="button"
            onClick={() => onNavigate('departments')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer transition-colors"
          >
            <Building2 className="w-4 h-4 text-slate-500" />
            Quản lý bộ phận
            <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>
      </div>

      {/* Overview Metric Cards: 5 Thẻ tóm tắt số liệu gọn gàng */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* Card 1: Tổng nhân sự */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900 font-mono-num">
              {totalEmployees}
            </div>
            <div className="text-xs font-medium text-slate-500">
              Tổng số nhân sự
            </div>
          </div>
        </div>

        {/* Card 2: Tỷ lệ Giới tính */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <Heart className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5 font-mono-num">
              <span className="text-xl font-bold text-rose-600">
                {genderStats.female} <span className="text-[11px] font-medium">Nữ</span>
              </span>
              <span className="text-slate-300">/</span>
              <span className="text-xl font-bold text-blue-700">
                {genderStats.male} <span className="text-[11px] font-medium">Nam</span>
              </span>
            </div>
            <div className="text-[11px] font-medium text-slate-500 truncate">
              {genderStats.femalePercent.toFixed(0)}% Nữ • {genderStats.malePercent.toFixed(0)}% Nam
            </div>
          </div>
        </div>

        {/* Card 3: Số bộ phận */}
        <div
          onClick={() => onNavigate('departments')}
          className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center gap-3.5 cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all"
          title="Bấm để xem danh sách phòng ban / bộ phận"
        >
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900 font-mono-num">
              {deptStats.length}
            </div>
            <div className="text-xs font-medium text-slate-500">
              Bộ phận / Phòng ban
            </div>
          </div>
        </div>

        {/* Card 4: Hợp đồng sắp hết hạn (Bấm để xem chi tiết ở menu) */}
        <div
          onClick={() => onNavigate('expiring_contracts')}
          className={`bg-white border rounded-2xl p-4 shadow-xs flex items-center justify-between gap-3 cursor-pointer transition-all hover:shadow-sm ${
            contractStats.totalNeedAction > 0
              ? 'border-amber-300 bg-amber-50/20 hover:border-amber-400'
              : 'border-slate-200 hover:border-blue-300'
          }`}
          title="Bấm để mở trang Quản lý hợp đồng sắp hết hạn"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                contractStats.expired > 0
                  ? 'bg-red-50 text-red-600'
                  : 'bg-amber-50 text-amber-700'
              }`}
            >
              <ScrollText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-2xl font-bold font-mono-num text-slate-900">
                  {contractStats.totalNeedAction}
                </span>
                {contractStats.expired > 0 && (
                  <span className="text-[10px] font-bold bg-red-100 text-red-700 px-1.5 py-0.2 rounded-full">
                    {contractStats.expired} quá hạn
                  </span>
                )}
              </div>
              <div className="text-xs font-medium text-slate-500 truncate">
                HĐ cần xử lý (≤ 30 ngày)
              </div>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
        </div>

        {/* Card 5: Sinh nhật tháng này (Bấm để xem chi tiết ở menu) */}
        <div
          onClick={() => onNavigate('birthdays')}
          className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center justify-between gap-3 cursor-pointer hover:border-emerald-300 hover:shadow-sm transition-all"
          title="Bấm để mở trang Sinh nhật nhân sự"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <Cake className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-2xl font-bold text-emerald-700 font-mono-num">
                  {thisMonthBirthdayCount}
                </span>
                {todayBirthdaysCount > 0 && (
                  <span className="text-[10px] font-bold bg-rose-100 text-rose-700 px-1.5 py-0.2 rounded-full animate-pulse">
                    {todayBirthdaysCount} hôm nay
                  </span>
                )}
              </div>
              <div className="text-xs font-medium text-slate-500 truncate">
                Sinh nhật Tháng {currentMonth}
              </div>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
        </div>
      </div>

      {/* 2. Charts Section: Grid 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* CHART 1: Biểu Đồ Nhân Sự Theo Phòng Ban (Chiếm 7 cột) */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl shadow-xs p-6 space-y-4 flex flex-col">
          {/* Header & Controls */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
                  <BarChart3 className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-bold text-slate-900">
                  Biểu Đồ Nhân Sự Theo Phòng Ban
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Phân bổ {totalEmployees} nhân sự qua {deptStats.length} phòng ban/bộ phận
              </p>
            </div>

            {/* Các bộ điều khiển biểu đồ */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Chọn kiểu biểu đồ: Cột đứng / Thanh ngang */}
              <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => setDeptChartType('column')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    deptChartType === 'column'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Biểu đồ cột đứng"
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  <span>Cột đứng</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDeptChartType('bar')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    deptChartType === 'bar'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Biểu đồ thanh ngang"
                >
                  <BarChartHorizontal className="w-3.5 h-3.5" />
                  <span>Thanh ngang</span>
                </button>
              </div>

              {/* Bật / Tắt phân loại Nam - Nữ */}
              <button
                type="button"
                onClick={() => setDeptStackGender(!deptStackGender)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg border cursor-pointer transition-colors ${
                  deptStackGender
                    ? 'bg-blue-50 border-blue-200 text-blue-700'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
                title="Bật/tắt phân tách Nam - Nữ trong biểu đồ"
              >
                {deptStackGender ? '✓ Chia Nam/Nữ' : 'Tổng số'}
              </button>
            </div>
          </div>

          {/* Dòng tìm kiếm & Chú thích Legend */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Ô tìm kiếm phòng ban */}
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={deptSearchTerm}
                onChange={(e) => setDeptSearchTerm(e.target.value)}
                placeholder="Tìm nhanh tên bộ phận..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-600 focus:bg-white transition-colors"
              />
            </div>

            {/* Legend chú thích */}
            <div className="flex items-center gap-4 text-xs shrink-0 self-end sm:self-auto">
              {deptStackGender ? (
                <>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-rose-500 inline-block shadow-2xs" />
                    <span className="font-medium text-slate-700">Nữ</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-blue-600 inline-block shadow-2xs" />
                    <span className="font-medium text-slate-700">Nam</span>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-gradient-to-r from-blue-600 to-indigo-600 inline-block" />
                  <span className="font-medium text-slate-700">Tổng nhân sự (NV)</span>
                </div>
              )}
            </div>
          </div>

          {/* Dải thông tin hiển thị khi hover - Cố định chiều cao triệt tiêu 100% hiện tượng giật (Layout Shift) */}
          <div className="h-9 px-3.5 rounded-xl border border-slate-200/80 bg-slate-50 flex items-center justify-between text-xs overflow-hidden select-none">
            {hoveredDept ? (
              <div className="flex flex-wrap items-center justify-between w-full gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                  <span className="font-bold text-slate-800 truncate max-w-xs" title={hoveredDept.name}>
                    {hoveredDept.name}
                  </span>
                </div>
                <div className="flex items-center gap-3 font-mono-num text-[11px] shrink-0">
                  <span className="text-slate-600">
                    Tổng: <strong className="text-slate-900 font-bold">{hoveredDept.count} NV</strong> ({hoveredDept.percentage.toFixed(1)}%)
                  </span>
                  <span className="text-rose-600 font-medium">
                    ♀ Nữ: <strong>{hoveredDept.female}</strong>
                  </span>
                  <span className="text-blue-700 font-medium">
                    ♂ Nam: <strong>{hoveredDept.male}</strong>
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-slate-400 text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                <span>Rê chuột vào cột hoặc thanh để xem nhanh chi tiết số lượng Nam / Nữ và tỷ lệ</span>
              </div>
            )}
          </div>

          {/* KHÔNG CÓ DỮ LIỆU */}
          {displayedDeptStats.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-xs">
              Không tìm thấy phòng ban nào khớp với từ khóa tìm kiếm.
            </div>
          ) : deptChartType === 'column' ? (
            /* ========================================================
               CHART KIỂU 1: BIỂU ĐỒ CỘT ĐỨNG (VERTICAL COLUMN CHART)
               - Fix 100% theo màn hình (Không tràn ngang, không sinh scrollbar)
               ======================================================== */
            <div className="relative pt-2 pb-1 select-none w-full">
              <div className="flex">
                {/* Trục Tung Y-Axis (Số lượng nhân sự) */}
                <div className="flex flex-col justify-between items-end pr-2 text-[10px] font-mono-num text-slate-400 w-8 shrink-0 h-64 select-none">
                  {chartTicks
                    .slice()
                    .reverse()
                    .map((tick) => (
                      <span key={tick} className="leading-none">
                        {tick}
                      </span>
                    ))}
                </div>

                {/* Vùng Vẽ Biểu Đồ (Chart Canvas - Fix 100% width) */}
                <div className="relative flex-1 min-w-0">
                  {/* Grid lines & Cột */}
                  <div className="relative h-64 w-full">
                    {/* Các đường lưới ngang (Horizontal Grid Lines) */}
                    <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                      {chartTicks
                        .slice()
                        .reverse()
                        .map((tick, i) => (
                          <div
                            key={tick}
                            className={`w-full border-b ${
                              i === chartTicks.length - 1
                                ? 'border-slate-300'
                                : 'border-slate-100 border-dashed'
                            }`}
                          />
                        ))}
                    </div>

                    {/* Danh sách các Cột (Tự co giãn đều 100% chiều ngang màn hình) */}
                    <div className="absolute inset-0 flex items-end justify-between gap-0.5 sm:gap-1 px-1 z-10">
                      {displayedDeptStats.map((item, idx) => {
                        const totalHeightPct = (item.count / chartMaxCount) * 100;
                        const isHovered = hoveredDept?.name === item.name;

                        // Hiển thị số trên đỉnh cột: hiện đủ khi ít cột, hoặc khi hover, hoặc các cột top
                        const showValue =
                          displayedDeptStats.length <= 12 ||
                          (displayedDeptStats.length <= 20 && idx % 2 === 0) ||
                          isHovered ||
                          idx < 3;

                        return (
                          <div
                            key={item.name}
                            className="flex-1 min-w-0 h-full flex flex-col items-center justify-end group cursor-pointer relative"
                            onMouseEnter={() => setHoveredDept(item)}
                            onMouseLeave={() => setHoveredDept(null)}
                          >
                            {/* Nhãn số lượng trên đỉnh cột */}
                            <div
                              className={`text-[9px] sm:text-[10px] font-mono-num font-bold mb-1 transition-all leading-none ${
                                isHovered
                                  ? 'text-blue-700 scale-110 z-20'
                                  : showValue
                                  ? 'text-slate-600'
                                  : 'opacity-0 group-hover:opacity-100 text-blue-700'
                              }`}
                            >
                              {item.count}
                            </div>

                            {/* Cột Bar */}
                            <div
                              className={`w-full rounded-t-sm sm:rounded-t-md overflow-hidden flex flex-col justify-end transition-all duration-200 shadow-2xs ${
                                displayedDeptStats.length <= 10
                                  ? 'max-w-[42px]'
                                  : displayedDeptStats.length <= 20
                                  ? 'max-w-[24px]'
                                  : 'max-w-[16px]'
                              } ${
                                isHovered
                                  ? 'ring-2 ring-blue-500 brightness-110 z-20'
                                  : 'group-hover:brightness-105'
                              }`}
                              style={{ height: `${Math.max(3, totalHeightPct)}%` }}
                            >
                              {deptStackGender ? (
                                <>
                                  {/* Nam (Màu xanh dương) ở trên */}
                                  {item.male > 0 && (
                                    <div
                                      style={{
                                        height: `${(item.male / item.count) * 100}%`,
                                      }}
                                      className="w-full bg-blue-600 transition-all duration-500"
                                      title={`Nam: ${item.male}`}
                                    />
                                  )}
                                  {/* Nữ (Màu hồng/rose) ở dưới */}
                                  {item.female > 0 && (
                                    <div
                                      style={{
                                        height: `${(item.female / item.count) * 100}%`,
                                      }}
                                      className="w-full bg-rose-500 transition-all duration-500"
                                      title={`Nữ: ${item.female}`}
                                    />
                                  )}
                                </>
                              ) : (
                                <div className="w-full h-full bg-gradient-to-t from-blue-600 to-indigo-500" />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Trục Hoành X-Axis: Nhãn tên phòng ban co giãn theo màn hình */}
                  <div className="relative pt-2 h-16 w-full">
                    {displayedDeptStats.length <= 10 ? (
                      /* Top 10: Xoay nhãn đều đẹp */
                      <div className="flex items-start justify-between px-1">
                        {displayedDeptStats.map((item) => (
                          <div
                            key={item.name}
                            className="flex-1 min-w-0 text-center flex justify-center"
                          >
                            <span
                              className={`text-[10px] block truncate transition-colors transform -rotate-45 origin-top-left font-medium max-w-[85px] ${
                                hoveredDept?.name === item.name
                                  ? 'text-blue-700 font-bold'
                                  : 'text-slate-600'
                              }`}
                              title={item.name}
                            >
                              {item.name}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : displayedDeptStats.length <= 20 ? (
                      /* Top 20: Thu gọn nhãn */
                      <div className="flex items-start justify-between px-1">
                        {displayedDeptStats.map((item, idx) => (
                          <div
                            key={item.name}
                            className="flex-1 min-w-0 text-center flex justify-center"
                          >
                            <span
                              className={`text-[9px] block truncate transition-colors transform -rotate-45 origin-top-left font-medium max-w-[65px] ${
                                hoveredDept?.name === item.name
                                  ? 'text-blue-700 font-bold'
                                  : idx % 2 === 0
                                  ? 'text-slate-600'
                                  : 'text-slate-400'
                              }`}
                              title={item.name}
                            >
                              {item.name}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      /* Tất cả (38): Hiển thị thang mốc và phòng ban đang chọn, không chồng chữ */
                      <div className="w-full">
                        <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono-num border-t border-slate-200 pt-1.5 px-1">
                          <span className="truncate max-w-[120px] font-medium text-slate-600">
                            1. {displayedDeptStats[0]?.name}
                          </span>
                          <span className="hidden sm:inline truncate max-w-[120px] text-slate-400">
                            19. {displayedDeptStats[Math.floor(displayedDeptStats.length / 2)]?.name}
                          </span>
                          <span className="truncate max-w-[120px] font-medium text-slate-600 text-right">
                            {displayedDeptStats.length}. {displayedDeptStats[displayedDeptStats.length - 1]?.name}
                          </span>
                        </div>
                        <div className="text-center text-[11px] pt-1.5">
                          {hoveredDept ? (
                            <span className="font-bold text-blue-700">
                              Đang xem: {hoveredDept.name} ({hoveredDept.count} NV)
                            </span>
                          ) : (
                            <span className="text-slate-400">
                              38 phòng ban (rê chuột vào cột để xem chi tiết, hoặc bấm chọn kiểu "Thanh ngang")
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ========================================================
               CHART KIỂU 2: BIỂU ĐỒ THANH NGANG (HORIZONTAL BAR CHART)
               ======================================================== */
            <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-2 pt-2">
              {/* Thước đo trục X ở đỉnh */}
              <div className="flex items-center pl-36 sm:pl-44 pr-16 text-[10px] font-mono-num text-slate-400 justify-between border-b border-slate-200 pb-1">
                {chartTicks.map((tick) => (
                  <span key={tick} className="w-4 text-center">
                    {tick}
                  </span>
                ))}
              </div>

              {/* Danh sách các thanh ngang biểu đồ */}
              {displayedDeptStats.map((item) => {
                const widthPercent = (item.count / chartMaxCount) * 100;
                const isHovered = hoveredDept?.name === item.name;

                return (
                  <div
                    key={item.name}
                    className="flex items-center gap-2 group cursor-pointer py-0.5"
                    onMouseEnter={() => setHoveredDept(item)}
                    onMouseLeave={() => setHoveredDept(null)}
                  >
                    {/* Tên phòng ban (Trục Tung Y-Axis) */}
                    <div
                      className={`w-36 sm:w-44 text-right pr-2 text-xs font-medium truncate shrink-0 transition-colors ${
                        isHovered
                          ? 'text-blue-700'
                          : 'text-slate-700 group-hover:text-slate-900'
                      }`}
                      title={item.name}
                    >
                      {item.name}
                    </div>

                    {/* Vùng thanh Bar Biểu đồ */}
                    <div className="flex-1 relative flex items-center h-6">
                      {/* Vạch lưới dọc phía sau */}
                      <div className="absolute inset-0 flex justify-between pointer-events-none">
                        {chartTicks.map((tick) => (
                          <div key={tick} className="h-full border-r border-slate-100 border-dashed" />
                        ))}
                      </div>

                      {/* Thanh Bar thực tế */}
                      <div
                        style={{ width: `${Math.max(2, widthPercent)}%` }}
                        className={`h-5 rounded-r-md overflow-hidden flex transition-all duration-300 relative z-10 shadow-2xs ${
                          isHovered
                            ? 'ring-2 ring-blue-500 ring-offset-1 brightness-105'
                            : 'group-hover:brightness-105'
                        }`}
                      >
                        {deptStackGender ? (
                          <>
                            {item.female > 0 && (
                              <div
                                style={{
                                  width: `${(item.female / item.count) * 100}%`,
                                }}
                                className="h-full bg-rose-500 flex items-center justify-center text-[10px] font-mono-num font-bold text-white transition-all duration-500 px-1 truncate"
                                title={`Nữ: ${item.female}`}
                              >
                                {item.female >= 10 && `♀${item.female}`}
                              </div>
                            )}
                            {item.male > 0 && (
                              <div
                                style={{
                                  width: `${(item.male / item.count) * 100}%`,
                                }}
                                className="h-full bg-blue-600 flex items-center justify-center text-[10px] font-mono-num font-bold text-white transition-all duration-500 px-1 truncate"
                                title={`Nam: ${item.male}`}
                              >
                                {item.male >= 10 && `♂${item.male}`}
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="w-full h-full bg-gradient-to-r from-blue-600 to-indigo-600" />
                        )}
                      </div>

                      {/* Số lượng NV & Tỷ lệ % ở đuôi thanh bar */}
                      <div className="ml-2.5 flex items-baseline gap-1 shrink-0 font-mono-num z-10">
                        <span className="text-xs font-bold text-slate-800">
                          {item.count} NV
                        </span>
                        <span className="text-[10px] text-slate-400">
                          ({item.percentage.toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* CỘT PHẢI (Chiếm 5 cột): CHART GIỚI TÍNH & CHART DÂN TỘC */}
        <div className="lg:col-span-5 space-y-6 flex flex-col justify-between">
          {/* CHART 2: Thống Kê Theo Giới Tính */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                  <PieChart className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Cơ Cấu Giới Tính
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Tỷ lệ phân bổ Nam / Nữ
                  </p>
                </div>
              </div>
              <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-full">
                {totalEmployees} Nhân sự
              </span>
            </div>

            {/* Donut Chart Visual & Stats */}
            <div className="flex flex-col sm:flex-row items-center gap-6 pt-2">
              {/* Circular Ring SVG */}
              <div className="relative w-36 h-36 shrink-0 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  {/* Background track */}
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    stroke="#f1f5f9"
                    strokeWidth="14"
                    fill="transparent"
                  />
                  {/* Nữ (Pink/Rose) */}
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    stroke="#f43f5e"
                    strokeWidth="14"
                    fill="transparent"
                    strokeDasharray={`${(genderStats.femalePercent / 100) * 251.2} 251.2`}
                    strokeLinecap="round"
                    className="transition-all duration-700 ease-out"
                  />
                  {/* Nam (Blue) */}
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    stroke="#2563eb"
                    strokeWidth="14"
                    fill="transparent"
                    strokeDasharray={`${(genderStats.malePercent / 100) * 251.2} 251.2`}
                    strokeDashoffset={`-${(genderStats.femalePercent / 100) * 251.2}`}
                    strokeLinecap="round"
                    className="transition-all duration-700 ease-out"
                  />
                </svg>
                {/* Center Content */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Tổng số
                  </span>
                  <span className="text-xl font-bold text-slate-900 font-mono-num leading-tight">
                    {totalEmployees}
                  </span>
                  <span className="text-[10px] text-slate-500">nhân sự</span>
                </div>
              </div>

              {/* Chi tiết 2 giới tính */}
              <div className="flex-1 w-full space-y-3">
                {/* Nữ Card */}
                <div className="p-3 bg-rose-50/70 border border-rose-200/60 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center font-bold text-sm">
                      ♀
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-800">
                        Nữ Giới
                      </div>
                      <div className="text-[11px] text-rose-700 font-medium font-mono-num">
                        {genderStats.femalePercent.toFixed(1)}% tổng nhân lực
                      </div>
                    </div>
                  </div>
                  <div className="text-right font-mono-num">
                    <span className="text-base font-bold text-rose-600">
                      {genderStats.female}
                    </span>
                    <span className="text-xs text-slate-500 ml-1">người</span>
                  </div>
                </div>

                {/* Nam Card */}
                <div className="p-3 bg-blue-50/70 border border-blue-200/60 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">
                      ♂
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-800">
                        Nam Giới
                      </div>
                      <div className="text-[11px] text-blue-700 font-medium font-mono-num">
                        {genderStats.malePercent.toFixed(1)}% tổng nhân lực
                      </div>
                    </div>
                  </div>
                  <div className="text-right font-mono-num">
                    <span className="text-base font-bold text-blue-700">
                      {genderStats.male}
                    </span>
                    <span className="text-xs text-slate-500 ml-1">người</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* CHART 3: Thống Kê Theo Dân Tộc */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Thành Phần Dân Tộc
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Ghi nhận {ethnicityStats.length} dân tộc trong công ty
                  </p>
                </div>
              </div>
            </div>

            {/* Thanh Multi-segment Bar trực quan */}
            <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
              {ethnicityStats.map((item) => (
                <div
                  key={item.name}
                  style={{ width: `${Math.max(1, item.percentage)}%` }}
                  className={`${item.color.bg} transition-all duration-500 hover:opacity-80`}
                  title={`${item.name}: ${item.count} người (${item.percentage.toFixed(1)}%)`}
                />
              ))}
            </div>

            {/* Danh sách thẻ dân tộc */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
              {ethnicityStats.map((item) => (
                <div
                  key={item.name}
                  className="p-2.5 rounded-xl border border-slate-200/70 bg-slate-50/60 hover:bg-white hover:border-blue-200 transition-all flex flex-col justify-between"
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`w-2.5 h-2.5 rounded-full ${item.color.bg} shrink-0`} />
                    <span className="text-xs font-bold text-slate-800 truncate" title={item.name}>
                      {item.name}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between font-mono-num">
                    <span className="text-xs font-bold text-slate-900">
                      {item.count} NV
                    </span>
                    <span className="text-[11px] text-slate-500 font-medium">
                      {item.percentage.toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
