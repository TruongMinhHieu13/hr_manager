import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Code2,
  Copy,
  FileCode2,
  GitBranch,
  Layout,
  Lock,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  TestTube2,
  X,
  Zap,
} from 'lucide-react';

type RuleCategory = 'process' | 'quality' | 'security_perf';

interface RuleSection {
  id: number;
  title: string;
  category: RuleCategory;
  categoryLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  accentClass: string;
  badgeClass: string;
  items: string[];
}

const RULE_SECTIONS: RuleSection[] = [
  {
    id: 1,
    title: 'Planning First',
    category: 'process',
    categoryLabel: 'Quy trình',
    icon: ClipboardCheck,
    accentClass: 'text-blue-700 bg-blue-50 border-blue-200',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    items: [
      'Phân tích yêu cầu trước khi code.',
      'Lập kế hoạch triển khai rõ ràng.',
      'Kiểm tra cấu trúc dự án hiện tại.',
      'Không tự ý thay đổi công nghệ hoặc kiến trúc dự án.',
      'Hỏi lại khi yêu cầu chưa đủ rõ.',
    ],
  },
  {
    id: 2,
    title: 'Clean Code',
    category: 'quality',
    categoryLabel: 'Chất lượng code',
    icon: Code2,
    accentClass: 'text-indigo-700 bg-indigo-50 border-indigo-200',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    items: [
      'Code rõ ràng, dễ đọc, dễ bảo trì.',
      'Ưu tiên modular architecture.',
      'Tách component theo chức năng.',
      'Tái sử dụng code khi hợp lý.',
      'Tránh duplicate code và unnecessary abstraction.',
      'Đặt tên biến, hàm, component có ý nghĩa.',
    ],
  },
  {
    id: 3,
    title: 'Preserve Existing Code',
    category: 'process',
    categoryLabel: 'Quy trình',
    icon: ShieldCheck,
    accentClass: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    items: [
      'Không phá vỡ chức năng hiện có.',
      'Không sửa file không liên quan.',
      'Không xóa code nếu chưa hiểu tác động.',
      'Ưu tiên thay đổi nhỏ và có kiểm soát.',
    ],
  },
  {
    id: 4,
    title: 'UI/UX Standards',
    category: 'quality',
    categoryLabel: 'Giao diện & UX',
    icon: Layout,
    accentClass: 'text-violet-700 bg-violet-50 border-violet-200',
    badgeClass: 'bg-violet-50 text-violet-700 border-violet-200',
    items: [
      'Thiết kế hiện đại, chuyên nghiệp.',
      'Giao diện nhất quán về màu sắc, font chữ và spacing.',
      'Responsive trên mọi thiết bị.',
      'Đảm bảo accessibility.',
      'Mọi button, form, menu và interaction phải hoạt động thực tế.',
      'Có đầy đủ loading, error và empty states.',
    ],
  },
  {
    id: 5,
    title: 'Performance',
    category: 'security_perf',
    categoryLabel: 'Hiệu suất',
    icon: Zap,
    accentClass: 'text-amber-700 bg-amber-50 border-amber-200',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    items: [
      'Tối ưu rendering.',
      'Tối ưu hình ảnh và tài nguyên.',
      'Lazy load khi phù hợp.',
      'Hạn chế dependency không cần thiết.',
      'Tối ưu API requests.',
      'Hướng đến Core Web Vitals tốt.',
    ],
  },
  {
    id: 6,
    title: 'Security',
    category: 'security_perf',
    categoryLabel: 'Bảo mật',
    icon: Lock,
    accentClass: 'text-rose-700 bg-rose-50 border-rose-200',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    items: [
      'Không expose API keys hoặc secrets.',
      'Validate dữ liệu đầu vào.',
      'Xử lý authentication và authorization an toàn.',
      'Chống XSS, SQL Injection và các lỗ hổng phổ biến.',
      'Không tin tưởng dữ liệu từ client.',
    ],
  },
  {
    id: 7,
    title: 'Error Handling',
    category: 'quality',
    categoryLabel: 'Xử lý lỗi',
    icon: AlertTriangle,
    accentClass: 'text-orange-700 bg-orange-50 border-orange-200',
    badgeClass: 'bg-orange-50 text-orange-700 border-orange-200',
    items: [
      'Không bỏ qua lỗi.',
      'Không sử dụng try/catch chỉ để che giấu lỗi.',
      'Thông báo lỗi rõ ràng.',
      'Xử lý các trường hợp edge cases.',
      'Không tự tạo dữ liệu giả để che giấu API hoặc database errors.',
    ],
  },
  {
    id: 8,
    title: 'Testing',
    category: 'process',
    categoryLabel: 'Kiểm thử',
    icon: TestTube2,
    accentClass: 'text-teal-700 bg-teal-50 border-teal-200',
    badgeClass: 'bg-teal-50 text-teal-700 border-teal-200',
    items: [
      'Kiểm tra sau mỗi thay đổi quan trọng.',
      'Chạy lint, typecheck và build nếu dự án hỗ trợ.',
      'Kiểm tra chức năng liên quan.',
      'Sửa lỗi phát sinh trước khi hoàn thành.',
      'Không tuyên bố đã test nếu chưa thực sự chạy test.',
    ],
  },
  {
    id: 9,
    title: 'Code Modification',
    category: 'process',
    categoryLabel: 'Quy trình',
    icon: GitBranch,
    accentClass: 'text-cyan-700 bg-cyan-50 border-cyan-200',
    badgeClass: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    items: [
      'Đọc code hiện tại trước khi sửa.',
      'Chỉ sửa những phần cần thiết.',
      'Không refactor toàn bộ nếu không được yêu cầu.',
      'Giữ backward compatibility khi có thể.',
    ],
  },
  {
    id: 10,
    title: 'Final Report',
    category: 'process',
    categoryLabel: 'Báo cáo',
    icon: FileCode2,
    accentClass: 'text-slate-700 bg-slate-100 border-slate-200',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    items: [
      'Những chức năng đã thực hiện.',
      'Các file đã tạo hoặc chỉnh sửa.',
      'Những lỗi đã xử lý.',
      'Kết quả kiểm tra.',
      'Những vấn đề chưa hoàn thành.',
    ],
  },
];

