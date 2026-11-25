/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Maximize2,
  Minimize2,
  Search,
  Upload,
  CloudUpload,
  Printer,
  Download,
  ArrowLeft,
  ArrowRight,
  FileText,
  Check,
  Copy,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Bold,
  Italic,
  Underline,
  Sparkles,
  Trash2,
  FileCheck,
  AlertCircle,
  Clock,
  Building2,
  User,
} from 'lucide-react';
import { DocumentTemplate, Employee } from '../types';
import { api } from '../api';

interface DocumentGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetEmployees: Employee[];
  initialTemplateName?: string;
  initialCategory?: string;
  onSavedEmployees?: (updatedEmployees: Employee[]) => void;
}

import {
  mergeEmployeeData,
  cleanVietnameseDiacritics,
  SYSTEM_VARIABLES,
  VARIABLE_CATEGORIES,
} from '../utils/documentVariables';

export { mergeEmployeeData, cleanVietnameseDiacritics };

// Bảng màu tạo avatar viết tắt
const AVATAR_COLORS = [
  'bg-blue-600',
  'bg-indigo-600',
  'bg-purple-600',
  'bg-emerald-600',
  'bg-amber-600',
  'bg-rose-600',
  'bg-cyan-600',
];

export const DocumentGeneratorModal: React.FC<DocumentGeneratorModalProps> = ({
  isOpen,
  onClose,
  targetEmployees,
  initialTemplateName,
  initialCategory,
  onSavedEmployees,
}) => {
  // 1: Chọn mẫu văn bản, 2: Trộn văn bản
  const [step, setStep] = useState<1 | 2>(1);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Danh sách mẫu văn bản
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Quản lý số hợp đồng tự động tăng dần cho mẫu hợp đồng
  const [startContractNumber, setStartContractNumber] = useState<string>('1080');
  const [employeeContractNumbers, setEmployeeContractNumbers] = useState<Record<string, string>>({});
  const [isSavingAllocations, setIsSavingAllocations] = useState<boolean>(false);
  const [hasSavedAllocations, setHasSavedAllocations] = useState<boolean>(false);

  // Bộ lọc Step 1
  const [searchTemplate, setSearchTemplate] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [pageSize, setPageSize] = useState<number>(15);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // File Upload Input Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State Step 2: Trộn văn bản
  const [activeEmployeeIndex, setActiveEmployeeIndex] = useState<number>(0);
  const [searchEmployeeTerm, setSearchEmployeeTerm] = useState('');
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  // Chế độ xem: 'a4' (Khổ giấy A4 210mm) | 'full' (Tràn toàn trang / Full page)
  const [viewMode, setViewMode] = useState<'a4' | 'full'>('full');
  // Ước lượng số trang A4
  const [estimatedPages, setEstimatedPages] = useState<number>(1);

  // Lưu trữ nội dung chỉnh sửa trực tiếp theo ID nhân viên
  const [editedDocs, setEditedDocs] = useState<Record<string, string>>({});

  // Tra cứu danh sách biến thay thế
  const [showVariablesModal, setShowVariablesModal] = useState<boolean>(false);
  const [selectedVarCategory, setSelectedVarCategory] = useState<string>('Tất cả');
  const [varSearchQuery, setVarSearchQuery] = useState<string>('');
  const [copiedVarCode, setCopiedVarCode] = useState<string | null>(null);

  const filteredModalVariables = useMemo(() => {
    return SYSTEM_VARIABLES.filter((v) => {
      const matchCat =
        selectedVarCategory === 'Tất cả' || v.category === selectedVarCategory;
      const q = varSearchQuery.trim().toLowerCase();
      const matchQ =
        !q ||
        v.code.toLowerCase().includes(q) ||
        v.label.toLowerCase().includes(q) ||
        v.example.toLowerCase().includes(q);
      return matchCat && matchQ;
    });
  }, [selectedVarCategory, varSearchQuery]);

  const copyVariable = (code: string) => {
    try {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(code);
      }
    } catch {
      // ignore
    }
    setCopiedVarCode(code);
    setTimeout(() => setCopiedVarCode(null), 2500);
  };

  // Document Editor Ref
  const documentEditorRef = useRef<HTMLDivElement>(null);

  // Template đang chọn
  const selectedTemplate = useMemo(() => {
    return templates.find((t) => t.id === selectedTemplateId) || templates[0] || null;
  }, [templates, selectedTemplateId]);

  // Kiểm tra mẫu hiện tại có phải là hợp đồng lao động / thử việc / đào tạo không
  const isContractTemplate = useMemo(() => {
    if (!selectedTemplate) return false;
    const name = (selectedTemplate.name || '').toLowerCase();
    const cat = (selectedTemplate.category || '').toLowerCase();
    const content = (selectedTemplate.contentHtml || '').toLowerCase();
    return (
      cat.includes('hợp đồng') ||
      name.includes('hd') ||
      name.includes('hđ') ||
      name.includes('hop_dong') ||
      content.includes('#số hợp đồng#') ||
      content.includes('#số hđ#')
    );
  }, [selectedTemplate]);

  // Tự động tải số hợp đồng gợi ý tăng dần từ sequence hệ thống
  useEffect(() => {
    if (isOpen && targetEmployees.length > 0) {
      setHasSavedAllocations(false);
      api.getNextContractNumber(targetEmployees.length)
        .then((res) => {
          const startNum = res.startNumber || res.nextContractNumber || '1080';
          const nums =
            res.numbers && res.numbers.length === targetEmployees.length
              ? res.numbers
              : targetEmployees.map((_, i) => {
                  const v = (parseInt(startNum, 10) || 1080) + i;
                  return v < 1000 ? String(v).padStart(4, '0') : String(v);
                });
          setStartContractNumber(startNum);
          const map: Record<string, string> = {};
          targetEmployees.forEach((emp, i) => {
            map[emp.id] = nums[i];
          });
          setEmployeeContractNumbers(map);
        })
        .catch(() => {
          setStartContractNumber('1080');
          const map: Record<string, string> = {};
          targetEmployees.forEach((emp, i) => {
            const v = 1080 + i;
            map[emp.id] = String(v);
          });
          setEmployeeContractNumbers(map);
        });
    }
  }, [isOpen, targetEmployees]);

  // Xử lý thay đổi số hợp đồng bắt đầu (tự động phân bổ lại cho các nhân viên phía sau)
  const handleStartContractNumberChange = (newVal: string) => {
    setStartContractNumber(newVal);
    setHasSavedAllocations(false);
    const startVal = parseInt(newVal, 10);
    if (!isNaN(startVal)) {
      const newMap: Record<string, string> = {};
      targetEmployees.forEach((emp, i) => {
        const v = startVal + i;
        newMap[emp.id] = v < 1000 ? String(v).padStart(4, '0') : String(v);
      });
      setEmployeeContractNumbers(newMap);
      setEditedDocs({});
    }
  };

  // Xử lý tùy chỉnh số hợp đồng riêng cho 1 nhân viên
  const handleIndividualContractNumberChange = (empId: string, val: string) => {
    setHasSavedAllocations(false);
    setEmployeeContractNumbers((prev) => ({
      ...prev,
      [empId]: val,
    }));
    setEditedDocs((prev) => {
      const copy = { ...prev };
      delete copy[empId];
      return copy;
    });
  };

  // Tải danh sách mẫu văn bản từ PostgreSQL API
  const loadTemplates = async () => {
    setIsLoadingTemplates(true);
    setErrorMessage(null);
    try {
      const data = await api.getDocumentTemplates();
      setTemplates(data);
      if (data.length > 0) {
        if (initialTemplateName) {
          const match = data.find(
            (t) =>
              t.name.toLowerCase() === initialTemplateName.toLowerCase() ||
              t.name.toLowerCase().includes(initialTemplateName.toLowerCase())
          );
          if (match) {
            setSelectedTemplateId(match.id);
            setStep(2);
            return;
          }
        }
        if (!selectedTemplateId) {
          setSelectedTemplateId(data[0].id);
        }
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Lỗi tải danh sách mẫu văn bản'
      );
    } finally {
      setIsLoadingTemplates(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (initialCategory) {
        setSelectedCategory(initialCategory);
      }
      loadTemplates();
      if (!initialTemplateName) {
        setStep(1);
      }
      setActiveEmployeeIndex(0);
      setEditedDocs({});
    }
  }, [isOpen, initialTemplateName, initialCategory]);

  // Bộ lọc mẫu văn bản Step 1
  const filteredTemplates = useMemo(() => {
    let list = templates;
    if (searchTemplate.trim()) {
      const term = searchTemplate.trim().toLowerCase();
      list = list.filter((t) => t.name.toLowerCase().includes(term));
    }
    if (selectedCategory !== 'ALL') {
      list = list.filter((t) => t.category === selectedCategory);
    }
    return list;
  }, [templates, searchTemplate, selectedCategory]);

  // Phân trang Step 1
  const paginatedTemplates = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTemplates.slice(start, start + pageSize);
  }, [filteredTemplates, currentPage, pageSize]);

  // Danh sách nhân sự được lọc trong Step 2
  const filteredEmployees = useMemo(() => {
    if (!searchEmployeeTerm.trim()) return targetEmployees;
    const term = searchEmployeeTerm.trim().toLowerCase();
    return targetEmployees.filter(
      (e) =>
        e.fullName.toLowerCase().includes(term) ||
        e.msnv.toLowerCase().includes(term) ||
        (e.department || '').toLowerCase().includes(term)
    );
  }, [targetEmployees, searchEmployeeTerm]);

  // Nhân viên đang xem trong Step 2
  const currentEmployee = targetEmployees[activeEmployeeIndex] || targetEmployees[0];

  // Nội dung văn bản đã trộn cho nhân viên hiện tại
  const currentMergedHtml = useMemo(() => {
    if (!currentEmployee || !selectedTemplate) return '';
    // Nếu nhân viên này đã có bản sửa tay thì dùng bản sửa tay, nếu chưa thì trộn mới từ mẫu
    if (editedDocs[currentEmployee.id]) {
      return editedDocs[currentEmployee.id];
    }
    const currentContractNumber =
      employeeContractNumbers[currentEmployee.id] || startContractNumber;
    const overrides = isContractTemplate
      ? {
          '#Số hợp đồng#': currentContractNumber,
          '#Số HĐ#': currentContractNumber,
          '{{soHopDong}}': currentContractNumber,
          '{so_hd}': currentContractNumber,
        }
      : undefined;
    return mergeEmployeeData(selectedTemplate.contentHtml, currentEmployee, overrides);
  }, [
    currentEmployee,
    selectedTemplate,
    editedDocs,
    employeeContractNumbers,
    startContractNumber,
    isContractTemplate,
  ]);

  // Lưu cấp số hợp đồng vào PostgreSQL & lịch sử hợp đồng
  const saveContractAllocations = async (silent: boolean = false) => {
    if (!isContractTemplate || targetEmployees.length === 0) return;
    setIsSavingAllocations(true);
    try {
      const isTraining =
        selectedTemplate?.name?.toLowerCase().includes('hddt') ||
        selectedTemplate?.name?.toLowerCase().includes('đào tạo') ||
        selectedTemplate?.name?.toLowerCase().includes('hoc_nghe');
      const contractType = isTraining ? 'HĐĐT' : 'HĐTV';
      const contractTypeName = isTraining ? 'Hợp đồng đào tạo' : 'Hợp đồng thử việc';
      const defaultDuration = isTraining ? '60 NGÀY' : '60 NGÀY';

      const allocations = targetEmployees.map((emp) => ({
        employeeId: emp.id,
        contractNumber: employeeContractNumbers[emp.id] || startContractNumber,
        contractType,
        contractTypeName,
        duration: emp.thoiHan || defaultDuration,
        startDate: emp.tuNgay || emp.ngayVao,
        endDate: emp.denNgay,
        note: `Tạo từ mẫu: ${selectedTemplate?.name || 'Mẫu văn bản'}`,
      }));

      const res = await api.allocateContractNumbers({
        allocations,
        templateName: selectedTemplate?.name,
      });

      setHasSavedAllocations(true);
      if (onSavedEmployees && res.updatedEmployees) {
        onSavedEmployees(res.updatedEmployees);
      }
      if (!silent) {
        setSuccessMessage(
          `Đã lưu số hợp đồng (${allocations.map((a) => a.contractNumber).join(', ')}) vào hồ sơ nhân viên và lịch sử!`
        );
        setTimeout(() => setSuccessMessage(null), 4000);
      }
      return res;
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Lỗi lưu số hợp đồng');
      setTimeout(() => setErrorMessage(null), 5000);
    } finally {
      setIsSavingAllocations(false);
    }
  };

  // Cập nhật ước lượng số trang A4 của văn bản
  useEffect(() => {
    if (step === 2 && documentEditorRef.current) {
      const scrollH = documentEditorRef.current.scrollHeight;
      // Chiều cao nội dung khả dụng 1 trang A4 (~980px)
      const pages = Math.max(1, Math.ceil(scrollH / 980));
      setEstimatedPages(pages);
    }
  }, [step, currentMergedHtml, activeEmployeeIndex, zoomLevel, viewMode]);

  // Xử lý tải lên file Word mẫu (.docx)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name;
    const isDocx = fileName.toLowerCase().endsWith('.docx');
    const isDoc = fileName.toLowerCase().endsWith('.doc');

    if (!isDocx && !isDoc) {
      setErrorMessage('Chỉ hỗ trợ file Word định dạng .docx hoặc .doc');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setIsUploading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      // Đọc file thành Base64
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = (reader.result as string) || '';
          // Gọi API server parse docx bằng mammoth
          const parsed = await api.parseDocxFile(base64Data);

          const newTemplateName = fileName.replace(/\.[^/.]+$/, '');
          const newTemplate: Partial<DocumentTemplate> = {
            id: `doc_tpl_${Date.now()}`,
            name: newTemplateName,
            category: 'Hồ sơ',
            fileName: fileName,
            fileSize: file.size,
            contentHtml: cleanVietnameseDiacritics(parsed.contentHtml),
            rawText: cleanVietnameseDiacritics(parsed.rawText),
            fileDataBase64: base64Data,
          };

          const saved = await api.saveDocumentTemplate(newTemplate);
          setTemplates((prev) => [saved, ...prev]);
          setSelectedTemplateId(saved.id);
          setSuccessMessage(`Đã tải lên và lưu thành công mẫu "${saved.name}".`);
          setTimeout(() => setSuccessMessage(null), 3500);
        } catch (err) {
          setErrorMessage(
            err instanceof Error ? err.message : 'Không thể đọc nội dung file Word.'
          );
        } finally {
          setIsUploading(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      };

      reader.onerror = () => {
        setErrorMessage('Lỗi khi đọc file trên thiết bị.');
        setIsUploading(false);
      };

      reader.readAsDataURL(file);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Lỗi tải file.');
      setIsUploading(false);
    }
  };

  // Xóa mẫu văn bản tùy chỉnh
  const handleDeleteTemplate = async (templateId: string, templateName: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa mẫu văn bản "${templateName}"?`)) {
      return;
    }
    try {
      await api.deleteDocumentTemplate(templateId);
      setTemplates((prev) => prev.filter((t) => t.id !== templateId));
      if (selectedTemplateId === templateId) {
        setSelectedTemplateId(templates[0]?.id || null);
      }
      setSuccessMessage(`Đã xóa mẫu văn bản "${templateName}".`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Lỗi xóa mẫu văn bản.');
    }
  };

  // In văn bản hiện tại
  const handlePrintDocument = () => {
    const editorEl = documentEditorRef.current;
    if (!editorEl) return;

    if (isContractTemplate && !hasSavedAllocations) {
      saveContractAllocations(true);
    }

    const contentHtml = editorEl.innerHTML;
    const printWindow = window.open('', '_blank', 'width=900,height=800');
    if (!printWindow) {
      alert('Trình duyệt đã chặn cửa sổ in pop-up. Vui lòng cho phép pop-up để in.');
      return;
    }

    printWindow.document.open();
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title></title>
        <style>
          @page {
            size: A4 portrait;
            margin: 18mm 15mm 18mm 20mm; /* Lề trang chuẩn văn bản A4: Trên 18mm, Phải 15mm, Dưới 18mm, Trái 20mm */
          }
          @media print {
            @page {
              size: A4 portrait;
              margin: 18mm 15mm 18mm 20mm;
            }
            html, body {
              margin: 0 !important;
              padding: 0 !important;
            }
          }
          * {
            font-family: 'Times New Roman', Times, serif !important;
            box-sizing: border-box;
          }
          body {
            font-family: 'Times New Roman', Times, serif !important;
            font-size: 13pt !important;
            line-height: 1.5;
            color: #000;
            margin: 0;
            padding: 0;
            background: #fff;
          }
          div, p, span, td, th, li {
            font-family: 'Times New Roman', Times, serif !important;
          }
          [style*="font-size: 12pt"], [style*="font-size:12pt"] {
            font-size: 13pt !important;
          }
          table { width: 100%; border-collapse: collapse; }
          p { margin: 0 0 6pt 0; font-size: 13pt; }
        </style>
      </head>
      <body>
        <div>${contentHtml}</div>
        <script>
          window.onload = function() {
            window.focus();
            window.print();
            setTimeout(function() { window.close(); }, 800);
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  // In tất cả văn bản cho toàn bộ nhân viên được chọn
  const handlePrintAllDocuments = () => {
    if (!selectedTemplate || targetEmployees.length === 0) return;

    if (isContractTemplate && !hasSavedAllocations) {
      saveContractAllocations(true);
    }

    const currentEditorHtml = documentEditorRef.current?.innerHTML;

    const allDocsHtml = targetEmployees
      .map((emp) => {
        let docHtml = '';
        if (currentEmployee && emp.id === currentEmployee.id && currentEditorHtml) {
          docHtml = currentEditorHtml;
        } else if (editedDocs[emp.id]) {
          docHtml = editedDocs[emp.id];
        } else {
          const assignedNum = employeeContractNumbers[emp.id] || startContractNumber;
          const overrides = isContractTemplate
            ? {
                '#Số hợp đồng#': assignedNum,
                '#Số HĐ#': assignedNum,
                '{{soHopDong}}': assignedNum,
                '{so_hd}': assignedNum,
              }
            : undefined;
          docHtml = mergeEmployeeData(selectedTemplate.contentHtml, emp, overrides);
        }

        return `
          <div class="print-document-item" style="page-break-after: always; break-after: page;">
            ${docHtml}
          </div>
        `;
      })
      .join('\n');

    const printWindow = window.open('', '_blank', 'width=900,height=800');
    if (!printWindow) {
      alert('Trình duyệt đã chặn cửa sổ in pop-up. Vui lòng cho phép pop-up để in.');
      return;
    }

    printWindow.document.open();
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title></title>
        <style>
          @page {
            size: A4 portrait;
            margin: 18mm 15mm 18mm 20mm; /* Lề trang chuẩn A4 */
          }
          @media print {
            @page {
              size: A4 portrait;
              margin: 18mm 15mm 18mm 20mm;
            }
            html, body {
              margin: 0 !important;
              padding: 0 !important;
            }
          }
          * {
            font-family: 'Times New Roman', Times, serif !important;
            box-sizing: border-box;
          }
          body {
            font-family: 'Times New Roman', Times, serif !important;
            font-size: 13pt !important;
            line-height: 1.5;
            color: #000;
            margin: 0;
            padding: 0;
            background: #fff;
          }
          div, p, span, td, th, li {
            font-family: 'Times New Roman', Times, serif !important;
          }
          [style*="font-size: 12pt"], [style*="font-size:12pt"] {
            font-size: 13pt !important;
          }
          table { width: 100%; border-collapse: collapse; }
          p { margin: 0 0 6pt 0; font-size: 13pt; }
          .print-document-item {
            page-break-after: always;
            break-after: page;
          }
          .print-document-item:last-child {
            page-break-after: auto;
            break-after: auto;
          }
        </style>
      </head>
      <body>
        <div>${allDocsHtml}</div>
        <script>
          window.onload = function() {
            window.focus();
            window.print();
            setTimeout(function() { window.close(); }, 800);
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Tải văn bản về máy dưới định dạng Word (.doc/.docx)
  const handleDownloadWord = () => {
    const editorEl = documentEditorRef.current;
    if (!editorEl || !currentEmployee) return;

    if (isContractTemplate && !hasSavedAllocations) {
      saveContractAllocations(true);
    }

    const contentHtml = editorEl.innerHTML;
    const safeName = (currentEmployee.fullName || 'NhanVien').replace(/\s+/g, '_');
    const safeTpl = (selectedTemplate?.name || 'VanBan').replace(/\s+/g, '_');
    const fileName = `${safeTpl}_${safeName}_${currentEmployee.msnv}.doc`;

    const docContent = `<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
<meta charset='utf-8'>
<title>${fileName}</title>
<style>
  @page Section1 { size: 595.3pt 841.9pt; margin: 20mm 20mm 20mm 20mm; mso-header-margin: 35.4pt; mso-footer-margin: 35.4pt; mso-paper-source: 0; }
  div.Section1 { page: Section1; }
  * { font-family: 'Times New Roman', Times, serif !important; }
  body { font-family: 'Times New Roman', Times, serif; font-size: 13pt; line-height: 1.5; color: #000; }
  div, p, span, td, th, li { font-family: 'Times New Roman', Times, serif !important; }
  table { width: 100%; border-collapse: collapse; }
  p { margin: 0 0 6pt 0; font-size: 13pt; }
</style>
</head>
<body>
<div class="Section1">
${contentHtml}
</div>
</body>
</html>`;

    const blob = new Blob(['\ufeff', docContent], {
      type: 'application/msword;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-2 sm:p-4 animate-in fade-in duration-150">
      <div
        className={`bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 transition-all ${
          isFullscreen
            ? 'fixed inset-2 z-50 w-auto h-auto'
            : 'w-full max-w-[98vw] 2xl:max-w-[1800px] h-[96vh]'
        }`}
      >
        {/* =================================================================== */}
        {/* HEADER MODAL (Khớp ảnh mẫu 1 & 2)                                  */}
        {/* =================================================================== */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-white shrink-0">
          <div>
            <h1 className="text-base font-bold text-slate-900 leading-tight">
              Tạo văn bản
            </h1>
            {/* Stepper Breadcrumbs */}
            <div className="flex items-center gap-1.5 text-xs mt-1">
              <button
                type="button"
                onClick={() => setStep(1)}
                className={`font-semibold cursor-pointer transition-colors ${
                  step === 1 ? 'text-blue-600 font-bold' : 'text-slate-500 hover:text-blue-600'
                }`}
              >
                1. Chọn mẫu văn bản
              </button>
              <span className="text-slate-400 font-mono-num">›</span>
              <span
                className={`font-semibold ${
                  step === 2 ? 'text-blue-600 font-bold' : 'text-slate-400'
                }`}
              >
                2. Trộn văn bản
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Nút phóng to / thu nhỏ */}
            <button
              type="button"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
              title={isFullscreen ? 'Thu nhỏ lại' : 'Phóng to toàn màn hình'}
            >
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </button>
            {/* Nút Đóng */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer transition-colors"
              title="Đóng cửa sổ"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Thông báo lỗi / thành công */}
        {errorMessage && (
          <div className="mx-6 mt-3 p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="p-1 text-red-600 hover:bg-red-100 rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {successMessage && (
          <div className="mx-6 mt-3 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setSuccessMessage(null)}
              className="p-1 text-emerald-600 hover:bg-emerald-100 rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* =================================================================== */}
        {/* STEP 1: CHỌN MẪU VĂN BẢN (GIAO DIỆN KHỚP ẢNH 1)                     */}
        {/* =================================================================== */}
        {step === 1 && (
          <div className="flex-1 flex flex-col min-h-0 bg-white">
            {/* Toolbar Step 1 */}
            <div className="p-6 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
              <div className="flex flex-wrap items-center gap-3 flex-1">
                {/* Ô tìm kiếm */}
                <div className="relative w-64">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchTemplate}
                    onChange={(e) => setSearchTemplate(e.target.value)}
                    placeholder="Tìm kiếm mẫu văn bản..."
                    className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:border-blue-600 bg-white"
                  />
                </div>

                {/* Dropdown loại mẫu */}
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white text-slate-700 focus:outline-none focus:border-blue-600 cursor-pointer"
                >
                  <option value="ALL">Tất cả mẫu</option>
                  <option value="Hồ sơ">Hồ sơ</option>
                  <option value="Hợp đồng">Hợp đồng</option>
                  <option value="Quyết định">Quyết định</option>
                  <option value="Công văn">Công văn</option>
                </select>
              </div>

              {/* Nút Tải mẫu văn bản (Upload file Word .docx) */}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".docx,.doc"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-xl cursor-pointer transition-colors shadow-xs"
                >
                  <CloudUpload className="w-4 h-4" />
                  <span>{isUploading ? 'Đang tải lên...' : 'Tải mẫu văn bản'}</span>
                </button>
              </div>
            </div>

            {/* Bảng danh sách mẫu văn bản */}
            <div className="flex-1 overflow-auto px-6">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-700 font-bold bg-white sticky top-0">
                    <th className="py-3 px-4 w-12 text-center">
                      <span className="sr-only">Chọn</span>
                    </th>
                    <th className="py-3 px-4">Tên mẫu</th>
                    <th className="py-3 px-4 w-40">Loại mẫu</th>
                    <th className="py-3 px-4 w-24 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedTemplates.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-16 text-center text-slate-400">
                        <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                        <p className="font-semibold text-xs text-slate-600">
                          {searchTemplate
                            ? `Không tìm thấy mẫu nào khớp với "${searchTemplate}".`
                            : 'Chưa có mẫu văn bản nào. Hãy bấm "Tải mẫu văn bản" để tải file Word lên.'}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    paginatedTemplates.map((item) => {
                      const isSelected = selectedTemplateId === item.id;

                      return (
                        <tr
                          key={item.id}
                          onClick={() => setSelectedTemplateId(item.id)}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-blue-50/80 font-medium'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          {/* Radio/Checkbox Indicator */}
                          <td className="py-3.5 px-4 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => setSelectedTemplateId(item.id)}
                              className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                            />
                          </td>

                          {/* Tên mẫu */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2.5">
                              <div className="p-1.5 bg-blue-50 text-blue-700 rounded-lg shrink-0">
                                <FileText className="w-4 h-4" />
                              </div>
                              <div>
                                <span className="font-bold text-slate-900 text-xs">
                                  {item.name}
                                </span>
                                {item.fileName && (
                                  <div className="text-[11px] text-slate-400 font-mono-num mt-0.5">
                                    {item.fileName}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Loại mẫu */}
                          <td className="py-3.5 px-4 text-slate-600">
                            <span className="inline-block px-2.5 py-1 bg-slate-100 text-slate-700 rounded-md text-[11px] font-semibold">
                              {item.category || 'Hồ sơ'}
                            </span>
                          </td>

                          {/* Thao tác xóa nếu là mẫu tải lên */}
                          <td className="py-3.5 px-4 text-right">
                            {!item.id.startsWith('doc_tpl_') && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteTemplate(item.id, item.name);
                                }}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer transition-colors"
                                title="Xóa mẫu văn bản này"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
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

            {/* Footer Pagination & Next Button Step 1 */}
            <div className="p-4 px-6 border-t border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
              <div className="text-xs text-slate-600 font-medium">
                Tổng số bản ghi:{' '}
                <strong className="font-mono-num text-slate-900 font-bold">
                  {filteredTemplates.length}
                </strong>
              </div>

              <div className="flex items-center gap-4 self-end sm:self-auto">
                <div className="flex items-center gap-2 text-xs text-slate-600 font-mono-num">
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="px-2 py-1 bg-white border border-slate-300 rounded text-xs font-semibold cursor-pointer"
                  >
                    <option value={10}>10</option>
                    <option value={15}>15</option>
                    <option value={30}>30</option>
                  </select>
                  <span>
                    Từ {(currentPage - 1) * pageSize + 1} đến{' '}
                    {Math.min(currentPage * pageSize, filteredTemplates.length)}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage((p) => p - 1)}
                      className="p-1 text-slate-500 hover:bg-slate-100 rounded disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={currentPage * pageSize >= filteredTemplates.length}
                      onClick={() => setCurrentPage((p) => p + 1)}
                      className="p-1 text-slate-500 hover:bg-slate-100 rounded disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    disabled={!selectedTemplateId}
                    onClick={() => setStep(2)}
                    className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-40 rounded-xl cursor-pointer transition-colors shadow-xs"
                  >
                    <span>Tiếp tục</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* STEP 2: TRỘN VĂN BẢN (GIAO DIỆN KHỚP ẢNH 2)                         */}
        {/* =================================================================== */}
        {step === 2 && (
          <div className="flex-1 flex flex-col min-h-0 bg-slate-50">
            {/* Vùng chính: Chia 2 cột (Trái: Danh sách nhân viên, Phải: Bản xem trước) */}
            <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
              {/* ------------------------------------------------------------- */}
              {/* CỘT TRÁI: Danh sách nhân viên được tạo văn bản                 */}
              {/* ------------------------------------------------------------- */}
              <div className="w-full md:w-80 lg:w-88 border-r border-slate-200 bg-white flex flex-col shrink-0">
                {/* Ô tìm kiếm nhân viên */}
                <div className="p-3.5 border-b border-slate-100">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={searchEmployeeTerm}
                      onChange={(e) => setSearchEmployeeTerm(e.target.value)}
                      placeholder="Tìm kiếm nhân viên..."
                      className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-blue-600 transition-colors"
                    />
                  </div>
                </div>

                {/* Danh sách nhân viên (Khớp avatar tròn chữ tắt trong ảnh 2) */}
                <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                  {filteredEmployees.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 text-xs">
                      Không tìm thấy nhân viên nào.
                    </div>
                  ) : (
                    filteredEmployees.map((emp, index) => {
                      const isActive =
                        targetEmployees[activeEmployeeIndex]?.id === emp.id;
                      const initials = emp.fullName
                        .split(' ')
                        .filter(Boolean)
                        .slice(-2)
                        .map((n) => n[0].toUpperCase())
                        .join('');
                      const colorBg =
                        AVATAR_COLORS[index % AVATAR_COLORS.length];

                      return (
                        <div
                          key={emp.id}
                          onClick={() => {
                            const originalIdx = targetEmployees.findIndex(
                              (e) => e.id === emp.id
                            );
                            if (originalIdx !== -1) {
                              setActiveEmployeeIndex(originalIdx);
                            }
                          }}
                          className={`p-3.5 flex items-center gap-3 cursor-pointer transition-colors ${
                            isActive
                              ? 'bg-blue-50/80 border-l-4 border-blue-600'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          {/* Avatar tròn với chữ viết tắt như ảnh 2 (TL, LT, NH...) */}
                          <div
                            className={`w-9 h-9 rounded-full ${colorBg} text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs`}
                          >
                            {initials || emp.fullName.slice(0, 2).toUpperCase()}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-slate-900 text-xs truncate flex items-center justify-between">
                              <span className="truncate">
                                {emp.fullName}{' '}
                                <span className="text-slate-500 font-mono-num font-semibold">
                                  ({emp.msnv})
                                </span>
                              </span>
                              {isContractTemplate && employeeContractNumbers[emp.id] && (
                                <span className="ml-1 px-1.5 py-0.5 text-[10px] font-mono-num font-bold rounded bg-blue-100 text-blue-800 shrink-0">
                                  #{employeeContractNumbers[emp.id]}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate mt-0.5">
                              {selectedTemplate?.name || 'Mẫu văn bản'}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Footer Cột Trái */}
                <div className="p-3 border-t border-slate-100 bg-slate-50/60 text-[11px] text-slate-500 flex items-center justify-between font-mono-num">
                  <span>Tổng: <strong>{targetEmployees.length}</strong></span>
                  <span>1 - {targetEmployees.length} bản ghi</span>
                </div>
              </div>

              {/* ------------------------------------------------------------- */}
              {/* CỘT PHẢI: Trình xem trước & Soạn thảo văn bản A4               */}
              {/* ------------------------------------------------------------- */}
              <div
                className={`flex-1 flex flex-col min-w-0 overflow-hidden transition-colors ${
                  viewMode === 'full' ? 'bg-white' : 'bg-slate-100/70'
                }`}
              >
                {/* Toolbar Editor / Viewer */}
                <div className="px-4 py-2 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
                  <div className="flex items-center gap-1 text-slate-600">
                    <span className="text-xs font-bold text-slate-700 mr-2">
                      {selectedTemplate?.name}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full font-semibold">
                      {currentEmployee?.fullName} ({currentEmployee?.msnv})
                    </span>
                  </div>

                  {/* Zoom controls, Chế độ xem & Số trang */}
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    {/* Nút tra cứu biến thay thế */}
                    <button
                      type="button"
                      onClick={() => setShowVariablesModal(true)}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200/80 rounded-lg font-semibold transition-colors cursor-pointer"
                      title="Tra cứu &amp; sao chép biến thay thế nhân sự"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                      <span>Biến thay thế ({SYSTEM_VARIABLES.length})</span>
                    </button>

                    <div className="h-4 w-px bg-slate-200 mx-0.5" />

                    {/* Nút chuyển đổi: Khổ A4 hoặc Tràn trang */}
                    <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                      <button
                        type="button"
                        onClick={() => setViewMode('a4')}
                        className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-md transition-all cursor-pointer ${
                          viewMode === 'a4'
                            ? 'bg-white text-blue-700 shadow-2xs font-bold'
                            : 'text-slate-600 hover:text-slate-900 font-medium'
                        }`}
                        title="Khổ giấy A4 chuẩn in (210mm)"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Khổ A4</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode('full')}
                        className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-md transition-all cursor-pointer ${
                          viewMode === 'full'
                            ? 'bg-white text-blue-700 shadow-2xs font-bold'
                            : 'text-slate-600 hover:text-slate-900 font-medium'
                        }`}
                        title="Phần giấy trắng mở rộng toàn màn hình (Full page)"
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                        <span>Tràn trang</span>
                      </button>
                    </div>

                    <div className="h-4 w-px bg-slate-200 mx-0.5" />

                    {/* Nút Zoom */}
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => setZoomLevel((z) => Math.max(50, z - 10))}
                        className="p-1 hover:bg-slate-100 rounded cursor-pointer"
                        title="Thu nhỏ xem trước"
                      >
                        <ZoomOut className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setZoomLevel(100)}
                        className="font-mono-num text-[11px] font-semibold w-10 text-center hover:bg-slate-100 rounded py-0.5 cursor-pointer"
                        title="Nhấp để đặt lại 100%"
                      >
                        {zoomLevel}%
                      </button>
                      <button
                        type="button"
                        onClick={() => setZoomLevel((z) => Math.min(160, z + 10))}
                        className="p-1 hover:bg-slate-100 rounded cursor-pointer"
                        title="Phóng to xem trước"
                      >
                        <ZoomIn className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="h-4 w-px bg-slate-200 mx-0.5" />

                    <span className="text-[11px] font-mono-num text-slate-500 whitespace-nowrap">
                      Ước tính: <strong className="text-slate-800">{estimatedPages}</strong> trang
                    </span>
                  </div>
                </div>

                {/* Banner quản lý số hợp đồng tự động tăng dần */}
                {isContractTemplate && (
                  <div className="px-4 py-2 bg-gradient-to-r from-blue-50 via-indigo-50/40 to-blue-50/20 border-b border-blue-200/80 flex flex-wrap items-center justify-between gap-2.5 text-xs shrink-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-600 text-white rounded-lg font-bold shadow-2xs">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Số HĐ tự động tăng dần</span>
                      </div>

                      <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-blue-200 shadow-2xs">
                        <span className="text-slate-600 font-medium">Bắt đầu từ:</span>
                        <input
                          type="text"
                          value={startContractNumber}
                          onChange={(e) => handleStartContractNumberChange(e.target.value)}
                          className="w-16 px-1.5 py-0.5 text-center font-mono-num font-bold text-blue-700 bg-blue-50/50 border border-blue-300 rounded focus:bg-white focus:outline-none focus:border-blue-600"
                          title="Nhập số hợp đồng bắt đầu (các nhân viên tiếp theo sẽ tự động tăng 1 đơn vị)"
                        />
                      </div>

                      <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
                        <span className="text-slate-600 font-medium">Số HĐ của nhân viên này:</span>
                        <input
                          type="text"
                          value={employeeContractNumbers[currentEmployee?.id] || ''}
                          onChange={(e) => handleIndividualContractNumberChange(currentEmployee?.id, e.target.value)}
                          className="w-16 px-1.5 py-0.5 text-center font-mono-num font-bold text-emerald-700 bg-emerald-50/50 border border-emerald-300 rounded focus:bg-white focus:outline-none focus:border-emerald-600"
                          title="Tùy chỉnh số hợp đồng riêng cho nhân viên đang chọn nếu cần"
                        />
                        <span className="text-[11px] text-slate-400">
                          (Thế vào <code className="text-blue-600 font-mono font-bold">#Số hợp đồng#</code>)
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => saveContractAllocations(false)}
                        disabled={isSavingAllocations || hasSavedAllocations}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs shadow-2xs transition-all ${
                          hasSavedAllocations
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 cursor-default'
                            : 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                        }`}
                        title="Lưu số hợp đồng mới vào hồ sơ nhân viên và bảng lịch sử hợp đồng"
                      >
                        {isSavingAllocations ? (
                          <Clock className="w-3.5 h-3.5 animate-spin" />
                        ) : hasSavedAllocations ? (
                          <Check className="w-3.5 h-3.5 text-emerald-700" />
                        ) : (
                          <FileCheck className="w-3.5 h-3.5" />
                        )}
                        <span>{hasSavedAllocations ? 'Đã lưu vào hồ sơ' : 'Lưu số HĐ vào hồ sơ'}</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Vùng giấy A4 / Tràn trang hiển thị văn bản */}
                <div
                  className={`flex-1 overflow-y-auto pb-32 transition-all ${
                    viewMode === 'full'
                      ? 'bg-white px-6 sm:px-12 py-6 flex justify-center items-start'
                      : 'bg-slate-100/70 p-4 sm:p-8 flex justify-center items-start'
                  }`}
                >
                  <div
                    style={{
                      zoom: zoomLevel !== 100 ? `${zoomLevel}%` : undefined,
                      width: viewMode === 'a4' ? '210mm' : '100%',
                      maxWidth: viewMode === 'a4' ? '210mm' : '100%',
                      minHeight: '297mm',
                      height: 'auto',
                      fontFamily: "'Times New Roman', Times, serif",
                      fontSize: '13pt',
                      lineHeight: '1.5',
                    }}
                    className={`document-preview-paper bg-white text-black leading-relaxed transition-all font-['Times_New_Roman'] text-[13pt] h-auto min-h-[297mm] self-start ${
                      viewMode === 'full'
                        ? 'w-full max-w-none p-2 sm:p-4 shadow-none border-none'
                        : 'w-[210mm] max-w-full p-10 sm:p-16 shadow-xl rounded-sm border border-slate-200/80 my-2'
                    }`}
                  >
                    {/* BẢN NỘI DUNG VĂN BẢN TRỘN (Hỗ trợ nhấp vào sửa trực tiếp) */}
                    <div
                      ref={documentEditorRef}
                      contentEditable={true}
                      suppressContentEditableWarning={true}
                      onBlur={(e) => {
                        const updatedHtml = e.currentTarget?.innerHTML || '';
                        if (currentEmployee) {
                          setEditedDocs((prev) => ({
                            ...prev,
                            [currentEmployee.id]: updatedHtml,
                          }));
                        }
                      }}
                      dangerouslySetInnerHTML={{ __html: currentMergedHtml }}
                      className="document-editor-content outline-none focus:ring-1 focus:ring-blue-400 p-1 rounded font-['Times_New_Roman'] text-[13pt] min-h-[260mm]"
                      style={{
                        fontFamily: "'Times New Roman', Times, serif",
                        fontSize: '13pt',
                        lineHeight: '1.5',
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* =============================================================== */}
            {/* FOOTER STEP 2 (Khớp chính xác 2 nút đỏ viền trong ảnh 2)         */}
            {/* =============================================================== */}
            <div className="p-4 px-6 border-t border-slate-200 bg-white flex items-center justify-between gap-4 shrink-0">
              {/* Nút Quay lại (bên trái) */}
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer transition-colors"
              >
                Quay lại
              </button>

              {/* Mẹo in sạch không dính header/footer */}
              <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
                <span className="font-bold text-slate-800">💡 Mẹo in:</span>
                <span>Trong cửa sổ in, vào <strong>Tùy chọn khác</strong> ➔ Bỏ tích <strong>&ldquo;Tiêu đề và chân trang&rdquo;</strong> để không in kèm ngày giờ &amp; link.</span>
              </div>

              {/* Các nút In, In tất cả và Tải xuống */}
              <div className="flex items-center gap-2.5">
                {/* Nút In văn bản đang xem */}
                <button
                  type="button"
                  onClick={handlePrintDocument}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-xl cursor-pointer transition-colors shadow-2xs"
                  title="In văn bản của nhân viên đang chọn (Ctrl + P)"
                >
                  <Printer className="w-4 h-4" />
                  <span>In bản này</span>
                </button>

                {/* Nút In tất cả văn bản */}
                <button
                  type="button"
                  onClick={handlePrintAllDocuments}
                  className="inline-flex items-center gap-1.5 px-4.5 py-2.5 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 rounded-xl cursor-pointer transition-colors shadow-2xs"
                  title={`In văn bản của toàn bộ ${targetEmployees.length} nhân viên`}
                >
                  <Printer className="w-4 h-4" />
                  <span>In tất cả ({targetEmployees.length})</span>
                </button>

                {/* Nút Tải xuống (File Word .doc/.docx) */}
                <button
                  type="button"
                  onClick={handleDownloadWord}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-xl cursor-pointer transition-colors shadow-xs"
                  title="Tải văn bản về máy dưới định dạng Word"
                >
                  <Download className="w-4 h-4" />
                  <span>Tải xuống</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal tra cứu biến thay thế */}
        {showVariablesModal && (
          <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[85vh] overflow-hidden border border-slate-200">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-amber-100 text-amber-700">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Biến thay thế thông tin nhân sự ({SYSTEM_VARIABLES.length} biến)
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Nhấp vào bất kỳ biến nào để sao chép mã biến vào khay nhớ tạm
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowVariablesModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Lọc danh mục & Tìm kiếm */}
              <div className="p-4 border-b border-slate-100 bg-white space-y-3">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={varSearchQuery}
                      onChange={(e) => setVarSearchQuery(e.target.value)}
                      placeholder="Tìm biến (ví dụ: khối, chức vụ, cccd, hợp đồng, địa chỉ...)"
                      className="w-full pl-9 pr-7 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-blue-500 transition-colors"
                    />
                    {varSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setVarSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm cursor-pointer"
                      >
                        ×
                      </button>
                    )}
                  </div>

                  {copiedVarCode && (
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-xl inline-flex items-center gap-1.5 shrink-0 animate-pulse">
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      Đã sao chép {copiedVarCode}
                    </span>
                  )}
                </div>

                {/* Danh mục */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                  {VARIABLE_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedVarCategory(cat)}
                      className={`px-2.5 py-1 text-xs rounded-lg font-semibold whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
                        selectedVarCategory === cat
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Danh sách biến */}
              <div className="p-4 overflow-y-auto flex-1 max-h-[50vh] space-y-2">
                {filteredModalVariables.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400 italic">
                    Không tìm thấy biến phù hợp với từ khóa &quot;{varSearchQuery}&quot;
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {filteredModalVariables.map((v) => (
                      <button
                        key={v.code}
                        type="button"
                        onClick={() => copyVariable(v.code)}
                        className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-200 text-left transition-all cursor-pointer group shadow-2xs"
                      >
                        <div className="min-w-0 pr-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono-num font-bold text-xs text-blue-700">
                              {v.code}
                            </span>
                            <span className="text-[10px] text-slate-400 bg-white border border-slate-200 px-1.5 py-0.2 rounded font-medium">
                              {v.category}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-600 font-medium truncate mt-0.5">
                            {v.label}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">
                            VD: {v.example}
                          </div>
                        </div>
                        <div className="shrink-0 p-1.5 text-slate-400 group-hover:text-blue-600 group-hover:bg-white rounded-lg transition-colors">
                          <Copy className="w-3.5 h-3.5" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer Modal */}
              <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
                <span>
                  Hiển thị: <strong>{filteredModalVariables.length}</strong> / {SYSTEM_VARIABLES.length} biến
                </span>
                <button
                  type="button"
                  onClick={() => setShowVariablesModal(false)}
                  className="px-4 py-1.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg cursor-pointer transition-colors"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
