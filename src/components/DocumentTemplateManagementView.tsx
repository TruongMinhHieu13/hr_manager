import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  FileText,
  Plus,
  Upload,
  Download,
  Search,
  Trash2,
  Edit3,
  Eye,
  Copy,
  Check,
  AlertCircle,
  Filter,
  Grid,
  List,
  Sparkles,
  RefreshCw,
  X,
  FileCheck,
  Printer,
  Info,
  Calendar,
  FolderOpen,
  ArrowRight,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { DocumentTemplate, Employee } from '../types';
import { api } from '../api';
import { DocumentGeneratorModal } from './DocumentGeneratorModal';
import { ErrorBoundary } from './ErrorBoundary';
import {
  SYSTEM_VARIABLES,
  COMMON_VARIABLES,
  VARIABLE_CATEGORIES,
  cleanVietnameseDiacritics,
} from '../utils/documentVariables';

interface DocumentTemplateManagementViewProps {
  employees: Employee[];
  documentTemplates: DocumentTemplate[];
  onRefreshTemplates: () => Promise<void>;
  onNavigateToEmployees?: () => void;
}

const TEMPLATE_CATEGORIES = [
  'Tất cả',
  'Hồ sơ',
  'Hợp đồng',
  'Quyết định',
  'Thông báo',
  'Khác',
];