const GOLDEN_RULES: string[] = [
  'Understand first, code second.',
  'Never break existing functionality.',
  'Quality over quantity.',
  'Security over convenience.',
  'Performance without sacrificing maintainability.',
  'Never fake test results.',
  'Never make assumptions when clarification is essential.',
];

const FULL_MARKDOWN_RULES = `# AI WEBSITE DEVELOPMENT RULES

Bạn là một Senior Full-stack Developer có kinh nghiệm xây dựng website chuyên nghiệp, tối ưu hiệu suất, bảo mật và trải nghiệm người dùng.

Hãy tuân thủ nghiêm ngặt các quy tắc sau:

${RULE_SECTIONS.map(
  (section) =>
    `## ${section.id}. ${section.title}\n${section.items.map((item) => `- ${item}`).join('\n')}`
).join('\n\n')}

## GOLDEN RULES
${GOLDEN_RULES.map((rule, idx) => `${idx + 1}. ${rule}`).join('\n')}

Mục tiêu cuối cùng: Xây dựng website có chất lượng production-ready, giao diện chuyên nghiệp, hoạt động ổn định, bảo mật, hiệu suất tốt và dễ dàng mở rộng.`;

const CATEGORY_FILTERS: { id: 'all' | RuleCategory; label: string }[] = [
  { id: 'all', label: 'Tất cả (10)' },
  { id: 'process', label: 'Quy trình & Kiểm thử' },
  { id: 'quality', label: 'Clean Code & UI/UX' },
  { id: 'security_perf', label: 'Bảo mật & Hiệu suất' },
];

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback below
    }
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export const AiRulesView: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<'all' | RuleCategory>('all');
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedSectionId, setCopiedSectionId] = useState<number | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredSections = useMemo(() => {
    return RULE_SECTIONS.filter((section) => {
      const matchesCategory =
        activeCategory === 'all' || section.category === activeCategory;
      if (!matchesCategory) return false;
      if (!normalizedQuery) return true;
      const inTitle = section.title.toLowerCase().includes(normalizedQuery);
      const inItems = section.items.some((item) =>
        item.toLowerCase().includes(normalizedQuery)
      );
      return inTitle || inItems;
    });
  }, [activeCategory, normalizedQuery]);

  const filteredGoldenRules = useMemo(() => {
    if (!normalizedQuery) return GOLDEN_RULES;
    if ('golden rules'.includes(normalizedQuery)) return GOLDEN_RULES;
    return GOLDEN_RULES.filter((rule) =>
      rule.toLowerCase().includes(normalizedQuery)
    );
  }, [normalizedQuery]);

  const totalRuleItems = useMemo(
    () => RULE_SECTIONS.reduce((sum, sec) => sum + sec.items.length, 0),
    []
  );
  const checkedCount = useMemo(
    () => Object.values(checkedItems).filter(Boolean).length,
    [checkedItems]
  );

  const toggleItem = (sectionId: number, itemIndex: number) => {
    const key = `${sectionId}-${itemIndex}`;
    setCheckedItems((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCopyAll = async () => {
    setCopyError(null);
    const ok = await copyTextToClipboard(FULL_MARKDOWN_RULES);
    if (ok) {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2500);
    } else {
      setCopyError('Không thể sao chép tự động. Vui lòng kiểm tra quyền clipboard của trình duyệt.');
    }
  };

  const handleCopySection = async (section: RuleSection) => {
    setCopyError(null);
    const markdown = `## ${section.id}. ${section.title}\n${section.items
      .map((item) => `- ${item}`)
      .join('\n')}`;
    const ok = await copyTextToClipboard(markdown);
    if (ok) {
      setCopiedSectionId(section.id);
      setTimeout(() => setCopiedSectionId(null), 2000);
    } else {
      setCopyError('Không thể sao chép mục này vào clipboard.');
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="space-y-2 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              AI Website Development Rules
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Quy Tắc AI Code Cho Dự Án VietSun HRM
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Vai trò: <span className="font-semibold text-slate-800">Senior Full-stack Developer</span> có kinh nghiệm xây dựng website chuyên nghiệp, tối ưu hiệu suất, bảo mật và trải nghiệm người dùng.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {checkedCount > 0 && (
              <button
                type="button"
                onClick={() => setCheckedItems({})}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                title="Đặt lại checklist"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Đặt lại ({checkedCount}/{totalRuleItems})
              </button>
            )}
            <button
              type="button"
              onClick={handleCopyAll}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer shadow-xs ${
                copiedAll
                  ? 'bg-emerald-600 text-white'
                  : 'bg-blue-700 hover:bg-blue-800 text-white'
              }`}
            >
              {copiedAll ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Đã sao chép Markdown!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Sao chép toàn bộ (Markdown)
                </>
              )}
            </button>
          </div>
        </div>

        {copyError && (
          <div
            role="alert"
            className="mt-4 px-3.5 py-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs font-medium text-rose-700"
          >
            {copyError}
          </div>
        )}

        {/* Mục tiêu cuối cùng */}
        <div className="mt-5 p-4 rounded-xl bg-gradient-to-r from-blue-50 via-indigo-50/70 to-slate-50 border border-blue-200/80 flex items-start gap-3">
          <div className="p-2 rounded-lg bg-blue-700 text-white shrink-0">
            <Award className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-blue-800">
              Mục tiêu cuối cùng
            </div>
            <p className="text-sm font-medium text-slate-800 mt-0.5">
              Xây dựng website có chất lượng production-ready, giao diện chuyên nghiệp, hoạt động ổn định, bảo mật, hiệu suất tốt và dễ dàng mở rộng.
            </p>
          </div>
        </div>

        {/* Search & Category Filters */}
        <div className="mt-5 pt-5 border-t border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm quy tắc (vd: bảo mật, responsive, test, XSS...)"
              aria-label="Tìm kiếm quy tắc AI code"
              className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 focus:bg-white transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Xóa từ khóa tìm kiếm"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Lọc theo nhóm quy tắc">
            {CATEGORY_FILTERS.map((cat) => {
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-blue-700 text-white border-blue-700'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Golden Rules Highlight */}
      {filteredGoldenRules.length > 0 && (
        <section className="bg-slate-900 text-white rounded-xl p-6 border border-slate-800 shadow-xs">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-400/30">
                <Award className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold tracking-wide uppercase text-amber-300">
                  Golden Rules
                </h2>
                <p className="text-xs text-slate-400">
                  7 nguyên tắc vàng luôn được ưu tiên hàng đầu trong mọi thay đổi
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {filteredGoldenRules.map((rule, index) => (
              <div
                key={rule}
                className="p-3.5 rounded-lg bg-slate-800/80 border border-slate-700/80 flex items-start gap-2.5"
              >
                <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/30 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {index + 1}
                </span>
                <span className="text-xs sm:text-sm font-medium text-slate-100 leading-snug">
                  {rule}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 10 Core Rule Sections */}
      {filteredSections.length > 0 ? (
        <section
          aria-label="Danh sách 10 quy tắc phát triển phần mềm"
          className="grid grid-cols-1 md:grid-cols-2 gap-5"
        >
          {filteredSections.map((section) => {
            const Icon = section.icon;
            const sectionCheckedCount = section.items.filter(
              (_, idx) => checkedItems[`${section.id}-${idx}`]
            ).length;
            const isSectionCopied = copiedSectionId === section.id;

            return (
              <article
                key={section.id}
                className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between hover:border-slate-300 transition-colors shadow-xs"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 pb-3.5 border-b border-slate-100">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`p-2.5 rounded-xl border shrink-0 ${section.accentClass}`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm sm:text-base font-bold text-slate-900">
                            {section.id}. {section.title}
                          </h3>
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${section.badgeClass}`}
                          >
                            {section.categoryLabel}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Đã kiểm tra {sectionCheckedCount}/{section.items.length} tiêu chí
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCopySection(section)}
                      aria-label={`Sao chép mục ${section.id}. ${section.title}`}
                      title="Sao chép mục này"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
                    >
                      {isSectionCopied ? (
                        <Check className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  <ul className="mt-3.5 space-y-2">
                    {section.items.map((item, idx) => {
                      const isChecked = !!checkedItems[`${section.id}-${idx}`];
                      return (
                        <li key={idx}>
                          <button
                            type="button"
                            onClick={() => toggleItem(section.id, idx)}
                            aria-pressed={isChecked}
                            className={`w-full text-left flex items-start gap-2.5 p-2 rounded-lg transition-colors cursor-pointer ${
                              isChecked
                                ? 'bg-emerald-50/70 text-slate-500'
                                : 'hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            <span
                              className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                isChecked
                                  ? 'bg-emerald-600 border-emerald-600 text-white'
                                  : 'border-slate-300 bg-white'
                              }`}
                            >
                              {isChecked && <Check className="w-3 h-3" />}
                            </span>
                            <span
                              className={`text-xs sm:text-sm leading-relaxed ${
                                isChecked ? 'line-through' : ''
                              }`}
                            >
                              {item}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        <section className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <Search className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-slate-800">
            Không tìm thấy quy tắc phù hợp
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Thử tìm với từ khóa khác hoặc đặt lại bộ lọc danh mục.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setActiveCategory('all');
            }}
            className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Xem tất cả quy tắc
          </button>
        </section>
      )}
    </div>
  );
};
