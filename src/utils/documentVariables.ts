import { Employee } from '../types';

export interface VariableDefinition {
  code: string;
  label: string;
  example: string;
  category: string;
  description?: string;
}

export const VARIABLE_CATEGORIES = [
  'Tất cả',
  'Thông tin nhân sự',
  'Công việc & Đơn vị',
  'Hợp đồng & Lương',
  'Địa chỉ & Học vấn',
  'Thời gian & Văn bản',
] as const;

export type VariableCategory = typeof VARIABLE_CATEGORIES[number];

// Danh sách các biến phổ biến nhất thường dùng trong mẫu văn bản
export const COMMON_VARIABLES = [
  '#Họ và tên#',
  '#MSNV#',
  '#Chức vụ#',
  '#Phòng ban#',
  '#Số hợp đồng#',
  '#Từ ngày#',
  '#Đến ngày#',
  '#Lương thử việc#',
  '#Số CCCD#',
  '#Hôm nay#',
];

// Danh sách biến chuẩn hóa tinh gọn (36 biến cốt lõi, đại diện đầy đủ 100% nhu cầu hợp đồng & văn bản)
export const SYSTEM_VARIABLES: VariableDefinition[] = [
  // 1. THÔNG TIN NHÂN SỰ
  { code: '#Họ và tên#', label: 'Họ và tên (In hoa toàn bộ)', example: 'NGUYỄN VĂN A', category: 'Thông tin nhân sự' },
  { code: '#MSNV#', label: 'Mã số nhân viên', example: 'NV0001', category: 'Thông tin nhân sự' },
  { code: '#Ngày sinh#', label: 'Ngày tháng năm sinh', example: '15/08/1995', category: 'Thông tin nhân sự' },
  { code: '#Giới tính#', label: 'Giới tính', example: 'Nam / Nữ', category: 'Thông tin nhân sự' },
  { code: '#Số điện thoại#', label: 'Số điện thoại liên hệ', example: '0987654321', category: 'Thông tin nhân sự' },
  { code: '#Số CCCD#', label: 'Số Căn cước công dân', example: '075097004601', category: 'Thông tin nhân sự' },
  { code: '#Ngày cấp CCCD#', label: 'Ngày cấp CCCD', example: '10/05/2021', category: 'Thông tin nhân sự' },
  { code: '#Nơi cấp CCCD#', label: 'Nơi cấp CCCD', example: 'Cục CSQLHC về TTXH', category: 'Thông tin nhân sự' },
  { code: '#Dân tộc#', label: 'Dân tộc', example: 'Kinh / Tày / Nùng', category: 'Thông tin nhân sự' },
  { code: '#Tôn giáo#', label: 'Tôn giáo', example: 'Không / Phật giáo / Công giáo', category: 'Thông tin nhân sự' },

  // 2. CÔNG VIỆC & ĐƠN VỊ
  { code: '#Phòng ban#', label: 'Tên Phòng ban', example: 'Phòng Bảo trì vận hành', category: 'Công việc & Đơn vị' },
  { code: '#Bộ phận con#', label: 'Bộ phận con / Xưởng trực thuộc', example: 'BP. Chuẩn bị sản xuất', category: 'Công việc & Đơn vị' },
  { code: '#Khối#', label: 'Khối quản lý', example: 'Văn phòng / GTSX', category: 'Công việc & Đơn vị' },
  { code: '#Chức vụ#', label: 'Chức vụ đảm nhiệm', example: 'Trưởng phòng / Nhân viên', category: 'Công việc & Đơn vị' },
  { code: '#Công việc#', label: 'Công việc cụ thể', example: 'Nhân viên IT / Thợ may', category: 'Công việc & Đơn vị' },
  { code: '#Đơn vị#', label: 'Đơn vị làm việc', example: 'Công ty Vietsun Đồng Nai', category: 'Công việc & Đơn vị' },
  { code: '#Ngày vào làm#', label: 'Ngày bắt đầu vào làm', example: '01/01/2025', category: 'Công việc & Đơn vị' },

  // 3. HỢP ĐỒNG & LƯƠNG
  { code: '#Số hợp đồng#', label: 'Số hợp đồng lao động', example: '001/HĐLĐ-2025', category: 'Hợp đồng & Lương' },
  { code: '#Loại HĐ#', label: 'Loại hợp đồng', example: 'HĐTV / HĐXĐTH', category: 'Hợp đồng & Lương' },
  { code: '#Thời hạn#', label: 'Thời hạn hợp đồng', example: '60 ngày / 12 tháng', category: 'Hợp đồng & Lương' },
  { code: '#Từ ngày#', label: 'Ngày bắt đầu hợp đồng', example: '01/01/2025', category: 'Hợp đồng & Lương' },
  { code: '#Đến ngày#', label: 'Ngày kết thúc hợp đồng', example: '31/12/2025', category: 'Hợp đồng & Lương' },
  { code: '#Lương thử việc#', label: 'Mức lương thử việc', example: '6.200.000', category: 'Hợp đồng & Lương' },
  { code: '#Lương chính thức#', label: 'Mức lương chính thức', example: '7.500.000', category: 'Hợp đồng & Lương' },
  { code: '#Bậc lương#', label: 'Bậc lương', example: '1/4 / Bậc 1', category: 'Hợp đồng & Lương' },
  { code: '#Ngạch lương#', label: 'Ngạch lương', example: 'H / Chuyên viên', category: 'Hợp đồng & Lương' },

  // 4. ĐỊA CHỈ & HỌC VẤN
  { code: '#Địa chỉ thường trú#', label: 'Địa chỉ thường trú đầy đủ', example: 'Ấp 1, Xã Xuân Hòa, H. Xuân Lộc, T. Đồng Nai', category: 'Địa chỉ & Học vấn' },
  { code: '#Địa chỉ tạm trú#', label: 'Địa chỉ tạm trú đầy đủ', example: 'Phường Long Bình, Biên Hòa, Đồng Nai', category: 'Địa chỉ & Học vấn' },
  { code: '#Nơi sinh#', label: 'Nơi sinh', example: 'Đồng Nai / TP. Hồ Chí Minh', category: 'Địa chỉ & Học vấn' },
  { code: '#Nguyên quán#', label: 'Nguyên quán / Quê quán', example: 'Hà Tĩnh / Nam Định', category: 'Địa chỉ & Học vấn' },
  { code: '#Trình độ chuyên môn#', label: 'Trình độ chuyên môn / Bằng cấp', example: 'Cao đẳng Kỹ thuật Cao Thắng', category: 'Địa chỉ & Học vấn' },

  // 5. THỜI GIAN & VĂN BẢN
  { code: '#Hôm nay#', label: 'Ngày tháng năm văn bản', example: 'ngày 23 tháng 11 năm 2026', category: 'Thời gian & Văn bản' },
  { code: '#Ngày#', label: 'Ngày hiện tại (2 chữ số)', example: '23', category: 'Thời gian & Văn bản' },
  { code: '#Tháng#', label: 'Tháng hiện tại (2 chữ số)', example: '11', category: 'Thời gian & Văn bản' },
  { code: '#Năm#', label: 'Năm hiện tại (4 chữ số)', example: '2026', category: 'Thời gian & Văn bản' },
  { code: '#Số quyết định#', label: 'Mẫu số quyết định chuẩn', example: '90993/QĐ-VSDN', category: 'Thời gian & Văn bản' },
];

