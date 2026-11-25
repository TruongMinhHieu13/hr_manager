/**
 * Quản lý định tuyến và đồng bộ URL cho VietSun HRM
 * Giúp các tab có đường dẫn (slug/tiền tố) riêng biệt và không bị reset về trang chủ khi F5
 */

import { ActiveTab } from '../types';

export const TAB_TO_PATH: Record<ActiveTab, string> = {
  dashboard: '/dashboard',
  employees: '/employees',
  departments: '/departments',
  expiring_contracts: '/expiring-contracts',
  birthdays: '/birthdays',
  probation_contracts: '/probation-contracts',
  training_contracts: '/training-contracts',
  created_contracts: '/created-contracts',
  resignation: '/resignation',
  document_templates: '/document-templates',
  face_crop: '/face-crop',
  designer: '/designer',
  print: '/print',
  history: '/history',
  settings: '/settings',
  ai_rules: '/ai-rules',
};

export const TAB_TITLES: Record<ActiveTab, string> = {
  dashboard: 'Dashboard - VietSun HRM',
  employees: 'Quản lý nhân viên - VietSun HRM',
  departments: 'Cơ cấu tổ chức & Phòng ban - VietSun HRM',
  expiring_contracts: 'Hợp đồng sắp hết hạn - VietSun HRM',
  birthdays: 'Sinh nhật trong tháng - VietSun HRM',
  probation_contracts: 'Hợp đồng thử việc (HĐTV) - VietSun HRM',
  training_contracts: 'Hợp đồng đào tạo nghề (HĐĐT) - VietSun HRM',
  created_contracts: 'Hợp đồng đã tạo - VietSun HRM',
  resignation: 'Nhân sự nghỉ việc - VietSun HRM',
  document_templates: 'Mẫu văn bản - VietSun HRM',
  face_crop: 'Cắt ảnh thẻ & Tách nền - VietSun HRM',
  designer: 'Thiết kế mẫu thẻ - VietSun HRM',
  print: 'In thẻ nhân viên - VietSun HRM',
  history: 'Lịch sử in & Import - VietSun HRM',
  settings: 'Cài đặt hệ thống - VietSun HRM',
  ai_rules: 'Quy tắc AI Code - VietSun HRM',
};

// Bản đồ ánh xạ tất cả slug (tiếng Anh, tiếng Việt, gạch dưới, gạch ngang) sang ActiveTab
const SLUG_TO_TAB_MAP: Record<string, ActiveTab> = {
  // Dashboard
  dashboard: 'dashboard',
  'tong-quan': 'dashboard',
  tongquan: 'dashboard',
  home: 'dashboard',
  'trang-chu': 'dashboard',
  trangchu: 'dashboard',

  // Employees
  employees: 'employees',
  employee: 'employees',
  'nhan-vien': 'employees',
  nhanvien: 'employees',

  // Departments
  departments: 'departments',
  department: 'departments',
  'phong-ban': 'departments',
  phongban: 'departments',
  'co-cau-to-chuc': 'departments',

  // Expiring contracts
  'expiring-contracts': 'expiring_contracts',
  expiring_contracts: 'expiring_contracts',
  'hop-dong-het-han': 'expiring_contracts',
  'het-han-hop-dong': 'expiring_contracts',
  hopdonghethan: 'expiring_contracts',

  // Birthdays
  birthdays: 'birthdays',
  birthday: 'birthdays',
  'sinh-nhat': 'birthdays',
  sinhnhat: 'birthdays',

  // Probation contracts
  'probation-contracts': 'probation_contracts',
  probation_contracts: 'probation_contracts',
  'hop-dong-thu-viec': 'probation_contracts',
  hopdongthuviec: 'probation_contracts',
  hdtv: 'probation_contracts',

  // Training contracts
  'training-contracts': 'training_contracts',
  training_contracts: 'training_contracts',
  'hop-dong-dao-tao': 'training_contracts',
  hopdongdaotao: 'training_contracts',
  hddt: 'training_contracts',

  // Created contracts
  'created-contracts': 'created_contracts',
  created_contracts: 'created_contracts',
  'hop-dong-da-tao': 'created_contracts',
  hopdongdatao: 'created_contracts',
  contracts: 'created_contracts',

  // Resignation & Work History
  resignation: 'resignation',
  'nghi-viec': 'resignation',
  nghiviec: 'resignation',
  'nhan-su-nghi-viec': 'resignation',
  'work-history': 'resignation',
  work_history: 'resignation',
  'lich-su-lam-viec': 'resignation',
  lichsulamviec: 'resignation',
  'tai-tuyen-dung': 'resignation',
  taituyendung: 'resignation',

  // Document templates
  'document-templates': 'document_templates',
  document_templates: 'document_templates',
  'mau-van-ban': 'document_templates',
  mauvanban: 'document_templates',

  // Face crop
  'face-crop': 'face_crop',
  face_crop: 'face_crop',
  'cat-anh-the': 'face_crop',
  catanhthe: 'face_crop',
  'tach-nen': 'face_crop',

  // Designer
  designer: 'designer',
  'thiet-ke-the': 'designer',
  thietkethe: 'designer',
  'mau-the': 'designer',

  // Print
  print: 'print',
  'in-the': 'print',
  inthe: 'print',
  'batch-print': 'print',

  // History
  history: 'history',
  'lich-su': 'history',
  lichsu: 'history',
  'nhat-ky': 'history',

  // Settings
  settings: 'settings',
  'cai-dat': 'settings',
  caidat: 'settings',
  'thiet-lap': 'settings',

  // AI Rules
  'ai-rules': 'ai_rules',
  ai_rules: 'ai_rules',
  airules: 'ai_rules',
  'quy-tac-ai': 'ai_rules',
  quytacai: 'ai_rules',
  'quy-tac-code': 'ai_rules',
  quytaccode: 'ai_rules',
};

