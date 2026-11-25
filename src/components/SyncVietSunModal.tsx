import React, { useState, useEffect } from 'react';
import {
  RefreshCw,
  X,
  CheckCircle2,
  AlertCircle,
  CloudDownload,
  Image,
  Building2,
  Users,
  UserPlus,
  ArrowRight,
  Code2,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  api,
  VietSunSyncOptions,
  VietSunSyncPreview,
  VietSunSyncResult,
} from '../api';

interface SyncVietSunModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSyncSuccess: (result: VietSunSyncResult) => void;
}

const DEFAULT_API_URL = 'https://viet-sun-id-card.vercel.app/api/employees';

export const SyncVietSunModal: React.FC<SyncVietSunModalProps> = ({
  isOpen,
  onClose,
  onSyncSuccess,
}) => {
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [includePhoto, setIncludePhoto] = useState(true);
  const [syncMode, setSyncMode] = useState<'upsert' | 'add_only'>('upsert');
  const [createDepartments, setCreateDepartments] = useState(true);

  // Preview state
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewData, setPreviewData] = useState<VietSunSyncPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgressMsg, setSyncProgressMsg] = useState('');
  const [syncResult, setSyncResult] = useState<VietSunSyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Code sample tab
  const [activeCodeTab, setActiveCodeTab] = useState<'curl' | 'react' | 'js'>('curl');
  const [copiedCode, setCopiedCode] = useState(false);

  // Fetch preview when modal opens
  useEffect(() => {
    if (isOpen) {
      loadPreview();
      setSyncResult(null);
      setSyncError(null);
    }
  }, [isOpen, apiUrl]);

  const loadPreview = async () => {
    setIsLoadingPreview(true);
    setPreviewError(null);
    try {
      const data = await api.previewSyncVietSun(apiUrl);
      setPreviewData(data);
    } catch (err: any) {
      console.error('Lỗi tải xem trước API:', err);
      setPreviewError(err?.message || 'Không thể kết nối đến API Việt Sun');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleStartSync = async () => {
    setIsSyncing(true);
    setSyncError(null);
    setSyncResult(null);
    setSyncProgressMsg('Đang gửi yêu cầu đồng bộ đến máy chủ và API Việt Sun...');

    try {
      const options: VietSunSyncOptions = {
        apiUrl,
        includePhoto,
        syncMode,
        createDepartments,
      };

      setSyncProgressMsg(
        includePhoto
          ? 'Đang tải toàn bộ dữ liệu nhân viên kèm ảnh thẻ 3×4...'
          : 'Đang tải danh sách nhân viên (chế độ tải nhanh)...'
      );

      const res = await api.syncVietSunEmployees(options);
      setSyncResult(res);
      onSyncSuccess(res);
    } catch (err: any) {
      console.error('Lỗi khi đồng bộ:', err);
      setSyncError(err?.message || 'Đồng bộ thất bại. Vui lòng kiểm tra lại kết nối mạng!');
    } finally {
      setIsSyncing(false);
      setSyncProgressMsg('');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  if (!isOpen) return null;

  const curlCode = `# 1. Lấy toàn bộ danh sách nhân viên (bỏ ảnh base64 để tải siêu nhanh)
curl -X GET "https://viet-sun-id-card.vercel.app/api/employees?includePhoto=false"

# 2. Tìm kiếm hoặc lọc theo bộ phận & phân trang
curl -X GET "https://viet-sun-id-card.vercel.app/api/employees?department=BGĐ&page=1&limit=50"

# 3. Tra cứu chi tiết 1 nhân viên theo MSNV
curl -X GET "https://viet-sun-id-card.vercel.app/api/employees/91079"

# 4. Lấy danh sách bộ phận kèm số lượng nhân viên
curl -X GET "https://viet-sun-id-card.vercel.app/api/departments"`;

  const reactCode = `// Hook lấy danh sách nhân viên trong React / Next.js
import { useEffect, useState } from 'react';

export function useVietSunEmployees(department = '') {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const url = new URL('https://viet-sun-id-card.vercel.app/api/employees');
    if (department) url.searchParams.set('department', department);
    url.searchParams.set('includePhoto', 'false');

    fetch(url.toString())
      .then((res) => res.json())
      .then((json) => {
        if (json.success) setEmployees(json.data);
      })
      .finally(() => setLoading(false));
  }, [department]);

  return { employees, loading };
}`;

  const jsCode = `// Gọi API lấy danh sách nhân viên từ website khác (Đã bật sẵn CORS *)
async function loadVietSunEmployees() {
  const response = await fetch('https://viet-sun-id-card.vercel.app/api/employees?includePhoto=false');
  const result = await response.json();

  if (result.success) {
    console.log('Tổng số nhân viên:', result.total);
    console.log('Danh sách nhân viên:', result.data);
    return result.data;
  }
}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="bg-linear-to-r from-blue-700 via-indigo-700 to-indigo-800 text-white p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-xs border border-white/20">
              <RefreshCw className={`w-5 h-5 text-white ${isSyncing ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Đồng Bộ Danh Sách Nhân Viên Từ API Việt Sun
                <span className="text-[10px] uppercase font-semibold tracking-wider bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 px-2 py-0.5 rounded-full">
                  CORS Sẵn Sàng
                </span>
              </h2>
              <p className="text-xs text-blue-100 mt-0.5">
                Kết nối trực tiếp tới link API <span className="font-mono underline">https://viet-sun-id-card.vercel.app/api/employees</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSyncing}
            className="text-white/70 hover:text-white p-2 rounded-lg hover:bg-white/10 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* API Connection Bar */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Địa Chỉ API Nguồn (Viet Sun ID Card)
              </label>
              <div className="flex items-center gap-2 bg-white border border-slate-300 rounded-lg px-3 py-1.5 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
                <span className="text-xs font-mono font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                  GET
                </span>
                <input
                  type="text"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  disabled={isSyncing}
                  placeholder="https://viet-sun-id-card.vercel.app/api/employees"
                  className="w-full text-xs font-mono text-slate-800 bg-transparent outline-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
              <button
                type="button"
                onClick={loadPreview}
                disabled={isLoadingPreview || isSyncing}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors disabled:opacity-50"
                title="Kiểm tra kết nối lại"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingPreview ? 'animate-spin text-blue-600' : ''}`} />
                Kiểm tra kết nối
              </button>
              <a
                href={apiUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                title="Mở trực tiếp API trên trình duyệt"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Mở link
              </a>
            </div>
          </div>

          {/* Sync Comparison Cards */}
          {previewError && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 text-xs">
                <div className="font-bold">Không thể kết nối đến API Việt Sun</div>
                <div className="mt-0.5 text-rose-700">{previewError}</div>
                <button
                  type="button"
                  onClick={loadPreview}
                  className="mt-2 text-xs font-bold text-rose-900 underline hover:no-underline cursor-pointer"
                >
                  Thử lại ngay
                </button>
              </div>
            </div>
          )}

          {isLoadingPreview && !previewData && (
            <div className="py-10 flex flex-col items-center justify-center text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
              <div className="text-sm font-semibold text-slate-700">Đang đối soát dữ liệu 2 danh sách nhân viên...</div>
              <div className="text-xs text-slate-400">Đang đọc danh sách từ https://viet-sun-id-card.vercel.app/api/employees</div>
            </div>
          )}

          {previewData && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  Đối Soát Dữ Liệu 2 Danh Sách
                </h3>
                <span className="text-[11px] font-medium text-slate-500">
                  Phản hồi API: <span className="font-semibold text-emerald-600">{previewData.pingMs}ms</span>
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {/* Remote Total */}
                <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl">
                  <div className="flex items-center justify-between text-blue-700">
                    <span className="text-[11px] font-bold">API Việt Sun</span>
                    <CloudDownload className="w-4 h-4" />
                  </div>
                  <div className="text-2xl font-black text-blue-900 mt-1">
                    {previewData.totalRemote}
                  </div>
                  <div className="text-[11px] text-blue-700/80 mt-0.5">Nhân sự nguồn</div>
                </div>

                {/* Local Total */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="flex items-center justify-between text-slate-700">
                    <span className="text-[11px] font-bold">HR Manager (Máy)</span>
                    <Users className="w-4 h-4" />
                  </div>
                  <div className="text-2xl font-black text-slate-900 mt-1">
                    {previewData.totalLocal}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Nhân sự hiện có</div>
                </div>

                {/* New Count */}
                <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl">
                  <div className="flex items-center justify-between text-emerald-700">
                    <span className="text-[11px] font-bold">Cần Thêm Mới</span>
                    <UserPlus className="w-4 h-4" />
                  </div>
                  <div className="text-2xl font-black text-emerald-900 mt-1">
                    +{previewData.newCount}
                  </div>
                  <div className="text-[11px] text-emerald-700/80 mt-0.5">Chưa có trên máy</div>
                </div>

                {/* Photos Count */}
                <div className="p-3.5 bg-purple-50/70 border border-purple-200 rounded-xl">
                  <div className="flex items-center justify-between text-purple-700">
                    <span className="text-[11px] font-bold">Ảnh Thẻ 3×4</span>
                    <Image className="w-4 h-4" />
                  </div>
                  <div className="text-2xl font-black text-purple-900 mt-1">
                    {previewData.remoteWithPhotosCount}
                  </div>
                  <div className="text-[11px] text-purple-700/80 mt-0.5">Có sẵn ảnh trên API</div>
                </div>
              </div>

              {/* Sample New Employees preview */}
              {previewData.newCount > 0 && (
                <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="text-xs font-bold text-slate-800 mb-2 flex items-center justify-between">
                    <span>Danh sách nhân viên mới phát hiện ({previewData.newCount} nhân sự):</span>
                    <span className="text-[11px] font-normal text-slate-500">Khớp theo Mã số nhân viên (MSNV)</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {previewData.sampleNewEmployees.map((emp) => (
                      <span
                        key={emp.msnv}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-white border border-slate-200 rounded-md shadow-2xs font-medium text-slate-800"
                      >
                        <span className="font-mono text-[11px] text-blue-600 font-bold">{emp.msnv}</span>
                        <span>{emp.fullName}</span>
                        <span className="text-[10px] text-slate-400">({emp.department})</span>
                        {emp.hasPhoto && (
                          <span className="text-[10px] bg-purple-100 text-purple-700 px-1 rounded font-bold">Ảnh</span>
                        )}
                      </span>
                    ))}
                    {previewData.newCount > previewData.sampleNewEmployees.length && (
                      <span className="text-xs text-slate-500 self-center px-1">
                        ...và {previewData.newCount - previewData.sampleNewEmployees.length} nhân viên khác
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sync Options */}
          <div className="border-t border-slate-200 pt-5 space-y-4">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Tùy Chọn Đồng Bộ
            </h3>

            <div className="space-y-3">
              {/* Option 1: Include Photos */}
              <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={includePhoto}
                  onChange={(e) => setIncludePhoto(e.target.checked)}
                  disabled={isSyncing}
                  className="mt-0.5 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                />
                <div className="flex-1 text-xs">
                  <div className="font-bold text-slate-900 flex items-center gap-2">
                    Tải kèm hình ảnh thẻ 3×4 (Base64)
                    <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                      Khuyên dùng
                    </span>
                  </div>
                  <p className="text-slate-500 mt-0.5">
                    Tự động lưu ảnh 3×4 vào hồ sơ nhân viên để in thẻ ID. Nếu nhân viên trên API chưa có ảnh thì giữ nguyên ảnh hiện tại của họ trong phần mềm.
                  </p>
                </div>
              </label>

              {/* Option 2: Sync Mode (Upsert vs Add Only) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <label
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    syncMode === 'upsert'
                      ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-600'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="syncMode"
                      value="upsert"
                      checked={syncMode === 'upsert'}
                      onChange={() => setSyncMode('upsert')}
                      disabled={isSyncing}
                      className="w-4 h-4 text-blue-600"
                    />
                    <div className="font-bold text-xs text-slate-900">
                      Cập nhật & Thêm mới (Upsert)
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 ml-6">
                    Thêm nhân viên mới, đồng thời cập nhật Họ tên, Bộ phận, Ảnh thẻ cho nhân viên trùng MSNV. Các thông tin chi tiết (CCCD, Lương, Địa chỉ...) đã nhập trên máy được bảo toàn 100%.
                  </p>
                </label>

                <label
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    syncMode === 'add_only'
                      ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-600'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="syncMode"
                      value="add_only"
                      checked={syncMode === 'add_only'}
                      onChange={() => setSyncMode('add_only')}
                      disabled={isSyncing}
                      className="w-4 h-4 text-blue-600"
                    />
                    <div className="font-bold text-xs text-slate-900">
                      Chỉ thêm nhân viên mới
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 ml-6">
                    Chỉ thêm những nhân viên chưa từng có trong hệ thống. Không thay đổi bất kỳ thông tin nào của nhân viên hiện tại.
                  </p>
                </label>
              </div>

              {/* Option 3: Create Departments */}
              <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={createDepartments}
                  onChange={(e) => setCreateDepartments(e.target.checked)}
                  disabled={isSyncing}
                  className="mt-0.5 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                />
                <div className="flex-1 text-xs">
                  <div className="font-bold text-slate-900">
                    Tự động tạo mới Phòng ban / Bộ phận nếu chưa có
                  </div>
                  <p className="text-slate-500 mt-0.5">
                    Nếu nhân viên thuộc bộ phận mới (ví dụ: Chuyền may 04-02, Tổ Cơ động...), hệ thống sẽ tự động thêm bộ phận đó vào danh mục Phòng Ban.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Sync Success Result Box */}
          {syncResult && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 animate-in fade-in">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div className="font-bold text-sm text-emerald-900">
                  {syncResult.message}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 pt-3 border-t border-emerald-200 text-xs">
                <div>
                  <span className="text-emerald-700 block">Tổng từ API:</span>
                  <span className="font-bold text-emerald-950 text-sm">{syncResult.totalRemote}</span>
                </div>
                <div>
                  <span className="text-emerald-700 block">Thêm mới:</span>
                  <span className="font-bold text-emerald-950 text-sm">+{syncResult.addedCount}</span>
                </div>
                <div>
                  <span className="text-emerald-700 block">Cập nhật:</span>
                  <span className="font-bold text-emerald-950 text-sm">{syncResult.updatedCount}</span>
                </div>
                <div>
                  <span className="text-emerald-700 block">Ảnh 3×4 cập nhật:</span>
                  <span className="font-bold text-emerald-950 text-sm">{syncResult.photosUpdatedCount}</span>
                </div>
              </div>
            </div>
          )}

          {/* Sync Error Box */}
          {syncError && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 text-xs">
                <div className="font-bold">Đồng bộ thất bại</div>
                <div className="mt-0.5 text-rose-700">{syncError}</div>
              </div>
            </div>
          )}

          {/* Developer Code Sample Section (As in uploaded images) */}
          <div className="border-t border-slate-200 pt-4">
            <details className="group">
              <summary className="flex items-center justify-between cursor-pointer text-xs font-bold text-slate-700 hover:text-blue-600 select-none">
                <div className="flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-slate-500 group-hover:text-blue-600" />
                  <span>Xem Code Mẫu Tích Hợp API (cURL / React / JS)</span>
                </div>
                <span className="text-[10px] text-slate-400 group-open:rotate-180 transition-transform">▼</span>
              </summary>

              <div className="mt-3 bg-slate-900 rounded-xl overflow-hidden border border-slate-800">
                <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2 bg-slate-950/50">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setActiveCodeTab('curl')}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                        activeCodeTab === 'curl'
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      cURL
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveCodeTab('react')}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                        activeCodeTab === 'react'
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      React / Next.js
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveCodeTab('js')}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                        activeCodeTab === 'js'
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      JavaScript
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const code =
                        activeCodeTab === 'curl'
                          ? curlCode
                          : activeCodeTab === 'react'
                          ? reactCode
                          : jsCode;
                      copyToClipboard(code);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] text-slate-300 hover:text-white px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded transition-colors cursor-pointer"
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedCode ? 'Đã sao chép' : 'Copy'}
                  </button>
                </div>

                <div className="p-4 text-[11px] font-mono text-slate-300 overflow-x-auto whitespace-pre leading-relaxed">
                  {activeCodeTab === 'curl' && curlCode}
                  {activeCodeTab === 'react' && reactCode}
                  {activeCodeTab === 'js' && jsCode}
                </div>
              </div>
            </details>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 border-t border-slate-200 p-4 px-6 flex items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500">
            {isSyncing ? (
              <span className="flex items-center gap-2 text-blue-700 font-semibold">
                <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                {syncProgressMsg}
              </span>
            ) : syncResult ? (
              <span className="text-emerald-700 font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                Đã đồng bộ xong! Danh sách nhân viên đã được cập nhật.
              </span>
            ) : (
              <span>Khớp theo MSNV • Tự động lưu vào cơ sở dữ liệu PostgreSQL</span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSyncing}
              className="px-4 py-2.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
            >
              {syncResult ? 'Đóng' : 'Hủy bỏ'}
            </button>

            <button
              type="button"
              onClick={handleStartSync}
              disabled={isSyncing || isLoadingPreview}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm cursor-pointer transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Đang đồng bộ...' : syncResult ? 'Đồng bộ lại' : 'Bắt Đầu Đồng Bộ'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