export const DocumentTemplateManagementView: React.FC<DocumentTemplateManagementViewProps> = ({
  employees,
  documentTemplates,
  onRefreshTemplates,
  onNavigateToEmployees,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Tất cả');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Modal thêm / sửa mẫu
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<DocumentTemplate | null>(null);
  const [modalTab, setModalTab] = useState<'upload' | 'manual'>('upload');
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('Hồ sơ');
  const [formFileName, setFormFileName] = useState('');
  const [formContentHtml, setFormContentHtml] = useState('');
  const [formFileDataBase64, setFormFileDataBase64] = useState('');
  const [isParsingDocx, setIsParsingDocx] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedVariable, setCopiedVariable] = useState<string | null>(null);
  const [selectedVarCategory, setSelectedVarCategory] = useState<string>('Tất cả');
  const [varSearchQuery, setVarSearchQuery] = useState('');
  const [isVarPanelOpen, setIsVarPanelOpen] = useState(false);

  // Modal xác nhận xóa
  const [deletingTemplate, setDeletingTemplate] = useState<DocumentTemplate | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Xem chi tiết mẫu
  const [previewingTemplate, setPreviewingTemplate] = useState<DocumentTemplate | null>(null);
  const [previewZoom, setPreviewZoom] = useState<number>(100);
  const [previewViewMode, setPreviewViewMode] = useState<'a4' | 'full'>('full');
  const [isPreviewMaximized, setIsPreviewMaximized] = useState<boolean>(false);

  // Modal Tạo văn bản nhanh (DocumentGeneratorModal)
  const [isGeneratorModalOpen, setIsGeneratorModalOpen] = useState(false);
  const [generatorTargetEmployees, setGeneratorTargetEmployees] = useState<Employee[]>([]);

  // Lọc danh sách mẫu
  const filteredTemplates = useMemo(() => {
    return documentTemplates.filter((tpl) => {
      const matchSearch =
        searchQuery.trim() === '' ||
        tpl.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tpl.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (tpl.rawText && tpl.rawText.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchCategory =
        selectedCategory === 'Tất cả' || tpl.category === selectedCategory;

      return matchSearch && matchCategory;
    });
  }, [documentTemplates, searchQuery, selectedCategory]);

  // Thống kê
  const stats = useMemo(() => {
    const total = documentTemplates.length;
    const categoryCounts: Record<string, number> = {};
    documentTemplates.forEach((t) => {
      const cat = t.category || 'Khác';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });
    return {
      total,
      categoryCounts,
    };
  }, [documentTemplates]);

  // Lọc biến hệ thống theo danh mục và tìm kiếm
  const filteredSystemVariables = useMemo(() => {
    return SYSTEM_VARIABLES.filter((v) => {
      const matchCategory =
        selectedVarCategory === 'Tất cả' || v.category === selectedVarCategory;
      const q = varSearchQuery.trim().toLowerCase();
      const matchSearch =
        !q ||
        v.code.toLowerCase().includes(q) ||
        v.label.toLowerCase().includes(q) ||
        v.example.toLowerCase().includes(q);
      return matchCategory && matchSearch;
    });
  }, [selectedVarCategory, varSearchQuery]);

  const openCreateModal = (mode: 'upload' | 'manual' = 'upload') => {
    setEditingTemplate(null);
    setModalTab(mode);
    setFormName('');
    setFormCategory('Hồ sơ');
    setFormFileName('');
    setFormContentHtml(
      `<h2 style="text-align: center; font-weight: bold; text-transform: uppercase;">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</h2>
<p style="text-align: center; font-style: italic;">Độc lập - Tự do - Hạnh phúc</p>
<hr style="width: 200px; margin: 10px auto;" />
<h3 style="text-align: center; font-weight: bold; margin-top: 20px;">VĂN BẢN MẪU MỚI</h3>
<p style="text-align: center;">Số: ....../2026</p>
<p>Kính gửi: Ông/Bà <strong>#Họ và tên#</strong></p>
<p>Mã số nhân viên: <strong>#MSNV#</strong></p>
<p>Bộ phận công tác: <strong>#Bộ phận#</strong> - Chức danh: <strong>#Chức vụ#</strong></p>
<p>Nội dung thông báo / điều động nhân sự...</p>`
    );
    setFormFileDataBase64('');
    setErrorMessage(null);
    setIsEditModalOpen(true);
  };

  const openEditModal = (tpl: DocumentTemplate) => {
    setEditingTemplate(tpl);
    setModalTab('manual');
    setFormName(tpl.name);
    setFormCategory(tpl.category || 'Hồ sơ');
    setFormFileName(tpl.fileName || '');
    setFormContentHtml(tpl.contentHtml || '');
    setFormFileDataBase64(tpl.fileDataBase64 || '');
    setErrorMessage(null);
    setIsEditModalOpen(true);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.docx') && !lower.endsWith('.doc')) {
      setErrorMessage('Vui lòng chọn tệp định dạng Word (.docx hoặc .doc)');
      return;
    }

    setErrorMessage(null);
    setIsParsingDocx(true);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        setFormFileDataBase64(base64);
        setFormFileName(file.name);
        if (!formName.trim()) {
          setFormName(file.name.replace(/\.[^/.]+$/, ''));
        }

        try {
          const parsed = await api.parseDocxFile(base64);
          setFormContentHtml(cleanVietnameseDiacritics(parsed.contentHtml));
        } catch (parseErr) {
          console.warn('Lỗi phân tích docx qua server, dùng nội dung fallback:', parseErr);
          setFormContentHtml(`
            <div style="text-align: center; font-weight: bold;">
              <h3>${file.name.replace(/\.[^/.]+$/, '')}</h3>
            </div>
            <p>Văn bản áp dụng cho nhân viên: <strong>#Họ và tên#</strong> (MSNV: #MSNV#)</p>
            <p>Bộ phận: #Bộ phận# - Chức vụ: #Chức vụ#</p>
          `);
        } finally {
          setIsParsingDocx(false);
        }
      };
      reader.onerror = () => {
        setIsParsingDocx(false);
        setErrorMessage('Không thể đọc file đã chọn.');
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setIsParsingDocx(false);
      setErrorMessage('Đã xảy ra lỗi khi tải file.');
    }
  };

  const handleSaveTemplate = async () => {
    if (!formName.trim()) {
      setErrorMessage('Vui lòng nhập tên mẫu văn bản.');
      return;
    }

    if (!formContentHtml.trim()) {
      setErrorMessage('Nội dung mẫu văn bản không được để trống.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const payload: Partial<DocumentTemplate> = {
        ...(editingTemplate?.id ? { id: editingTemplate.id } : {}),
        name: formName.trim(),
        category: formCategory,
        fileName: formFileName.trim() || `${formName.trim()}.docx`,
        contentHtml: cleanVietnameseDiacritics(formContentHtml),
        fileDataBase64: formFileDataBase64,
      };

      await api.saveDocumentTemplate(payload);
      await onRefreshTemplates();
      setIsEditModalOpen(false);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Lỗi khi lưu mẫu văn bản.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingTemplate) return;
    setIsDeleting(true);
    try {
      await api.deleteDocumentTemplate(deletingTemplate.id);
      await onRefreshTemplates();
      setDeletingTemplate(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Lỗi khi xóa mẫu.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDownloadOriginalDocx = (tpl: DocumentTemplate) => {
    if (tpl.fileDataBase64) {
      const link = document.createElement('a');
      link.href = tpl.fileDataBase64;
      link.download = tpl.fileName || `${tpl.name}.docx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      // Export html to word
      const header = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset='utf-8'><title>${tpl.name}</title>
<style>
@page Section1 { size: 595.3pt 841.9pt; margin: 20mm; }
div.Section1 { page: Section1; }
body { font-family: 'Times New Roman', serif; font-size: 13pt; line-height: 1.5; color: #000; }
</style>
</head>
<body><div class="Section1">${tpl.contentHtml}</div></body></html>`;

      const blob = new Blob(['\ufeff', header], { type: 'application/msword;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${tpl.name}.doc`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  const copyVariableToClipboard = (variableCode: string) => {
    navigator.clipboard.writeText(variableCode);
    setCopiedVariable(variableCode);
    setTimeout(() => setCopiedVariable(null), 2000);
  };

  const insertVariableIntoContent = (variableCode: string) => {
    try {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(variableCode);
      }
    } catch {
      // ignore
    }
    setFormContentHtml((prev) => prev + ` <strong>${variableCode}</strong> `);
    setCopiedVariable(variableCode);
    setTimeout(() => setCopiedVariable(null), 2500);
  };

  const handleStartMerge = (tpl: DocumentTemplate) => {
    setGeneratorTargetEmployees(employees);
    setIsGeneratorModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Banner & Stats */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 md:p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-xl bg-blue-50 text-blue-700">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  <span>Quản Lý Mẫu Văn Bản &amp; Biểu Mẫu</span>
                  <span className="text-xs px-2.5 py-0.5 font-bold rounded-full bg-blue-100 text-blue-700">
                    Word (.docx)
                  </span>
                </h1>
                <p className="text-xs md:text-sm text-slate-500 mt-0.5">
                  Quản lý các file Word mẫu, hợp đồng thử việc, quyết định và biểu mẫu nhân sự tự động điền thông tin.
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => onRefreshTemplates()}
              className="p-2.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer transition-colors"
              title="Tải lại danh sách mẫu"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => openCreateModal('manual')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer transition-colors shadow-2xs"
            >
              <Plus className="w-4 h-4 text-slate-500" />
              <span>Thêm Mẫu Mới</span>
            </button>
            <button
              type="button"
              onClick={() => openCreateModal('upload')}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl cursor-pointer transition-colors shadow-xs"
            >
              <Upload className="w-4 h-4" />
              <span>Tải File Word Mẫu (.docx)</span>
            </button>
          </div>
        </div>

        {/* Thống kê nhanh */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 pt-5">
          <div className="bg-slate-50/80 rounded-xl p-3.5 border border-slate-100">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Tổng số mẫu
            </div>
            <div className="text-2xl font-bold font-mono-num text-slate-900 mt-1">
              {stats.total}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Biểu mẫu sẵn dùng</div>
          </div>

          <div className="bg-blue-50/50 rounded-xl p-3.5 border border-blue-100/60">
            <div className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider">
              Mẫu Hồ sơ &amp; HĐ
            </div>
            <div className="text-2xl font-bold font-mono-num text-blue-800 mt-1">
              {(stats.categoryCounts['Hồ sơ'] || 0) + (stats.categoryCounts['Hợp đồng'] || 0)}
            </div>
            <div className="text-[11px] text-blue-600 mt-0.5">Hợp đồng thử việc, quyết định</div>
          </div>

          <div className="bg-emerald-50/50 rounded-xl p-3.5 border border-emerald-100/60">
            <div className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">
              Nhân sự áp dụng
            </div>
            <div className="text-2xl font-bold font-mono-num text-emerald-800 mt-1">
              {employees.length}
            </div>
            <div className="text-[11px] text-emerald-600 mt-0.5">Sẵn sàng trộn văn bản</div>
          </div>

          <div className="bg-purple-50/50 rounded-xl p-3.5 border border-purple-100/60">
            <div className="text-[11px] font-semibold text-purple-700 uppercase tracking-wider">
              Biến tự động điền
            </div>
            <div className="text-2xl font-bold font-mono-num text-purple-800 mt-1">
              {SYSTEM_VARIABLES.length}
            </div>
            <div className="text-[11px] text-purple-600 mt-0.5">Trường thông tin chuẩn hóa</div>
          </div>
        </div>
      </div>

      {/* 2. Filter & Search Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Left: Search input */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tên mẫu, tên file Word..."
            className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-600 focus:outline-none transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Center: Category Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-none">
          {TEMPLATE_CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-xl cursor-pointer transition-all shrink-0 ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-2xs font-bold'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {/* Right: View Mode Toggle */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl shrink-0 self-end sm:self-center">
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded-lg cursor-pointer transition-colors ${
              viewMode === 'grid' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
            }`}
            title="Dạng lưới thẻ"
          >
            <Grid className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`p-1.5 rounded-lg cursor-pointer transition-colors ${
              viewMode === 'table' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
            }`}
            title="Dạng danh sách bảng"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 3. Main Templates Display */}
      {filteredTemplates.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
            <FileText className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-slate-800">Không tìm thấy mẫu văn bản phù hợp</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-5">
            {searchQuery
              ? `Không có mẫu văn bản nào khớp với từ khóa "${searchQuery}". Hãy thử tìm kiếm khác.`
              : 'Chưa có mẫu văn bản nào trong danh mục này. Bạn có thể tải lên file Word mẫu (.docx) mới ngay bây giờ.'}
          </p>
          <button
            type="button"
            onClick={() => openCreateModal('upload')}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl cursor-pointer shadow-xs transition-colors"
          >
            <Upload className="w-4 h-4" />
            <span>Tải Lên Mẫu Mới Ngay</span>
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        /* DẠNG LƯỚI THẺ (GRID) */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTemplates.map((tpl) => {
            const isDefaultSeed = tpl.id.startsWith('doc_tpl_');
            return (
              <div
                key={tpl.id}
                className="bg-white rounded-2xl border border-slate-200/80 hover:border-blue-300 hover:shadow-md transition-all flex flex-col justify-between overflow-hidden group"
              >
                {/* Header card */}
                <div className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                        DOCX
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-sm text-slate-900 group-hover:text-blue-700 transition-colors line-clamp-1" title={tpl.name}>
                          {tpl.name}
                        </h3>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5 truncate">
                          <span className="truncate">{tpl.fileName || 'template.docx'}</span>
                          {tpl.fileSize ? (
                            <span>• {Math.round(tpl.fileSize / 1024)} KB</span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 shrink-0">
                      {tpl.category || 'Hồ sơ'}
                    </span>
                  </div>

                  {/* Trích đoạn xem trước nội dung */}
                  <div className="p-3 bg-slate-50/80 rounded-xl text-[11px] text-slate-600 line-clamp-3 leading-relaxed border border-slate-100">
                    {tpl.rawText ? (
                      tpl.rawText.trim()
                    ) : (
                      <span
                        dangerouslySetInnerHTML={{
                          __html: tpl.contentHtml.replace(/<[^>]+>/g, ' ').slice(0, 150) + '...',
                        }}
                      />
                    )}
                  </div>

                  {/* Variables detection preview */}
                  <div className="flex flex-wrap items-center gap-1 pt-1">
                    <span className="text-[10px] text-slate-400 font-semibold mr-1">Biến sẵn có:</span>
                    {tpl.contentHtml.includes('#Họ và tên#') && (
                      <span className="text-[10px] font-mono-num px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
                        #Họ và tên#
                      </span>
                    )}
                    {tpl.contentHtml.includes('#MSNV#') && (
                      <span className="text-[10px] font-mono-num px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
                        #MSNV#
                      </span>
                    )}
                    {tpl.contentHtml.includes('#Số CCCD#') && (
                      <span className="text-[10px] font-mono-num px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
                        #Số CCCD#
                      </span>
                    )}
                    {tpl.contentHtml.includes('#Bộ phận#') && (
                      <span className="text-[10px] font-mono-num px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
                        #Bộ phận#
                      </span>
                    )}
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="p-3 bg-slate-50/60 border-t border-slate-100 flex items-center justify-between gap-1">
                  <button
                    type="button"
                    onClick={() => handleStartMerge(tpl)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl cursor-pointer transition-colors shadow-2xs"
                  >
                    <FileCheck className="w-3.5 h-3.5" />
                    <span>Trộn Văn Bản</span>
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setPreviewingTemplate(tpl)}
                      className="p-1.5 text-slate-600 hover:text-blue-700 hover:bg-white rounded-lg cursor-pointer transition-colors"
                      title="Xem trước toàn bộ văn bản"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditModal(tpl)}
                      className="p-1.5 text-slate-600 hover:text-amber-700 hover:bg-white rounded-lg cursor-pointer transition-colors"
                      title="Chỉnh sửa mẫu này"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadOriginalDocx(tpl)}
                      className="p-1.5 text-slate-600 hover:text-emerald-700 hover:bg-white rounded-lg cursor-pointer transition-colors"
                      title="Tải file Word (.docx) về máy"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingTemplate(tpl)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-white rounded-lg cursor-pointer transition-colors"
                      title="Xóa mẫu này"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* DẠNG DANH SÁCH BẢNG (TABLE) */
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 w-12 text-center">#</th>
                  <th className="py-3 px-4">Tên Mẫu Văn Bản</th>
                  <th className="py-3 px-4 w-32">Loại Mẫu</th>
                  <th className="py-3 px-4 w-48">Tên Tệp Gốc</th>
                  <th className="py-3 px-4 w-28">Dung Lượng</th>
                  <th className="py-3 px-4 w-44 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTemplates.map((tpl, idx) => (
                  <tr key={tpl.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 text-center font-mono-num text-slate-400">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-900">
                      <div className="flex items-center gap-2.5">
                        <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                        <div>
                          <div className="text-slate-900 font-bold hover:text-blue-700 cursor-pointer" onClick={() => setPreviewingTemplate(tpl)}>
                            {tpl.name}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                        {tpl.category || 'Hồ sơ'}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono-num text-slate-500 truncate max-w-xs">
                      {tpl.fileName || 'template.docx'}
                    </td>
                    <td className="py-3 px-4 font-mono-num text-slate-500">
                      {tpl.fileSize ? `${Math.round(tpl.fileSize / 1024)} KB` : '—'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleStartMerge(tpl)}
                          className="px-2.5 py-1 text-[11px] font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer transition-colors"
                        >
                          Trộn
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreviewingTemplate(tpl)}
                          className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                          title="Xem trước"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(tpl)}
                          className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                          title="Sửa mẫu"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadOriginalDocx(tpl)}
                          className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                          title="Tải file"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingTemplate(tpl)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                          title="Xóa"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. MODAL THÊM / CHỈNH SỬA MẪU VĂN BẢN */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="p-4 md:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    {editingTemplate ? 'Chỉnh Sửa Mẫu Văn Bản' : 'Thêm Mẫu Văn Bản Mới'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Hỗ trợ tệp Word (.docx) hoặc soạn thảo trực tiếp với các biến thay thế tự động
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {errorMessage && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Basic Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tên mẫu văn bản <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="VD: Hợp đồng thử việc văn phòng 2026..."
                    className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Loại mẫu văn bản
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:border-blue-600 focus:outline-none bg-white cursor-pointer"
                  >
                    <option value="Hồ sơ">Hồ sơ</option>
                    <option value="Hợp đồng">Hợp đồng</option>
                    <option value="Quyết định">Quyết định</option>
                    <option value="Thông báo">Thông báo</option>
                    <option value="Khác">Khác</option>
                  </select>
                </div>
              </div>

              {/* Upload Word file section */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-2">
                    <Upload className="w-4 h-4 text-blue-600" />
                    Tải lên file Word mẫu (.docx, .doc)
                  </span>
                  {formFileName && (
                    <span className="text-[11px] font-mono-num text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      Đã chọn: {formFileName}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <label className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-2xs">
                    <Upload className="w-4 h-4" />
                    <span>Chọn tệp Word từ máy tính</span>
                    <input
                      type="file"
                      accept=".docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                  {isParsingDocx && (
                    <span className="text-xs font-semibold text-blue-600 flex items-center gap-1.5 animate-pulse">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Đang phân tích cấu trúc file Word...
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">
                  Hệ thống tự động đọc bố cục, căn lề, bảng biểu và chữ ký trong file Word và chuyển đổi sang mẫu trộn.
                </p>
              </div>

              {/* Danh sách biến thay thế gợi ý */}
              <div className="bg-slate-50/90 p-2.5 rounded-xl border border-slate-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span className="text-xs font-bold text-slate-800">
                      Biến tự động điền ({SYSTEM_VARIABLES.length} biến chuẩn):
                    </span>
                    <span className="text-[10px] text-slate-400 font-normal hidden sm:inline">
                      (Nhấp để chèn vào mẫu)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {copiedVariable && (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full inline-flex items-center gap-1 animate-pulse">
                        <Check className="w-3 h-3 text-emerald-600" />
                        Đã chèn {copiedVariable}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsVarPanelOpen((prev) => !prev)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200/80 px-2.5 py-0.5 rounded-lg cursor-pointer transition-colors"
                    >
                      <span>{isVarPanelOpen ? 'Thu gọn' : 'Xem toàn bộ biến'}</span>
                      {isVarPanelOpen ? (
                        <ChevronUp className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Hàng biến nhanh phổ biến (luôn hiển thị dạng compact) */}
                <div className="flex items-center gap-1.5 overflow-x-auto pt-2 pb-0.5 scrollbar-thin">
                  <span className="text-[10px] font-semibold text-slate-400 shrink-0">Phổ biến:</span>
                  {COMMON_VARIABLES.map((code) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => insertVariableIntoContent(code)}
                      className="px-2 py-0.5 text-[10px] font-mono-num font-bold bg-white hover:bg-blue-50 text-blue-700 hover:text-blue-800 border border-slate-200 hover:border-blue-300 rounded-md cursor-pointer transition-colors shrink-0 shadow-2xs inline-flex items-center gap-1"
                      title={`Bấm để chèn ${code}`}
                    >
                      <span>{code}</span>
                      <Plus className="w-2.5 h-2.5 opacity-60" />
                    </button>
                  ))}
                </div>

                {/* Khu vực mở rộng toàn bộ biến (khi isVarPanelOpen = true) */}
                {isVarPanelOpen && (
                  <div className="mt-2.5 pt-2.5 border-t border-slate-200/80 space-y-2">
                    {/* Hàng lọc danh mục & tìm kiếm biến */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <div className="relative w-full sm:w-60">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          value={varSearchQuery}
                          onChange={(e) => setVarSearchQuery(e.target.value)}
                          placeholder="Tìm biến (họ tên, cccd, lương, hợp đồng...)"
                          className="w-full pl-8 pr-6 py-1 text-[11px] bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500"
                        />
                        {varSearchQuery && (
                          <button
                            type="button"
                            onClick={() => setVarSearchQuery('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                          >
                            ×
                          </button>
                        )}
                      </div>

                      {/* Category Pills */}
                      <div className="flex items-center gap-1 overflow-x-auto max-w-full pb-0.5 scrollbar-thin">
                        {VARIABLE_CATEGORIES.map((cat) => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setSelectedVarCategory(cat)}
                            className={`px-2 py-0.5 text-[10px] rounded-md font-semibold whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
                              selectedVarCategory === cat
                                ? 'bg-blue-600 text-white shadow-2xs'
                                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Variable Chips */}
                    <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 bg-white rounded-lg border border-slate-200/80 shadow-2xs">
                      {filteredSystemVariables.length === 0 ? (
                        <div className="text-[11px] text-slate-400 italic py-2 px-1 w-full text-center">
                          Không tìm thấy biến phù hợp với từ khóa &quot;{varSearchQuery}&quot;
                        </div>
                      ) : (
                        filteredSystemVariables.map((v) => (
                          <button
                            key={v.code}
                            type="button"
                            onClick={() => insertVariableIntoContent(v.code)}
                            className="px-2 py-0.5 text-[11px] font-mono-num font-semibold bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-300 rounded-md cursor-pointer transition-colors shadow-2xs flex items-center gap-1 group"
                            title={`${v.label} (Ví dụ: ${v.example}) - Nhấp để chèn & sao chép`}
                          >
                            <span className="text-blue-700 font-bold">{v.code}</span>
                            <span className="text-[10px] text-slate-400 font-normal group-hover:text-blue-600">
                              {v.label}
                            </span>
                            <Plus className="w-2.5 h-2.5 text-slate-400 group-hover:text-blue-600" />
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Editor / HTML Preview Area */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nội dung mẫu văn bản (Bấm vào khung để chỉnh sửa trực tiếp):
                </label>
                <div
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => {
                    const html = e.currentTarget?.innerHTML;
                    if (typeof html === 'string') {
                      setFormContentHtml(html);
                    }
                  }}
                  dangerouslySetInnerHTML={{ __html: formContentHtml }}
                  className="min-h-[260px] max-h-[380px] overflow-y-auto p-6 bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-blue-600 font-['Times_New_Roman'] text-[13pt] leading-relaxed shadow-inner"
                  style={{ fontFamily: "'Times New Roman', Times, serif", fontSize: '13pt', lineHeight: '1.5' }}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSaveTemplate}
                className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl cursor-pointer shadow-xs transition-colors"
              >
                {isSaving ? 'Đang lưu...' : 'Lưu Mẫu Văn Bản'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. MODAL XEM CHI TIẾT MẪU (PREVIEW MODAL) */}
      {previewingTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className={`bg-white rounded-2xl shadow-2xl border border-slate-200 w-full flex flex-col overflow-hidden transition-all duration-200 ${
              isPreviewMaximized
                ? 'fixed inset-2 sm:inset-4 max-w-none max-h-none h-[calc(100vh-16px)] sm:h-[calc(100vh-32px)]'
                : 'max-w-4xl max-h-[92vh] h-[88vh]'
            }`}
          >
            {/* Header Preview Modal */}
            <div className="p-3.5 sm:p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-white shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-xl shrink-0">
                  <Eye className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-900 text-sm sm:text-base truncate">
                    {previewingTemplate.name}
                  </h3>
                  <p className="text-[11px] text-slate-500 truncate">
                    {previewingTemplate.category} • {previewingTemplate.fileName || 'template.docx'}
                  </p>
                </div>
              </div>

              {/* Controls Toolbar: Khổ A4 / Tràn trang & Zoom & Phóng to */}
              <div className="flex items-center gap-2 text-xs">
                {/* Nút chuyển đổi chế độ xem: Tràn trang (Full trắng) hoặc Khổ A4 */}
                <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setPreviewViewMode('full')}
                    className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-md transition-all cursor-pointer ${
                      previewViewMode === 'full'
                        ? 'bg-white text-blue-700 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900 font-medium'
                    }`}
                    title="Nền trắng mở rộng toàn bộ (Full trắng)"
                  >
                    <span>Tràn trang (Full trắng)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewViewMode('a4')}
                    className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-md transition-all cursor-pointer ${
                      previewViewMode === 'a4'
                        ? 'bg-white text-blue-700 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900 font-medium'
                    }`}
                    title="Định dạng khung trang A4 chuẩn (210mm)"
                  >
                    <span>Khổ A4</span>
                  </button>
                </div>

                <div className="h-4 w-px bg-slate-200 mx-0.5 hidden sm:block" />

                {/* Nút Zoom */}
                <div className="hidden sm:flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => setPreviewZoom((z) => Math.max(60, z - 10))}
                    className="p-1 hover:bg-slate-100 rounded cursor-pointer text-slate-600"
                    title="Thu nhỏ"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewZoom(100)}
                    className="font-mono-num text-[11px] font-semibold w-10 text-center hover:bg-slate-100 rounded py-0.5 cursor-pointer text-slate-700"
                    title="Đặt lại 100%"
                  >
                    {previewZoom}%
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewZoom((z) => Math.min(150, z + 10))}
                    className="p-1 hover:bg-slate-100 rounded cursor-pointer text-slate-600"
                    title="Phóng to"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="h-4 w-px bg-slate-200 mx-0.5 hidden sm:block" />

                {/* Nút toàn màn hình */}
                <button
                  type="button"
                  onClick={() => setIsPreviewMaximized(!isPreviewMaximized)}
                  className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                  title={isPreviewMaximized ? 'Thu nhỏ cửa sổ' : 'Phóng to toàn màn hình'}
                >
                  {isPreviewMaximized ? (
                    <Minimize2 className="w-4 h-4" />
                  ) : (
                    <Maximize2 className="w-4 h-4" />
                  )}
                </button>

                {/* Nút đóng */}
                <button
                  type="button"
                  onClick={() => setPreviewingTemplate(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Vùng xem trước văn bản: 100% full nền trắng tinh khôi */}
            <div
              className={`flex-1 overflow-y-auto flex justify-center items-start ${
                previewViewMode === 'full'
                  ? 'bg-white p-6 sm:p-12'
                  : 'bg-slate-100/90 p-4 sm:p-8'
              }`}
            >
              <div
                style={{
                  zoom: previewZoom !== 100 ? `${previewZoom}%` : undefined,
                  width: previewViewMode === 'a4' ? '210mm' : '100%',
                }}
                className={`document-preview-paper bg-white text-black leading-relaxed transition-all font-['Times_New_Roman'] text-[13pt] h-auto self-start ${
                  previewViewMode === 'full'
                    ? 'w-full max-w-none p-0 shadow-none border-none'
                    : 'w-full max-w-[210mm] min-h-[297mm] p-10 sm:p-14 shadow-xl rounded-sm border border-slate-200/80 my-2'
                }`}
                dangerouslySetInnerHTML={{ __html: previewingTemplate.contentHtml }}
              />
            </div>

            {/* Footer Modal */}
            <div className="p-3.5 sm:p-4 bg-white border-t border-slate-200 flex items-center justify-between gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setPreviewingTemplate(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Đóng
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadOriginalDocx(previewingTemplate)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Tải File Mẫu (.docx)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const tpl = previewingTemplate;
                    setPreviewingTemplate(null);
                    handleStartMerge(tpl);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl cursor-pointer shadow-xs"
                >
                  <FileCheck className="w-4 h-4" />
                  <span>Trộn Văn Bản Ngay</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. MODAL XÁC NHẬN XÓA MẪU */}
      {deletingTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="font-bold text-slate-900 text-base">Xác nhận xóa mẫu văn bản</h3>
              <p className="text-xs text-slate-500">
                Bạn có chắc chắn muốn xóa mẫu{' '}
                <strong className="text-slate-800">"{deletingTemplate.name}"</strong> không? Thao tác này sẽ xóa vĩnh viễn mẫu khỏi hệ thống.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeletingTemplate(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteConfirm}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-xl cursor-pointer transition-colors shadow-xs"
              >
                {isDeleting ? 'Đang xóa...' : 'Xác Nhận Xóa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Document Generator Modal */}
      <ErrorBoundary fallbackTitle="Lỗi hiển thị cửa sổ Tạo văn bản" onReset={() => setIsGeneratorModalOpen(false)}>
        <DocumentGeneratorModal
          isOpen={isGeneratorModalOpen}
          onClose={() => setIsGeneratorModalOpen(false)}
          targetEmployees={generatorTargetEmployees}
        />
      </ErrorBoundary>
    </div>
  );
};