/**
 * Chuẩn hóa một chuỗi slug thành ActiveTab tương ứng
 */
export function matchSlugToTab(rawSlug: string): ActiveTab | null {
  if (!rawSlug) return null;
  const slug = rawSlug.trim().toLowerCase().replace(/^\/+|\/+$/g, '');
  if (!slug) return null;

  if (slug in SLUG_TO_TAB_MAP) {
    return SLUG_TO_TAB_MAP[slug];
  }

  // Thử bỏ dấu gạch ngang hoặc gạch dưới
  const simplified = slug.replace(/[-_]/g, '');
  if (simplified in SLUG_TO_TAB_MAP) {
    return SLUG_TO_TAB_MAP[simplified];
  }

  return null;
}

/**
 * Đọc tab hiện tại từ URL (hỗ trợ pathname, hash, query params)
 */
export function getTabFromUrl(): ActiveTab {
  if (typeof window === 'undefined') return 'dashboard';

  try {
    // 1. Kiểm tra hash (ví dụ: #/employees hoặc #nhan-vien)
    const hash = window.location.hash.replace(/^#\/?/, '').trim();
    if (hash) {
      const tabFromHash = matchSlugToTab(hash);
      if (tabFromHash) return tabFromHash;
    }

    // 2. Kiểm tra query parameters (ví dụ: ?tab=employees)
    const searchParams = new URLSearchParams(window.location.search);
    const tabParam = searchParams.get('tab') || searchParams.get('page');
    if (tabParam) {
      const tabFromParam = matchSlugToTab(tabParam);
      if (tabFromParam) return tabFromParam;
    }

    // 3. Kiểm tra pathname (ví dụ: /employees, /probation-contracts)
    const pathname = window.location.pathname;
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length > 0) {
      const lastSegment = segments[segments.length - 1];
      const tabFromPath = matchSlugToTab(lastSegment);
      if (tabFromPath) return tabFromPath;
    }
  } catch (err) {
    console.warn('Lỗi phân tích route từ URL:', err);
  }

  return 'dashboard';
}

/**
 * Lấy đường dẫn URL đại diện cho một tab
 */
export function getPathForTab(tab: ActiveTab): string {
  return TAB_TO_PATH[tab] || `/${tab}`;
}

/**
 * Cập nhật tiêu đề trang
 */
export function updateDocumentTitle(tab: ActiveTab) {
  if (typeof document !== 'undefined') {
    document.title = TAB_TITLES[tab] || 'VietSun HRM';
  }
}