/**
 * Chuẩn hóa dấu tiếng Việt NFC & sửa lỗi gõ tách rời
 */
export function cleanVietnameseDiacritics(str: string): string {
  if (!str) return '';
  let s = str.normalize('NFC');

  // Loại bỏ các dấu thừa bị gắn sau nguyên âm đã có dấu
  s = s.replace(/([áàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵíìỉĩị])['`\u0027\u0060\u2019\u0300\u0301\u0309\u0303\u0323]/gi, '$1');

  // Chuyển đổi các dạng dấu sắc/huyền bị gõ rời (VIQR / decomposed)
  const viqrAccents: [RegExp, (m: string, c: string) => string][] = [
    [/([aAâÂăĂeEêÊoOôÔơƠuUưƯyYiI])['\u0027\u2019\u0301]/g, (_m, c) => {
      const map: Record<string, string> = {
        'a': 'á', 'A': 'Á', 'â': 'ấ', 'Â': 'Ấ', 'ă': 'ắ', 'Ă': 'Ắ',
        'e': 'é', 'E': 'É', 'ê': 'ế', 'Ê': 'Ế',
        'o': 'ó', 'O': 'Ó', 'ô': 'ố', 'Ô': 'Ố', 'ơ': 'ớ', 'Ơ': 'Ớ',
        'u': 'ú', 'U': 'Ú', 'ư': 'ứ', 'Ư': 'Ứ',
        'y': 'ý', 'Y': 'Ý', 'i': 'í', 'I': 'Í'
      };
      return map[c] || c;
    }],
    [/([aAâÂăĂeEêÊoOôÔơƠuUưƯyYiI])[`\u0060\u0300]/g, (_m, c) => {
      const map: Record<string, string> = {
        'a': 'à', 'A': 'À', 'â': 'ầ', 'Â': 'Ầ', 'ă': 'ằ', 'Ă': 'Ằ',
        'e': 'è', 'E': 'È', 'ê': 'ề', 'Ê': 'Ề',
        'o': 'ò', 'O': 'Ò', 'ô': 'ồ', 'Ô': 'Ồ', 'ơ': 'ờ', 'Ơ': 'Ờ',
        'u': 'ù', 'U': 'Ù', 'ư': 'ừ', 'Ư': 'Ừ',
        'y': 'ỳ', 'Y': 'Ỳ', 'i': 'ì', 'I': 'Ì'
      };
      return map[c] || c;
    }],
    [/([áàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵíìỉĩị])['`\u0027\u0060\u2019\u0300\u0301\u0309\u0303\u0323]/gi, (_m, c) => c],
  ];

  for (const [pattern, handler] of viqrAccents) {
    s = s.replace(pattern, handler);
  }

  return s.normalize('NFC');
}

function formatMoneyVnd(val?: string): string {
  if (!val || !val.trim()) return '';
  const str = val.trim();
  if (str.includes('%') || !/\d/.test(str)) {
    return str.replace(/\s*(đ|đồng|vnđ|vnd)\s*$/gi, '').trim();
  }
  const cleanDigits = str.replace(/[^0-9]/g, '');
  if (cleanDigits) {
    return Number(cleanDigits).toLocaleString('vi-VN');
  }
  return str.replace(/\s*(đ|đồng|vnđ|vnd)\s*$/gi, '').trim();
}

/**
 * Xây dựng bảng từ điển thay thế biến cho một nhân viên cụ thể
 * Hỗ trợ overrides để ghi đè các biến cụ thể (ví dụ: #Số hợp đồng# tự động tăng dần)
 */
export function buildEmployeeReplacements(
  emp: Employee,
  overrides?: Record<string, string>
): Record<string, string> {
  const today = new Date();
  const dayStr = String(today.getDate()).padStart(2, '0');
  const monthStr = String(today.getMonth() + 1).padStart(2, '0');
  const yearStr = String(today.getFullYear());

  // Tính toán các trường phụ thuộc hoặc fallback
  const computedDepartment = (
    emp.phongBan ||
    emp.department ||
    emp.boPhan ||
    ''
  ).trim();

  const computedSubDepartment = (
    emp.phongBanCon ||
    ''
  ).trim();

  const computedDivision = (
    emp.khoi ||
    emp.khoi2 ||
    ''
  ).trim();

  const computedDeptCode = (
    emp.kyHieuPb ||
    ''
  ).trim();

  const computedJobTitle = (
    emp.chucVu ||
    emp.congViec ||
    emp.jobTitle ||
    ''
  ).trim();

  const computedWork = (
    emp.congViec ||
    emp.chucVu ||
    emp.jobTitle ||
    ''
  ).trim();

  // Địa chỉ thường trú đầy đủ
  const computedAddress = (
    emp.diaChiThuongTru ||
    [emp.soNhaThuongTru, emp.phuongXaThuongTru, emp.tinhTpThuongTru]
      .filter(Boolean)
      .join(', ') ||
    ''
  ).trim();

  // Địa chỉ tạm trú đầy đủ
  const computedTempAddress = (
    [emp.soNhaTamTru, emp.phuongXaTamTru, emp.tinhTpTamTru]
      .filter(Boolean)
      .join(', ') ||
    emp.soNhaTamTru ||
    computedAddress ||
    ''
  ).trim();

  // Tách họ & tên nếu chưa có sẵn
  let computedHo = emp.ho || '';
  let computedTen = emp.ten || '';
  if ((!computedHo || !computedTen) && emp.fullName) {
    const parts = emp.fullName.trim().split(/\s+/);
    if (parts.length > 1) {
      computedTen = parts[parts.length - 1];
      computedHo = parts.slice(0, -1).join(' ');
    } else {
      computedTen = emp.fullName;
      computedHo = '';
    }
  }

  const joinDateVal = emp.ngayVao || emp.joinDate || '';
  // Ưu tiên số hợp đồng từ overrides (số tự động tăng dần mới), nếu không mới fallback về emp.soHd hoặc msnv
  const overrideContractNumber =
    overrides?.['#Số hợp đồng#'] ||
    overrides?.['#Số HĐ#'] ||
    overrides?.contractNumber ||
    overrides?.soHd;
  const contractNumVal = overrideContractNumber || emp.soHd || emp.msnv || '01';
  // Bắt buộc: Họ tên viết hoa toàn bộ, Thời hạn viết thường hết
  const upperFullName = (emp.fullName || '').trim().toUpperCase();
  const lowerThoiHan = (emp.thoiHan || '').trim().toLowerCase();

  return {
    // 1. Định dạng chuẩn #Tên biến#
    // Thông tin cơ bản
    '#Họ và tên#': upperFullName,
    '#Họ tên#': upperFullName,
    '#Tên nhân viên#': upperFullName,
    '#Họ#': computedHo,
    '#Tên#': computedTen,
    '#MSNV#': emp.msnv || '',
    '#Mã nhân viên#': emp.msnv || '',
    '#Mã số#': emp.msnv || '',
    '#STT#': emp.stt || '',

    // Cơ cấu tổ chức
    '#Khối#': computedDivision,
    '#Ký hiệu PB#': computedDeptCode,
    '#Ký hiệu phòng ban#': computedDeptCode,
    '#Phòng ban#': computedDepartment,
    '#Bộ phận#': computedDepartment,
    '#Phòng ban con#': computedSubDepartment,
    '#Bộ phận con#': computedSubDepartment,
    '#Đơn vị#': emp.donVi || '',

    // Vị trí & Chức danh
    '#Chức vụ#': computedJobTitle,
    '#Vị trí#': computedJobTitle,
    '#Chức danh#': computedJobTitle,
    '#Công việc#': computedWork,
    '#Tình trạng#': emp.tinhTrang || 'Đang làm việc',

    // Hợp đồng & Thời gian
    '#Số hợp đồng#': contractNumVal,
    '#Số HĐ#': contractNumVal,
    '#Loại HĐ#': emp.loaiHd || '',
    '#Thời hạn#': lowerThoiHan,
    '#Thời hạn HĐ#': lowerThoiHan,
    '#Thời hạn hợp đồng#': lowerThoiHan,
    '#Phân loại HĐ#': emp.phanLoai || '',
    '#Ngày vào làm#': joinDateVal,
    '#Ngày bắt đầu#': joinDateVal,
    '#Ngày vào#': joinDateVal,
    '#Từ ngày#': emp.tuNgay || joinDateVal,
    '#Đến ngày#': emp.denNgay || '',
    '#Lương thử việc#': formatMoneyVnd(emp.luongThuViec),
    '#Mức lương thử việc#': formatMoneyVnd(emp.luongThuViec),
    '#Lương đào tạo#': formatMoneyVnd(emp.luongThuViec),
    '#Phụ cấp đào tạo#': formatMoneyVnd(emp.luongThuViec),
    '#Lương#': formatMoneyVnd(emp.luongThuViec || emp.luongChinhThuc),
    '#Mức lương#': formatMoneyVnd(emp.luongThuViec || emp.luongChinhThuc),
    '#Lương chính thức#': formatMoneyVnd(emp.luongChinhThuc),
    '#Lương cơ bản#': formatMoneyVnd(emp.luongChinhThuc || emp.luongThuViec),
    '#Bậc lương#': emp.bacLuong || '',
    '#Bậc#': emp.bacLuong || '',
    '#Ngạch lương#': emp.ngachLuong || '',
    '#Ngạch#': emp.ngachLuong || '',
    '#Ngạch bậc#': [emp.ngachLuong, emp.bacLuong].filter(Boolean).join(' - '),
    '#Bậc ngạch#': [emp.bacLuong, emp.ngachLuong].filter(Boolean).join(' - '),
    '#Ngạch, bậc#': [emp.ngachLuong, emp.bacLuong].filter(Boolean).join(', '),
    '#Bậc, ngạch#': [emp.bacLuong, emp.ngachLuong].filter(Boolean).join(', '),

    // CCCD / CMND
    '#Số CCCD#': emp.cccd || '',
    '#CCCD#': emp.cccd || '',
    '#CMND#': emp.cccd || '',
    '#Ngày cấp CCCD#': emp.ngayCapCccd || '',
    '#Ngày cấp#': emp.ngayCapCccd || '',
    '#Nơi cấp CCCD#': emp.noiCapCccd || 'Cục CSQLHC về TTXH',
    '#Nơi cấp#': emp.noiCapCccd || 'Cục CSQLHC về TTXH',
    '#Ngày hết hạn CCCD#': emp.ngayHetHanCccd || '',
    '#Số CMND cũ#': emp.soCmndCu || '',

    // Thông tin cá nhân
    '#Ngày sinh#': emp.ngaySinh || '',
    '#Nơi sinh#': emp.noiSinh || '',
    '#Nguyên quán#': emp.nguyenQuan || '',
    '#Quê quán#': emp.nguyenQuan || '',
    '#Giới tính#': emp.gioiTinh || 'Nam',
    '#Dân tộc#': emp.danToc || 'Kinh',
    '#Tôn giáo#': emp.tonGiao || 'Không',
    '#Tình trạng hôn nhân#': emp.tinhTrangHonNhan || 'Độc thân',
    '#Hôn nhân#': emp.tinhTrangHonNhan || 'Độc thân',
    '#Sức khỏe#': emp.sucKhoe || 'Tốt',
    '#Người giới thiệu#': emp.gioiThieu || '',
    '#Quốc tịch#': 'Việt Nam',

    // Học vấn & Kỹ năng
    '#Trình độ văn hóa#': emp.trinhDoVanHoa || '',
    '#Trình độ chuyên môn#': emp.trinhDoChuyenMon || '',
    '#Trình độ ngoại ngữ#': emp.trinhDoNgoaiNgu || '',
    '#Ngoại ngữ#': emp.trinhDoNgoaiNgu || '',
    '#Tay nghề#': emp.tayNghe || '',
    '#Bậc thợ#': emp.tayNghe || '',
    '#Đào tạo#': emp.daoTao || '',

    // Địa chỉ & Liên hệ
    '#Số điện thoại#': emp.soDienThoai || '',
    '#SĐT#': emp.soDienThoai || '',
    '#Điện thoại#': emp.soDienThoai || '',
    '#Địa chỉ thường trú#': computedAddress,
    '#Địa chỉ thường chú#': computedAddress,
    '#Hộ khẩu thường trú#': computedAddress,
    '#Hộ khẩu thường chú#': computedAddress,
    '#Thường trú#': computedAddress,
    '#Thường chú#': computedAddress,
    '#HKTT#': computedAddress,
    '#Số nhà thường trú#': emp.soNhaThuongTru || '',
    '#Phường xã thường trú#': emp.phuongXaThuongTru || '',
    '#Tỉnh TP thường trú#': emp.tinhTpThuongTru || '',
    '#Địa chỉ tạm trú#': computedTempAddress,
    '#Chỗ ở hiện nay#': computedTempAddress,
    '#Tạm trú#': computedTempAddress,
    '#Số nhà tạm trú#': emp.soNhaTamTru || '',
    '#Phường xã tạm trú#': emp.phuongXaTamTru || '',
    '#Tỉnh TP tạm trú#': emp.tinhTpTamTru || '',

    // Thời gian & Văn bản hệ thống
    '#Ngày#': dayStr,
    '#Tháng#': monthStr,
    '#Năm#': yearStr,
    '#Hôm nay#': `ngày ${dayStr} tháng ${monthStr} năm ${yearStr}`,
    '#Ngày hiện tại#': dayStr,
    '#Tháng hiện tại#': monthStr,
    '#Năm hiện tại#': yearStr,
    '#Số quyết định#': (emp.extraData as any)?.soQuyetDinh || (emp as any).soQuyetDinh || `${emp.msnv || 'NV'}/QĐ-VSDN`,
    '#Số công văn#': `${emp.msnv || 'NV'}/CV-VSDN`,
    '#Ngày nghỉ việc#': (emp.extraData as any)?.ngayNghi || emp.denNgay || '',
    '#Lý do nghỉ việc#': (emp.extraData as any)?.lyDoNghi || (emp.extraData as any)?.nhomLyDo || '',
    '#Lý do#': (emp.extraData as any)?.lyDoNghi || '',
    '#Nhóm lý do#': (emp.extraData as any)?.nhomLyDo || '',
    '#Người duyệt#': (emp.extraData as any)?.nguoiDuyet || '',
    '#Ngày hẹn trả lương#': (emp.extraData as any)?.ngayHenTraLuong || '',
    '#Hẹn trả lương#': (emp.extraData as any)?.ngayHenTraLuong || '',
    '#Tháng báo cáo#': (emp.extraData as any)?.thangBaoCao || '',

    // 2. Tương thích định dạng {{variable}} và {variable}
    '{{fullName}}': upperFullName,
    '{{msnv}}': emp.msnv || '',
    '{{soQuyetDinh}}': (emp.extraData as any)?.soQuyetDinh || (emp as any).soQuyetDinh || `${emp.msnv || 'NV'}/QĐ-VSDN`,
    '{{ngayNghi}}': (emp.extraData as any)?.ngayNghi || emp.denNgay || '',
    '{{ngayHenTraLuong}}': (emp.extraData as any)?.ngayHenTraLuong || '',
    '{{thangBaoCao}}': (emp.extraData as any)?.thangBaoCao || '',
    '{{lyDoNghi}}': (emp.extraData as any)?.lyDoNghi || '',
    '{{department}}': computedDepartment,
    '{{jobTitle}}': computedJobTitle,
    '{{joinDate}}': joinDateVal,
    '{{cccd}}': emp.cccd || '',
    '{{phone}}': emp.soDienThoai || '',
    '{{address}}': computedAddress,
    '{{division}}': computedDivision,
    '{ho_ten}': upperFullName,
    '{thoi_han}': lowerThoiHan,
    '{msnv}': emp.msnv || '',
    '{phong_ban}': computedDepartment,
    '{khoi}': computedDivision,
    '{ky_hieu_pb}': computedDeptCode,
    '{phong_ban_con}': computedSubDepartment,
    '{chuc_vu}': computedJobTitle,
    '{cong_viec}': computedWork,
    '{ngay_sinh}': emp.ngaySinh || '',
    '{gioi_tinh}': emp.gioiTinh || '',
    '{cccd}': emp.cccd || '',
    '{dia_chi}': computedAddress,
    '{sdt}': emp.soDienThoai || '',
    '{{luong}}': formatMoneyVnd(emp.luongThuViec || emp.luongChinhThuc),
    '{{luongThuViec}}': formatMoneyVnd(emp.luongThuViec),
    '{{luongChinhThuc}}': formatMoneyVnd(emp.luongChinhThuc),
    '{luong}': formatMoneyVnd(emp.luongThuViec || emp.luongChinhThuc),
    '{luong_thu_viec}': formatMoneyVnd(emp.luongThuViec),
    '{luong_chinh_thuc}': formatMoneyVnd(emp.luongChinhThuc),
  };

  // Áp dụng thêm các giá trị overrides nếu có
  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      if (value !== undefined && value !== null) {
        replacements[key] = String(value);
      }
    }
  }

  return replacements;
}

/**
 * Trộn dữ liệu nhân viên vào nội dung văn bản HTML
 * Hỗ trợ overrides để ghi đè số hợp đồng tự động tăng dần hoặc các thông số tùy chỉnh
 */
export function mergeEmployeeData(
  templateHtml: string,
  emp: Employee,
  overrides?: Record<string, string>
): string {
  if (!templateHtml || !emp) return '';

  const today = new Date();
  const dayStr = String(today.getDate()).padStart(2, '0');
  const monthStr = String(today.getMonth() + 1).padStart(2, '0');
  const yearStr = String(today.getFullYear());

  const replacements = buildEmployeeReplacements(emp, overrides);

  let result = templateHtml;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.split(key).join(value);
  }

  // Thay thế các ngày tháng dấu chấm lửng "ngày ... tháng ... năm 202x" bằng ngày hiện tại
  result = result.replace(
    /ngày\s*\.\.\.\s*tháng\s*\.\.\.\s*năm\s*202\d/gi,
    `ngày ${dayStr} tháng ${monthStr} năm ${yearStr}`
  );

  return cleanVietnameseDiacritics(result);
}
