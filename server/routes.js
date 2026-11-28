import express from 'express';
import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';
import { pool } from './db.js';
import { convertDocxToFormattedHtml } from './docxParser.js';
import workHistoryRouter from './workHistoryRoutes.js';
import appointmentRouter, { syncDueAppointmentDecisions } from './appointmentRoutes.js';

const router = express.Router();
const WORKSPACE_ID = 'workspace_vietsun_dong_nai_v1';

// Tích hợp router Quản lý Lịch sử làm việc & Tái tuyển dụng
router.use(workHistoryRouter);
// Tích hợp router Quản lý Bổ nhiệm & Miễn nhiệm
router.use(appointmentRouter);

// Chuẩn hóa tiếng Việt: xử lý triệt để lỗi tách dấu, lỗi VIQR, và chuẩn hóa Unicode sang dạng dựng sẵn NFC
export function cleanVietnameseDiacritics(str) {
  if (!str) return '';
  let s = str.normalize('NFC');

  // 1. Loại bỏ các dấu thừa bị gắn sau nguyên âm đã có dấu
  s = s.replace(/([áàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵíìỉĩị])['`\u0027\u0060\u2019\u0300\u0301\u0309\u0303\u0323]/gi, '$1');

  // 2. Chuyển đổi các dạng dấu sắc/huyền bị gõ rời (VIQR / decomposed)
  const viqrAccents = [
    [/([aAâÂăĂeEêÊoOôÔơƠuUưƯyYiI])['\u0027\u2019\u0301]/g, (_m, c) => {
      const map = {
        'a': 'á', 'A': 'Á', 'â': 'ấ', 'Â': 'Ấ', 'ă': 'ắ', 'Ă': 'Ắ',
        'e': 'é', 'E': 'É', 'ê': 'ế', 'Ê': 'Ế',
        'o': 'ó', 'O': 'Ó', 'ô': 'ố', 'Ô': 'Ố', 'ơ': 'ớ', 'Ơ': 'Ớ',
        'u': 'ú', 'U': 'Ú', 'ư': 'ứ', 'Ư': 'Ứ',
        'y': 'ý', 'Y': 'Ý', 'i': 'í', 'I': 'Í'
      };
      return map[c] || c;
    }],
    [/([aAâÂăĂeEêÊoOôÔơƠuUưƯyYiI])[`\u0060\u0300]/g, (_m, c) => {
      const map = {
        'a': 'à', 'A': 'À', 'â': 'ầ', 'Â': 'Ầ', 'ă': 'ằ', 'Ă': 'Ằ',
        'e': 'è', 'E': 'È', 'ê': 'ề', 'Ê': 'Ề',
        'o': 'ò', 'O': 'Ò', 'ô': 'ồ', 'Ô': 'Ồ', 'ơ': 'ờ', 'Ơ': 'Ờ',
        'u': 'ù', 'U': 'Ù', 'ư': 'ừ', 'Ư': 'Ừ',
        'y': 'ỳ', 'Y': 'Ỳ', 'i': 'ì', 'I': 'Ì'
      };
      return map[c] || c;
    }],
    [/([áàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵíìỉĩị])['`\u0027\u0060\u2019\u0300\u0301\u0309\u0303\u0323]/gi, '$1'],
  ];

  for (const [pattern, handler] of viqrAccents) {
    s = s.replace(pattern, handler);
  }

  return s.normalize('NFC');
}

const EMPLOYEE_SELECT_FIELDS = `
  id, msnv, full_name AS "fullName", department, join_date AS "joinDate",
  photo_url AS "photoUrl", print_count AS "printCount",
  last_printed_at AS "lastPrintedAt", owner_id AS "ownerId",
  stt, don_vi AS "donVi", tinh_trang AS "tinhTrang", khoi, ky_hieu_pb AS "kyHieuPb",
  phong_ban AS "phongBan", phong_ban_con AS "phongBanCon", ho, ten, cong_viec AS "congViec",
  ngay_vao AS "ngayVao", ngay_sinh AS "ngaySinh", noi_sinh AS "noiSinh", nguyen_quan AS "nguyenQuan",
  gioi_tinh AS "gioiTinh", dan_toc AS "danToc", ton_giao AS "tonGiao",
  so_nha_thuong_tru AS "soNhaThuongTru", phuong_xa_thuong_tru AS "phuongXaThuongTru",
  tinh_tp_thuong_tru AS "tinhTpThuongTru", dia_chi_thuong_tru AS "diaChiThuongTru",
  so_nha_tam_tru AS "soNhaTamTru", phuong_xa_tam_tru AS "phuongXaTamTru",
  tinh_tp_tam_tru AS "tinhTpTamTru", cccd, ngay_cap_cccd AS "ngayCapCccd",
  noi_cap_cccd AS "noiCapCccd", ngay_het_han_cccd AS "ngayHetHanCccd",
  trinh_do_van_hoa AS "trinhDoVanHoa", trinh_do_chuyen_mon AS "trinhDoChuyenMon",
  so_cmnd_cu AS "soCmndCu", trinh_do_ngoai_ngu AS "trinhDoNgoaiNgu", tay_nghe AS "tayNghe",
  dao_tao AS "daoTao", so_dien_thoai AS "soDienThoai", tinh_trang_hon_nhan AS "tinhTrangHonNhan",
  suc_khoe AS "sucKhoe", gioi_thieu AS "gioiThieu", bo_phan AS "boPhan", loai_hd AS "loaiHd",
  thoi_han AS "thoiHan", phan_loai AS "phanLoai", so_hd AS "soHd", tu_ngay AS "tuNgay",
  den_ngay AS "denNgay", khoi2, chuc_vu AS "chucVu",
  division_id AS "divisionId", department_id AS "departmentId", sub_department_id AS "subDepartmentId",
  extra_data AS "extraData",
  luong_thu_viec AS "luongThuViec", luong_chinh_thuc AS "luongChinhThuc",
  bac_luong AS "bacLuong", ngach_luong AS "ngachLuong", ghi_chu_hop_dong AS "ghiChuHopDong",
  trang_thai_hop_dong AS "trangThaiHopDong",
  da_ky_hop_dong AS "daKyHopDong", ngay_ky_hop_dong AS "ngayKyHopDong",
  created_at AS "createdAt", updated_at AS "updatedAt"
`;

function generateDeptCode(name) {
  if (!name) return 'PB';
  const clean = name
    .replace(/^(phòng|ban|bộ phận|bp\.?)\s+/i, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'PB';
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  const initials = words.map((w) => w[0]).join('').toUpperCase();
  return initials.slice(0, 6) || 'PB';
}

function extractEmployeeFields(emp) {
  const msnv = (emp.msnv || '').toString().trim();
  let ho = (emp.ho || '').toString().trim();
  let ten = (emp.ten || '').toString().trim();
  const computedFullName = (emp.fullName || `${ho} ${ten}`.trim() || msnv).toString().trim();
  if (!ho && !ten && computedFullName) {
    const parts = computedFullName.split(/\s+/);
    if (parts.length > 1) {
      ten = parts.pop();
      ho = parts.join(' ');
    } else {
      ten = computedFullName;
      ho = '';
    }
  }
  const department = (emp.department || emp.phongBan || emp.boPhan || emp.phongBanCon || 'Chưa phân bổ').toString().trim();
  const joinDate = (emp.joinDate || emp.ngayVao || '').toString().trim();
  const photoUrl = (emp.photoUrl || '').toString();
  const printCount = parseInt(emp.printCount, 10) || 0;
  const lastPrintedAt = (emp.lastPrintedAt || '').toString();
  const ownerId = (emp.ownerId || WORKSPACE_ID).toString();

  return {
    msnv,
    fullName: computedFullName,
    department,
    joinDate,
    photoUrl,
    printCount,
    lastPrintedAt,
    ownerId,
    stt: (emp.stt || '').toString(),
    donVi: (emp.donVi || '').toString(),
    tinhTrang: (emp.tinhTrang || '').toString(),
    khoi: (emp.khoi || '').toString(),
    kyHieuPb: (emp.kyHieuPb || '').toString(),
    phongBan: (emp.phongBan || '').toString(),
    phongBanCon: (emp.phongBanCon || '').toString(),
    ho,
    ten,
    congViec: (emp.congViec || '').toString(),
    ngayVao: (emp.ngayVao || joinDate).toString(),
    ngaySinh: (emp.ngaySinh || '').toString(),
    noiSinh: (emp.noiSinh || '').toString(),
    nguyenQuan: (emp.nguyenQuan || '').toString(),
    gioiTinh: (emp.gioiTinh || '').toString(),
    danToc: (emp.danToc || '').toString(),
    tonGiao: (emp.tonGiao || '').toString(),
    soNhaThuongTru: (emp.soNhaThuongTru || '').toString(),
    phuongXaThuongTru: (emp.phuongXaThuongTru || '').toString(),
    tinhTpThuongTru: (emp.tinhTpThuongTru || '').toString(),
    diaChiThuongTru: (emp.diaChiThuongTru || '').toString(),
    soNhaTamTru: (emp.soNhaTamTru || '').toString(),
    phuongXaTamTru: (emp.phuongXaTamTru || '').toString(),
    tinhTpTamTru: (emp.tinhTpTamTru || '').toString(),
    cccd: (emp.cccd || '').toString(),
    ngayCapCccd: (emp.ngayCapCccd || '').toString(),
    noiCapCccd: (emp.noiCapCccd || '').toString(),
    ngayHetHanCccd: (emp.ngayHetHanCccd || '').toString(),
    trinhDoVanHoa: (emp.trinhDoVanHoa || '').toString(),
    trinhDoChuyenMon: (emp.trinhDoChuyenMon || '').toString(),
    soCmndCu: (emp.soCmndCu || '').toString(),
    trinhDoNgoaiNgu: (emp.trinhDoNgoaiNgu || '').toString(),
    tayNghe: (emp.tayNghe || '').toString(),
    daoTao: (emp.daoTao || '').toString(),
    soDienThoai: (emp.soDienThoai || '').toString(),
    tinhTrangHonNhan: (emp.tinhTrangHonNhan || '').toString(),
    sucKhoe: (emp.sucKhoe || '').toString(),
    gioiThieu: (emp.gioiThieu || '').toString(),
    boPhan: (emp.boPhan || '').toString(),
    loaiHd: (emp.loaiHd || '').toString(),
    thoiHan: (emp.thoiHan || '').toString(),
    phanLoai: (emp.phanLoai || '').toString(),
    soHd: (emp.soHd || '').toString(),
    tuNgay: (emp.tuNgay || '').toString(),
    denNgay: (emp.denNgay || '').toString(),
    khoi2: (emp.khoi2 || '').toString(),
    chucVu: (emp.chucVu || '').toString(),
    divisionId: (emp.divisionId || emp.khoiId || '').toString(),
    departmentId: (emp.departmentId || emp.phongBanId || '').toString(),
    subDepartmentId: (emp.subDepartmentId || emp.phongBanConId || '').toString(),
    extraData: typeof emp.extraData === 'object' && emp.extraData !== null ? JSON.stringify(emp.extraData) : '{}',
    luongThuViec: (emp.luongThuViec || '').toString(),
    luongChinhThuc: (emp.luongChinhThuc || '').toString(),
    bacLuong: (emp.bacLuong || emp.bac || '').toString(),
    ngachLuong: (emp.ngachLuong || emp.ngach || '').toString(),
    ghiChuHopDong: (emp.ghiChuHopDong || '').toString(),
  };
}

// =============================================================================
// 1. GET WORKSPACE (Tải toàn bộ dữ liệu ban đầu cho ứng dụng)
// =============================================================================
router.get('/workspace', async (req, res) => {
  try {
    await syncDueAppointmentDecisions();
    const [empRes, divRes, deptRes, subDeptRes, parentDeptRes, tplRes, impRes, prtRes, setRes] = await Promise.all([
      pool.query(`
        SELECT ${EMPLOYEE_SELECT_FIELDS}
        FROM employees
        ORDER BY msnv DESC, created_at DESC, id DESC
      `),
      pool.query(`
        SELECT id, code, name, description, status, order_index AS "orderIndex",
               owner_id AS "ownerId", created_at AS "createdAt", updated_at AS "updatedAt"
        FROM divisions
        ORDER BY COALESCE(order_index, 0) ASC, id ASC
      `),
      pool.query(`
        SELECT id, code, name, division_id AS "divisionId", division_name AS "divisionName",
               description, status, parent_id AS "parentId", parent_name AS "parentName",
               owner_id AS "ownerId", order_index AS "orderIndex",
               created_at AS "createdAt", updated_at AS "updatedAt"
        FROM departments
        ORDER BY COALESCE(order_index, 0) ASC, id ASC
      `),
      pool.query(`
        SELECT id, name, department_id AS "departmentId", department_name AS "departmentName",
               division_id AS "divisionId", division_name AS "divisionName",
               description, status, owner_id AS "ownerId", order_index AS "orderIndex",
               created_at AS "createdAt", updated_at AS "updatedAt"
        FROM sub_departments
        ORDER BY COALESCE(order_index, 0) ASC, id ASC
      `),
      pool.query(`
        SELECT id, name, owner_id AS "ownerId", order_index AS "orderIndex",
               created_at AS "createdAt", updated_at AS "updatedAt"
        FROM parent_departments
        ORDER BY COALESCE(order_index, 0) ASC, id ASC
      `),
      pool.query(`
        SELECT id, name, layout_style AS "layoutStyle", orientation,
               primary_color AS "primaryColor", secondary_color AS "secondaryColor",
               background_color AS "backgroundColor", text_color AS "textColor",
               border_color AS "borderColor", font_family AS "fontFamily",
               company_branch AS "companyBranch", company_name_line1 AS "companyNameLine1",
               company_name_line2 AS "companyNameLine2", company_tagline AS "companyTagline",
               logo_text AS "logoText", logo_url AS "logoUrl", show_stamp AS "showStamp",
               stamp_opacity::float AS "stampOpacity", stamp_offset_x::float AS "stampOffsetX",
               stamp_offset_y::float AS "stampOffsetY", name_font_size::float AS "nameFontSize",
               msnv_font_size::float AS "msnvFontSize", dept_font_size::float AS "deptFontSize",
               date_font_size::float AS "dateFontSize", header_font_size::float AS "headerFontSize",
               dept_prefix AS "deptPrefix", photo_bg_color AS "photoBgColor",
               photo_width_percent::float AS "photoWidthPercent", name_offset_y::float AS "nameOffsetY",
               msnv_offset_y::float AS "msnvOffsetY", dept_offset_y::float AS "deptOffsetY",
               date_offset_y::float AS "dateOffsetY", back_title AS "backTitle",
               back_rules AS "backRules", back_address AS "backAddress", back_phone AS "backPhone",
               show_qr_on_back AS "showQrOnBack", is_default AS "isDefault",
               owner_id AS "ownerId", created_at AS "createdAt", updated_at AS "updatedAt"
        FROM card_templates
        ORDER BY is_default DESC, name ASC
      `),
      pool.query(`
        SELECT id, file_name AS "fileName", import_mode AS "importMode",
               total_rows AS "totalRows", valid_count AS "validCount",
               error_count AS "errorCount", imported_count AS "importedCount",
               updated_count AS "updatedCount", summary_note AS "summaryNote",
               owner_id AS "ownerId", created_at AS "createdAt"
        FROM import_logs
        ORDER BY created_at DESC
        LIMIT 50
      `),
      pool.query(`
        SELECT id, print_mode AS "printMode", template_name AS "templateName",
               total_cards AS "totalCards", total_pages AS "totalPages",
               paper_size AS "paperSize", duplex, employee_summary AS "employeeSummary",
               owner_id AS "ownerId", created_at AS "createdAt"
        FROM print_logs
        ORDER BY created_at DESC
        LIMIT 50
      `),
      pool.query(`
        SELECT id, company_name AS "companyName", company_branch AS "companyBranch",
               company_sub_name AS "companySubName", logo_url AS "logoUrl",
               default_paper_size AS "defaultPaperSize", default_cols AS "defaultCols",
               default_rows AS "defaultRows", default_gap_mm::float AS "defaultGapMm",
               default_margin_mm::float AS "defaultMarginMm", card_width_mm::float AS "cardWidthMm",
               card_height_mm::float AS "cardHeightMm", owner_id AS "ownerId",
               created_at AS "createdAt", updated_at AS "updatedAt"
        FROM app_settings
        LIMIT 1
      `),
    ]);

    res.json({
      success: true,
      data: {
        employees: empRes.rows,
        divisions: divRes.rows,
        departments: deptRes.rows,
        subDepartments: subDeptRes.rows,
        parentDepartments: parentDeptRes.rows,
        templates: tplRes.rows,
        importLogs: impRes.rows,
        printLogs: prtRes.rows,
        settings: setRes.rows[0] || null,
      },
    });
  } catch (err) {
    console.error('Lỗi API /workspace:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =============================================================================
// 2. EMPLOYEES (CRUD, Batch Update, Batch Delete, Batch Print)
// =============================================================================

// Tạo mới hoặc cập nhật 1 nhân viên
router.post('/employees', async (req, res) => {
  try {
    const f = extractEmployeeFields(req.body);
    const empId = req.body.id || `emp_${f.msnv}_${Date.now()}`;

    // Kiểm tra trùng số CCCD với nhân viên khác
    if (f.cccd && f.cccd.trim()) {
      const cleanCccd = f.cccd.trim();
      const existingCccd = await pool.query(
        `SELECT id, msnv, full_name, department, tinh_trang 
         FROM employees 
         WHERE LOWER(TRIM(cccd)) = LOWER($1) AND msnv <> $2
         LIMIT 1`,
        [cleanCccd, f.msnv]
      );
      if (existingCccd.rows.length > 0) {
        const dup = existingCccd.rows[0];
        return res.status(400).json({
          success: false,
          error: `Số CCCD/CMND "${cleanCccd}" đã tồn tại trong hệ thống (thuộc về nhân viên: ${dup.full_name} - MSNV: ${dup.msnv} - ${dup.department} - Tình trạng: ${dup.tinh_trang || 'Đang làm việc'}). Không thể lưu nhân viên trùng số CCCD!`
        });
      }
    }

    const query = `
      INSERT INTO employees (
        id, msnv, full_name, department, join_date, photo_url, print_count, last_printed_at, owner_id,
        stt, don_vi, tinh_trang, khoi, ky_hieu_pb, phong_ban, phong_ban_con, ho, ten, cong_viec, ngay_vao,
        ngay_sinh, noi_sinh, nguyen_quan, gioi_tinh, dan_toc, ton_giao, so_nha_thuong_tru, phuong_xa_thuong_tru,
        tinh_tp_thuong_tru, dia_chi_thuong_tru, so_nha_tam_tru, phuong_xa_tam_tru, tinh_tp_tam_tru, cccd,
        ngay_cap_cccd, noi_cap_cccd, ngay_het_han_cccd, trinh_do_van_hoa, trinh_do_chuyen_mon, so_cmnd_cu,
        trinh_do_ngoai_ngu, tay_nghe, dao_tao, so_dien_thoai, tinh_trang_hon_nhan, suc_khoe, gioi_thieu,
        bo_phan, loai_hd, thoi_han, phan_loai, so_hd, tu_ngay, den_ngay, khoi2, chuc_vu,
        division_id, department_id, sub_department_id,
        extra_data, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
        $31, $32, $33, $34, $35, $36, $37, $38, $39, $40,
        $41, $42, $43, $44, $45, $46, $47, $48, $49, $50,
        $51, $52, $53, $54, $55, $56, $57, $58, $59, $60, CURRENT_TIMESTAMP
      )
      ON CONFLICT (msnv) DO UPDATE
      SET full_name = EXCLUDED.full_name,
          department = EXCLUDED.department,
          join_date = EXCLUDED.join_date,
          photo_url = CASE WHEN EXCLUDED.photo_url <> '' THEN EXCLUDED.photo_url ELSE employees.photo_url END,
          print_count = EXCLUDED.print_count,
          last_printed_at = EXCLUDED.last_printed_at,
          stt = EXCLUDED.stt,
          don_vi = EXCLUDED.don_vi,
          tinh_trang = EXCLUDED.tinh_trang,
          khoi = EXCLUDED.khoi,
          ky_hieu_pb = EXCLUDED.ky_hieu_pb,
          phong_ban = EXCLUDED.phong_ban,
          phong_ban_con = EXCLUDED.phong_ban_con,
          ho = EXCLUDED.ho,
          ten = EXCLUDED.ten,
          cong_viec = EXCLUDED.cong_viec,
          ngay_vao = EXCLUDED.ngay_vao,
          ngay_sinh = EXCLUDED.ngay_sinh,
          noi_sinh = EXCLUDED.noi_sinh,
          nguyen_quan = EXCLUDED.nguyen_quan,
          gioi_tinh = EXCLUDED.gioi_tinh,
          dan_toc = EXCLUDED.dan_toc,
          ton_giao = EXCLUDED.ton_giao,
          so_nha_thuong_tru = EXCLUDED.so_nha_thuong_tru,
          phuong_xa_thuong_tru = EXCLUDED.phuong_xa_thuong_tru,
          tinh_tp_thuong_tru = EXCLUDED.tinh_tp_thuong_tru,
          dia_chi_thuong_tru = EXCLUDED.dia_chi_thuong_tru,
          so_nha_tam_tru = EXCLUDED.so_nha_tam_tru,
          phuong_xa_tam_tru = EXCLUDED.phuong_xa_tam_tru,
          tinh_tp_tam_tru = EXCLUDED.tinh_tp_tam_tru,
          cccd = EXCLUDED.cccd,
          ngay_cap_cccd = EXCLUDED.ngay_cap_cccd,
          noi_cap_cccd = EXCLUDED.noi_cap_cccd,
          ngay_het_han_cccd = EXCLUDED.ngay_het_han_cccd,
          trinh_do_van_hoa = EXCLUDED.trinh_do_van_hoa,
          trinh_do_chuyen_mon = EXCLUDED.trinh_do_chuyen_mon,
          so_cmnd_cu = EXCLUDED.so_cmnd_cu,
          trinh_do_ngoai_ngu = EXCLUDED.trinh_do_ngoai_ngu,
          tay_nghe = EXCLUDED.tay_nghe,
          dao_tao = EXCLUDED.dao_tao,
          so_dien_thoai = EXCLUDED.so_dien_thoai,
          tinh_trang_hon_nhan = EXCLUDED.tinh_trang_hon_nhan,
          suc_khoe = EXCLUDED.suc_khoe,
          gioi_thieu = EXCLUDED.gioi_thieu,
          bo_phan = EXCLUDED.bo_phan,
          loai_hd = EXCLUDED.loai_hd,
          thoi_han = EXCLUDED.thoi_han,
          phan_loai = EXCLUDED.phan_loai,
          so_hd = EXCLUDED.so_hd,
          tu_ngay = EXCLUDED.tu_ngay,
          den_ngay = EXCLUDED.den_ngay,
          khoi2 = EXCLUDED.khoi2,
          chuc_vu = EXCLUDED.chuc_vu,
          division_id = EXCLUDED.division_id,
          department_id = EXCLUDED.department_id,
          sub_department_id = EXCLUDED.sub_department_id,
          extra_data = EXCLUDED.extra_data,
          updated_at = CURRENT_TIMESTAMP
      RETURNING ${EMPLOYEE_SELECT_FIELDS}
    `;

    const values = [
      empId, f.msnv, f.fullName, f.department, f.joinDate, f.photoUrl, f.printCount, f.lastPrintedAt, f.ownerId,
      f.stt, f.donVi, f.tinhTrang, f.khoi, f.kyHieuPb, f.phongBan, f.phongBanCon, f.ho, f.ten, f.congViec, f.ngayVao,
      f.ngaySinh, f.noiSinh, f.nguyenQuan, f.gioiTinh, f.danToc, f.tonGiao, f.soNhaThuongTru, f.phuongXaThuongTru,
      f.tinhTpThuongTru, f.diaChiThuongTru, f.soNhaTamTru, f.phuongXaTamTru, f.tinhTpTamTru, f.cccd,
      f.ngayCapCccd, f.noiCapCccd, f.ngayHetHanCccd, f.trinhDoVanHoa, f.trinhDoChuyenMon, f.soCmndCu,
      f.trinhDoNgoaiNgu, f.tayNghe, f.daoTao, f.soDienThoai, f.tinhTrangHonNhan, f.sucKhoe, f.gioiThieu,
      f.boPhan, f.loaiHd, f.thoiHan, f.phanLoai, f.soHd, f.tuNgay, f.denNgay, f.khoi2, f.chucVu,
      f.divisionId, f.departmentId, f.subDepartmentId, f.extraData
    ];

    const result = await pool.query(query, values);
    const savedEmp = result.rows[0];

    // Tự động đồng bộ sang bảng employee_work_histories nếu có CCCD
    if (f.cccd && f.cccd.trim()) {
      try {
        const cleanCccd = f.cccd.trim();
        const checkActive = await pool.query(
          `SELECT id FROM employee_work_histories WHERE cccd = $1 AND (status = 'active' OR end_date IS NULL)`,
          [cleanCccd]
        );
        if (checkActive.rows.length === 0) {
          const checkTurn = await pool.query(
            `SELECT COALESCE(MAX(turn_number), 0) AS max_turn FROM employee_work_histories WHERE cccd = $1`,
            [cleanCccd]
          );
          const nextTurn = (parseInt(checkTurn.rows[0].max_turn, 10) || 0) + 1;
          
          let startDate = null;
          if (f.ngayVao && f.ngayVao.includes('/')) {
            const parts = f.ngayVao.split('/');
            if (parts.length === 3) startDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          }
          if (!startDate) startDate = new Date().toISOString().split('T')[0];

          await pool.query(
            `INSERT INTO employee_work_histories (
              id, employee_id, cccd, msnv, turn_number, start_date, department, position, contract_type, status, created_by, owner_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', 'system_add_employee', $10)
            ON CONFLICT DO NOTHING`,
            [`wh_${savedEmp.id}_turn_${nextTurn}`, savedEmp.id, cleanCccd, f.msnv, nextTurn, startDate, f.department || '', f.chucVu || '', f.loaiHd || 'Chính thức', f.ownerId]
          );
        }
      } catch (whErr) {
        console.warn('Lỗi đồng bộ work history khi thêm nhân viên:', whErr.message);
      }
    }

    res.json({ success: true, employee: savedEmp });
  } catch (err) {
    console.error('Lỗi POST /employees:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Cập nhật 1 nhân viên theo ID
router.put('/employees/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;

    // Kiểm tra trùng MSNV nếu có thay đổi MSNV
    if (body.msnv !== undefined && typeof body.msnv === 'string' && body.msnv.trim()) {
      const cleanMsnv = body.msnv.trim();
      const existingMsnv = await pool.query(
        `SELECT id, msnv, full_name, department 
         FROM employees 
         WHERE LOWER(TRIM(msnv)) = LOWER($1) AND id <> $2
         LIMIT 1`,
        [cleanMsnv, id]
      );
      if (existingMsnv.rows.length > 0) {
        const dup = existingMsnv.rows[0];
        return res.status(400).json({
          success: false,
          error: `Mã số nhân viên "${cleanMsnv}" đã tồn tại trong hệ thống (thuộc về nhân viên: ${dup.full_name} - ${dup.department}). Vui lòng kiểm tra lại!`
        });
      }
    }

    // Kiểm tra trùng số CCCD nếu có thay đổi CCCD
    if (body.cccd !== undefined && typeof body.cccd === 'string' && body.cccd.trim()) {
      const cleanCccd = body.cccd.trim();
      const existingCccd = await pool.query(
        `SELECT id, msnv, full_name, department, tinh_trang 
         FROM employees 
         WHERE LOWER(TRIM(cccd)) = LOWER($1) AND id <> $2
         LIMIT 1`,
        [cleanCccd, id]
      );
      if (existingCccd.rows.length > 0) {
        const dup = existingCccd.rows[0];
        return res.status(400).json({
          success: false,
          error: `Số CCCD/CMND "${cleanCccd}" đã tồn tại trong hệ thống (thuộc về nhân viên: ${dup.full_name} - MSNV: ${dup.msnv} - ${dup.department} - Tình trạng: ${dup.tinh_trang || 'Đang làm việc'}). Không thể cập nhật trùng số CCCD!`
        });
      }
    }

    const mapping = {
      msnv: 'msnv',
      fullName: 'full_name',
      department: 'department',
      joinDate: 'join_date',
      photoUrl: 'photo_url',
      printCount: 'print_count',
      lastPrintedAt: 'last_printed_at',
      stt: 'stt',
      donVi: 'don_vi',
      tinhTrang: 'tinh_trang',
      khoi: 'khoi',
      kyHieuPb: 'ky_hieu_pb',
      phongBan: 'phong_ban',
      phongBanCon: 'phong_ban_con',
      ho: 'ho',
      ten: 'ten',
      congViec: 'cong_viec',
      ngayVao: 'ngay_vao',
      ngaySinh: 'ngay_sinh',
      noiSinh: 'noi_sinh',
      nguyenQuan: 'nguyen_quan',
      gioiTinh: 'gioi_tinh',
      danToc: 'dan_toc',
      tonGiao: 'ton_giao',
      soNhaThuongTru: 'so_nha_thuong_tru',
      phuongXaThuongTru: 'phuong_xa_thuong_tru',
      tinhTpThuongTru: 'tinh_tp_thuong_tru',
      diaChiThuongTru: 'dia_chi_thuong_tru',
      soNhaTamTru: 'so_nha_tam_tru',
      phuongXaTamTru: 'phuong_xa_tam_tru',
      tinhTpTamTru: 'tinh_tp_tam_tru',
      cccd: 'cccd',
      ngayCapCccd: 'ngay_cap_cccd',
      noiCapCccd: 'noi_cap_cccd',
      ngayHetHanCccd: 'ngay_het_han_cccd',
      trinhDoVanHoa: 'trinh_do_van_hoa',
      trinhDoChuyenMon: 'trinh_do_chuyen_mon',
      soCmndCu: 'so_cmnd_cu',
      trinhDoNgoaiNgu: 'trinh_do_ngoai_ngu',
      tayNghe: 'tay_nghe',
      daoTao: 'dao_tao',
      soDienThoai: 'so_dien_thoai',
      tinhTrangHonNhan: 'tinh_trang_hon_nhan',
      sucKhoe: 'suc_khoe',
      gioiThieu: 'gioi_thieu',
      boPhan: 'bo_phan',
      loaiHd: 'loai_hd',
      thoiHan: 'thoi_han',
      phanLoai: 'phan_loai',
      soHd: 'so_hd',
      tuNgay: 'tu_ngay',
      denNgay: 'den_ngay',
      khoi2: 'khoi2',
      chucVu: 'chuc_vu',
      divisionId: 'division_id',
      departmentId: 'department_id',
      subDepartmentId: 'sub_department_id',
      luongThuViec: 'luong_thu_viec',
      luongChinhThuc: 'luong_chinh_thuc',
      bacLuong: 'bac_luong',
      ngachLuong: 'ngach_luong',
      bac: 'bac_luong',
      ngach: 'ngach_luong',
      ghiChuHopDong: 'ghi_chu_hop_dong',
      trangThaiHopDong: 'trang_thai_hop_dong',
      daKyHopDong: 'da_ky_hop_dong',
      ngayKyHopDong: 'ngay_ky_hop_dong',
    };

    const updates = [];
    const values = [id];
    let idx = 2;

    for (const [camelKey, snakeCol] of Object.entries(mapping)) {
      if (body[camelKey] !== undefined) {
        updates.push(`${snakeCol} = $${idx++}`);
        values.push(typeof body[camelKey] === 'string' ? body[camelKey].trim() : body[camelKey]);
      }
    }

    if (body.extraData !== undefined) {
      updates.push(`extra_data = $${idx++}`);
      values.push(JSON.stringify(body.extraData));
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);

    const query = `
      UPDATE employees
      SET ${updates.join(', ')}
      WHERE id = $1
      RETURNING ${EMPLOYEE_SELECT_FIELDS}
    `;

    const result = await pool.query(query, values);
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy nhân viên' });
    }

    res.json({ success: true, employee: result.rows[0] });
  } catch (err) {
    console.error('Lỗi PUT /employees/:id:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

function formatSalaryVnd(val) {
  if (val === null || val === undefined) return '';
  const str = String(val).trim();
  if (!str) return '';
  if (str.includes('%') || !/\d/.test(str)) {
    return str;
  }
  const cleanDigits = str.replace(/[^0-9]/g, '');
  if (!cleanDigits) return str;
  const num = Number(cleanDigits);
  if (isNaN(num)) return str;
  return num.toLocaleString('vi-VN') + ' đ';
}

// Cập nhật nhanh mức lương thử việc cho 1 nhân viên
router.patch('/employees/:id/probation-salary', async (req, res) => {
  try {
    const { id } = req.params;
    const { luongThuViec, bacLuong, ngachLuong, bac, ngach, ghiChuHopDong } = req.body;

    const updates = [];
    const values = [id];
    let idx = 2;

    if (luongThuViec !== undefined) {
      updates.push(`luong_thu_viec = $${idx++}`);
      values.push(formatSalaryVnd(luongThuViec));
    }
    const finalBac = bacLuong !== undefined ? bacLuong : bac;
    if (finalBac !== undefined) {
      updates.push(`bac_luong = $${idx++}`);
      values.push(String(finalBac).trim());
    }
    const finalNgach = ngachLuong !== undefined ? ngachLuong : ngach;
    if (finalNgach !== undefined) {
      updates.push(`ngach_luong = $${idx++}`);
      values.push(String(finalNgach).trim());
    }
    if (ghiChuHopDong !== undefined) {
      updates.push(`ghi_chu_hop_dong = $${idx++}`);
      values.push(String(ghiChuHopDong).trim());
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'Không có dữ liệu cần cập nhật' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');

    const query = `
      UPDATE employees
      SET ${updates.join(', ')}
      WHERE id = $1
      RETURNING ${EMPLOYEE_SELECT_FIELDS}
    `;

    const result = await pool.query(query, values);
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy nhân viên' });
    }

    res.json({ success: true, employee: result.rows[0] });
  } catch (err) {
    console.error('Lỗi PATCH /employees/:id/probation-salary:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Cập nhật lương thử việc hàng loạt cho nhiều nhân viên
router.post('/employees/batch-probation-salary', async (req, res) => {
  try {
    const { ids, luongThuViec } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'Danh sách ID nhân viên không hợp lệ' });
    }

    const val = formatSalaryVnd(luongThuViec);
    await pool.query(
      `UPDATE employees SET luong_thu_viec = $1, updated_at = CURRENT_TIMESTAMP WHERE id = ANY($2)`,
      [val, ids]
    );

    const updated = await pool.query(
      `SELECT ${EMPLOYEE_SELECT_FIELDS} FROM employees WHERE id = ANY($1)`,
      [ids]
    );

    res.json({ success: true, count: ids.length, employees: updated.rows });
  } catch (err) {
    console.error('Lỗi batch-probation-salary:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Helper: Chuẩn hóa số hợp đồng để kiểm tra trùng lặp
 * (cắt khoảng trắng, bỏ các số 0 ở đầu, không phân biệt hoa thường)
 */
function normalizeContractNumber(val) {
  const raw = String(val || '').trim();
  if (!raw) return '';
  const stripped = raw.replace(/^0+/, '');
  return (stripped || '0').toLowerCase();
}

/**
 * Helper: Định dạng số hợp đồng chuẩn (tối thiểu 4 chữ số nếu < 1000)
 */
function formatContractNumberSeq(num) {
  return num < 1000 ? String(num).padStart(4, '0') : String(num);
}

/**
 * Helper: Lấy tập hợp tất cả số hợp đồng đã tồn tại trong DB (cả bảng contracts và employees.so_hd)
 */
async function getExistingContractNumberSet(client, options = {}) {
  const { excludeContractId = null, excludeEmployeeId = null } = options;
  const set = new Set();

  const ctrQuery = excludeContractId
    ? client.query(
        `SELECT DISTINCT TRIM(contract_number) AS num FROM contracts WHERE TRIM(COALESCE(contract_number, '')) <> '' AND id <> $1`,
        [excludeContractId]
      )
    : client.query(
        `SELECT DISTINCT TRIM(contract_number) AS num FROM contracts WHERE TRIM(COALESCE(contract_number, '')) <> ''`
      );

  const empQuery = excludeEmployeeId
    ? client.query(
        `SELECT DISTINCT TRIM(so_hd) AS num FROM employees WHERE TRIM(COALESCE(so_hd, '')) <> '' AND id <> $1`,
        [excludeEmployeeId]
      )
    : client.query(
        `SELECT DISTINCT TRIM(so_hd) AS num FROM employees WHERE TRIM(COALESCE(so_hd, '')) <> ''`
      );

  const [ctrRes, empRes] = await Promise.all([ctrQuery, empQuery]);
  for (const row of ctrRes.rows) {
    const norm = normalizeContractNumber(row.num);
    if (norm) set.add(norm);
  }
  for (const row of empRes.rows) {
    const norm = normalizeContractNumber(row.num);
    if (norm) set.add(norm);
  }
  return set;
}

/**
 * Helper: Lấy danh sách `count` số hợp đồng gợi ý tiếp theo không trùng với bất kỳ số nào đã có
 * mà không làm tăng sequence (peek)
 */
async function peekNextContractNumbers(client, count = 1) {
  try {
    const [seqRes, existingSet] = await Promise.all([
      client.query(`SELECT last_value, is_called FROM contract_number_seq`),
      getExistingContractNumberSet(client),
    ]);
    let candidate = 1080;
    if (seqRes.rows.length > 0) {
      const { last_value, is_called } = seqRes.rows[0];
      candidate = is_called ? parseInt(last_value, 10) + 1 : parseInt(last_value, 10);
    }
    if (isNaN(candidate) || candidate < 1) candidate = 1080;

    const numbers = [];
    while (numbers.length < count) {
      const formatted = formatContractNumberSeq(candidate);
      const norm = normalizeContractNumber(formatted);
      if (!existingSet.has(norm)) {
        numbers.push(formatted);
        existingSet.add(norm);
      }
      candidate += 1;
    }
    return numbers;
  } catch (err) {
    console.error('Lỗi peekNextContractNumbers:', err);
    const fallback = [];
    for (let i = 0; i < count; i++) {
      fallback.push(formatContractNumberSeq(1080 + i));
    }
    return fallback;
  }
}

/**
 * Helper: Lấy số hợp đồng gợi ý tiếp theo mà không làm tăng sequence (peek)
 */
async function peekNextContractNumber(client) {
  const nums = await peekNextContractNumbers(client, 1);
  return nums[0] || '1080';
}

/**
 * Helper: Sinh số hợp đồng tăng dần kế tiếp (gọi nextval) và bỏ qua mọi số đã tồn tại trong DB.
 * Nếu người dùng chỉ định số tùy ý (nhập tay), cho phép lưu (kể cả trùng) và đồng bộ sequence nếu cần.
 */
async function generateNextContractNumber(client, preferredNumber) {
  if (preferredNumber && String(preferredNumber).trim()) {
    const cleanNum = String(preferredNumber).trim();
    const val = parseInt(cleanNum, 10);
    if (!isNaN(val) && val >= 1080) {
      try {
        await client.query(
          `SELECT setval('contract_number_seq', GREATEST(last_value, $1::bigint), true) FROM contract_number_seq`,
          [val]
        );
      } catch (e) {
        // ignore sequence sync error
      }
    }
    return cleanNum;
  }

  const existingSet = await getExistingContractNumberSet(client);
  try {
    while (true) {
      const r = await client.query(`SELECT nextval('contract_number_seq') as next_val`);
      const val = parseInt(r.rows[0].next_val, 10);
      const formatted = formatContractNumberSeq(val);
      if (!existingSet.has(normalizeContractNumber(formatted))) {
        return formatted;
      }
    }
  } catch (err) {
    console.error('Lỗi generateNextContractNumber:', err);
    let candidate = 1080;
    while (existingSet.has(normalizeContractNumber(formatContractNumberSeq(candidate)))) {
      candidate += 1;
    }
    return formatContractNumberSeq(candidate);
  }
}

/**
 * API Lấy số hợp đồng gợi ý tiếp theo: GET /api/contracts/next-number
 * Hỗ trợ tham số ?count=N để sinh danh sách số tăng dần không trùng cho nhiều nhân viên
 */
router.get('/contracts/next-number', async (req, res) => {
  try {
    const count = Math.max(1, parseInt(req.query.count, 10) || 1);
    const numbers = await peekNextContractNumbers(pool, count);
    const startNumber = numbers[0] || '1080';
    res.json({
      success: true,
      nextContractNumber: startNumber,
      startNumber,
      numbers,
    });
  } catch (err) {
    console.error('Lỗi GET /contracts/next-number:', err);
    res.status(500).json({
      success: false,
      error: err.message,
      nextContractNumber: '1080',
      numbers: ['1080'],
    });
  }
});

/**
 * API Cấp và lưu số hợp đồng tự động tăng dần cho một hoặc nhiều nhân viên: POST /api/contracts/allocate-numbers
 * Body: {
 *   allocations: [{ employeeId, contractNumber, contractType, contractTypeName, duration, startDate, endDate, note }],
 *   templateName: string
 * }
 */
router.post('/contracts/allocate-numbers', async (req, res) => {
  const client = await pool.connect();
  try {
    const { allocations = [], templateName = '' } = req.body;
    if (!Array.isArray(allocations) || allocations.length === 0) {
      return res.status(400).json({ success: false, error: 'Danh sách cấp số hợp đồng trống' });
    }

    await client.query('BEGIN');
    const updatedEmployees = [];
    let maxContractNum = 0;

    for (const alloc of allocations) {
      const {
        employeeId,
        contractNumber,
        contractType = 'HĐTV',
        contractTypeName = 'Hợp đồng thử việc',
        duration = '60 NGÀY',
        startDate,
        endDate,
        note,
      } = alloc;

      if (!employeeId || !contractNumber) continue;

      const numVal = parseInt(contractNumber, 10);
      if (!isNaN(numVal) && numVal > maxContractNum) {
        maxContractNum = numVal;
      }

      // 1. Cập nhật so_hd và trạng thái đã ký cho nhân viên trong bảng employees
      const todaySignDate = new Date().toLocaleDateString('vi-VN');
      const empRes = await client.query(
        `UPDATE employees
         SET so_hd = $1, da_ky_hop_dong = true, ngay_ky_hop_dong = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3
         RETURNING ${EMPLOYEE_SELECT_FIELDS}`,
        [String(contractNumber).trim(), todaySignDate, employeeId]
      );

      if (empRes.rows.length === 0) continue;
      const emp = empRes.rows[0];
      updatedEmployees.push(emp);

      // 2. Chuyển các hợp đồng 'Hiệu lực' cũ cùng loại hợp đồng thành 'Đã thay thế'
      await client.query(
        `UPDATE contracts
         SET status = 'Đã thay thế', updated_at = CURRENT_TIMESTAMP
         WHERE employee_id = $1 AND contract_type = $2 AND status = 'Hiệu lực'`,
        [employeeId, contractType]
      );

      // 3. Thêm bản ghi hợp đồng mới vào bảng contracts
      const contractId = 'ctr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      const computedStart = startDate || emp.tuNgay || emp.ngayVao || new Date().toLocaleDateString('vi-VN');
      const computedEnd = endDate || emp.denNgay || '';
      const finalNote = note || `Tạo từ mẫu văn bản: ${templateName || contractTypeName}`;

      await client.query(
        `INSERT INTO contracts (
           id, employee_id, msnv, full_name, contract_number,
           contract_type, contract_type_name, duration,
           start_date, end_date, status, note,
           salary, probation_salary, bac_luong, ngach_luong,
           department, position, sign_date, owner_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Hiệu lực', $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
        [
          contractId,
          employeeId,
          emp.msnv || '',
          emp.fullName || '',
          String(contractNumber).trim(),
          contractType,
          contractTypeName,
          duration,
          computedStart,
          computedEnd,
          finalNote,
          emp.luongChinhThuc || '',
          emp.luongThuViec || '',
          emp.bacLuong || '',
          emp.ngachLuong || '',
          emp.phongBanCon || emp.department || emp.phongBan || '',
          emp.chucVu || emp.congViec || '',
          todaySignDate,
          emp.ownerId || WORKSPACE_ID,
        ]
      );
    }

    // 4. Đồng bộ sequence contract_number_seq nếu số lớn nhất >= 1080
    if (maxContractNum >= 1080) {
      await client.query(
        `SELECT setval('contract_number_seq', GREATEST(last_value, $1::bigint), true) FROM contract_number_seq`,
        [maxContractNum]
      );
    }

    await client.query('COMMIT');
    res.json({
      success: true,
      message: `Đã cấp số hợp đồng và cập nhật thành công cho ${updatedEmployees.length} nhân viên`,
      updatedEmployees,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Lỗi POST /contracts/allocate-numbers:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

/**
 * API Đánh dấu trạng thái Đã ký / Chưa ký hợp đồng: POST /api/contracts/toggle-signed
 * Body: { employeeIds: string[], isSigned: boolean, signDate?: string }
 */
router.post('/contracts/toggle-signed', async (req, res) => {
  const client = await pool.connect();
  try {
    const { employeeIds = [], isSigned = true, signDate } = req.body;
    if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Danh sách nhân viên trống' });
    }

    const computedDate = isSigned
      ? (signDate && String(signDate).trim()) || new Date().toLocaleDateString('vi-VN')
      : '';

    await client.query('BEGIN');
    const updatedEmployees = [];

    for (const empId of employeeIds) {
      const empRes = await client.query(
        `UPDATE employees
         SET da_ky_hop_dong = $1, ngay_ky_hop_dong = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3
         RETURNING ${EMPLOYEE_SELECT_FIELDS}`,
        [Boolean(isSigned), computedDate, empId]
      );
      if (empRes.rows.length > 0) {
        const emp = empRes.rows[0];
        updatedEmployees.push(emp);

        if (isSigned) {
          const contractNum = String(emp.soHd || '').trim();
          const existingCtr = await client.query(
            `SELECT id FROM contracts
             WHERE employee_id = $1 AND COALESCE(contract_number, '') = $2
             LIMIT 1`,
            [empId, contractNum]
          );
          if (existingCtr.rowCount > 0) {
            await client.query(
              `UPDATE contracts SET sign_date = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
              [existingCtr.rows[0].id, computedDate]
            );
          } else {
            const ctrId = `ctr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
            const loaiHd = emp.loaiHd || 'HĐTV';
            const loaiHdName =
              loaiHd === 'HĐTV'
                ? 'Hợp đồng thử việc'
                : loaiHd === 'HĐĐT'
                  ? 'Hợp đồng đào tạo'
                  : loaiHd === 'HĐKXĐ'
                    ? 'HĐLĐ không xác định thời hạn'
                    : loaiHd === 'HĐXĐTH'
                      ? 'HĐLĐ xác định thời hạn'
                      : loaiHd;
            await client.query(
              `INSERT INTO contracts (
                 id, employee_id, msnv, full_name, contract_number,
                 contract_type, contract_type_name, duration,
                 start_date, end_date, status, note,
                 salary, probation_salary, bac_luong, ngach_luong,
                 department, position, sign_date, owner_id
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Hiệu lực', $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
              [
                ctrId,
                empId,
                emp.msnv || '',
                emp.fullName || '',
                contractNum,
                loaiHd,
                loaiHdName,
                emp.thoiHan || '',
                emp.tuNgay || emp.ngayVao || emp.joinDate || '',
                emp.denNgay || '',
                emp.ghiChuHopDong || 'Đánh dấu đã ký hợp đồng',
                emp.luongChinhThuc || '',
                emp.luongThuViec || '',
                emp.bacLuong || '',
                emp.ngachLuong || '',
                emp.phongBanCon || emp.department || emp.phongBan || '',
                emp.chucVu || emp.congViec || '',
                computedDate,
                emp.ownerId || WORKSPACE_ID,
              ]
            );
          }
        }
      }
    }

    await client.query('COMMIT');
    res.json({
      success: true,
      message: `Đã cập nhật trạng thái ${isSigned ? 'Đã ký' : 'Chưa ký'} hợp đồng cho ${updatedEmployees.length} nhân viên`,
      updatedEmployees,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Lỗi POST /contracts/toggle-signed:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

/**
 * API Tái ký hợp đồng lao động: POST /api/contracts/renew
 * Body: { employeeId, contractType, contractTypeName, duration, startDate, endDate, note, contractNumber }
 */
router.post('/contracts/renew', async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      employeeId,
      contractType,
      contractTypeName,
      duration,
      startDate,
      endDate,
      note,
      contractNumber,
      salary,
      luongChinhThuc,
      luongThuViec,
      bacLuong,
      ngachLuong,
      bac,
      ngach,
    } = req.body;

    // Validate
    if (!employeeId || typeof employeeId !== 'string') {
      return res.status(400).json({ success: false, error: 'Mã định danh nhân viên (employeeId) là bắt buộc' });
    }
    if (!contractType || typeof contractType !== 'string') {
      return res.status(400).json({ success: false, error: 'Vui lòng chọn loại hợp đồng mới' });
    }
    if (!startDate || typeof startDate !== 'string' || !startDate.trim()) {
      return res.status(400).json({ success: false, error: 'Ngày bắt đầu hợp đồng là bắt buộc' });
    }

    // Helper phân tích ngày
    const parseDate = (dStr) => {
      if (!dStr) return null;
      const clean = String(dStr).trim();
      const dmy = clean.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
      if (dmy) return new Date(parseInt(dmy[3], 10), parseInt(dmy[2], 10) - 1, parseInt(dmy[1], 10));
      const ymd = clean.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
      if (ymd) return new Date(parseInt(ymd[1], 10), parseInt(ymd[2], 10) - 1, parseInt(ymd[3], 10));
      const d = new Date(clean);
      return !isNaN(d.getTime()) ? d : null;
    };

    const parsedStart = parseDate(startDate);
    if (!parsedStart) {
      return res.status(400).json({ success: false, error: 'Ngày bắt đầu không đúng định dạng (DD/MM/YYYY)' });
    }

    const isIndefinite =
      contractType === 'hdld_kxd' ||
      contractType === 'HĐKXĐ' ||
      (typeof contractTypeName === 'string' && contractTypeName.toLowerCase().includes('không xác định'));

    let finalEndDate = '';
    if (!isIndefinite) {
      if (!endDate || !String(endDate).trim()) {
        return res.status(400).json({ success: false, error: 'Hợp đồng có thời hạn bắt buộc phải có Ngày hết hạn' });
      }
      const parsedEnd = parseDate(endDate);
      if (!parsedEnd) {
        return res.status(400).json({ success: false, error: 'Ngày hết hạn không đúng định dạng (DD/MM/YYYY)' });
      }
      if (parsedEnd.getTime() <= parsedStart.getTime()) {
        return res.status(400).json({ success: false, error: 'Ngày hết hạn phải lớn hơn Ngày bắt đầu hợp đồng' });
      }
      finalEndDate = String(endDate).trim();
    }

    await client.query('BEGIN');

    // 1. Kiểm tra sự tồn tại của nhân viên
    const empRes = await client.query(
      `SELECT * FROM employees WHERE id = $1 FOR UPDATE`,
      [employeeId]
    );
    if (empRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Không tìm thấy nhân viên trong hệ thống' });
    }
    const currentEmp = empRes.rows[0];

    // Chuẩn hóa loại HĐ và thời hạn lưu vào employees
    let mappedLoaiHd = 'HĐXĐTH';
    let mappedThoiHan = duration || '12 THÁNG';

    if (isIndefinite) {
      mappedLoaiHd = 'HĐKXĐ';
      mappedThoiHan = 'Không xác định';
    } else if (contractType === 'hdld_12m' || contractType.includes('12')) {
      mappedLoaiHd = 'HĐXĐTH';
      mappedThoiHan = '12 THÁNG';
    } else if (contractType === 'hdld_24m' || contractType.includes('24')) {
      mappedLoaiHd = 'HĐXĐTH';
      mappedThoiHan = '24 THÁNG';
    } else if (contractType === 'hdld_36m' || contractType.includes('36')) {
      mappedLoaiHd = 'HĐXĐTH';
      mappedThoiHan = '36 THÁNG';
    } else {
      mappedLoaiHd = contractType.toUpperCase().includes('KXĐ') ? 'HĐKXĐ' : 'HĐXĐTH';
    }

    const cleanMsnv = currentEmp.msnv || '';
    const newContractNumber = await generateNextContractNumber(client, contractNumber);

    // 2. Chuyển hợp đồng cũ (nếu có trong bảng contracts) sang trạng thái 'Đã tái ký'
    await client.query(
      `UPDATE contracts
       SET status = 'Đã tái ký', updated_at = CURRENT_TIMESTAMP
       WHERE employee_id = $1 AND status = 'Hiệu lực'`,
      [employeeId]
    );

    // 3. Nếu trước đó chưa từng có bản ghi nào trong bảng contracts của nhân viên này,
    // lưu lại bản ghi hợp đồng cũ để đảm bảo toàn vẹn lịch sử
    const historyCheck = await client.query(
      `SELECT COUNT(*) FROM contracts WHERE employee_id = $1`,
      [employeeId]
    );
    if (parseInt(historyCheck.rows[0].count, 10) === 0 && (currentEmp.tu_ngay || currentEmp.den_ngay)) {
      const oldContractId = `contract_old_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await client.query(
        `INSERT INTO contracts (
          id, employee_id, msnv, full_name, contract_number, contract_type,
          contract_type_name, duration, start_date, end_date, status, note, owner_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Đã tái ký', 'Hợp đồng cũ trước khi tái ký', $11)`,
        [
          oldContractId,
          employeeId,
          cleanMsnv,
          currentEmp.full_name,
          currentEmp.so_hd || `${cleanMsnv}/HĐLĐ-CŨ`,
          currentEmp.loai_hd || 'HĐXĐTH',
          currentEmp.loai_hd || 'Hợp đồng trước đó',
          currentEmp.thoi_han || '',
          currentEmp.tu_ngay || '',
          currentEmp.den_ngay || '',
          currentEmp.owner_id || WORKSPACE_ID,
        ]
      );
    }

    // 4. Tạo bản ghi hợp đồng mới trong bảng contracts
    const newContractId = `contract_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const finalContractTypeName = contractTypeName || (isIndefinite ? 'HĐLĐ không xác định thời hạn' : 'HĐLĐ 12 tháng');

    const finalBacLuong = (bacLuong !== undefined ? bacLuong : bac) !== undefined
      ? String(bacLuong !== undefined ? bacLuong : bac).trim()
      : (currentEmp.bac_luong || '');

    const finalNgachLuong = (ngachLuong !== undefined ? ngachLuong : ngach) !== undefined
      ? String(ngachLuong !== undefined ? ngachLuong : ngach).trim()
      : (currentEmp.ngach_luong || '');

    const inputSalary = salary !== undefined ? salary : (luongChinhThuc !== undefined ? luongChinhThuc : luongThuViec);
    const finalSalary = inputSalary !== undefined && inputSalary !== null && String(inputSalary).trim() !== ''
      ? formatSalaryVnd(inputSalary)
      : (currentEmp.luong_chinh_thuc || currentEmp.luong_thu_viec || '');

    const insertContractRes = await client.query(
      `INSERT INTO contracts (
        id, employee_id, msnv, full_name, contract_number, contract_type,
        contract_type_name, duration, start_date, end_date, status, note,
        salary, probation_salary, bac_luong, ngach_luong, department, position,
        sign_date, owner_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Hiệu lực', $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING 
        id, employee_id AS "employeeId", msnv, full_name AS "fullName",
        contract_number AS "contractNumber", contract_type AS "contractType",
        contract_type_name AS "contractTypeName", duration,
        start_date AS "startDate", end_date AS "endDate", status, note,
        salary, probation_salary AS "probationSalary", bac_luong AS "bacLuong",
        ngach_luong AS "ngachLuong", department, position,
        sign_date AS "signDate", owner_id AS "ownerId",
        created_at AS "createdAt", updated_at AS "updatedAt"`,
      [
        newContractId,
        employeeId,
        cleanMsnv,
        currentEmp.full_name,
        newContractNumber,
        mappedLoaiHd,
        finalContractTypeName,
        mappedThoiHan,
        startDate.trim(),
        finalEndDate,
        note ? note.trim() : 'Tái ký hợp đồng lao động',
        finalSalary || currentEmp.luong_chinh_thuc || '',
        currentEmp.luong_thu_viec || '',
        finalBacLuong,
        finalNgachLuong,
        currentEmp.department || currentEmp.phong_ban || '',
        currentEmp.chuc_vu || currentEmp.cong_viec || '',
        new Date().toLocaleDateString('vi-VN'),
        currentEmp.owner_id || WORKSPACE_ID,
      ]
    );

    // 5. Cập nhật thông tin nhân viên trong bảng employees
    const updateEmpRes = await client.query(
      `UPDATE employees
       SET loai_hd = $2,
           thoi_han = $3,
           tu_ngay = $4,
           den_ngay = $5,
           so_hd = $6,
           trang_thai_hop_dong = 'Hiệu lực',
           tinh_trang = CASE WHEN tinh_trang = 'Nghỉ việc' OR tinh_trang = 'Hết hiệu lực' THEN 'LV' ELSE tinh_trang END,
           ghi_chu_hop_dong = CASE
             WHEN $7 <> '' THEN CONCAT(COALESCE(ghi_chu_hop_dong, ''), ' | ', $7)
             ELSE ghi_chu_hop_dong
           END,
           bac_luong = $8,
           ngach_luong = $9,
           luong_chinh_thuc = CASE WHEN $10 <> '' THEN $10 ELSE luong_chinh_thuc END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING ${EMPLOYEE_SELECT_FIELDS}`,
      [
        employeeId,
        mappedLoaiHd,
        mappedThoiHan,
        startDate.trim(),
        finalEndDate,
        newContractNumber,
        note ? `Tái ký ngày ${new Date().toLocaleDateString('vi-VN')}: ${note.trim()}` : `Tái ký ${mappedLoaiHd} (${mappedThoiHan}) ngày ${new Date().toLocaleDateString('vi-VN')}`,
        finalBacLuong,
        finalNgachLuong,
        finalSalary,
      ]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Tái ký hợp đồng thành công',
      employee: updateEmpRes.rows[0],
      contract: insertContractRes.rows[0],
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Lỗi POST /contracts/renew:', err);
    res.status(err.statusCode || 500).json({ success: false, error: err.message || 'Lỗi xử lý tái ký hợp đồng' });
  } finally {
    client.release();
  }
});

// Lấy danh sách toàn bộ hợp đồng đã tạo trong hệ thống (bao gồm cả bảng contracts và dữ liệu đã ký / đã cấp số trong bảng employees)
router.get('/contracts', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM (
        SELECT
          c.id,
          c.employee_id AS "employeeId",
          COALESCE(NULLIF(c.msnv, ''), e.msnv, '') AS msnv,
          COALESCE(NULLIF(c.full_name, ''), e.full_name, '') AS "fullName",
          c.contract_number AS "contractNumber",
          c.contract_type AS "contractType",
          c.contract_type_name AS "contractTypeName",
          c.duration,
          c.start_date AS "startDate",
          c.end_date AS "endDate",
          c.status,
          c.note,
          COALESCE(NULLIF(c.salary, ''), e.luong_chinh_thuc, '') AS salary,
          COALESCE(NULLIF(c.probation_salary, ''), e.luong_thu_viec, '') AS "probationSalary",
          COALESCE(NULLIF(c.bac_luong, ''), e.bac_luong, '') AS "bacLuong",
          COALESCE(NULLIF(c.ngach_luong, ''), e.ngach_luong, '') AS "ngachLuong",
          COALESCE(NULLIF(c.department, ''), NULLIF(e.phong_ban_con, ''), NULLIF(e.department, ''), e.phong_ban, '') AS department,
          COALESCE(NULLIF(c.position, ''), NULLIF(e.chuc_vu, ''), e.cong_viec, '') AS position,
          COALESCE(NULLIF(c.sign_date, ''), e.ngay_ky_hop_dong, '') AS "signDate",
          CASE
            WHEN COALESCE(NULLIF(c.sign_date, ''), e.ngay_ky_hop_dong, '') <> '' OR COALESCE(e.da_ky_hop_dong, false) = true THEN true
            ELSE false
          END AS "isSigned",
          c.extra_data AS "extraData",
          c.owner_id AS "ownerId",
          c.created_at AS "createdAt",
          c.updated_at AS "updatedAt",
          e.photo_url AS "photoUrl",
          e.tinh_trang AS "employeeStatus"
        FROM contracts c
        LEFT JOIN employees e ON c.employee_id = e.id

        UNION ALL

        SELECT
          ('emp_ctr_' || e.id) AS id,
          e.id AS "employeeId",
          COALESCE(e.msnv, '') AS msnv,
          COALESCE(e.full_name, '') AS "fullName",
          COALESCE(e.so_hd, '') AS "contractNumber",
          COALESCE(NULLIF(e.loai_hd, ''), 'HĐTV') AS "contractType",
          CASE UPPER(TRIM(COALESCE(e.loai_hd, '')))
            WHEN 'HĐTV' THEN 'Hợp đồng thử việc'
            WHEN 'HĐĐT' THEN 'Hợp đồng đào tạo'
            WHEN 'HĐKXĐ' THEN 'HĐLĐ không xác định thời hạn'
            WHEN 'HĐXĐTH' THEN 'HĐLĐ xác định thời hạn'
            ELSE COALESCE(NULLIF(e.loai_hd, ''), 'Hợp đồng lao động')
          END AS "contractTypeName",
          COALESCE(e.thoi_han, '') AS duration,
          COALESCE(NULLIF(e.tu_ngay, ''), NULLIF(e.ngay_vao, ''), e.join_date, '') AS "startDate",
          COALESCE(e.den_ngay, '') AS "endDate",
          CASE
            WHEN e.tinh_trang = 'Nghỉ việc' THEN 'Đã chấm dứt'
            ELSE COALESCE(NULLIF(e.trang_thai_hop_dong, ''), 'Hiệu lực')
          END AS status,
          COALESCE(e.ghi_chu_hop_dong, '') AS note,
          COALESCE(e.luong_chinh_thuc, '') AS salary,
          COALESCE(e.luong_thu_viec, '') AS "probationSalary",
          COALESCE(e.bac_luong, '') AS "bacLuong",
          COALESCE(e.ngach_luong, '') AS "ngachLuong",
          COALESCE(NULLIF(e.phong_ban_con, ''), NULLIF(e.department, ''), e.phong_ban, '') AS department,
          COALESCE(NULLIF(e.chuc_vu, ''), e.cong_viec, '') AS position,
          COALESCE(e.ngay_ky_hop_dong, '') AS "signDate",
          COALESCE(e.da_ky_hop_dong, false) AS "isSigned",
          '{}'::jsonb AS "extraData",
          e.owner_id AS "ownerId",
          COALESCE(e.updated_at, e.created_at) AS "createdAt",
          e.updated_at AS "updatedAt",
          e.photo_url AS "photoUrl",
          e.tinh_trang AS "employeeStatus"
        FROM employees e
        WHERE (e.da_ky_hop_dong = true OR TRIM(COALESCE(e.so_hd, '')) <> '')
          AND NOT EXISTS (
            SELECT 1 FROM contracts c2
            WHERE c2.employee_id = e.id
              AND (COALESCE(c2.contract_number, '') = COALESCE(e.so_hd, '') OR c2.status = 'Hiệu lực')
          )
      ) all_contracts
      ORDER BY
        CASE WHEN id LIKE 'emp_ctr_%' THEN 1 ELSE 0 END ASC,
        "createdAt" DESC NULLS LAST,
        "isSigned" DESC,
        CASE
          WHEN "signDate" ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$' THEN TO_DATE("signDate", 'DD/MM/YYYY')
          WHEN "signDate" ~ '^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}$' THEN TO_DATE("signDate", 'YYYY-MM-DD')
          ELSE NULL
        END DESC NULLS LAST,
        NULLIF((REGEXP_MATCH(COALESCE("contractNumber", ''), '([0-9]+)'))[1], '')::BIGINT DESC NULLS LAST,
        "contractNumber" DESC,
        id DESC`
    );
    res.json({ success: true, contracts: result.rows });
  } catch (err) {
    console.error('Lỗi GET /contracts:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Lấy lịch sử hợp đồng của nhân viên (sắp xếp hợp đồng mới nhất lên đầu, hỗ trợ cả employeeId và msnv)
router.get('/contracts/:employeeId/history', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const result = await pool.query(
      `SELECT 
        id,
        employee_id AS "employeeId",
        msnv,
        full_name AS "fullName",
        contract_number AS "contractNumber",
        contract_type AS "contractType",
        contract_type_name AS "contractTypeName",
        duration,
        start_date AS "startDate",
        end_date AS "endDate",
        status,
        note,
        salary,
        probation_salary AS "probationSalary",
        bac_luong AS "bacLuong",
        ngach_luong AS "ngachLuong",
        department,
        position,
        sign_date AS "signDate",
        extra_data AS "extraData",
        owner_id AS "ownerId",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM contracts 
      WHERE employee_id = $1 OR LOWER(TRIM(msnv)) = LOWER($1)
      ORDER BY 
        CASE 
          WHEN start_date ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$' THEN TO_DATE(start_date, 'DD/MM/YYYY')
          WHEN start_date ~ '^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}$' THEN TO_DATE(start_date, 'YYYY-MM-DD')
          ELSE NULL
        END DESC NULLS LAST,
        created_at DESC`,
      [employeeId]
    );
    res.json({ success: true, contracts: result.rows });
  } catch (err) {
    console.error('Lỗi GET /contracts/:employeeId/history:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Tạo mới bản ghi hợp đồng lao động (Lưu vĩnh viễn vào lịch sử contracts)
router.post('/contracts', async (req, res) => {
  const client = await pool.connect();
  try {
    const body = req.body;
    const employeeId = body.employeeId;
    if (!employeeId) {
      return res.status(400).json({ success: false, error: 'Mã định danh nhân viên (employeeId) là bắt buộc' });
    }

    await client.query('BEGIN');
    const empRes = await client.query('SELECT * FROM employees WHERE id = $1 FOR UPDATE', [employeeId]);
    if (empRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Không tìm thấy nhân viên trong hệ thống' });
    }
    const emp = empRes.rows[0];

    const contractId = body.id || `contract_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const status = body.status || 'Hiệu lực';

    if (status === 'Hiệu lực') {
      // Bảo toàn hợp đồng cũ từ bảng employees nếu trước đó chưa từng có bản ghi trong bảng contracts
      if (emp.so_hd && String(emp.so_hd).trim() !== '') {
        const prevCountRes = await client.query(
          `SELECT COUNT(*) FROM contracts WHERE employee_id = $1`,
          [employeeId]
        );
        if (parseInt(prevCountRes.rows[0].count, 10) === 0) {
          const oldId = `ctr_prev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          await client.query(
            `INSERT INTO contracts (
              id, employee_id, msnv, full_name, contract_number, contract_type,
              contract_type_name, duration, start_date, end_date, status, note,
              salary, probation_salary, bac_luong, ngach_luong, department, position,
              sign_date, owner_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Đã tái ký', $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
            [
              oldId,
              employeeId,
              emp.msnv || '',
              emp.full_name || '',
              emp.so_hd || '',
              emp.loai_hd || 'HĐTV',
              emp.loai_hd || 'Hợp đồng cũ',
              emp.thoi_han || '',
              emp.tu_ngay || emp.ngay_vao || emp.join_date || '',
              emp.den_ngay || '',
              emp.ghi_chu_hop_dong || 'Hợp đồng trước khi tạo hợp đồng mới',
              emp.luong_chinh_thuc || '',
              emp.luong_thu_viec || '',
              emp.bac_luong || '',
              emp.ngach_luong || '',
              emp.phong_ban_con || emp.department || emp.phong_ban || '',
              emp.chuc_vu || emp.cong_viec || '',
              emp.ngay_ky_hop_dong || '',
              emp.owner_id || WORKSPACE_ID,
            ]
          );
        }
      }

      // Đổi trạng thái các hợp đồng hiệu lực cũ sang 'Đã tái ký' (giữ nguyên không xóa lịch sử)
      await client.query(
        `UPDATE contracts 
         SET status = 'Đã tái ký', updated_at = CURRENT_TIMESTAMP 
         WHERE employee_id = $1 AND status = 'Hiệu lực'`,
        [employeeId]
      );
    }

    const requestedContractNumber = body.contractNumber || body.soHd;
    const finalContractNumber = requestedContractNumber
      ? await generateNextContractNumber(client, requestedContractNumber)
      : (status === 'Hiệu lực' ? await generateNextContractNumber(client) : emp.so_hd || '');

    const insRes = await client.query(`
      INSERT INTO contracts (
        id, employee_id, msnv, full_name, contract_number, contract_type,
        contract_type_name, duration, start_date, end_date, status, note,
        salary, probation_salary, bac_luong, ngach_luong, department, position,
        sign_date, extra_data, owner_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
      RETURNING 
        id, employee_id AS "employeeId", msnv, full_name AS "fullName",
        contract_number AS "contractNumber", contract_type AS "contractType",
        contract_type_name AS "contractTypeName", duration,
        start_date AS "startDate", end_date AS "endDate", status, note,
        salary, probation_salary AS "probationSalary", bac_luong AS "bacLuong",
        ngach_luong AS "ngachLuong", department, position,
        sign_date AS "signDate", extra_data AS "extraData", owner_id AS "ownerId",
        created_at AS "createdAt", updated_at AS "updatedAt"
    `, [
      contractId,
      employeeId,
      body.msnv || emp.msnv || '',
      body.fullName || emp.full_name || '',
      finalContractNumber,
      body.contractType || body.loaiHd || 'HĐXĐTH',
      body.contractTypeName || body.contractType || 'Hợp đồng lao động',
      body.duration || body.thoiHan || emp.thoi_han || '',
      body.startDate || body.tuNgay || '',
      body.endDate || body.denNgay || '',
      status,
      body.note || '',
      body.salary || emp.luong_chinh_thuc || '',
      body.probationSalary || emp.luong_thu_viec || '',
      body.bacLuong || emp.bac_luong || '',
      body.ngachLuong || emp.ngach_luong || '',
      body.department || emp.department || '',
      body.position || emp.chuc_vu || '',
      body.signDate || new Date().toLocaleDateString('vi-VN'),
      body.extraData ? JSON.stringify(body.extraData) : '{}',
      emp.owner_id || WORKSPACE_ID
    ]);

    // Nếu là hợp đồng Hiệu lực, cập nhật thông tin HĐ hiện tại trên bảng employees
    let updatedEmp = emp;
    if (status === 'Hiệu lực') {
      const upEmp = await client.query(`
        UPDATE employees
        SET loai_hd = COALESCE(NULLIF($2, ''), loai_hd),
            so_hd = COALESCE(NULLIF($3, ''), so_hd),
            thoi_han = COALESCE(NULLIF($4, ''), thoi_han),
            tu_ngay = COALESCE(NULLIF($5, ''), tu_ngay),
            den_ngay = COALESCE(NULLIF($6, ''), den_ngay),
            ngay_ky_hop_dong = COALESCE(NULLIF($7, ''), ngay_ky_hop_dong),
            da_ky_hop_dong = CASE WHEN COALESCE(NULLIF($7, ''), '') <> '' THEN true ELSE da_ky_hop_dong END,
            trang_thai_hop_dong = 'Hiệu lực',
            tinh_trang = CASE WHEN tinh_trang = 'Nghỉ việc' OR tinh_trang = 'Hết hiệu lực' THEN 'LV' ELSE tinh_trang END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING ${EMPLOYEE_SELECT_FIELDS}
      `, [
        employeeId,
        body.contractType || body.loaiHd,
        finalContractNumber,
        body.duration || body.thoiHan,
        body.startDate || body.tuNgay,
        body.endDate || body.denNgay,
        body.signDate || '',
      ]);
      updatedEmp = upEmp.rows[0];
    }

    await client.query('COMMIT');
    res.json({ success: true, contract: insRes.rows[0], employee: updatedEmp });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Lỗi POST /contracts:', err);
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

// Cập nhật thông tin hợp đồng đã tạo
router.put('/contracts/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const body = req.body || {};

    await client.query('BEGIN');

    // Nếu là bản ghi tổng hợp từ bảng employees (chưa có trong bảng contracts), tạo bản ghi thật trong contracts
    if (id.startsWith('emp_ctr_')) {
      const employeeId = id.slice('emp_ctr_'.length);
      const empRes = await client.query('SELECT * FROM employees WHERE id = $1 FOR UPDATE', [employeeId]);
      if (empRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Không tìm thấy nhân viên của hợp đồng' });
      }
      const emp = empRes.rows[0];
      const newContractId = `ctr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const contractNumber = body.contractNumber !== undefined ? String(body.contractNumber).trim() : (emp.so_hd || '');
      const contractType = body.contractType !== undefined ? String(body.contractType).trim() : (emp.loai_hd || 'HĐTV');
      const contractTypeName = body.contractTypeName !== undefined ? String(body.contractTypeName).trim() : contractType;
      const duration = body.duration !== undefined ? String(body.duration).trim() : (emp.thoi_han || '');
      const startDate = body.startDate !== undefined ? String(body.startDate).trim() : (emp.tu_ngay || emp.ngay_vao || emp.join_date || '');
      const endDate = body.endDate !== undefined ? String(body.endDate || '').trim() : (emp.den_ngay || '');
      const status = body.status !== undefined ? String(body.status).trim() : (emp.trang_thai_hop_dong || 'Hiệu lực');
      const note = body.note !== undefined ? String(body.note) : (emp.ghi_chu_hop_dong || '');
      const salary = body.salary !== undefined ? String(body.salary) : (emp.luong_chinh_thuc || '');
      const probationSalary = body.probationSalary !== undefined ? String(body.probationSalary) : (emp.luong_thu_viec || '');
      const bacLuong = body.bacLuong !== undefined ? String(body.bacLuong) : (emp.bac_luong || '');
      const ngachLuong = body.ngachLuong !== undefined ? String(body.ngachLuong) : (emp.ngach_luong || '');
      const department = body.department !== undefined ? String(body.department) : (emp.phong_ban_con || emp.department || emp.phong_ban || '');
      const position = body.position !== undefined ? String(body.position) : (emp.chuc_vu || emp.cong_viec || '');
      const signDate = body.signDate !== undefined ? String(body.signDate) : (emp.ngay_ky_hop_dong || '');

      const insRes = await client.query(
        `INSERT INTO contracts (
           id, employee_id, msnv, full_name, contract_number, contract_type,
           contract_type_name, duration, start_date, end_date, status, note,
           salary, probation_salary, bac_luong, ngach_luong, department, position,
           sign_date, owner_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
         RETURNING
           id, employee_id AS "employeeId", msnv, full_name AS "fullName",
           contract_number AS "contractNumber", contract_type AS "contractType",
           contract_type_name AS "contractTypeName", duration,
           start_date AS "startDate", end_date AS "endDate", status, note,
           salary, probation_salary AS "probationSalary", bac_luong AS "bacLuong",
           ngach_luong AS "ngachLuong", department, position,
           sign_date AS "signDate", extra_data AS "extraData", owner_id AS "ownerId",
           created_at AS "createdAt", updated_at AS "updatedAt"`,
        [
          newContractId, employeeId, emp.msnv || '', emp.full_name || '',
          contractNumber, contractType, contractTypeName, duration,
          startDate, endDate, status, note,
          salary, probationSalary, bacLuong, ngachLuong,
          department, position, signDate, emp.owner_id || WORKSPACE_ID
        ]
      );

      let updatedEmployee = null;
      if (status === 'Hiệu lực') {
        const empUp = await client.query(
          `UPDATE employees
           SET so_hd = COALESCE(NULLIF($2, ''), so_hd),
               loai_hd = COALESCE(NULLIF($3, ''), loai_hd),
               thoi_han = COALESCE(NULLIF($4, ''), thoi_han),
               tu_ngay = COALESCE(NULLIF($5, ''), tu_ngay),
               den_ngay = COALESCE(NULLIF($6, ''), den_ngay),
               ngay_ky_hop_dong = COALESCE(NULLIF($7, ''), ngay_ky_hop_dong),
               da_ky_hop_dong = CASE WHEN COALESCE(NULLIF($7, ''), '') <> '' THEN true ELSE da_ky_hop_dong END,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1
           RETURNING ${EMPLOYEE_SELECT_FIELDS}`,
          [employeeId, contractNumber, contractType, duration, startDate, endDate, signDate]
        );
        if (empUp.rows.length > 0) updatedEmployee = empUp.rows[0];
      }

      await client.query('COMMIT');
      return res.json({ success: true, contract: insRes.rows[0], employee: updatedEmployee });
    }

    const existingRes = await client.query('SELECT * FROM contracts WHERE id = $1 FOR UPDATE', [id]);
    if (existingRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Không tìm thấy hợp đồng' });
    }
    const existing = existingRes.rows[0];

    const contractNumber = body.contractNumber !== undefined ? String(body.contractNumber).trim() : existing.contract_number;
    const contractType = body.contractType !== undefined ? String(body.contractType).trim() : existing.contract_type;
    const contractTypeName = body.contractTypeName !== undefined ? String(body.contractTypeName).trim() : existing.contract_type_name;
    const duration = body.duration !== undefined ? String(body.duration).trim() : existing.duration;
    const startDate = body.startDate !== undefined ? String(body.startDate).trim() : existing.start_date;
    const endDate = body.endDate !== undefined ? String(body.endDate || '').trim() : existing.end_date;
    const status = body.status !== undefined ? String(body.status).trim() : existing.status;
    const note = body.note !== undefined ? String(body.note) : existing.note;
    const salary = body.salary !== undefined ? String(body.salary) : existing.salary;
    const probationSalary = body.probationSalary !== undefined ? String(body.probationSalary) : existing.probation_salary;
    const bacLuong = body.bacLuong !== undefined ? String(body.bacLuong) : existing.bac_luong;
    const ngachLuong = body.ngachLuong !== undefined ? String(body.ngachLuong) : existing.ngach_luong;
    const department = body.department !== undefined ? String(body.department) : existing.department;
    const position = body.position !== undefined ? String(body.position) : existing.position;
    const signDate = body.signDate !== undefined ? String(body.signDate) : existing.sign_date;

    const upRes = await client.query(
      `UPDATE contracts
       SET contract_number = $2,
           contract_type = $3,
           contract_type_name = $4,
           duration = $5,
           start_date = $6,
           end_date = $7,
           status = $8,
           note = $9,
           salary = $10,
           probation_salary = $11,
           bac_luong = $12,
           ngach_luong = $13,
           department = $14,
           position = $15,
           sign_date = $16,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING
         id, employee_id AS "employeeId", msnv, full_name AS "fullName",
         contract_number AS "contractNumber", contract_type AS "contractType",
         contract_type_name AS "contractTypeName", duration,
         start_date AS "startDate", end_date AS "endDate", status, note,
         salary, probation_salary AS "probationSalary", bac_luong AS "bacLuong",
         ngach_luong AS "ngachLuong", department, position,
         sign_date AS "signDate", extra_data AS "extraData", owner_id AS "ownerId",
         created_at AS "createdAt", updated_at AS "updatedAt"`,
      [
        id,
        contractNumber,
        contractType,
        contractTypeName,
        duration,
        startDate,
        endDate,
        status,
        note,
        salary,
        probationSalary,
        bacLuong,
        ngachLuong,
        department,
        position,
        signDate,
      ]
    );

    // Nếu hợp đồng đang có trạng thái Hiệu lực, đồng bộ lại một số trường chính sang hồ sơ nhân viên
    let updatedEmployee = null;
    if (status === 'Hiệu lực' && existing.employee_id) {
      const empUp = await client.query(
        `UPDATE employees
         SET so_hd = COALESCE(NULLIF($2, ''), so_hd),
             loai_hd = COALESCE(NULLIF($3, ''), loai_hd),
             thoi_han = COALESCE(NULLIF($4, ''), thoi_han),
             tu_ngay = COALESCE(NULLIF($5, ''), tu_ngay),
             den_ngay = COALESCE(NULLIF($6, ''), den_ngay),
             ngay_ky_hop_dong = COALESCE(NULLIF($7, ''), ngay_ky_hop_dong),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING ${EMPLOYEE_SELECT_FIELDS}`,
        [existing.employee_id, contractNumber, contractType, duration, startDate, endDate, signDate]
      );
      if (empUp.rows.length > 0) {
        updatedEmployee = empUp.rows[0];
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, contract: upRes.rows[0], employee: updatedEmployee });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Lỗi PUT /contracts/:id:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

// Xóa bản ghi hợp đồng đã tạo
router.delete('/contracts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (id.startsWith('emp_ctr_')) {
      const employeeId = id.slice('emp_ctr_'.length);
      const upRes = await pool.query(
        `UPDATE employees
         SET so_hd = '', da_ky_hop_dong = false, ngay_ky_hop_dong = '', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING id`,
        [employeeId]
      );
      if (upRes.rowCount === 0) {
        return res.status(404).json({ success: false, error: 'Không tìm thấy nhân viên để gỡ hợp đồng' });
      }
      return res.json({ success: true, message: 'Đã gỡ thông tin số hợp đồng & trạng thái ký trên hồ sơ nhân viên' });
    }
    const delRes = await pool.query('DELETE FROM contracts WHERE id = $1 RETURNING id', [id]);
    if (delRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy hợp đồng để xóa' });
    }
    res.json({ success: true, message: 'Đã xóa hợp đồng thành công' });
  } catch (err) {
    console.error('Lỗi DELETE /contracts/:id:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Cập nhật lương, bậc, ngạch hàng loạt từ file Excel theo MSNV (chỉ cập nhật lương/bậc/ngạch, KHÔNG tạo mới, KHÔNG sửa thông tin khác)
router.post('/employees/batch-update-salary-ranks', async (req, res) => {
  const client = await pool.connect();
  try {
    const { items, contractType } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Danh sách cập nhật trống' });
    }

    await client.query('BEGIN');

    const updatedEmployees = [];
    const notFoundMsnvs = [];
    const skippedMsnvs = [];

    for (const item of items) {
      const rawMsnv = String(item.msnv || '').trim();
      if (!rawMsnv) continue;

      // Tìm nhân viên theo MSNV chính xác hoặc bỏ số 0 ở đầu
      const cleanMsnvNoZero = rawMsnv.replace(/^0+/, '');
      const findRes = await client.query(
        `SELECT id, msnv, full_name, loai_hd, luong_thu_viec, bac_luong, ngach_luong
         FROM employees
         WHERE LOWER(TRIM(msnv)) = LOWER($1)
            OR (LENGTH($2) > 0 AND LTRIM(msnv, '0') = $2)
         ORDER BY id ASC
         LIMIT 1`,
        [rawMsnv, cleanMsnvNoZero]
      );

      if (findRes.rowCount === 0) {
        notFoundMsnvs.push(rawMsnv);
        continue; // Tuyệt đối KHÔNG tạo nhân viên mới
      }

      const emp = findRes.rows[0];

      // Nếu có yêu cầu kiểm tra loại hợp đồng (ví dụ: chỉ cập nhật HĐTV hoặc HĐĐT)
      if (contractType) {
        const loai = String(emp.loai_hd || '').trim().toUpperCase();
        if (contractType === 'training') {
          const isTraining = loai === 'HĐĐT' || loai === 'HDDT' || loai.includes('ĐÀO TẠO') || loai.includes('DAO TAO');
          if (!isTraining) {
            skippedMsnvs.push(rawMsnv);
            continue; // Bỏ qua nhân viên không thuộc hợp đồng đào tạo
          }
        } else if (contractType === 'probation') {
          const isProbation = loai === 'HĐTV' || loai === 'HDTV' || loai.includes('THỬ VIỆC') || loai.includes('THU VIEC');
          if (!isProbation) {
            skippedMsnvs.push(rawMsnv);
            continue; // Bỏ qua nhân viên không thuộc hợp đồng thử việc
          }
        }
      }

      const updates = [];
      const values = [emp.id];
      let idx = 2;

      const finalSalary = item.luongThuViec !== undefined && item.luongThuViec !== null && String(item.luongThuViec).trim() !== ''
        ? formatSalaryVnd(item.luongThuViec)
        : undefined;
      const finalBac = (item.bacLuong !== undefined && item.bacLuong !== null) ? String(item.bacLuong).trim() : (item.bac !== undefined ? String(item.bac).trim() : undefined);
      const finalNgach = (item.ngachLuong !== undefined && item.ngachLuong !== null) ? String(item.ngachLuong).trim() : (item.ngach !== undefined ? String(item.ngach).trim() : undefined);
      const rawChucVu = item.chucVu !== undefined && item.chucVu !== null
        ? item.chucVu
        : (item.chuc_vu !== undefined && item.chuc_vu !== null ? item.chuc_vu : undefined);
      const finalChucVu = rawChucVu !== undefined ? String(rawChucVu).trim() : undefined;

      if (finalSalary !== undefined && finalSalary !== '') {
        updates.push(`luong_thu_viec = $${idx++}`);
        values.push(finalSalary);
      }
      if (finalBac !== undefined && finalBac !== '') {
        updates.push(`bac_luong = $${idx++}`);
        values.push(finalBac);
      }
      if (finalNgach !== undefined && finalNgach !== '') {
        updates.push(`ngach_luong = $${idx++}`);
        values.push(finalNgach);
      }
      if (finalChucVu !== undefined && finalChucVu !== '') {
        updates.push(`chuc_vu = $${idx++}`);
        values.push(finalChucVu);
      }

      if (updates.length === 0) {
        skippedMsnvs.push(rawMsnv);
        continue;
      }

      updates.push('updated_at = CURRENT_TIMESTAMP');

      const updateQuery = `
        UPDATE employees
        SET ${updates.join(', ')}
        WHERE id = $1
        RETURNING ${EMPLOYEE_SELECT_FIELDS}
      `;
      const updateRes = await client.query(updateQuery, values);
      if (updateRes.rows[0]) {
        updatedEmployees.push(updateRes.rows[0]);
      }
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      updatedCount: updatedEmployees.length,
      notFoundCount: notFoundMsnvs.length,
      skippedCount: skippedMsnvs.length,
      updatedEmployees,
      notFoundMsnvs,
      skippedMsnvs,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Lỗi POST /employees/batch-update-salary-ranks:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

// Chấm dứt hợp đồng hàng loạt từ file Excel & tạo đơn thôi việc (trạng thái 'Đang thực hiện')
// MSNV không có trong hệ thống -> BỎ QUA, không thêm mới hay cập nhật
router.post('/employees/batch-terminate-and-resign', async (req, res) => {
  const client = await pool.connect();
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Danh sách chấm dứt hợp đồng trống' });
    }

    await client.query('BEGIN');

    const updatedEmployees = [];
    const notFoundMsnvs = [];
    const createdApplications = [];

    for (const item of items) {
      const rawMsnv = String(item.msnv || '').trim();
      if (!rawMsnv) continue;

      const cleanMsnvNoZero = rawMsnv.replace(/^0+/, '');
      const findRes = await client.query(
        `SELECT id, msnv, full_name, cccd, ngay_vao, chuc_vu, don_vi, cong_viec, department, so_hd, loai_hd, den_ngay, extra_data
         FROM employees
         WHERE LOWER(TRIM(msnv)) = LOWER($1)
            OR (LENGTH($2) > 0 AND LTRIM(msnv, '0') = $2)
         ORDER BY id ASC
         LIMIT 1`,
        [rawMsnv, cleanMsnvNoZero]
      );

      if (findRes.rows.length === 0) {
        // "Còn các msnv trong danh sách bỏ qua không thêm mới hay cập nhật gì cả"
        notFoundMsnvs.push(rawMsnv);
        continue;
      }

      const emp = findRes.rows[0];
      const ngayNghi = (item.ngayNghi || emp.den_ngay || '').trim();
      const ngayHenTraLuong = (item.ngayHenTraLuong || '').trim();
      const lyDo = (item.lyDo || 'Duyệt theo đơn').trim();
      const thangBaoCao = (item.thangBaoCao || '').trim();
      const donVi = (emp.don_vi || item.donVi || 'CÔNG TY CỔ PHẦN ĐẦU TƯ MẶT TRỜI VIỆT - CN ĐỒNG NAI').trim();
      const viTri = (emp.cong_viec || emp.department || item.viTri || 'Công nhân may').trim();
      const soHd = (emp.so_hd || '').trim();
      const loaiHd = (emp.loai_hd || 'HĐXĐTH').trim();

      const existingExtra = typeof emp.extra_data === 'object' && emp.extra_data !== null ? emp.extra_data : {};
      const newExtra = {
        ...existingExtra,
        ngayNghi,
        ngayHenTraLuong,
        lyDoNghi: lyDo,
        nhomLyDo: lyDo,
        thangBaoCao,
        tinhTrangHopDong: 'Hết hiệu lực',
      };

      // 1. Chấm dứt hợp đồng nhân viên
      await client.query(
        `UPDATE employees
         SET tinh_trang = 'Nghỉ việc',
             trang_thai_hop_dong = 'Hết hiệu lực',
             den_ngay = $1,
             extra_data = $2::jsonb,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [ngayNghi, JSON.stringify(newExtra), emp.id]
      );

      updatedEmployees.push({
        id: emp.id,
        msnv: emp.msnv,
        fullName: emp.full_name,
      });

      // 2. Đưa qua đơn xin nghỉ việc với trạng thái 'Đang thực hiện'
      const appId = `res_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const soQuyetDinh = '';

      const existingAppRes = await client.query(
        `SELECT id FROM resignation_applications WHERE employee_id = $1 OR LOWER(TRIM(msnv)) = LOWER($2) LIMIT 1`,
        [emp.id, emp.msnv]
      );

      if (existingAppRes.rows.length > 0) {
        const curAppId = existingAppRes.rows[0].id;
        await client.query(
          `UPDATE resignation_applications
           SET ngay_nghi = $1,
               ngay_hen_tra_luong = $2,
               ly_do = $3,
               nhom_ly_do = $3,
               thang_bao_cao = $4,
               trang_thai = 'Đang thực hiện',
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $5`,
          [ngayNghi, ngayHenTraLuong, lyDo, thangBaoCao, curAppId]
        );
        createdApplications.push({ id: curAppId, msnv: emp.msnv, fullName: emp.full_name, status: 'updated' });
      } else {
        await client.query(
          `INSERT INTO resignation_applications (
             id, employee_id, msnv, full_name, don_vi, vi_tri, so_hd, loai_hd,
             nhom_ly_do, ly_do, ngay_nghi, ngay_hen_tra_luong, thang_bao_cao,
             so_quyet_dinh, trang_thai, owner_id, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8,
             $9, $10, $11, $12, $13,
             $14, 'Đang thực hiện', $15, CURRENT_TIMESTAMP
           )`,
          [
            appId, emp.id, emp.msnv, emp.full_name, donVi, viTri, soHd, loaiHd,
            lyDo, lyDo, ngayNghi, ngayHenTraLuong, thangBaoCao,
            soQuyetDinh, WORKSPACE_ID
          ]
        );
        createdApplications.push({ id: appId, msnv: emp.msnv, fullName: emp.full_name, status: 'created' });
      }

      // Đồng bộ lịch sử làm việc sang terminated
      if (emp.cccd && emp.cccd.trim()) {
        const empCccd = emp.cccd.trim();
        let resType = 'khac';
        const r = String(lyDo || '').toLowerCase();
        if (r.includes('rút hồ sơ')) resType = 'rut_ho_so';
        else if (r.includes('bỏ việc')) resType = 'bo_viec';
        else if (r.includes('thôi việc') || r.includes('kỷ luật')) resType = 'cong_ty_cho_thoi_viec';
        else if (r.includes('hết hợp đồng') || r.includes('hết hiệu lực') || r.includes('hết hạn')) resType = 'het_hop_dong';
        else if (r.includes('đơn') || r.includes('xin nghỉ')) resType = 'tu_xin_nghi';

        let parsedEndDate = null;
        if (ngayNghi) {
          const parts = ngayNghi.split('/');
          if (parts.length === 3) parsedEndDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          else if (ngayNghi.includes('-')) parsedEndDate = ngayNghi;
        }

        const latestWh = await client.query(
          `SELECT id FROM employee_work_histories WHERE LOWER(TRIM(cccd)) = LOWER($1) ORDER BY turn_number DESC LIMIT 1`,
          [empCccd]
        );

        if (latestWh.rows.length > 0) {
          await client.query(
            `UPDATE employee_work_histories
             SET end_date = COALESCE($1::date, end_date, CURRENT_DATE),
                 resignation_type = $2,
                 resignation_reason = $3,
                 status = 'terminated',
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $4`,
            [parsedEndDate, resType, lyDo || 'Duyệt theo đơn', latestWh.rows[0].id]
          );
        }
      }
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      updatedCount: updatedEmployees.length,
      skippedCount: notFoundMsnvs.length,
      updatedEmployees,
      notFoundMsnvs,
      createdApplications,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Lỗi batch-terminate-and-resign:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

// Xóa 1 nhân viên theo ID
router.delete('/employees/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM employees WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Lỗi DELETE /employees/:id:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Xóa hàng loạt nhân viên
router.post('/employees/batch-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'Danh sách ID không hợp lệ' });
    }

    await pool.query('DELETE FROM employees WHERE id = ANY($1)', [ids]);
    res.json({ success: true, count: ids.length });
  } catch (err) {
    console.error('Lỗi batch-delete:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Cập nhật số lần in hàng loạt
router.post('/employees/batch-print', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'Danh sách ID không hợp lệ' });
    }

    const todayStr = new Date().toLocaleDateString('vi-VN');
    await pool.query(`
      UPDATE employees
      SET print_count = COALESCE(print_count, 0) + 1,
          last_printed_at = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ANY($2)
    `, [todayStr, ids]);

    res.json({ success: true, count: ids.length });
  } catch (err) {
    console.error('Lỗi batch-print:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Batch Upsert từ Import Excel
router.post('/employees/batch-upsert', async (req, res) => {
  const client = await pool.connect();
  try {
    const { employees: empList, importMode = 'add_only' } = req.body;
    if (!Array.isArray(empList) || empList.length === 0) {
      return res.status(400).json({ success: false, error: 'Danh sách import trống' });
    }

    await client.query('BEGIN');
    let imported = 0;
    let updated = 0;

    // 1. Tải cache divisions, departments, sub_departments hiện có
    const divRes = await client.query('SELECT id, name, code FROM divisions');
    const deptRes = await client.query('SELECT id, division_id, name, code FROM departments');
    const subDeptRes = await client.query('SELECT id, department_id, name FROM sub_departments');

    const divMapByName = new Map();
    divRes.rows.forEach(d => divMapByName.set(d.name.trim().toLowerCase(), d));

    const deptMapByName = new Map();
    deptRes.rows.forEach(d => {
      deptMapByName.set(`${d.division_id || ''}:::${d.name.trim().toLowerCase()}`, d);
      if (!deptMapByName.has(d.name.trim().toLowerCase())) {
        deptMapByName.set(d.name.trim().toLowerCase(), d);
      }
    });

    const subDeptMapByName = new Map();
    subDeptRes.rows.forEach(s => {
      subDeptMapByName.set(`${s.department_id || ''}:::${s.name.trim().toLowerCase()}`, s);
      if (!subDeptMapByName.has(s.name.trim().toLowerCase())) {
        subDeptMapByName.set(s.name.trim().toLowerCase(), s);
      }
    });

    const existingDeptCodes = new Set(deptRes.rows.map(d => (d.code || '').trim().toUpperCase()).filter(Boolean));

    const existingCccdRes = await client.query('SELECT msnv, LOWER(TRIM(cccd)) as cccd, full_name FROM employees WHERE cccd IS NOT NULL AND TRIM(cccd) <> \'\'');
    const cccdToMsnvMap = new Map();
    existingCccdRes.rows.forEach(r => cccdToMsnvMap.set(r.cccd, { msnv: r.msnv, name: r.full_name }));

    for (const rawEmp of empList) {
      const f = extractEmployeeFields(rawEmp);

      // Nếu trùng CCCD với nhân viên khác đã có MSNV khác trong hệ thống, bỏ qua để bảo toàn dữ liệu
      if (f.cccd && f.cccd.trim()) {
        const cleanCccd = f.cccd.trim().toLowerCase();
        const existingHolder = cccdToMsnvMap.get(cleanCccd);
        if (existingHolder && existingHolder.msnv.toLowerCase() !== f.msnv.toLowerCase()) {
          continue;
        }
        cccdToMsnvMap.set(cleanCccd, { msnv: f.msnv, name: f.fullName });
      }

      // Nếu có ID có sẵn (nhân viên đang cập nhật), dùng lại
      // Nếu là nhân viên mới thêm, tạo ID với timestamp HIỆN TẠI để sắp xếp lên đầu danh sách
      const empId = rawEmp.id || `emp_${Date.now()}_${Math.random().toString(36).substr(2, 7)}`;

      // A. Xử lý Khối (Division)
      const rawKhoi = (f.khoi || f.khoi2 || '').trim();
      let divisionId = f.divisionId || '';
      if (rawKhoi) {
        const khoiKey = rawKhoi.toLowerCase();
        if (divMapByName.has(khoiKey)) {
          divisionId = divMapByName.get(khoiKey).id;
        } else {
          divisionId = `div_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
          const divCode = generateDeptCode(rawKhoi);
          const maxDivRes = await client.query('SELECT COALESCE(MAX(order_index), 0) AS max_idx FROM divisions');
          const nextDivIdx = (parseInt(maxDivRes.rows[0]?.max_idx, 10) || 0) + 1;
          await client.query(`
            INSERT INTO divisions (id, code, name, description, status, order_index, owner_id)
            VALUES ($1, $2, $3, '', 'active', $4, $5)
            ON CONFLICT DO NOTHING
          `, [divisionId, divCode, rawKhoi, nextDivIdx, f.ownerId || WORKSPACE_ID]);
          const newDivObj = { id: divisionId, name: rawKhoi, code: divCode };
          divMapByName.set(khoiKey, newDivObj);
        }
      }

      // B. Xử lý Phòng ban (Department - Cấp 2)
      const rawDept = (f.phongBan || f.department || f.boPhan || '').trim();
      let departmentId = f.departmentId || '';
      if (rawDept) {
        const deptKeyScoped = `${divisionId}:::${rawDept.toLowerCase()}`;
        const deptKeyGlobal = rawDept.toLowerCase();
        let targetDept = deptMapByName.get(deptKeyScoped) || deptMapByName.get(deptKeyGlobal);

        if (targetDept) {
          departmentId = targetDept.id;
          if (f.kyHieuPb && targetDept.code !== f.kyHieuPb) {
            await client.query('UPDATE departments SET code = $1 WHERE id = $2', [f.kyHieuPb, targetDept.id]);
            targetDept.code = f.kyHieuPb;
            existingDeptCodes.add(f.kyHieuPb);
          }
          if (!targetDept.division_id && divisionId) {
            await client.query('UPDATE departments SET division_id = $1 WHERE id = $2', [divisionId, targetDept.id]);
            targetDept.division_id = divisionId;
          }
          if (!f.kyHieuPb && targetDept.code) {
            f.kyHieuPb = targetDept.code;
          }
        } else {
          departmentId = `dept_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
          let deptCode = (f.kyHieuPb || '').trim().toUpperCase();
          if (!deptCode) {
            deptCode = generateDeptCode(rawDept);
          }
          let uniqueCode = deptCode;
          let codeCounter = 1;
          while (existingDeptCodes.has(uniqueCode)) {
            uniqueCode = `${deptCode}${codeCounter++}`;
          }
          existingDeptCodes.add(uniqueCode);
          f.kyHieuPb = uniqueCode;

          const maxDeptRes = await client.query('SELECT COALESCE(MAX(order_index), 0) AS max_idx FROM departments');
          const nextDeptIdx = (parseInt(maxDeptRes.rows[0]?.max_idx, 10) || 0) + 1;

          await client.query(`
            INSERT INTO departments (id, division_id, code, name, description, status, order_index, owner_id)
            VALUES ($1, $2, $3, $4, '', 'active', $5, $6)
            ON CONFLICT DO NOTHING
          `, [departmentId, divisionId || null, uniqueCode, rawDept, nextDeptIdx, f.ownerId || WORKSPACE_ID]);

          targetDept = { id: departmentId, division_id: divisionId, name: rawDept, code: uniqueCode };
          deptMapByName.set(deptKeyScoped, targetDept);
          deptMapByName.set(deptKeyGlobal, targetDept);
        }
      }

      // C. Xử lý Phòng ban con (SubDepartment - Cấp 3)
      const rawSubDept = (f.phongBanCon || '').trim();
      let subDepartmentId = f.subDepartmentId || '';
      if (rawSubDept && departmentId) {
        const subKeyScoped = `${departmentId}:::${rawSubDept.toLowerCase()}`;
        const subKeyGlobal = rawSubDept.toLowerCase();
        let targetSub = subDeptMapByName.get(subKeyScoped) || subDeptMapByName.get(subKeyGlobal);

        if (targetSub) {
          subDepartmentId = targetSub.id;
        } else {
          subDepartmentId = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
          const maxSubRes = await client.query('SELECT COALESCE(MAX(order_index), 0) AS max_idx FROM sub_departments');
          const nextSubIdx = (parseInt(maxSubRes.rows[0]?.max_idx, 10) || 0) + 1;

          await client.query(`
            INSERT INTO sub_departments (id, department_id, division_id, name, description, status, order_index, owner_id)
            VALUES ($1, $2, $3, $4, '', 'active', $5, $6)
            ON CONFLICT DO NOTHING
          `, [subDepartmentId, departmentId, divisionId || null, rawSubDept, nextSubIdx, f.ownerId || WORKSPACE_ID]);

          targetSub = { id: subDepartmentId, department_id: departmentId, name: rawSubDept };
          subDeptMapByName.set(subKeyScoped, targetSub);
          subDeptMapByName.set(subKeyGlobal, targetSub);
        }
      }

      const values = [
        empId, f.msnv, f.fullName, f.department, f.joinDate, f.photoUrl, f.printCount, f.lastPrintedAt, f.ownerId,
        f.stt, f.donVi, f.tinhTrang, f.khoi, f.kyHieuPb, f.phongBan, f.phongBanCon, f.ho, f.ten, f.congViec, f.ngayVao,
        f.ngaySinh, f.noiSinh, f.nguyenQuan, f.gioiTinh, f.danToc, f.tonGiao, f.soNhaThuongTru, f.phuongXaThuongTru,
        f.tinhTpThuongTru, f.diaChiThuongTru, f.soNhaTamTru, f.phuongXaTamTru, f.tinhTpTamTru, f.cccd,
        f.ngayCapCccd, f.noiCapCccd, f.ngayHetHanCccd, f.trinhDoVanHoa, f.trinhDoChuyenMon, f.soCmndCu,
        f.trinhDoNgoaiNgu, f.tayNghe, f.daoTao, f.soDienThoai, f.tinhTrangHonNhan, f.sucKhoe, f.gioiThieu,
        f.boPhan, f.loaiHd, f.thoiHan, f.phanLoai, f.soHd, f.tuNgay, f.denNgay, f.khoi2, f.chucVu,
        divisionId || '', departmentId || '', subDepartmentId || '',
        f.extraData
      ];

      if (importMode === 'upsert') {
        const result = await client.query(`
          INSERT INTO employees (
            id, msnv, full_name, department, join_date, photo_url, print_count, last_printed_at, owner_id,
            stt, don_vi, tinh_trang, khoi, ky_hieu_pb, phong_ban, phong_ban_con, ho, ten, cong_viec, ngay_vao,
            ngay_sinh, noi_sinh, nguyen_quan, gioi_tinh, dan_toc, ton_giao, so_nha_thuong_tru, phuong_xa_thuong_tru,
            tinh_tp_thuong_tru, dia_chi_thuong_tru, so_nha_tam_tru, phuong_xa_tam_tru, tinh_tp_tam_tru, cccd,
            ngay_cap_cccd, noi_cap_cccd, ngay_het_han_cccd, trinh_do_van_hoa, trinh_do_chuyen_mon, so_cmnd_cu,
            trinh_do_ngoai_ngu, tay_nghe, dao_tao, so_dien_thoai, tinh_trang_hon_nhan, suc_khoe, gioi_thieu,
            bo_phan, loai_hd, thoi_han, phan_loai, so_hd, tu_ngay, den_ngay, khoi2, chuc_vu,
            division_id, department_id, sub_department_id, extra_data
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
            $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
            $31, $32, $33, $34, $35, $36, $37, $38, $39, $40,
            $41, $42, $43, $44, $45, $46, $47, $48, $49, $50,
            $51, $52, $53, $54, $55, $56, $57, $58, $59, $60
          )
          ON CONFLICT (msnv) DO UPDATE
          SET full_name = EXCLUDED.full_name,
              department = EXCLUDED.department,
              join_date = EXCLUDED.join_date,
              photo_url = CASE WHEN EXCLUDED.photo_url <> '' THEN EXCLUDED.photo_url ELSE employees.photo_url END,
              stt = EXCLUDED.stt,
              don_vi = EXCLUDED.don_vi,
              tinh_trang = EXCLUDED.tinh_trang,
              khoi = EXCLUDED.khoi,
              ky_hieu_pb = EXCLUDED.ky_hieu_pb,
              phong_ban = EXCLUDED.phong_ban,
              phong_ban_con = EXCLUDED.phong_ban_con,
              ho = EXCLUDED.ho,
              ten = EXCLUDED.ten,
              cong_viec = EXCLUDED.cong_viec,
              ngay_vao = EXCLUDED.ngay_vao,
              ngay_sinh = EXCLUDED.ngay_sinh,
              noi_sinh = EXCLUDED.noi_sinh,
              nguyen_quan = EXCLUDED.nguyen_quan,
              gioi_tinh = EXCLUDED.gioi_tinh,
              dan_toc = EXCLUDED.dan_toc,
              ton_giao = EXCLUDED.ton_giao,
              so_nha_thuong_tru = EXCLUDED.so_nha_thuong_tru,
              phuong_xa_thuong_tru = EXCLUDED.phuong_xa_thuong_tru,
              tinh_tp_thuong_tru = EXCLUDED.tinh_tp_thuong_tru,
              dia_chi_thuong_tru = EXCLUDED.dia_chi_thuong_tru,
              so_nha_tam_tru = EXCLUDED.so_nha_tam_tru,
              phuong_xa_tam_tru = EXCLUDED.phuong_xa_tam_tru,
              tinh_tp_tam_tru = EXCLUDED.tinh_tp_tam_tru,
              cccd = EXCLUDED.cccd,
              ngay_cap_cccd = EXCLUDED.ngay_cap_cccd,
              noi_cap_cccd = EXCLUDED.noi_cap_cccd,
              ngay_het_han_cccd = EXCLUDED.ngay_het_han_cccd,
              trinh_do_van_hoa = EXCLUDED.trinh_do_van_hoa,
              trinh_do_chuyen_mon = EXCLUDED.trinh_do_chuyen_mon,
              so_cmnd_cu = EXCLUDED.so_cmnd_cu,
              trinh_do_ngoai_ngu = EXCLUDED.trinh_do_ngoai_ngu,
              tay_nghe = EXCLUDED.tay_nghe,
              dao_tao = EXCLUDED.dao_tao,
              so_dien_thoai = EXCLUDED.so_dien_thoai,
              tinh_trang_hon_nhan = EXCLUDED.tinh_trang_hon_nhan,
              suc_khoe = EXCLUDED.suc_khoe,
              gioi_thieu = EXCLUDED.gioi_thieu,
              bo_phan = EXCLUDED.bo_phan,
              loai_hd = EXCLUDED.loai_hd,
              thoi_han = EXCLUDED.thoi_han,
              phan_loai = EXCLUDED.phan_loai,
              so_hd = EXCLUDED.so_hd,
              tu_ngay = EXCLUDED.tu_ngay,
              den_ngay = EXCLUDED.den_ngay,
              khoi2 = EXCLUDED.khoi2,
              chuc_vu = EXCLUDED.chuc_vu,
              division_id = CASE WHEN EXCLUDED.division_id <> '' THEN EXCLUDED.division_id ELSE employees.division_id END,
              department_id = CASE WHEN EXCLUDED.department_id <> '' THEN EXCLUDED.department_id ELSE employees.department_id END,
              sub_department_id = CASE WHEN EXCLUDED.sub_department_id <> '' THEN EXCLUDED.sub_department_id ELSE employees.sub_department_id END,
              extra_data = EXCLUDED.extra_data,
              updated_at = CURRENT_TIMESTAMP
          RETURNING (xmax = 0) AS was_inserted;
        `, values);
        if (result.rows[0]?.was_inserted) {
          imported++;
        } else {
          updated++;
        }
      } else {
        const result = await client.query(`
          INSERT INTO employees (
            id, msnv, full_name, department, join_date, photo_url, print_count, last_printed_at, owner_id,
            stt, don_vi, tinh_trang, khoi, ky_hieu_pb, phong_ban, phong_ban_con, ho, ten, cong_viec, ngay_vao,
            ngay_sinh, noi_sinh, nguyen_quan, gioi_tinh, dan_toc, ton_giao, so_nha_thuong_tru, phuong_xa_thuong_tru,
            tinh_tp_thuong_tru, dia_chi_thuong_tru, so_nha_tam_tru, phuong_xa_tam_tru, tinh_tp_tam_tru, cccd,
            ngay_cap_cccd, noi_cap_cccd, ngay_het_han_cccd, trinh_do_van_hoa, trinh_do_chuyen_mon, so_cmnd_cu,
            trinh_do_ngoai_ngu, tay_nghe, dao_tao, so_dien_thoai, tinh_trang_hon_nhan, suc_khoe, gioi_thieu,
            bo_phan, loai_hd, thoi_han, phan_loai, so_hd, tu_ngay, den_ngay, khoi2, chuc_vu,
            division_id, department_id, sub_department_id, extra_data
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
            $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
            $31, $32, $33, $34, $35, $36, $37, $38, $39, $40,
            $41, $42, $43, $44, $45, $46, $47, $48, $49, $50,
            $51, $52, $53, $54, $55, $56, $57, $58, $59, $60
          )
          ON CONFLICT (msnv) DO NOTHING
          RETURNING id;
        `, values);
        if (result.rowCount > 0) {
          imported++;
        }
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, importedCount: imported, updatedCount: updated });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Lỗi batch-upsert:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

// =============================================================================
// 2.1 ĐỒNG BỘ NHÂN VIÊN TỪ API VIỆT SUN (https://viet-sun-id-card.vercel.app/api/employees)
// =============================================================================

const DEFAULT_VIETSUN_API_URL = 'https://viet-sun-id-card.vercel.app/api/employees';

// GET /api/employees/sync-vietsun/preview : Đối soát thông tin trước khi đồng bộ
router.get('/employees/sync-vietsun/preview', async (req, res) => {
  try {
    const apiUrl = req.query.apiUrl || DEFAULT_VIETSUN_API_URL;
    const fetchUrl = new URL(apiUrl);
    fetchUrl.searchParams.set('includePhoto', 'false');

    const t0 = Date.now();
    const response = await fetch(fetchUrl.toString(), {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`Kết nối API Việt Sun thất bại (Mã lỗi HTTP: ${response.status})`);
    }

    const json = await response.json();
    if (!json.success || !Array.isArray(json.data)) {
      throw new Error(json.error || 'Dữ liệu trả về từ API Việt Sun không đúng định dạng');
    }

    const pingMs = Date.now() - t0;
    const remoteEmployees = json.data;
    const totalRemote = remoteEmployees.length;

    // Lấy danh sách nhân viên hiện có trong DB local
    const localRes = await pool.query(`
      SELECT msnv, full_name, department, photo_url, print_count, last_printed_at
      FROM employees
    `);
    const localEmployees = localRes.rows;
    const localMsnvMap = new Map();
    localEmployees.forEach((e) => localMsnvMap.set(e.msnv.trim(), e));

    const remoteMsnvMap = new Map();
    remoteEmployees.forEach((e) => remoteMsnvMap.set(e.msnv.trim(), e));

    const newEmployees = [];
    const existingEmployees = [];
    let remoteWithPhotosCount = 0;

    for (const rEmp of remoteEmployees) {
      const msnv = (rEmp.msnv || '').toString().trim();
      if (rEmp.hasPhoto || (rEmp.photoUrl && rEmp.photoUrl.length > 0)) {
        remoteWithPhotosCount++;
      }
      if (localMsnvMap.has(msnv)) {
        existingEmployees.push({
          msnv,
          fullName: rEmp.fullName,
          department: rEmp.department,
          hasPhoto: !!rEmp.hasPhoto,
          localDept: localMsnvMap.get(msnv).department,
          localName: localMsnvMap.get(msnv).full_name,
        });
      } else {
        newEmployees.push({
          msnv,
          fullName: rEmp.fullName,
          department: rEmp.department,
          joinDate: rEmp.joinDate,
          hasPhoto: !!rEmp.hasPhoto,
        });
      }
    }

    const onlyInLocalCount = localEmployees.filter((e) => !remoteMsnvMap.has(e.msnv.trim())).length;

    res.json({
      success: true,
      apiUrl,
      pingMs,
      totalRemote,
      totalLocal: localEmployees.length,
      newCount: newEmployees.length,
      existingCount: existingEmployees.length,
      onlyInLocalCount,
      remoteWithPhotosCount,
      sampleNewEmployees: newEmployees.slice(0, 10),
      sampleExistingEmployees: existingEmployees.slice(0, 5),
    });
  } catch (err) {
    console.error('Lỗi GET /employees/sync-vietsun/preview:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/employees/sync-vietsun : Thực hiện đồng bộ
router.post('/employees/sync-vietsun', async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      apiUrl = DEFAULT_VIETSUN_API_URL,
      includePhoto = true,
      syncMode = 'upsert', // 'upsert' | 'add_only'
      createDepartments = true,
    } = req.body;

    const fetchUrl = new URL(apiUrl);
    if (!includePhoto) {
      fetchUrl.searchParams.set('includePhoto', 'false');
    }

    console.log(`[Sync VietSun] Đang tải nhân viên từ ${fetchUrl.toString()} (includePhoto: ${includePhoto})...`);
    const response = await fetch(fetchUrl.toString(), {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      throw new Error(`Không thể kết nối đến API Việt Sun (Mã HTTP: ${response.status})`);
    }

    const json = await response.json();
    if (!json.success || !Array.isArray(json.data)) {
      throw new Error(json.error || 'Dữ liệu nhân viên từ API Việt Sun không hợp lệ');
    }

    const remoteEmployees = json.data;
    if (remoteEmployees.length === 0) {
      return res.status(400).json({ success: false, error: 'API Việt Sun trả về 0 nhân viên' });
    }

    await client.query('BEGIN');

    // 1. Đồng bộ và cache danh mục departments
    const deptRes = await client.query('SELECT id, division_id, name, code FROM departments');
    const deptMapByName = new Map();
    deptRes.rows.forEach((d) => {
      deptMapByName.set(d.name.trim().toLowerCase(), d);
    });
    const existingDeptCodes = new Set(deptRes.rows.map((d) => (d.code || '').trim().toUpperCase()).filter(Boolean));

    let newDepartmentsCount = 0;

    // Tự động kiểm tra và thêm các bộ phận mới từ API nếu cần
    if (createDepartments) {
      for (const rEmp of remoteEmployees) {
        const deptName = (rEmp.department || '').trim();
        if (deptName && !deptMapByName.has(deptName.toLowerCase())) {
          const newDeptId = `dept_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
          let deptCode = generateDeptCode(deptName);
          let uniqueCode = deptCode;
          let counter = 1;
          while (existingDeptCodes.has(uniqueCode)) {
            uniqueCode = `${deptCode}${counter++}`;
          }
          existingDeptCodes.add(uniqueCode);

          const maxDeptRes = await client.query('SELECT COALESCE(MAX(order_index), 0) AS max_idx FROM departments');
          const nextDeptIdx = (parseInt(maxDeptRes.rows[0]?.max_idx, 10) || 0) + 1;

          await client.query(`
            INSERT INTO departments (id, division_id, code, name, description, status, order_index, owner_id)
            VALUES ($1, NULL, $2, $3, 'Tự động tạo từ đồng bộ API Việt Sun', 'active', $4, $5)
            ON CONFLICT (name) DO NOTHING
          `, [newDeptId, uniqueCode, deptName, nextDeptIdx, WORKSPACE_ID]);

          const deptObj = { id: newDeptId, name: deptName, code: uniqueCode };
          deptMapByName.set(deptName.toLowerCase(), deptObj);
          newDepartmentsCount++;
        }
      }
    }

    // 2. Lấy danh sách nhân viên hiện tại để đối soát
    const currentEmpsRes = await client.query('SELECT id, msnv, photo_url, print_count FROM employees');
    const localEmpMap = new Map();
    currentEmpsRes.rows.forEach((e) => localEmpMap.set(e.msnv.trim(), e));

    let addedCount = 0;
    let updatedCount = 0;
    let photosUpdatedCount = 0;

    for (const rEmp of remoteEmployees) {
      const msnv = (rEmp.msnv || '').toString().trim();
      if (!msnv) continue;

      const fullName = (rEmp.fullName || '').toString().trim();
      const department = (rEmp.department || 'Chưa phân bổ').toString().trim();
      const joinDate = (rEmp.joinDate || '').toString().trim();
      const photoUrl = (rEmp.photoUrl || '').toString().trim();
      const printCount = parseInt(rEmp.printCount, 10) || 1;
      const lastPrintedAt = (rEmp.lastPrintedAt || '').toString().trim();
      // Lấy ngày tạo / cập nhật từ API để lưu vào DB → sắp xếp đúng thứ tự thời gian
      const remoteCreatedAt = rEmp.createdAt ? new Date(rEmp.createdAt).toISOString() : null;
      const remoteUpdatedAt = rEmp.updatedAt ? new Date(rEmp.updatedAt).toISOString() : null;

      // Phân tách Họ và Tên
      const nameParts = fullName.split(/\s+/);
      const ten = nameParts.length > 1 ? nameParts.pop() : fullName;
      const ho = nameParts.join(' ');

      // Xác định department_id
      const targetDept = deptMapByName.get(department.toLowerCase());
      const departmentId = targetDept ? targetDept.id : '';
      const kyHieuPb = targetDept ? targetDept.code : '';

      const existing = localEmpMap.get(msnv);

      if (existing) {
        if (syncMode === 'upsert') {
          // Chỉ ghi đè photo_url nếu API có ảnh
          let shouldUpdatePhoto = photoUrl !== '';
          if (shouldUpdatePhoto) photosUpdatedCount++;

          await client.query(`
            UPDATE employees
            SET full_name = $1,
                department = $2,
                department_id = COALESCE(NULLIF($3, ''), department_id),
                ky_hieu_pb = CASE WHEN ky_hieu_pb = '' OR ky_hieu_pb IS NULL THEN $4 ELSE ky_hieu_pb END,
                phong_ban = CASE WHEN phong_ban = '' OR phong_ban IS NULL THEN $2 ELSE phong_ban END,
                join_date = CASE WHEN employees.join_date = '' OR employees.join_date IS NULL THEN $5 ELSE employees.join_date END,
                ngay_vao = CASE WHEN employees.ngay_vao = '' OR employees.ngay_vao IS NULL THEN $5 ELSE employees.ngay_vao END,
                photo_url = CASE WHEN $6 <> '' THEN $6 ELSE employees.photo_url END,
                print_count = GREATEST(employees.print_count, $7),
                last_printed_at = CASE WHEN $8 <> '' THEN $8 ELSE employees.last_printed_at END,
                ho = CASE WHEN employees.ho = '' OR employees.ho IS NULL THEN $9 ELSE employees.ho END,
                ten = CASE WHEN employees.ten = '' OR employees.ten IS NULL THEN $10 ELSE employees.ten END,
                created_at = CASE WHEN $12::timestamptz IS NOT NULL THEN $12::timestamptz ELSE employees.created_at END,
                updated_at = COALESCE($13::timestamptz, CURRENT_TIMESTAMP)
            WHERE msnv = $11
          `, [fullName, department, departmentId, kyHieuPb, joinDate, photoUrl, printCount, lastPrintedAt, ho, ten, msnv, remoteCreatedAt, remoteUpdatedAt]);

          updatedCount++;
        }
      } else {
        // Thêm nhân viên mới — dùng ID gốc từ VietSun để bảo toàn tham chiếu
        // Lưu created_at và updated_at từ API → sắp xếp đúng thứ tự thời gian tạo gốc
        const newId = rEmp.id || `emp_${Date.now()}_${Math.random().toString(36).substr(2, 7)}`;
        if (photoUrl) photosUpdatedCount++;

        await client.query(`
          INSERT INTO employees (
            id, msnv, full_name, department, department_id, phong_ban, ky_hieu_pb,
            join_date, ngay_vao, photo_url, print_count, last_printed_at,
            ho, ten, tinh_trang, owner_id,
            created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'Đang làm việc', $15,
            COALESCE($16::timestamptz, CURRENT_TIMESTAMP),
            COALESCE($17::timestamptz, CURRENT_TIMESTAMP)
          )
          ON CONFLICT (msnv) DO NOTHING
        `, [
          newId, msnv, fullName, department, departmentId, department, kyHieuPb,
          joinDate, joinDate, photoUrl, printCount, lastPrintedAt,
          ho, ten, WORKSPACE_ID,
          remoteCreatedAt, remoteUpdatedAt
        ]);

        addedCount++;
        localEmpMap.set(msnv, { id: newId, msnv, photo_url: photoUrl, print_count: printCount });
      }
    }

    // Ghi nhật ký import_logs
    const logId = `log_sync_${Date.now()}`;
    const summaryNote = `Đồng bộ từ API Việt Sun (${includePhoto ? 'Có ảnh 3x4' : 'Không kèm ảnh'}): Thêm ${addedCount} mới, Cập nhật ${updatedCount}, Ảnh thẻ cập nhật: ${photosUpdatedCount}, Bộ phận mới: ${newDepartmentsCount}`;
    await client.query(`
      INSERT INTO import_logs (
        id, file_name, import_mode, total_rows, valid_count, error_count,
        imported_count, updated_count, summary_note, owner_id
      )
      VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8, $9)
    `, [
      logId,
      `API: viet-sun-id-card.vercel.app (${includePhoto ? 'Ảnh Base64' : 'Nhanh'})`,
      syncMode,
      remoteEmployees.length,
      addedCount + updatedCount,
      addedCount,
      updatedCount,
      summaryNote,
      WORKSPACE_ID
    ]);

    await client.query('COMMIT');

    console.log(`[Sync VietSun] Hoàn tất: Thêm ${addedCount}, Cập nhật ${updatedCount}, Ảnh ${photosUpdatedCount}`);

    res.json({
      success: true,
      totalRemote: remoteEmployees.length,
      addedCount,
      updatedCount,
      photosUpdatedCount,
      newDepartmentsCount,
      message: `Đồng bộ thành công! Đã thêm mới ${addedCount} và cập nhật ${updatedCount} nhân sự (${photosUpdatedCount} ảnh thẻ).`,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Lỗi POST /employees/sync-vietsun:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

// =============================================================================
// 3. MÔ HÌNH TỔ CHỨC 3 CẤP (KHỐI -> PHÒNG BAN -> PHÒNG BAN CON)
// =============================================================================

// -----------------------------------------------------------------------------
// 3.1 CẤP 1: KHỐI (DIVISIONS)
// -----------------------------------------------------------------------------

router.post('/divisions', async (req, res) => {
  try {
    const { id, code = '', name, description = '', status = 'active', orderIndex, ownerId = WORKSPACE_ID } = req.body;
    const cleanName = (name || '').trim();
    const cleanCode = (code || '').trim().toUpperCase();

    if (!cleanName) {
      return res.status(400).json({ success: false, error: 'Tên Khối không được để trống' });
    }

    // Kiểm tra trùng tên Khối
    const dupCheck = await pool.query('SELECT id FROM divisions WHERE LOWER(name) = LOWER($1)', [cleanName]);
    if (dupCheck.rows.length > 0) {
      return res.status(400).json({ success: false, error: `Khối "${cleanName}" đã tồn tại trên hệ thống!` });
    }

    const divId = id || `div_${Date.now()}`;
    let targetOrderIndex = orderIndex;
    if (typeof targetOrderIndex !== 'number') {
      const maxRes = await pool.query(`SELECT COALESCE(MAX(order_index), 0) AS max_idx FROM divisions`);
      targetOrderIndex = (parseInt(maxRes.rows[0]?.max_idx, 10) || 0) + 1;
    }

    const result = await pool.query(`
      INSERT INTO divisions (id, code, name, description, status, order_index, owner_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, code, name, description, status, order_index AS "orderIndex",
                owner_id AS "ownerId", created_at AS "createdAt", updated_at AS "updatedAt"
    `, [divId, cleanCode, cleanName, description.trim(), status, targetOrderIndex, ownerId]);

    res.json({ success: true, division: result.rows[0] });
  } catch (err) {
    console.error('Lỗi POST /divisions:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/divisions/reorder', async (req, res) => {
  try {
    const { orders } = req.body;
    if (!Array.isArray(orders)) {
      return res.status(400).json({ success: false, error: 'orders phải là một mảng' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < orders.length; i++) {
        const item = orders[i];
        const id = typeof item === 'string' ? item : item.id;
        const idx = typeof item === 'object' && typeof item.orderIndex === 'number' ? item.orderIndex : i + 1;
        await client.query(`
          UPDATE divisions
          SET order_index = $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `, [idx, id]);
      }
      await client.query('COMMIT');
      res.json({ success: true });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Lỗi PUT /divisions/reorder:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/divisions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { code = '', name, description = '', status = 'active', oldName } = req.body;
    const cleanName = (name || '').trim();
    const cleanCode = (code || '').trim().toUpperCase();

    if (!cleanName) {
      return res.status(400).json({ success: false, error: 'Tên Khối không được để trống' });
    }

    // Kiểm tra trùng tên với khối khác
    const dupCheck = await pool.query('SELECT id FROM divisions WHERE LOWER(name) = LOWER($1) AND id <> $2', [cleanName, id]);
    if (dupCheck.rows.length > 0) {
      return res.status(400).json({ success: false, error: `Khối "${cleanName}" đã tồn tại!` });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(`
        UPDATE divisions
        SET code = $1, name = $2, description = $3, status = $4, updated_at = CURRENT_TIMESTAMP
        WHERE id = $5
        RETURNING id, code, name, description, status, order_index AS "orderIndex",
                  owner_id AS "ownerId", created_at AS "createdAt", updated_at AS "updatedAt"
      `, [cleanCode, cleanName, description.trim(), status, id]);

      // Đồng bộ tên Khối sang các bảng cấp dưới
      const effectiveOldName = oldName || cleanName;
      await client.query(`
        UPDATE departments
        SET division_name = $1, updated_at = CURRENT_TIMESTAMP
        WHERE division_id = $2 OR division_name = $3
      `, [cleanName, id, effectiveOldName]);

      await client.query(`
        UPDATE sub_departments
        SET division_name = $1, updated_at = CURRENT_TIMESTAMP
        WHERE division_id = $2 OR division_name = $3
      `, [cleanName, id, effectiveOldName]);

      await client.query(`
        UPDATE employees
        SET khoi = $1, updated_at = CURRENT_TIMESTAMP
        WHERE division_id = $2 OR khoi = $3
      `, [cleanName, id, effectiveOldName]);

      await client.query('COMMIT');
      res.json({ success: true, division: result.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Lỗi PUT /divisions/:id:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/divisions/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Lấy thông tin khối
    const divRes = await pool.query('SELECT id, name FROM divisions WHERE id = $1', [id]);
    if (divRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy Khối cần xóa' });
    }
    const div = divRes.rows[0];

    // 2. Kiểm tra an toàn: Có phòng ban hoặc nhân viên trực thuộc hay không
    const deptCountRes = await pool.query('SELECT COUNT(*) FROM departments WHERE division_id = $1 OR division_name = $2', [id, div.name]);
    const deptCount = parseInt(deptCountRes.rows[0].count, 10) || 0;

    const empCountRes = await pool.query('SELECT COUNT(*) FROM employees WHERE division_id = $1 OR khoi = $2', [id, div.name]);
    const empCount = parseInt(empCountRes.rows[0].count, 10) || 0;

    if (deptCount > 0 || empCount > 0) {
      return res.status(400).json({
        success: false,
        hasRelations: true,
        deptCount,
        empCount,
        error: `Không thể xóa Khối "${div.name}" vì đang có ${deptCount} Phòng ban và ${empCount} Nhân viên trực thuộc! Vui lòng chuyển trạng thái Khối sang "Ngừng hoạt động" hoặc chuyển các phòng ban/nhân viên sang Khối khác trước khi xóa.`,
      });
    }

    await pool.query('DELETE FROM divisions WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Lỗi DELETE /divisions/:id:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 3.2 CẤP 2: PHÒNG BAN (DEPARTMENTS - CÓ KÝ HIỆU PB)
// -----------------------------------------------------------------------------

router.post('/departments', async (req, res) => {
  try {
    const {
      id,
      code,
      name,
      divisionId = '',
      divisionName = '',
      description = '',
      status = 'active',
      orderIndex,
      ownerId = WORKSPACE_ID
    } = req.body;

    const cleanName = (name || '').trim();
    let cleanCode = (code || '').trim().toUpperCase();

    if (!cleanName) {
      return res.status(400).json({ success: false, error: 'Tên Phòng ban không được để trống' });
    }

    if (!cleanCode) {
      cleanCode = generateDeptCode(cleanName);
    }

    // 1. Kiểm tra TRÙNG LẶP KÝ HIỆU PB (tự sinh mã độc nhất nếu code tự tạo bị trùng)
    let uniqueCode = cleanCode;
    let counter = 1;
    while (true) {
      const dupCodeRes = await pool.query('SELECT id, name FROM departments WHERE UPPER(code) = $1', [uniqueCode]);
      if (dupCodeRes.rows.length === 0) break;
      // Nếu người dùng chủ động gõ code trùng thì cảnh báo lỗi
      if (code && code.trim().toUpperCase() === uniqueCode) {
        return res.status(400).json({
          success: false,
          error: `Ký hiệu PB "${cleanCode}" đã được sử dụng bởi phòng ban "${dupCodeRes.rows[0].name}". Vui lòng chọn ký hiệu khác!`,
        });
      }
      counter++;
      uniqueCode = `${cleanCode}${counter}`;
    }
    cleanCode = uniqueCode;

    // 2. Tự động tra cứu divisionName nếu chưa có
    let effDivId = divisionId;
    let effDivName = divisionName;
    if (effDivId && !effDivName) {
      const dRes = await pool.query('SELECT name FROM divisions WHERE id = $1', [effDivId]);
      if (dRes.rows.length > 0) effDivName = dRes.rows[0].name;
    } else if (!effDivId && effDivName) {
      const dRes = await pool.query('SELECT id FROM divisions WHERE name = $1', [effDivName]);
      if (dRes.rows.length > 0) effDivId = dRes.rows[0].id;
    }

    const deptId = id || `dept_${Date.now()}`;
    let targetOrderIndex = orderIndex;
    if (typeof targetOrderIndex !== 'number') {
      const maxRes = await pool.query(`SELECT COALESCE(MAX(order_index), 0) AS max_idx FROM departments`);
      targetOrderIndex = (parseInt(maxRes.rows[0]?.max_idx, 10) || 0) + 1;
    }

    const result = await pool.query(`
      INSERT INTO departments (
        id, code, name, division_id, division_name, description, status,
        parent_id, parent_name, owner_id, order_index
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, $5, $8, $9)
      RETURNING id, code, name, division_id AS "divisionId", division_name AS "divisionName",
                description, status, parent_id AS "parentId", parent_name AS "parentName",
                owner_id AS "ownerId", order_index AS "orderIndex", created_at AS "createdAt", updated_at AS "updatedAt"
    `, [deptId, cleanCode, cleanName, effDivId || null, effDivName, description.trim(), status, ownerId, targetOrderIndex]);

    res.json({ success: true, department: result.rows[0] });
  } catch (err) {
    console.error('Lỗi POST /departments:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/departments/reorder', async (req, res) => {
  try {
    const { orders } = req.body;
    if (!Array.isArray(orders)) {
      return res.status(400).json({ success: false, error: 'orders phải là một mảng' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < orders.length; i++) {
        const item = orders[i];
        const id = typeof item === 'string' ? item : item.id;
        const idx = typeof item === 'object' && typeof item.orderIndex === 'number' ? item.orderIndex : i + 1;
        await client.query(`
          UPDATE departments
          SET order_index = $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `, [idx, id]);
      }
      await client.query('COMMIT');
      res.json({ success: true });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Lỗi PUT /departments/reorder:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/departments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      code,
      name,
      divisionId,
      divisionName,
      description = '',
      status = 'active',
      oldName,
      oldCode
    } = req.body;

    const cleanName = (name || '').trim();
    const cleanCode = (code || '').trim().toUpperCase();

    if (!cleanName) {
      return res.status(400).json({ success: false, error: 'Tên Phòng ban không được để trống' });
    }
    if (!cleanCode) {
      return res.status(400).json({ success: false, error: 'Ký hiệu PB là bắt buộc' });
    }

    // 1. Kiểm tra trùng lặp Ký hiệu PB với phòng ban khác
    const dupCodeRes = await pool.query('SELECT id, name FROM departments WHERE UPPER(code) = $1 AND id <> $2', [cleanCode, id]);
    if (dupCodeRes.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Ký hiệu PB "${cleanCode}" đã được sử dụng bởi phòng ban "${dupCodeRes.rows[0].name}". Vui lòng chọn ký hiệu khác!`,
      });
    }

    // 2. Tra cứu divisionName nếu cần
    let effDivId = divisionId;
    let effDivName = divisionName;
    if (effDivId && !effDivName) {
      const dRes = await pool.query('SELECT name FROM divisions WHERE id = $1', [effDivId]);
      if (dRes.rows.length > 0) effDivName = dRes.rows[0].name;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(`
        UPDATE departments
        SET code = $1, name = $2, division_id = $3, division_name = $4,
            description = $5, status = $6, parent_id = $3, parent_name = $4,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $7
        RETURNING id, code, name, division_id AS "divisionId", division_name AS "divisionName",
                  description, status, parent_id AS "parentId", parent_name AS "parentName",
                  owner_id AS "ownerId", order_index AS "orderIndex", created_at AS "createdAt", updated_at AS "updatedAt"
      `, [cleanCode, cleanName, effDivId || null, effDivName || '', description.trim(), status, id]);

      const effectiveOldName = oldName || cleanName;
      const effectiveOldCode = oldCode || cleanCode;

      // Đồng bộ sang sub_departments
      await client.query(`
        UPDATE sub_departments
        SET department_name = $1, division_id = $2, division_name = $3, updated_at = CURRENT_TIMESTAMP
        WHERE department_id = $4 OR department_name = $5
      `, [cleanName, effDivId || null, effDivName || '', id, effectiveOldName]);

      // Đồng bộ sang nhân viên
      await client.query(`
        UPDATE employees
        SET phong_ban = $1,
            ky_hieu_pb = $2,
            khoi = CASE WHEN $3 <> '' THEN $3 ELSE khoi END,
            division_id = CASE WHEN $4 <> '' THEN $4 ELSE division_id END,
            department_id = $5,
            updated_at = CURRENT_TIMESTAMP
        WHERE department_id = $5 OR phong_ban = $6 OR ky_hieu_pb = $7
      `, [cleanName, cleanCode, effDivName || '', effDivId || '', id, effectiveOldName, effectiveOldCode]);

      await client.query('COMMIT');
      res.json({ success: true, department: result.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Lỗi PUT /departments/:id:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/departments/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Lấy thông tin phòng ban
    const deptRes = await pool.query('SELECT id, name, code FROM departments WHERE id = $1', [id]);
    if (deptRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy Phòng ban cần xóa' });
    }
    const dept = deptRes.rows[0];

    // 2. Kiểm tra an toàn: Có phòng ban con hoặc nhân viên trực thuộc hay không
    const subCountRes = await pool.query('SELECT COUNT(*) FROM sub_departments WHERE department_id = $1 OR department_name = $2', [id, dept.name]);
    const subCount = parseInt(subCountRes.rows[0].count, 10) || 0;

    const empCountRes = await pool.query('SELECT COUNT(*) FROM employees WHERE department_id = $1 OR phong_ban = $2 OR ky_hieu_pb = $3', [id, dept.name, dept.code]);
    const empCount = parseInt(empCountRes.rows[0].count, 10) || 0;

    if (subCount > 0 || empCount > 0) {
      return res.status(400).json({
        success: false,
        hasRelations: true,
        subCount,
        empCount,
        error: `Không thể xóa Phòng ban "${dept.name}" (${dept.code}) vì đang có ${subCount} Phòng ban con và ${empCount} Nhân viên trực thuộc! Vui lòng chuyển trạng thái sang "Ngừng hoạt động" thay vì xóa dữ liệu để bảo toàn hồ sơ nhân sự.`,
      });
    }

    await pool.query('DELETE FROM departments WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Lỗi DELETE /departments/:id:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 3.3 CẤP 3: PHÒNG BAN CON (SUB-DEPARTMENTS)
// -----------------------------------------------------------------------------

router.post('/sub-departments', async (req, res) => {
  try {
    const {
      id,
      name,
      departmentId,
      departmentName = '',
      divisionId = '',
      divisionName = '',
      description = '',
      status = 'active',
      orderIndex,
      ownerId = WORKSPACE_ID
    } = req.body;

    const cleanName = (name || '').trim();
    if (!cleanName) {
      return res.status(400).json({ success: false, error: 'Tên Phòng ban con không được để trống' });
    }
    if (!departmentId) {
      return res.status(400).json({ success: false, error: 'Phải chọn Phòng ban cấp 2 trực thuộc' });
    }

    // Tra cứu thông tin department cha
    let effDeptName = departmentName;
    let effDivId = divisionId;
    let effDivName = divisionName;

    const deptRes = await pool.query('SELECT name, division_id, division_name FROM departments WHERE id = $1', [departmentId]);
    if (deptRes.rows.length > 0) {
      effDeptName = deptRes.rows[0].name;
      effDivId = deptRes.rows[0].division_id;
      effDivName = deptRes.rows[0].division_name;
    }

    const subId = id || `sub_dept_${Date.now()}`;
    let targetOrderIndex = orderIndex;
    if (typeof targetOrderIndex !== 'number') {
      const maxRes = await pool.query(`SELECT COALESCE(MAX(order_index), 0) AS max_idx FROM sub_departments WHERE department_id = $1`, [departmentId]);
      targetOrderIndex = (parseInt(maxRes.rows[0]?.max_idx, 10) || 0) + 1;
    }

    const result = await pool.query(`
      INSERT INTO sub_departments (
        id, department_id, department_name, division_id, division_name,
        name, description, status, order_index, owner_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, department_id AS "departmentId", department_name AS "departmentName",
                division_id AS "divisionId", division_name AS "divisionName",
                name, description, status, order_index AS "orderIndex",
                owner_id AS "ownerId", created_at AS "createdAt", updated_at AS "updatedAt"
    `, [subId, departmentId, effDeptName, effDivId || null, effDivName, cleanName, description.trim(), status, targetOrderIndex, ownerId]);

    res.json({ success: true, subDepartment: result.rows[0] });
  } catch (err) {
    console.error('Lỗi POST /sub-departments:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/sub-departments/reorder', async (req, res) => {
  try {
    const { orders } = req.body;
    if (!Array.isArray(orders)) {
      return res.status(400).json({ success: false, error: 'orders phải là một mảng' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < orders.length; i++) {
        const item = orders[i];
        const id = typeof item === 'string' ? item : item.id;
        const idx = typeof item === 'object' && typeof item.orderIndex === 'number' ? item.orderIndex : i + 1;
        await client.query(`
          UPDATE sub_departments
          SET order_index = $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `, [idx, id]);
      }
      await client.query('COMMIT');
      res.json({ success: true });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Lỗi PUT /sub-departments/reorder:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/sub-departments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      departmentId,
      departmentName,
      divisionId,
      divisionName,
      description = '',
      status = 'active',
      oldName
    } = req.body;

    const cleanName = (name || '').trim();
    if (!cleanName) {
      return res.status(400).json({ success: false, error: 'Tên Phòng ban con không được để trống' });
    }

    // Tra cứu thông tin department cha nếu có departmentId
    let effDeptId = departmentId;
    let effDeptName = departmentName;
    let effDivId = divisionId;
    let effDivName = divisionName;

    if (effDeptId) {
      const deptRes = await pool.query('SELECT name, division_id, division_name FROM departments WHERE id = $1', [effDeptId]);
      if (deptRes.rows.length > 0) {
        effDeptName = deptRes.rows[0].name;
        effDivId = deptRes.rows[0].division_id;
        effDivName = deptRes.rows[0].division_name;
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(`
        UPDATE sub_departments
        SET name = $1, department_id = COALESCE($2, department_id),
            department_name = COALESCE($3, department_name),
            division_id = COALESCE($4, division_id),
            division_name = COALESCE($5, division_name),
            description = $6, status = $7, updated_at = CURRENT_TIMESTAMP
        WHERE id = $8
        RETURNING id, department_id AS "departmentId", department_name AS "departmentName",
                  division_id AS "divisionId", division_name AS "divisionName",
                  name, description, status, order_index AS "orderIndex",
                  owner_id AS "ownerId", created_at AS "createdAt", updated_at AS "updatedAt"
      `, [cleanName, effDeptId || null, effDeptName || null, effDivId || null, effDivName || null, description.trim(), status, id]);

      const effectiveOldName = oldName || cleanName;

      // Đồng bộ sang bảng nhân viên nếu đổi tên hoặc phòng ban cha
      await client.query(`
        UPDATE employees
        SET phong_ban_con = $1,
            bo_phan = $1,
            sub_department_id = $2,
            updated_at = CURRENT_TIMESTAMP
        WHERE sub_department_id = $2 OR phong_ban_con = $3 OR bo_phan = $3
      `, [cleanName, id, effectiveOldName]);

      await client.query('COMMIT');
      res.json({ success: true, subDepartment: result.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Lỗi PUT /sub-departments/:id:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/sub-departments/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Lấy thông tin phòng ban con
    const subRes = await pool.query('SELECT id, name FROM sub_departments WHERE id = $1', [id]);
    if (subRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy Phòng ban con cần xóa' });
    }
    const subDept = subRes.rows[0];

    // 2. Kiểm tra an toàn: Có nhân viên trực thuộc hay không
    const empCountRes = await pool.query(`
      SELECT COUNT(*) FROM employees
      WHERE sub_department_id = $1 OR phong_ban_con = $2 OR bo_phan = $2
    `, [id, subDept.name]);
    const empCount = parseInt(empCountRes.rows[0].count, 10) || 0;

    if (empCount > 0) {
      return res.status(400).json({
        success: false,
        hasRelations: true,
        empCount,
        error: `Không thể xóa Phòng ban con "${subDept.name}" vì đang có ${empCount} Nhân viên trực thuộc! Vui lòng chuyển trạng thái sang "Ngừng hoạt động" thay vì xóa dữ liệu để đảm bảo toàn vẹn dữ liệu.`,
      });
    }

    await pool.query('DELETE FROM sub_departments WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Lỗi DELETE /sub-departments/:id:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 3.4 TƯƠNG THÍCH NGƯỢC PARENT DEPARTMENTS (LEGACY)
// -----------------------------------------------------------------------------

router.post('/parent-departments', async (req, res) => {
  try {
    const { id, name, ownerId = WORKSPACE_ID, orderIndex } = req.body;
    const cleanName = name.trim();
    const parentDeptId = id || `parent_dept_${Date.now()}`;

    let targetOrderIndex = orderIndex;
    if (typeof targetOrderIndex !== 'number') {
      const maxRes = await pool.query(`SELECT COALESCE(MAX(order_index), 0) AS max_idx FROM parent_departments`);
      targetOrderIndex = (parseInt(maxRes.rows[0]?.max_idx, 10) || 0) + 1;
    }

    const result = await pool.query(`
      INSERT INTO parent_departments (id, name, owner_id, order_index)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (name) DO UPDATE
      SET updated_at = CURRENT_TIMESTAMP
      RETURNING id, name, owner_id AS "ownerId", order_index AS "orderIndex", created_at AS "createdAt", updated_at AS "updatedAt"
    `, [parentDeptId, cleanName, ownerId, targetOrderIndex]);

    res.json({ success: true, parentDepartment: result.rows[0] });
  } catch (err) {
    console.error('Lỗi POST /parent-departments:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/parent-departments/reorder', async (req, res) => {
  try {
    const { orders } = req.body;
    if (!Array.isArray(orders)) {
      return res.status(400).json({ success: false, error: 'orders phải là một mảng' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < orders.length; i++) {
        const item = orders[i];
        const id = typeof item === 'string' ? item : item.id;
        const idx = typeof item === 'object' && typeof item.orderIndex === 'number' ? item.orderIndex : i + 1;
        await client.query(`
          UPDATE parent_departments
          SET order_index = $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `, [idx, id]);
      }
      await client.query('COMMIT');
      res.json({ success: true });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Lỗi PUT /parent-departments/reorder:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/parent-departments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, oldName } = req.body;
    const cleanName = name.trim();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(`
        UPDATE parent_departments
        SET name = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING id, name, owner_id AS "ownerId", order_index AS "orderIndex", created_at AS "createdAt", updated_at AS "updatedAt"
      `, [cleanName, id]);

      await client.query(`
        UPDATE departments
        SET parent_name = $1, updated_at = CURRENT_TIMESTAMP
        WHERE parent_id = $2
      `, [cleanName, id]);

      if (oldName && oldName.trim() !== cleanName) {
        await client.query(`
          UPDATE employees
          SET phong_ban = $1, updated_at = CURRENT_TIMESTAMP
          WHERE phong_ban = $2
        `, [cleanName, oldName.trim()]);
      }

      await client.query('COMMIT');
      res.json({ success: true, parentDepartment: result.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Lỗi PUT /parent-departments/:id:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/parent-departments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        UPDATE departments
        SET parent_id = NULL, parent_name = '', updated_at = CURRENT_TIMESTAMP
        WHERE parent_id = $1
      `, [id]);

      await client.query('DELETE FROM parent_departments WHERE id = $1', [id]);
      await client.query('COMMIT');
      res.json({ success: true });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Lỗi DELETE /parent-departments/:id:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =============================================================================
// 4. CARD TEMPLATES (CRUD)
// =============================================================================

router.post('/templates', async (req, res) => {
  try {
    const tpl = req.body;
    const id = tpl.id || `tpl_${Date.now()}`;

    const query = `
      INSERT INTO card_templates (
        id, name, layout_style, orientation, primary_color, secondary_color, background_color, text_color,
        border_color, font_family, company_branch, company_name_line1, company_name_line2, company_tagline,
        logo_text, logo_url, show_stamp, stamp_opacity, stamp_offset_x, stamp_offset_y, name_font_size,
        msnv_font_size, dept_font_size, date_font_size, header_font_size, dept_prefix, photo_bg_color,
        photo_width_percent, name_offset_y, msnv_offset_y, dept_offset_y, date_offset_y, back_title,
        back_rules, back_address, back_phone, show_qr_on_back, is_default, owner_id, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14,
        $15, $16, $17, $18, $19, $20, $21,
        $22, $23, $24, $25, $26, $27,
        $28, $29, $30, $31, $32, $33,
        $34, $35, $36, $37, $38, $39, CURRENT_TIMESTAMP
      )
      ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name,
          layout_style = EXCLUDED.layout_style,
          orientation = EXCLUDED.orientation,
          primary_color = EXCLUDED.primary_color,
          secondary_color = EXCLUDED.secondary_color,
          background_color = EXCLUDED.background_color,
          text_color = EXCLUDED.text_color,
          border_color = EXCLUDED.border_color,
          font_family = EXCLUDED.font_family,
          company_branch = EXCLUDED.company_branch,
          company_name_line1 = EXCLUDED.company_name_line1,
          company_name_line2 = EXCLUDED.company_name_line2,
          company_tagline = EXCLUDED.company_tagline,
          logo_text = EXCLUDED.logo_text,
          logo_url = EXCLUDED.logo_url,
          show_stamp = EXCLUDED.show_stamp,
          stamp_opacity = EXCLUDED.stamp_opacity,
          stamp_offset_x = EXCLUDED.stamp_offset_x,
          stamp_offset_y = EXCLUDED.stamp_offset_y,
          name_font_size = EXCLUDED.name_font_size,
          msnv_font_size = EXCLUDED.msnv_font_size,
          dept_font_size = EXCLUDED.dept_font_size,
          date_font_size = EXCLUDED.date_font_size,
          header_font_size = EXCLUDED.header_font_size,
          dept_prefix = EXCLUDED.dept_prefix,
          photo_bg_color = EXCLUDED.photo_bg_color,
          photo_width_percent = EXCLUDED.photo_width_percent,
          name_offset_y = EXCLUDED.name_offset_y,
          msnv_offset_y = EXCLUDED.msnv_offset_y,
          dept_offset_y = EXCLUDED.dept_offset_y,
          date_offset_y = EXCLUDED.date_offset_y,
          back_title = EXCLUDED.back_title,
          back_rules = EXCLUDED.back_rules,
          back_address = EXCLUDED.back_address,
          back_phone = EXCLUDED.back_phone,
          show_qr_on_back = EXCLUDED.show_qr_on_back,
          is_default = EXCLUDED.is_default,
          updated_at = CURRENT_TIMESTAMP
      RETURNING id;
    `;

    // Nếu đặt là default, bỏ default của các template khác
    if (tpl.isDefault) {
      await pool.query('UPDATE card_templates SET is_default = false WHERE id <> $1', [id]);
    }

    await pool.query(query, [
      id,
      tpl.name || 'Mẫu thẻ mới',
      tpl.layoutStyle || 'vietsun_table',
      tpl.orientation || 'landscape',
      tpl.primaryColor || '#57534e',
      tpl.secondaryColor || '#f59e0b',
      tpl.backgroundColor || '#ffffff',
      tpl.textColor || '#1c1917',
      tpl.borderColor || '#292524',
      tpl.fontFamily || "'Noto Serif', 'Times New Roman', serif",
      tpl.companyBranch || 'VIETSUN ĐỒNG NAI',
      tpl.companyNameLine1 || 'CHI NHÁNH CÔNG TY CỔ PHẦN',
      tpl.companyNameLine2 || 'ĐẦU TƯ MẶT TRỜI VIỆT',
      tpl.companyTagline || 'Warming Your Life',
      tpl.logoText || 'VIETSUN',
      tpl.logoUrl || '/assets/aistudio/VIETSUN_b5e42dd9.png',
      Boolean(tpl.showStamp),
      tpl.stampOpacity || 0,
      tpl.stampOffsetX || 0,
      tpl.stampOffsetY || 0,
      tpl.nameFontSize || 13.5,
      tpl.msnvFontSize || 14,
      tpl.deptFontSize || 12.5,
      tpl.dateFontSize || 12,
      tpl.headerFontSize || 8.5,
      tpl.deptPrefix || '',
      tpl.photoBgColor || '#ffffff',
      tpl.photoWidthPercent || 22.5,
      tpl.nameOffsetY || 0,
      tpl.msnvOffsetY || 0,
      tpl.deptOffsetY || 0,
      tpl.dateOffsetY || 0,
      tpl.backTitle || '',
      tpl.backRules || '',
      tpl.backAddress || '',
      tpl.backPhone || '',
      Boolean(tpl.showQrOnBack),
      Boolean(tpl.isDefault),
      tpl.ownerId || WORKSPACE_ID,
    ]);

    res.json({ success: true, id });
  } catch (err) {
    console.error('Lỗi POST /templates:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM card_templates WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Lỗi DELETE /templates/:id:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =============================================================================
// 4B. DOCUMENT TEMPLATES (WORD .DOCX TEMPLATES & MERGE)
// =============================================================================

async function ensureDefaultDocumentTemplates() {
  try {
    // Luôn đảm bảo mẫu QĐNV (Quyết định nghỉ việc) có sẵn trong hệ thống
    await pool.query(`
      INSERT INTO document_templates (id, name, category, file_name, content_html, raw_text)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO NOTHING
    `, [
      'doc_tpl_qdnv',
      'VSDN_QDNV',
      'Quyết định',
      'VSDN_QDNV.docx',
      `<table style="width: 100%; border-collapse: collapse; margin-top: 4px; margin-bottom: 10px;">
  <tbody>
    <tr>
      <td style="vertical-align: top; padding: 4px 8px; width: 48%; border: none; text-align: center;">
        <div style="font-weight: bold; font-size: 11pt; line-height: 1.4;">CÔNG TY CỔ PHẦN ĐẦU TƯ MẶT TRỜI VIỆT</div>
        <div style="font-weight: bold; font-size: 11pt; line-height: 1.4;"><u>CHI NHÁNH VIETSUN ĐỒNG NAI</u></div>
        <div style="font-size: 12pt; margin-top: 6px;">Số : <strong>#Số quyết định#</strong></div>
      </td>
      <td style="vertical-align: top; padding: 4px 8px; width: 52%; border: none; text-align: center;">
        <div style="font-weight: bold; font-size: 11pt; line-height: 1.4;">CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
        <div style="font-weight: bold; font-size: 11pt; line-height: 1.4;"><u>Độc Lập – Tự Do – Hạnh Phúc</u></div>
        <div style="font-size: 11pt; margin-top: 2px;">---oOo---</div>
        <div style="font-style: italic; font-size: 12pt; margin-top: 4px;">Xuân Hòa, #Hôm nay#</div>
      </td>
    </tr>
  </tbody>
</table>

<div style="text-align: center; font-size: 16pt; font-weight: bold; margin-top: 12px; margin-bottom: 2px; text-transform: uppercase;">QUYẾT ĐỊNH</div>
<div style="text-align: center; font-style: italic; font-size: 13pt; font-weight: bold; margin-bottom: 10px;">Về việc: Chấm dứt hợp đồng lao động</div>

<div style="text-align: center; font-size: 13pt; font-weight: bold; line-height: 1.4; margin-bottom: 12px;">
  VIETSUN ĐỒNG NAI<br/>
  CHI NHÁNH CÔNG TY CỔ PHẦN ĐẦU TƯ MẶT TRỜI VIỆT
</div>

<div style="font-size: 13pt; line-height: 1.5; margin-bottom: 12px; font-style: italic;">
  <div>- Căn cứ Bộ Luật Lao động số 45/2019/QH14 ngày 20/11/2019;</div>
  <div>- Căn cứ điều lệ tổ chức của Công ty cổ phần đầu tư Mặt Trời Việt – Chi nhánh Vietsun Đồng Nai;</div>
  <div>- Căn cứ chức năng, quyền hạn của Giám đốc;</div>
  <div>- Căn cứ đơn xin nghỉ việc, và thời hạn nghỉ việc của CBCNV.</div>
</div>

<div style="font-size: 13pt; line-height: 1.6; margin-bottom: 10px;">
  <div><strong>Điều 1:</strong> Chấm dứt Hợp đồng lao động với:</div>
  <div style="padding-left: 16px;">
    <div>Ông / bà : <strong>#Họ và tên#</strong> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Ngày sinh: <strong>#Ngày sinh#</strong></div>
    <div>Bộ phận/Phòng: <strong>#Công việc#</strong></div>
    <div>Loại hợp đồng: <strong>#Loại HĐ đầy đủ#</strong></div>
    <div>Lý do chấm dứt: <strong>#Lý do nghỉ việc#</strong></div>
    <div>Thời gian chấm dứt từ ngày: <strong>#Ngày nghỉ việc#</strong></div>
  </div>
</div>

<div style="font-size: 13pt; line-height: 1.6; margin-bottom: 10px;">
  <div><strong>Điều 2:</strong> Chế độ thôi việc:</div>
  <div style="padding-left: 16px;">
    <div>Ông/Bà: <strong>#Họ và tên#</strong> được hưởng các khoản chế độ sau:</div>
    <div>- Tiền lương và các phụ cấp khác theo lương của những ngày làm việc tại Công ty: Được chi trả đầy đủ theo quy chế nội bộ của Công ty và đúng theo quy định của pháp luật lao động.</div>
    <div>- Chế độ trợ cấp thôi việc: Không</div>
    <div>- Chế độ trợ cấp mất việc làm: Không</div>
  </div>
</div>

<div style="font-size: 13pt; line-height: 1.6; margin-bottom: 10px;">
  <div><strong>Điều 3:</strong> Bàn giao công việc và công dụng cụ:</div>
  <div style="padding-left: 16px;">
    <div>- Đã bàn giao công việc</div>
    <div>- Đã trả thẻ tên</div>
  </div>
</div>

<div style="font-size: 13pt; line-height: 1.6; margin-bottom: 20px;">
  <div><strong>Điều 4:</strong> Phòng NLHC, Phòng KT_TC, các đơn vị có liên quan và Ông/ Bà có tên tại điều 1 chịu trách nhiệm thi hành Quyết định này.</div>
  <div style="padding-left: 16px;">Quyết định có hiệu lực kể từ ngày : <strong>#Ngày nghỉ việc#</strong></div>
</div>

<table style="width: 100%; margin-top: 20px; border-collapse: collapse;">
  <tbody>
    <tr>
      <td style="width: 45%; vertical-align: top; text-align: left; border: none; padding-left: 12px;">
        <div style="font-weight: bold; font-size: 11pt;"><em>Nơi nhận:</em></div>
        <div style="font-size: 11pt; line-height: 1.5; font-style: italic;">
          - Như điều 4<br/>
          - Lưu P. NLHC
        </div>
      </td>
      <td style="width: 55%; vertical-align: top; text-align: center; border: none;">
        <div style="font-weight: bold; font-size: 12pt; text-transform: uppercase;">GIÁM ĐỐC ĐIỀU HÀNH CHI NHÁNH</div>
        <div style="height: 75px;"></div>
        <div style="font-weight: bold; font-size: 12pt;">ĐỖ ĐẶNG QUỐC HUY</div>
      </td>
    </tr>
  </tbody>
</table>`,
      'QUYẾT ĐỊNH Về việc: Chấm dứt hợp đồng lao động (QĐNV)'
    ]);

    // Mẫu Phụ lục hợp đồng lao động mặc định (tự động bổ sung hoặc cập nhật nếu chưa bị chỉnh sửa)
    await pool.query(`
      INSERT INTO document_templates (id, name, category, file_name, content_html, raw_text)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO UPDATE
      SET content_html = EXCLUDED.content_html
      WHERE document_templates.updated_at = document_templates.created_at
    `, [
      'doc_tpl_phu_luc_hdld',
      'Phụ lục hợp đồng lao động',
      'Hợp đồng',
      'Phu_luc_hop_dong_lao_dong.docx',
      `<table style="width: 100%; border-collapse: collapse; margin-bottom: 10px;">
  <tr>
    <td style="width: 48%; vertical-align: top; text-align: center; font-size: 11pt; font-weight: bold;">
      CÔNG TY CỔ PHẦN ĐẦU TƯ MẶT TRỜI VIỆT<br/>
      CHI NHÁNH VIETSUN ĐỒNG NAI
    </td>
    <td style="width: 52%; vertical-align: top; text-align: center; font-size: 11pt;">
      <div style="font-weight: bold;">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
      <div style="font-weight: bold; text-decoration: underline;">Độc lập – Tự do – Hạnh phúc</div>
      <div style="font-style: italic; margin-top: 6px;">Xuân Hòa, #Hôm nay#</div>
    </td>
  </tr>
</table>

<div style="text-align: center; font-size: 15pt; font-weight: bold; margin-top: 10px; margin-bottom: 4px;">PHỤ LỤC HỢP ĐỒNG LAO ĐỘNG</div>
<div style="text-align: center; font-size: 11.5pt; font-weight: bold; margin-bottom: 4px;">Số: #Số phụ lục#/HĐLĐ-VSDN/#Năm#/#MSNV#/#Bộ phận con#</div>
<div style="text-align: center; font-style: italic; font-size: 11pt; margin-bottom: 10px;">Căn cứ Hợp đồng Lao động số #Số hợp đồng# ký kết ngày #Ngày ký HĐ#</div>

<div style="font-size: 11.5pt; font-weight: bold; margin-bottom: 6px;">Chúng tôi, gồm:</div>

<table style="width: 100%; border-collapse: collapse; font-size: 11pt; margin-bottom: 10px;">
  <tr>
    <td style="width: 30%; padding: 3px 4px; font-weight: bold; vertical-align: top;">Bên A: Người sử dụng lao động (NSDLĐ)</td>
    <td colspan="3" style="padding: 3px 4px; font-weight: bold;">: CÔNG TY CỔ PHẦN ĐẦU TƯ MẶT TRỜI VIỆT</td>
  </tr>
  <tr>
    <td style="padding: 3px 4px; vertical-align: top;">Địa chỉ</td>
    <td colspan="3" style="padding: 3px 4px;">: Lô III-3A, Đường CN1, Nhóm CN III, KCN Tân Bình, Phường Tây Thạnh, Tp.Hồ Chí Minh</td>
  </tr>
  <tr>
    <td style="padding: 3px 4px;">Mã số thuế</td>
    <td colspan="3" style="padding: 3px 4px;">: 0305027542</td>
  </tr>
  <tr>
    <td style="padding: 3px 4px;">Đại diện</td>
    <td colspan="3" style="padding: 3px 4px; font-weight: bold;">: ĐỖ ĐẶNG QUỐC HUY</td>
  </tr>
  <tr>
    <td style="padding: 3px 4px;">Chức vụ</td>
    <td colspan="3" style="padding: 3px 4px;">: GIÁM ĐỐC ĐIỀU HÀNH CHI NHÁNH</td>
  </tr>
  <tr>
    <td style="padding: 3px 4px;">Số CCCD</td>
    <td style="width: 32%; padding: 3px 4px;">: 075086021801</td>
    <td colspan="2" style="padding: 3px 4px;">- Ngày cấp CCCD: 19/08/2022</td>
  </tr>
  <tr>
    <td style="padding: 3px 4px;">Nơi cấp CCCD</td>
    <td colspan="3" style="padding: 3px 4px;">: Cục CSQLHCVTTXH</td>
  </tr>
  <tr>
    <td style="padding: 3px 4px; vertical-align: top;">Địa chỉ thường trú<br/>Điện thoại<br/>Địa điểm làm việc</td>
    <td colspan="3" style="padding: 3px 4px; vertical-align: top;">
      : Ấp Xuân Tâm 1, Xuân Hòa, Tp.Đồng Nai<br/>
      : 0938813801<br/>
      : Vietsun Đồng Nai – Chi nhánh công ty Cổ Phần Đầu Tư Mặt Trời Việt – Tổ 1, Ấp Hòa Hưng, Xã Xuân Hòa, Tp.Đồng Nai.
    </td>
  </tr>
  <tr>
    <td colspan="4" style="padding: 4px; font-style: italic;">Căn cứ giấy Ủy quyền số 01/GUQ-VĐ/2025 của Phó Tổng Giám Đốc Công ty Cổ Phần Đầu Tư Mặt Trời Việt, người đại diện pháp luật chi nhánh Vietsun Đồng Nai.</td>
  </tr>
  <tr>
    <td style="padding: 4px 4px 3px 4px; font-weight: bold;">Bên B: Người Lao động (NLĐ)</td>
    <td style="padding: 4px 4px 3px 4px; font-weight: bold;">: #Họ và tên#</td>
    <td colspan="2" style="padding: 4px 4px 3px 4px;">- Quốc tịch: Việt Nam</td>
  </tr>
  <tr>
    <td style="padding: 3px 4px;">Ngày sinh</td>
    <td style="padding: 3px 4px;">: #Ngày sinh#</td>
    <td colspan="2" style="padding: 3px 4px;">Tại : #Nơi sinh#</td>
  </tr>
  <tr>
    <td style="padding: 3px 4px;">Nghề nghiệp</td>
    <td colspan="3" style="padding: 3px 4px;">: #Công việc#</td>
  </tr>
  <tr>
    <td style="padding: 3px 4px; vertical-align: top;">Địa chỉ thường trú</td>
    <td colspan="3" style="padding: 3px 4px;">: #Địa chỉ thường trú#</td>
  </tr>
  <tr>
    <td style="padding: 3px 4px;">Số CCCD/Số Hộ Chiếu</td>
    <td style="padding: 3px 4px;">: #Số CCCD#</td>
    <td colspan="2" style="padding: 3px 4px;">- Ngày cấp : #Ngày cấp CCCD#</td>
  </tr>
  <tr>
    <td style="padding: 3px 4px;">Nơi cấp</td>
    <td colspan="3" style="padding: 3px 4px;">: #Nơi cấp CCCD#</td>
  </tr>
  <tr>
    <td style="padding: 3px 4px;">Giấy phép LĐ số</td>
    <td colspan="3" style="padding: 3px 4px;">: ... &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; - Ngày cấp : ...</td>
  </tr>
  <tr>
    <td style="padding: 3px 4px;">Nơi cấp</td>
    <td colspan="3" style="padding: 3px 4px;">: ...</td>
  </tr>
  <tr>
    <td style="padding: 3px 4px;">Điện thoại</td>
    <td colspan="3" style="padding: 3px 4px;">: #Số điện thoại#</td>
  </tr>
</table>

<div style="font-size: 11pt; margin-bottom: 8px; text-align: justify;">
  Sau khi bàn bạc và thống nhất, hai bên thỏa thuận ký kết Phụ lục hợp đồng lao động để bổ sung và cam kết thực hiện đúng các điều khoản sau đây:
</div>

<div style="font-size: 11pt; margin-bottom: 6px;">
  <strong>Điều 1.</strong> Kể từ ngày <strong>#Ngày hiệu lực#</strong> điều chỉnh công việc, mức lương của Ông / bà: <strong>#Họ và tên#</strong> như sau:
</div>

<table style="width: 100%; border-collapse: collapse; font-size: 11pt; margin-bottom: 10px;" border="1">
  <thead>
    <tr style="background-color: #f3f4f6; font-weight: bold; text-align: center;">
      <th style="border: 1px solid #333; padding: 6px 8px; width: 28%;">Nội dung thay đổi</th>
      <th style="border: 1px solid #333; padding: 6px 8px; width: 36%;">Cũ</th>
      <th style="border: 1px solid #333; padding: 6px 8px; width: 36%;">Mới</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="border: 1px solid #333; padding: 6px 8px; font-weight: bold;">Mức lương</td>
      <td style="border: 1px solid #333; padding: 6px 8px;">#Lương cũ# đ</td>
      <td style="border: 1px solid #333; padding: 6px 8px; font-weight: bold;">#Lương mới# đ</td>
    </tr>
    <tr>
      <td style="border: 1px solid #333; padding: 6px 8px; font-weight: bold;">Bậc / Ngạch</td>
      <td style="border: 1px solid #333; padding: 6px 8px;">Bậc : #Bậc cũ# - Ngạch : #Ngạch cũ#</td>
      <td style="border: 1px solid #333; padding: 6px 8px;">Bậc : #Bậc mới# - Ngạch : #Ngạch mới#</td>
    </tr>
    <tr>
      <td style="border: 1px solid #333; padding: 6px 8px; font-weight: bold;">Chức vụ</td>
      <td style="border: 1px solid #333; padding: 6px 8px;">#Công việc cũ#</td>
      <td style="border: 1px solid #333; padding: 6px 8px; font-weight: bold;">#Công việc mới#</td>
    </tr>
  </tbody>
</table>

<div style="font-size: 11pt; margin-bottom: 4px;"><strong>Điều 2. Điều khoản thi hành</strong></div>
<div style="font-size: 11pt; margin-bottom: 6px; text-align: justify; line-height: 1.45;">
  Phụ lục này là một bộ phận của Hợp đồng lao động số <strong>#Số hợp đồng#</strong> ký kết ngày #Ngày ký HĐ#, được làm thành 02 (hai) bản có giá trị ngang nhau, mỗi bên giữ một bản và có hiệu lực từ ngày #Ngày hiệu lực# đến khi có Phụ lục thay thế khác.
</div>
<div style="font-size: 11pt; margin-bottom: 14px; text-align: justify;">
  Hai bên đã đọc Phụ lục Hợp đồng, đã hiểu và đồng ý tất cả các điều khoản ghi trong Phụ lục Hợp đồng và cùng ký vào Phụ lục Hợp đồng này.
</div>

<table style="width: 100%; border-collapse: collapse; text-align: center; font-size: 11pt; margin-top: 16px;">
  <tr>
    <td style="width: 50%; vertical-align: top;">
      <div style="font-weight: bold;">NGƯỜI SỬ DỤNG LAO ĐỘNG</div>
      <div style="font-weight: bold; margin-bottom: 58px;">GIÁM ĐỐC CHI NHÁNH</div>
      <div style="font-weight: bold;">ĐỖ ĐẶNG QUỐC HUY</div>
    </td>
    <td style="width: 50%; vertical-align: top;">
      <div style="font-weight: bold; margin-bottom: 74px;">NGƯỜI LAO ĐỘNG</div>
      <div style="font-weight: bold;">#Họ và tên#</div>
    </td>
  </tr>
</table>`,
      'PHỤ LỤC HỢP ĐỒNG LAO ĐỘNG'
    ]);

    // Mẫu Phụ lục HĐ HQCV (Thưởng hiệu quả vị trí công việc) mặc định
    await pool.query(`
      INSERT INTO document_templates (id, name, category, file_name, content_html, raw_text)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO UPDATE
      SET content_html = EXCLUDED.content_html
      WHERE document_templates.updated_at = document_templates.created_at
    `, [
      'doc_tpl_phu_luc_hqcv',
      'Phụ lục HĐ HQCV (Thưởng hiệu quả công việc)',
      'Hợp đồng',
      'Phu_luc_HD_HQCV.docx',
      `<table style="width: 100%; border-collapse: collapse; margin-bottom: 10px;">
  <tr>
    <td style="width: 48%; vertical-align: top; text-align: center; font-size: 11pt; font-weight: bold;">
      CÔNG TY CỔ PHẦN ĐẦU TƯ MẶT TRỜI VIỆT<br/>
      CHI NHÁNH VIETSUN ĐỒNG NAI
    </td>
    <td style="width: 52%; vertical-align: top; text-align: center; font-size: 11pt;">
      <div style="font-weight: bold;">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
      <div style="font-weight: bold; text-decoration: underline;">Độc lập – Tự do – Hạnh phúc</div>
      <div style="font-style: italic; margin-top: 6px;">Xuân Hòa, #Hôm nay#</div>
    </td>
  </tr>
</table>

<div style="text-align: center; font-size: 15pt; font-weight: bold; margin-top: 10px; margin-bottom: 4px;">PHỤ LỤC HỢP ĐỒNG LAO ĐỘNG</div>
<div style="text-align: center; font-size: 11.5pt; font-weight: bold; margin-bottom: 4px;">Số: #Số HĐ HQCV#/HĐLĐ-VSDN/#Năm#/#MSNV#</div>
<div style="text-align: center; font-style: italic; font-size: 11pt; margin-bottom: 10px;">Căn cứ Hợp đồng Lao động số #Số hợp đồng# ký kết ngày #Ngày ký HĐ#</div>

<div style="font-size: 11.5pt; font-weight: bold; margin-bottom: 6px;">Chúng tôi, gồm:</div>

<table style="width: 100%; border-collapse: collapse; font-size: 11pt; margin-bottom: 10px;">
  <tr>
    <td style="width: 30%; padding: 3px 4px; font-weight: bold; vertical-align: top;">Bên A: Người sử dụng lao động (NSDLĐ)</td>
    <td colspan="2" style="padding: 3px 4px; font-weight: bold;">: CÔNG TY CỔ PHẦN ĐẦU TƯ MẶT TRỜI VIỆT</td>
  </tr>
  <tr>
    <td style="padding: 3px 4px; vertical-align: top;">Địa chỉ</td>
    <td colspan="2" style="padding: 3px 4px;">: Lô III-3A, Đường CN1, Nhóm CN III, KCN Tân Bình, phường Tây Thạnh, Tp.Hồ Chí Minh</td>
  </tr>
  <tr>
    <td style="padding: 3px 4px;">Mã số thuế</td>
    <td colspan="2" style="padding: 3px 4px;">: 0305027542</td>
  </tr>
  <tr>
    <td style="padding: 3px 4px;">Đại diện</td>
    <td colspan="2" style="padding: 3px 4px; font-weight: bold;">: ĐỖ ĐẶNG QUỐC HUY</td>
  </tr>
  <tr>
    <td style="padding: 3px 4px;">Chức vụ</td>
    <td colspan="2" style="padding: 3px 4px;">: GIÁM ĐỐC ĐIỀU HÀNH CHI NHÁNH</td>
  </tr>
  <tr>
    <td style="padding: 3px 4px;">Số CCCD</td>
    <td style="width: 34%; padding: 3px 4px;">: 075086021801</td>
    <td style="padding: 3px 4px;">- Ngày cấp CCCD: 19/08/2022</td>
  </tr>
  <tr>
    <td style="padding: 3px 4px;">Nơi cấp CCCD</td>
    <td colspan="2" style="padding: 3px 4px;">: Cục CSQLHCVTTXH</td>
  </tr>
  <tr>
    <td style="padding: 3px 4px;">Địa chỉ thường trú</td>
    <td colspan="2" style="padding: 3px 4px;">: Ấp Xuân Tâm 1, Xuân Hòa, TP.Đồng Nai</td>
  </tr>
  <tr>
    <td style="padding: 3px 4px;">Điện thoại</td>
    <td colspan="2" style="padding: 3px 4px;">: 0938813801</td>
  </tr>
  <tr>
    <td style="padding: 3px 4px; vertical-align: top;">Địa chỉ làm việc</td>
    <td colspan="2" style="padding: 3px 4px;">: Vietsun Đồng Nai – Chi Nhánh công ty Cổ Phần Đầu Tư Mặt Trời Việt- Tổ 1, Ấp Hòa Hưng, Xã Xuân Hòa, Tp.Đồng Nai.</td>
  </tr>
  <tr>
    <td colspan="3" style="padding: 4px; font-style: italic;">Căn cứ Giấy ủy quyền số 01/GUQ-VĐ/2025 của Phó Tổng Giám Đốc Công ty Cổ Phần Đầu Tư Mặt Trời Việt, người đại diện pháp luật Chi nhánh Vietsun Đồng Nai.</td>
  </tr>
  <tr>
    <td style="padding: 4px 4px 3px 4px; font-weight: bold;">Bên B: Người Lao động (NLĐ)</td>
    <td style="padding: 4px 4px 3px 4px; font-weight: bold;">: #Họ và tên#</td>
    <td style="padding: 4px 4px 3px 4px;">- Quốc tịch: Việt Nam</td>
  </tr>
  <tr>
    <td style="padding: 3px 4px;">Ngày sinh</td>
    <td style="padding: 3px 4px;">: #Ngày sinh#</td>
    <td style="padding: 3px 4px;">Tại: #Nơi sinh#</td>
  </tr>
  <tr>
    <td style="padding: 3px 4px;">Nghề nghiệp</td>
    <td colspan="2" style="padding: 3px 4px;">: #Công việc#</td>
  </tr>
  <tr>
    <td style="padding: 3px 4px; vertical-align: top;">Địa chỉ thường trú</td>
    <td colspan="2" style="padding: 3px 4px;">: #Địa chỉ thường trú#</td>
  </tr>
  <tr>
    <td style="padding: 3px 4px;">Số CCCD/Số Hộ Chiếu</td>
    <td style="padding: 3px 4px;">: #Số CCCD#</td>
    <td style="padding: 3px 4px;">- Ngày cấp : #Ngày cấp CCCD#</td>
  </tr>
  <tr>
    <td style="padding: 3px 4px;">Nơi cấp</td>
    <td colspan="2" style="padding: 3px 4px;">: #Nơi cấp CCCD#</td>
  </tr>
  <tr>
    <td style="padding: 3px 4px;">Giấy phép LĐ số</td>
    <td colspan="2" style="padding: 3px 4px;">: ... &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; - Ngày cấp : ... &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Nơi cấp : .....</td>
  </tr>
  <tr>
    <td style="padding: 3px 4px;">Điện thoại</td>
    <td colspan="2" style="padding: 3px 4px;">: #Số điện thoại#</td>
  </tr>
</table>

<div style="font-size: 11pt; margin-bottom: 8px; text-align: justify;">
  Sau khi bàn bạc và thống nhất, hai bên thỏa thuận ký kết Phụ lục hợp đồng lao động để bổ sung và cam kết thực hiện đúng các điều khoản sau đây:
</div>

<div style="font-size: 11pt; margin-bottom: 4px;"><strong>Điều 1. Quyền lợi bổ sung của NLĐ</strong></div>
<div style="font-size: 11pt; margin-bottom: 4px;">
  Mức thưởng hiệu quả vị trí công việc: <strong>#Mức tiền HQCV# đồng/tháng</strong>
</div>
<div style="font-size: 11pt; margin-bottom: 4px; font-style: italic; text-align: justify;">
  (Mức thưởng bao gồm: Thuế thu nhập cá nhân và nghĩa vụ tài chính khác (nếu có) người lao động phải đóng theo quy định pháp luật).
</div>
<div style="font-size: 11pt; margin-bottom: 4px; text-align: justify; line-height: 1.45;">
  Cách thức trả tiền thưởng: Căn cứ vào hiệu suất, hiệu quả công việc hàng tháng của Người lao động thực hiện và kết quả kinh doanh hàng tháng của đơn vị, phòng ban, Công ty theo quy chế độ công ty ban hành.
</div>
<div style="font-size: 11pt; margin-bottom: 10px;">
  Thời gian hiệu lực: từ ngày <strong>#Ngày hiệu lực#</strong>
</div>

<div style="font-size: 11pt; margin-bottom: 4px;"><strong>Điều 2. Điều khoản thi hành</strong></div>
<div style="font-size: 11pt; margin-bottom: 6px; text-align: justify; line-height: 1.45;">
  Phụ lục này là một bộ phận của Hợp đồng lao động số <strong>#Số hợp đồng#</strong> ký kết ngày #Ngày ký HĐ# được làm thành 02 (hai) bản có giá trị ngang nhau, mỗi bên giữ một bản và có hiệu lực từ ngày ký đến khi có Phụ lục thay thế khác.
</div>
<div style="font-size: 11pt; margin-bottom: 14px; text-align: justify;">
  Hai bên đã đọc Phụ lục Hợp đồng, đã hiểu và đồng ý tất cả các điều khoản ghi trong Phụ lục Hợp đồng và cùng ký vào Phụ lục Hợp đồng này.
</div>

<table style="width: 100%; border-collapse: collapse; text-align: center; font-size: 11pt; margin-top: 16px;">
  <tr>
    <td style="width: 50%; vertical-align: top;">
      <div style="font-weight: bold;">NGƯỜI SỬ DỤNG LAO ĐỘNG</div>
      <div style="font-weight: bold; margin-bottom: 58px;">GIÁM ĐỐC CHI NHÁNH</div>
      <div style="font-weight: bold;">ĐỖ ĐẶNG QUỐC HUY</div>
    </td>
    <td style="width: 50%; vertical-align: top;">
      <div style="font-weight: bold;">NGƯỜI LAO ĐỘNG</div>
      <div style="font-style: italic; font-size: 10.5pt; margin-bottom: 58px;">(Ký và ghi rõ họ tên)</div>
      <div style="font-weight: bold;">#Họ và tên#</div>
    </td>
  </tr>
</table>`,
      'PHỤ LỤC HỢP ĐỒNG LAO ĐỘNG - THƯỞNG HIỆU QUẢ CÔNG VIỆC (HQCV)'
    ]);

    const check = await pool.query('SELECT count(*) FROM document_templates WHERE id != $1', ['doc_tpl_qdnv']);
    if (parseInt(check.rows[0].count, 10) > 0) return;

    console.log('[PostgreSQL] Đang khởi tạo 3 mẫu văn bản Word mặc định...');
    
    // 1. ANDA Thông báo khen thưởng
    await pool.query(`
      INSERT INTO document_templates (id, name, category, file_name, content_html, raw_text)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      'doc_tpl_khen_thuong',
      'ANDA Thông báo khen thưởng',
      'Hồ sơ',
      'ANDA_Thong_bao_khen_thuong.docx',
      `<div style="text-align: center; font-weight: bold; font-size: 13pt; margin-bottom: 4px;">CÔNG TY TNHH QUẢN LÝ CHUỖI CUNG ỨNG ANDA VIỆT NAM</div>
<div style="text-align: center; font-weight: bold; font-size: 12pt; margin-bottom: 20px;">CHI NHÁNH VIỆT SUN ĐỒNG NAI</div>

<div style="text-align: center; font-size: 16pt; font-weight: bold; margin-bottom: 6px; text-transform: uppercase;">THÔNG BÁO KHEN THƯỞNG CÁ NHÂN XUẤT SẮC</div>
<div style="text-align: center; font-style: italic; font-size: 12pt; margin-bottom: 22px;">Số: #Số quyết định#/TB-KT</div>

<div style="margin-bottom: 12px; font-size: 13pt;">Kính gửi: <strong>Ông/Bà #Họ và tên#</strong> &nbsp;&nbsp;&nbsp;&nbsp; MSNV: <strong>#MSNV#</strong></div>
<div style="margin-bottom: 16px; font-size: 13pt;">Bộ phận: <strong>#Bộ phận#</strong> &nbsp;&nbsp;&nbsp;&nbsp; Chức vụ: <strong>#Chức vụ#</strong></div>

<div style="margin-bottom: 12px; line-height: 1.6; font-size: 13pt; text-align: justify;">
Ban Giám đốc Công ty trân trọng ghi nhận và biểu dương những đóng góp tích cực, tinh thần trách nhiệm và thành tích xuất sắc trong công tác chuyên môn của Ông/Bà <strong>#Họ và tên#</strong> trong suốt thời gian qua.
</div>

<div style="margin-bottom: 12px; line-height: 1.6; font-size: 13pt; text-align: justify;">
Căn cứ Quy chế thi đua khen thưởng của Công ty, Ban Giám đốc quyết định khen thưởng:
<ul style="margin-top: 8px; margin-bottom: 8px; padding-left: 24px;">
  <li style="margin-bottom: 4px;"><strong>Hình thức khen thưởng:</strong> Tuyên dương trước toàn thể đơn vị và trao tặng Giấy khen danh dự.</li>
  <li style="margin-bottom: 4px;"><strong>Mức tiền thưởng:</strong> Thưởng kèm theo quyết định theo chính sách phúc lợi khen thưởng của công ty.</li>
</ul>
</div>

<div style="margin-bottom: 28px; line-height: 1.6; font-size: 13pt; text-align: justify;">
Chúc Ông/Bà <strong>#Họ và tên#</strong> luôn dồi dào sức khỏe, giữ vững nhiệt huyết và tiếp tục gặt hái thêm nhiều thành công mới cùng tập thể công ty!
</div>

<table style="width: 100%; margin-top: 40px; text-align: center; border-collapse: collapse;">
  <tr>
    <td style="width: 45%; vertical-align: top; text-align: left; padding-left: 20px;">
      <div style="font-weight: bold; font-size: 11pt;">NƠI NHẬN:</div>
      <div style="font-size: 11pt; line-height: 1.5; color: #444;">
        - Như trên;<br/>
        - Bộ phận Nhân sự;<br/>
        - Lưu VT.
      </div>
    </td>
    <td style="width: 55%; vertical-align: top;">
      <div style="font-style: italic; font-size: 12pt; margin-bottom: 4px;">Đồng Nai, ngày ... tháng ... năm 2026</div>
      <div style="font-weight: bold; font-size: 13pt; text-transform: uppercase;">TỔNG GIÁM ĐỐC</div>
      <div style="font-style: italic; font-size: 11pt; color: #666; margin-bottom: 70px;">(Ký tên và đóng dấu)</div>
      <div style="font-weight: bold; font-size: 12pt;">BÀ LÊ THỊ MINH NGUYỆT</div>
    </td>
  </tr>
</table>`,
      'ANDA Thông báo khen thưởng'
    ]);

    // 2. HDTVVP mau hop dong (Hợp đồng thử việc - chính xác như ảnh mẫu 2 và văn bản của người dùng)
    await pool.query(`
      INSERT INTO document_templates (id, name, category, file_name, content_html, raw_text)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      'doc_tpl_hdtv',
      'HDTVVP mau hop dong',
      'Hồ sơ',
      'HDTVVP_mau_hop_dong.docx',
      `<div style="text-align: center; font-weight: bold; font-size: 13pt; margin-bottom: 4px;">CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
<div style="text-align: center; font-weight: bold; font-size: 13pt; margin-bottom: 4px;">Độc lập - Tự do - Hạnh phúc</div>
<div style="text-align: center; margin-bottom: 14px;">----------o0o----------</div>

<div style="text-align: right; font-style: italic; font-size: 13pt; margin-bottom: 14px;">Hà Nội, ngày ... tháng ... năm 2026</div>

<div style="font-size: 13pt; margin-bottom: 14px; line-height: 1.5; text-align: justify;">
- Căn cứ vào Bộ Luật Lao Động số 45/2019/QH14 ngày 20 tháng 11 năm 2019<br/>
- Căn cứ vào Nghị định 145/2020/NĐ-CP ngày 14 tháng 12 năm 2020 quy định chi tiết và hướng dẫn thi hành một số điều của Bộ luật lao động.<br/>
- Căn vào Thông tư 10/2020/TT-BLĐTBXH ngày 12 tháng 11 năm 2020 hướng dẫn một số nội dung tại Bộ luật Lao động.
</div>

<div style="text-align: center; font-size: 16pt; font-weight: bold; margin-top: 14px; margin-bottom: 4px;">HỢP ĐỒNG THỬ VIỆC</div>
<div style="text-align: center; font-style: italic; font-size: 13pt; margin-bottom: 18px;">Số: #Số hợp đồng#/HĐTV</div>

<div style="margin-bottom: 12px; font-size: 13pt;">Hôm nay, Chúng tôi gồm:</div>

<div style="font-weight: bold; font-size: 13pt; margin-bottom: 6px;">BÊN A: CÔNG TY TNHH QUẢN LÝ CHUỖI CUNG ỨNG ANDA VIỆT NAM</div>
<div style="margin-bottom: 4px; font-size: 13pt;">- Địa chỉ: Số 3+5 Nguyễn Văn Linh, Phường Việt Hưng, Thành phố Hà Nội.</div>
<div style="margin-bottom: 4px; font-size: 13pt;">- Đại diện: <strong>Bà Lê Thị Minh Nguyệt</strong> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Chức vụ: <strong>Giám đốc</strong></div>
<div style="margin-bottom: 14px; font-size: 13pt;">- Mã số thuế: 0110382626</div>

<div style="font-weight: bold; font-size: 13pt; margin-bottom: 6px;">BÊN B: Ông/Bà: #Họ và tên#</div>
<div style="margin-bottom: 4px; font-size: 13pt;">- Mã số nhân viên (MSNV): <strong>#MSNV#</strong></div>
<div style="margin-bottom: 4px; font-size: 13pt;">- Sinh ngày: #Ngày sinh# &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Giới tính: #Giới tính#</div>
<div style="margin-bottom: 4px; font-size: 13pt;">- Số CCCD: #Số CCCD# &nbsp;&nbsp;&nbsp;&nbsp; Cấp ngày: #Ngày cấp# &nbsp;&nbsp;&nbsp;&nbsp; Nơi cấp: #Nơi cấp#</div>
<div style="margin-bottom: 4px; font-size: 13pt;">- Nơi đăng ký HKTT: #Hộ khẩu thường trú#</div>
<div style="margin-bottom: 14px; font-size: 13pt;">- Chỗ ở hiện nay: #Chỗ ở hiện nay#</div>

<div style="margin-bottom: 12px; font-size: 13pt; text-align: justify;">Thỏa thuận ký kết hợp đồng thử việc với những điều khoản sau đây:</div>

<div style="font-weight: bold; font-size: 13pt; margin-bottom: 4px;">Điều 1. Công việc và địa điểm làm việc:</div>
<div style="margin-bottom: 4px; font-size: 13pt;">1) Công việc:</div>
<div style="margin-bottom: 4px; font-size: 13pt;">- Vị trí / Chức danh: <strong>#Chức vụ#</strong></div>
<div style="margin-bottom: 4px; font-size: 13pt;">- Bộ phận công tác: <strong>#Bộ phận#</strong></div>
<div style="margin-bottom: 4px; font-size: 13pt; text-align: justify;">- Công việc phải làm: Tiếp nhận, xử lý và thực hiện các nghiệp vụ chuyên môn theo sự phân công của Trưởng đơn vị và Ban Giám đốc.</div>
<div style="margin-bottom: 10px; font-size: 13pt;">2) Địa điểm làm việc: Tại văn phòng và cơ sở sản xuất kinh doanh của công ty.</div>

<div style="font-weight: bold; font-size: 13pt; margin-bottom: 4px;">Điều 2: Thời gian thử việc:</div>
<div style="margin-bottom: 4px; font-size: 13pt;">- Thời gian thử việc: 01 tháng</div>
<div style="margin-bottom: 10px; font-size: 13pt;">- Bắt đầu từ ngày: #Ngày vào làm# đến hết thời gian thử việc theo quy định.</div>

<div style="font-weight: bold; font-size: 13pt; margin-bottom: 4px;">Điều 3: Thời giờ làm việc, thời giờ nghỉ ngơi:</div>
<div style="margin-bottom: 4px; font-size: 13pt;">1) Thời giờ làm việc: 7h/ngày (Sáng từ 8h đến 11h30, Chiều từ 14h đến 17h30) – 6 ngày/tuần từ thứ 2 đến thứ 7.</div>
<div style="margin-bottom: 10px; font-size: 13pt;">2) Thời gian nghỉ: Nghỉ ngày chủ nhật hàng tuần và các ngày lễ, tết theo quy định của Luật lao động.</div>

<div style="font-weight: bold; font-size: 13pt; margin-bottom: 4px;">Điều 4: Quyền lợi và nghĩa vụ của người lao động:</div>
<div style="margin-bottom: 4px; font-size: 13pt;">1. Lương thử việc: Hưởng mức lương theo thỏa thuận, trả vào ngày cuối tháng qua tài khoản ngân hàng.</div>
<div style="margin-bottom: 10px; font-size: 13pt;">2. Nghĩa vụ: Hoàn thành những công việc đã cam kết, chấp hành nội quy kỷ luật lao động và an toàn vệ sinh lao động.</div>

<div style="font-weight: bold; font-size: 13pt; margin-bottom: 4px;">Điều 5: Điều khoản thi hành:</div>
<div style="margin-bottom: 24px; font-size: 13pt; text-align: justify;">Hợp đồng thử việc được làm thành 02 bản có giá trị pháp lý ngang nhau, mỗi bên giữ một bản để thực hiện.</div>

<table style="width: 100%; margin-top: 30px; text-align: center; border-collapse: collapse;">
  <tr>
    <td style="width: 50%; vertical-align: top;">
      <div style="font-weight: bold; font-size: 13pt; text-transform: uppercase;">Người lao động</div>
      <div style="font-style: italic; font-size: 11pt; color: #666; margin-bottom: 60px;">(Ký và ghi rõ họ tên)</div>
      <div style="font-weight: bold; font-size: 13pt;">#Họ và tên#</div>
    </td>
    <td style="width: 50%; vertical-align: top;">
      <div style="font-weight: bold; font-size: 13pt; text-transform: uppercase;">NGƯỜI SỬ DỤNG LAO ĐỘNG</div>
      <div style="font-style: italic; font-size: 11pt; color: #666; margin-bottom: 60px;">(Ký tên, đóng dấu)</div>
      <div style="font-weight: bold; font-size: 13pt;">BÀ LÊ THỊ MINH NGUYỆT</div>
    </td>
  </tr>
</table>`,
      'HỢP ĐỒNG THỬ VIỆC'
    ]);

    // 3. Công văn Hỗ trợ dữ liệu
    await pool.query(`
      INSERT INTO document_templates (id, name, category, file_name, content_html, raw_text)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      'doc_tpl_cong_van',
      'Công văn Hỗ trợ dữ liệu',
      'Hồ sơ',
      'Cong_van_Ho_tro_du_lieu.docx',
      `<div style="text-align: center; font-weight: bold; font-size: 13pt; margin-bottom: 4px;">CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
<div style="text-align: center; font-weight: bold; font-size: 13pt; margin-bottom: 4px;">Độc lập - Tự do - Hạnh phúc</div>
<div style="text-align: center; margin-bottom: 18px;">----------o0o----------</div>

<div style="text-align: center; font-size: 16pt; font-weight: bold; margin-bottom: 6px; text-transform: uppercase;">CÔNG VĂN XÁC NHẬN VÀ HỖ TRỢ DỮ LIỆU NHÂN SỰ</div>
<div style="text-align: center; font-style: italic; font-size: 13pt; margin-bottom: 22px;">Số: #Số công văn#/CV-HT</div>

<div style="margin-bottom: 14px; font-size: 13pt;">Kính gửi: Các Cơ quan, Đơn vị và Tổ chức hữu quan</div>

<div style="margin-bottom: 12px; line-height: 1.6; font-size: 13pt; text-align: justify;">
Công ty Cổ phần Đầu tư Mặt Trời Việt - Chi nhánh Vietsun Đồng Nai trân trọng xác nhận thông tin nhân sự của cán bộ công nhân viên đang công tác tại đơn vị như sau:
</div>

<div style="margin-bottom: 6px; font-size: 13pt;">- Họ và tên nhân viên: <strong>#Họ và tên#</strong></div>
<div style="margin-bottom: 6px; font-size: 13pt;">- Mã số nhân viên (MSNV): <strong>#MSNV#</strong></div>
<div style="margin-bottom: 6px; font-size: 13pt;">- Ngày sinh: #Ngày sinh# &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Giới tính: #Giới tính#</div>
<div style="margin-bottom: 6px; font-size: 13pt;">- Số CCCD/CMND: #Số CCCD# &nbsp;&nbsp;&nbsp;&nbsp; Cấp ngày: #Ngày cấp# &nbsp;&nbsp;&nbsp;&nbsp; Nơi cấp: #Nơi cấp#</div>
<div style="margin-bottom: 6px; font-size: 13pt;">- Hộ khẩu thường trú: #Hộ khẩu thường trú#</div>
<div style="margin-bottom: 6px; font-size: 13pt;">- Bộ phận công tác: <strong>#Bộ phận#</strong></div>
<div style="margin-bottom: 6px; font-size: 13pt;">- Chức danh chuyên môn: <strong>#Chức vụ#</strong></div>
<div style="margin-bottom: 14px; font-size: 13pt;">- Ngày vào làm việc: <strong>#Ngày vào làm#</strong></div>

<div style="margin-bottom: 28px; line-height: 1.6; font-size: 13pt; text-align: justify;">
Công văn này được lập theo đề nghị của nhân sự để phục vụ công tác xác minh, hỗ trợ thủ tục hành chính. Kính đề nghị Quý cơ quan phối hợp và tạo điều kiện hỗ trợ.
</div>

<table style="width: 100%; margin-top: 40px; text-align: center; border-collapse: collapse;">
  <tr>
    <td style="width: 50%; vertical-align: top;">
      <div style="font-weight: bold; font-size: 13pt; text-transform: uppercase;">Xác nhận của Nhân viên</div>
      <div style="font-style: italic; font-size: 11pt; color: #666; margin-bottom: 60px;">(Ký và ghi rõ họ tên)</div>
      <div style="font-weight: bold; font-size: 13pt;">#Họ và tên#</div>
    </td>
    <td style="width: 50%; vertical-align: top;">
      <div style="font-style: italic; font-size: 11pt; margin-bottom: 4px;">Đồng Nai, ngày ... tháng ... năm 2026</div>
      <div style="font-weight: bold; font-size: 13pt; text-transform: uppercase;">ĐẠI DIỆN DOANH NGHIỆP</div>
      <div style="font-style: italic; font-size: 11pt; color: #666; margin-bottom: 60px;">(Ký tên, đóng dấu)</div>
      <div style="font-weight: bold; font-size: 13pt;">GIÁM ĐỐC CHI NHÁNH</div>
    </td>
  </tr>
</table>`,
      'CÔNG VĂN XÁC NHẬN VÀ HỖ TRỢ DỮ LIỆU NHÂN SỰ'
    ]);

    console.log('[PostgreSQL] Đã khởi tạo 3 mẫu văn bản Word mặc định thành công.');
  } catch (err) {
    console.warn('[PostgreSQL] Khởi tạo mẫu văn bản mặc định:', err.message);
  }
}

router.get('/document-templates', async (req, res) => {
  try {
    await ensureDefaultDocumentTemplates();
    const result = await pool.query(`
      SELECT id, name, category, file_name AS "fileName",
             file_size AS "fileSize", content_html AS "contentHtml",
             raw_text AS "rawText", file_data_base64 AS "fileDataBase64",
             owner_id AS "ownerId", created_at AS "createdAt", updated_at AS "updatedAt"
      FROM document_templates
      ORDER BY created_at ASC
    `);
    res.json({ success: true, templates: result.rows });
  } catch (err) {
    console.error('Lỗi GET /document-templates:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/document-templates', async (req, res) => {
  try {
    const { id, name, category = 'Hồ sơ', fileName = '', fileSize = 0, contentHtml = '', rawText = '', fileDataBase64 = '' } = req.body;
    const templateId = id || `doc_tpl_${Date.now()}`;
    const cleanName = cleanVietnameseDiacritics((name || fileName || 'Mẫu văn bản mới').trim());
    const cleanedHtml = cleanVietnameseDiacritics(contentHtml);
    const cleanedRawText = cleanVietnameseDiacritics(rawText);

    const result = await pool.query(`
      INSERT INTO document_templates (id, name, category, file_name, file_size, content_html, raw_text, file_data_base64)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        category = EXCLUDED.category,
        file_name = EXCLUDED.file_name,
        file_size = EXCLUDED.file_size,
        content_html = EXCLUDED.content_html,
        raw_text = EXCLUDED.raw_text,
        file_data_base64 = EXCLUDED.file_data_base64,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, name, category, file_name AS "fileName", file_size AS "fileSize",
                content_html AS "contentHtml", raw_text AS "rawText",
                owner_id AS "ownerId", created_at AS "createdAt", updated_at AS "updatedAt"
    `, [templateId, cleanName, category, fileName, fileSize, cleanedHtml, cleanedRawText, fileDataBase64]);

    res.json({ success: true, template: result.rows[0] });
  } catch (err) {
    console.error('Lỗi POST /document-templates:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/document-templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM document_templates WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Lỗi DELETE /document-templates/:id:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/document-templates/parse-docx', async (req, res) => {
  try {
    const { fileBase64 } = req.body;
    if (!fileBase64) {
      return res.status(400).json({ success: false, error: 'Thiếu dữ liệu file Word' });
    }

    const cleanBase64 = fileBase64.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    const result = await convertDocxToFormattedHtml(buffer);

    res.json({
      success: true,
      contentHtml: result.contentHtml,
      rawText: result.rawText,
      messages: result.messages || [],
    });
  } catch (err) {
    console.error('Lỗi parse docx:', err);
    res.status(500).json({ success: false, error: 'Không thể đọc file Word: ' + err.message });
  }
});

// =============================================================================
// 5. IMPORT LOGS & PRINT LOGS
// =============================================================================

router.post('/import-logs', async (req, res) => {
  try {
    const {
      id = `imp_${Date.now()}`,
      fileName,
      importMode = 'add_only',
      totalRows = 0,
      validCount = 0,
      errorCount = 0,
      importedCount = 0,
      updatedCount = 0,
      summaryNote = '',
      ownerId = WORKSPACE_ID,
    } = req.body;

    const result = await pool.query(`
      INSERT INTO import_logs (id, file_name, import_mode, total_rows, valid_count, error_count, imported_count, updated_count, summary_note, owner_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, file_name AS "fileName", import_mode AS "importMode", total_rows AS "totalRows",
                valid_count AS "validCount", error_count AS "errorCount", imported_count AS "importedCount",
                updated_count AS "updatedCount", summary_note AS "summaryNote", owner_id AS "ownerId", created_at AS "createdAt"
    `, [id, fileName, importMode, totalRows, validCount, errorCount, importedCount, updatedCount, summaryNote, ownerId]);

    res.json({ success: true, log: result.rows[0] });
  } catch (err) {
    console.error('Lỗi POST /import-logs:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/print-logs', async (req, res) => {
  try {
    const {
      id = `prt_${Date.now()}`,
      printMode = 'a4_grid',
      templateName = '',
      totalCards = 0,
      totalPages = 1,
      paperSize = 'A4',
      duplex = false,
      employeeSummary = '',
      ownerId = WORKSPACE_ID,
    } = req.body;

    const result = await pool.query(`
      INSERT INTO print_logs (id, print_mode, template_name, total_cards, total_pages, paper_size, duplex, employee_summary, owner_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, print_mode AS "printMode", template_name AS "templateName", total_cards AS "totalCards",
                total_pages AS "totalPages", paper_size AS "paperSize", duplex, employee_summary AS "employeeSummary",
                owner_id AS "ownerId", created_at AS "createdAt"
    `, [id, printMode, templateName, totalCards, totalPages, paperSize, duplex, employeeSummary, ownerId]);

    res.json({ success: true, log: result.rows[0] });
  } catch (err) {
    console.error('Lỗi POST /print-logs:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =============================================================================
// 6. APP SETTINGS
// =============================================================================

router.post('/settings', async (req, res) => {
  try {
    const s = req.body;
    const id = s.id || 'settings_vietsun_default';

    const result = await pool.query(`
      INSERT INTO app_settings (
        id, company_name, company_branch, company_sub_name, logo_url,
        default_paper_size, default_cols, default_rows, default_gap_mm, default_margin_mm,
        card_width_mm, card_height_mm, owner_id, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE
      SET company_name = EXCLUDED.company_name,
          company_branch = EXCLUDED.company_branch,
          company_sub_name = EXCLUDED.company_sub_name,
          logo_url = EXCLUDED.logo_url,
          default_paper_size = EXCLUDED.default_paper_size,
          default_cols = EXCLUDED.default_cols,
          default_rows = EXCLUDED.default_rows,
          default_gap_mm = EXCLUDED.default_gap_mm,
          default_margin_mm = EXCLUDED.default_margin_mm,
          card_width_mm = EXCLUDED.card_width_mm,
          card_height_mm = EXCLUDED.card_height_mm,
          updated_at = CURRENT_TIMESTAMP
      RETURNING id, company_name AS "companyName", company_branch AS "companyBranch",
                company_sub_name AS "companySubName", logo_url AS "logoUrl",
                default_paper_size AS "defaultPaperSize", default_cols AS "defaultCols",
                default_rows AS "defaultRows", default_gap_mm::float AS "defaultGapMm",
                default_margin_mm::float AS "defaultMarginMm", card_width_mm::float AS "cardWidthMm",
                card_height_mm::float AS "cardHeightMm", owner_id AS "ownerId",
                created_at AS "createdAt", updated_at AS "updatedAt"
    `, [
      id,
      s.companyName || 'CÔNG TY CP ĐẦU TƯ MẶT TRỜI VIỆT',
      s.companyBranch || 'VIETSUN ĐỒNG NAI',
      s.companySubName || '',
      s.logoUrl || '/assets/aistudio/VIETSUN_b5e42dd9.png',
      s.defaultPaperSize || 'A4',
      s.defaultCols || 2,
      s.defaultRows || 5,
      s.defaultGapMm || 0,
      s.defaultMarginMm || 0,
      s.cardWidthMm || 85.6,
      s.cardHeightMm || 54.0,
      s.ownerId || WORKSPACE_ID,
    ]);

    res.json({ success: true, settings: result.rows[0] });
  } catch (err) {
    console.error('Lỗi POST /settings:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Clear toàn bộ nhật ký (Import logs, Print logs) & reset số lần in của nhân viên
router.post('/history/clear', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM import_logs');
    await client.query('DELETE FROM print_logs');
    await client.query(`
      UPDATE employees
      SET print_count = 0, last_printed_at = '', updated_at = CURRENT_TIMESTAMP
    `);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Lỗi POST /history/clear:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

// Seed lại dữ liệu mẫu
router.post('/seed-sample-employees', async (req, res) => {
  try {
    await pool.query(`
      INSERT INTO employees (
        id, msnv, full_name, department, join_date, photo_url, print_count, last_printed_at, owner_id,
        stt, don_vi, tinh_trang, khoi, ky_hieu_pb, phong_ban, phong_ban_con, ho, ten, cong_viec, ngay_vao,
        ngay_sinh, noi_sinh, nguyen_quan, gioi_tinh, dan_toc, ton_giao, so_nha_thuong_tru, phuong_xa_thuong_tru,
        tinh_tp_thuong_tru, dia_chi_thuong_tru, so_nha_tam_tru, phuong_xa_tam_tru, tinh_tp_tam_tru, cccd,
        ngay_cap_cccd, noi_cap_cccd, ngay_het_han_cccd, trinh_do_van_hoa, trinh_do_chuyen_mon, so_cmnd_cu,
        trinh_do_ngoai_ngu, tay_nghe, dao_tao, so_dien_thoai, tinh_trang_hon_nhan, suc_khoe, gioi_thieu,
        bo_phan, loai_hd, thoi_han, phan_loai, so_hd, tu_ngay, den_ngay, khoi2, chuc_vu
      ) VALUES
        (
          'emp_10448', '10448', 'Đỗ Đặng Quốc Huy', 'Ban giám đốc', '15/05/2012', '', 1, '15/05/2012', 'workspace_vietsun_dong_nai_v1',
          '1', 'XMAY 03', 'LV', 'Văn phòng', 'BGĐ', 'Ban giám đốc', 'BGĐ', 'Đỗ Đặng Quốc', 'Huy', 'Giám đốc Điều hành', '15/05/2012',
          '10/07/1986', 'Thành phố Đồng Nai', 'Quảng Ngãi', 'Nam', 'Kinh', 'Công Giáo', 'Ấp Xuân Tâm', 'Xã Xuân Hòa',
          'Thành phố Đồng Nai', 'Ấp Xuân Tâm, Xã Xuân Hòa, Thành phố Đồng Nai', 'Ấp Xuân Tâm', 'Xã Xuân Hòa', 'Thành phố Đồng Nai', '075086021801',
          '11/05/2026', 'Cục CSQLHCVTTXH', '10/07/2046', '11/12', '', '', '', 'x', '', '0938813801', 'Đã kết hôn', '', '',
          'BGĐ', 'HĐKXĐ', '', 'THAM GIA', '0448', '01/09/2025', '', 'BOD', 'Giám đốc'
        ),
        (
          'emp_90063', '90063', 'Phạm Văn Hiếu', 'Phòng Bảo trì vận hành', '01/07/2025', '', 1, '01/07/2025', 'workspace_vietsun_dong_nai_v1',
          '2', 'XMAY 03', 'LV', 'Văn phòng', 'P6', 'Phòng Bảo trì vận hành', 'BP. Bảo trì vận hành', 'Phạm Văn', 'Hiếu', 'Nhân viên Bảo trì vận hành', '01/07/2025',
          '01/01/1994', 'Sóc Trăng', 'Sóc Trăng', 'Nam', 'Kinh', 'Không', 'Huỳnh Phẩm', 'Thạnh Qưới',
          'Thành phố Cần Thơ', 'Huỳnh Phẩm, Thạnh Qưới, Thành phố Cần Thơ', 'Huỳnh Phẩm', 'Thạnh Quới', 'Thành phố Cần Thơ', '094094002952',
          '24/03/2023', 'Cục CSQLHCVTTXH', '01/01/2034', '9/12', '', '365961212', '', '', 'x', '0366815871', 'Độc thân', 'II', '',
          'BP. Bảo trì vận hành', 'HĐXĐTH', '12 THÁNG', 'THAM GIA', '0063', '2026-07-01', '2027-06-30', 'VSDN6', 'Nhân viên'
        ),
        (
          'emp_00455', '00455', 'Bùi Nhật Duy', 'Phòng Bảo trì vận hành', '21/10/2025', '', 1, '21/10/2025', 'workspace_vietsun_dong_nai_v1',
          '3', 'XMAY 03', 'LV', 'Văn phòng', 'P6', 'Phòng Bảo trì vận hành', 'BP. Bảo trì vận hành', 'Bùi Nhật', 'Duy', 'Nhân viên IT', '21/10/2025',
          '18/04/1997', 'Thành phố Đồng Nai', 'Quảng Ngãi', 'Nam', 'Kinh', 'Công Giáo', 'Ấp Xuân Tâm', 'Xã Xuân Hòa',
          'Thành phố Đồng Nai', 'Ấp Xuân Tâm, Xã Xuân Hòa, Thành phố Đồng Nai', 'Ấp Xuân Tâm', 'Xã Xuân Hòa', 'Thành phố Đồng Nai', '075097004601',
          '08/09/2022', 'Cục CSQLHCVTTXH', '18/04/2037', '12/12', 'Cao Đẳng công nghệ thủ đức', '', '', '', 'x', '0792192607', 'Đã kết hôn', 'I', '',
          'BP. Bảo trì vận hành', 'HĐXĐTH', '12 THÁNG', 'THAM GIA', '0455', '2025-12-18', '2026-12-17', 'VSDN6', 'Nhân viên'
        ),
        (
          'emp_36854', '36854', 'Đặng Văn Tuyển', 'Phòng Bảo trì vận hành', '13/02/2025', '', 1, '13/02/2025', 'workspace_vietsun_dong_nai_v1',
          '4', 'XMAY 03', 'LV', 'Văn phòng', 'P6', 'Phòng Bảo trì vận hành', 'BP. Bảo trì vận hành', 'Đặng Văn', 'Tuyển', 'Nhân viên Bảo trì vận hành', '13/02/2025',
          '06/08/1986', 'Hà Nội', 'Hà Nội', 'Nam', 'Kinh', 'Không', 'Ấp Hòa Hưng', 'Xã Xuân Hòa',
          'Thành phố Đồng Nai', 'Ấp Hòa Hưng, Xã Xuân Hòa, Thành phố Đồng Nai', 'Ấp Hòa Hưng', 'Xã Xuân Hòa', 'Thành phố Đồng Nai', '001086017731',
          '04/05/2023', 'Cục CSQLHCVTTXH', '06/08/2046', '9/12', 'Chứng chỉ sơ cấp bảo trì máy may', '', '', 'x', '', '0979163833', 'Đã kết hôn', 'II', 'Hồng nhân sự',
          'BP. Bảo trì vận hành', 'HĐXĐTH', '12 THÁNG', 'THAM GIA', '6854', '2026-03-01', '2027-04-12', 'VSDN6', 'Nhân viên'
        ),
        (
          'emp_34433', '34433', 'Võ Đức Minh', 'Phòng Bảo trì vận hành', '14/04/2021', '', 1, '14/04/2021', 'workspace_vietsun_dong_nai_v1',
          '5', 'XMAY 03', 'LV', 'Văn phòng', 'P6', 'Phòng Bảo trì vận hành', 'BP. Bảo trì vận hành', 'Võ Đức', 'Minh', 'Nhân viên Bảo trì vận hành', '14/04/2021',
          '22/12/1992', 'Thành phố Đồng Nai', 'Quảng Trị', 'Nam', 'Kinh', 'Phật Giáo', 'Ấp Hòa Hưng', 'Xã Xuân Hòa',
          'Thành phố Đồng Nai', 'Ấp Hòa Hưng, Xã Xuân Hòa, Thành phố Đồng Nai', 'Ấp Hòa Hưng', 'Xã Xuân Hòa', 'Thành phố Đồng Nai', '075092008536',
          '12/06/2022', 'Cục CSQLHCVTTXH', '22/12/2032', '12/12', 'Kỷ thuật điện', '', '', 'x', '', '0985483237', 'Độc thân', '', '',
          'BP. Bảo trì vận hành', 'HĐKXĐ', '', 'THAM GIA', '453', '2026-05-01', '', 'VSDN6', 'Nhân viên'
        ),
        (
          'emp_90793', '90793', 'Trịnh Minh Hùng', 'Phòng Bảo trì vận hành', '25/06/2026', '', 1, '25/06/2026', 'workspace_vietsun_dong_nai_v1',
          '6', 'XMAY 03', 'LV', 'Văn phòng', 'P6', 'Phòng Bảo trì vận hành', 'BP. Bảo trì vận hành', 'Trịnh Minh', 'Hùng', 'Nhân viên Bảo trì vận hành', '25/06/2026',
          '16/05/1999', 'Thành phố Đồng Nai', '', 'Nam', 'Kinh', 'Phật Giáo', 'Ấp Hòa Hưng', 'Xã Xuân Hòa',
          'Thành phố Đồng Nai', 'Ấp Hòa Hưng, Xã Xuân Hòa, Thành phố Đồng Nai', 'Ấp Hòa Hưng', 'Xã Xuân Hòa', 'Thành phố Đồng Nai', '075099008189',
          '15/10/2024', 'Cục CSQLHCVTTXH', '16/05/2039', '12/12', '', '', '', '', 'x', '0916874360', 'Đã kết hôn', 'I', '34806 Mai Hoa',
          'BP. Bảo trì vận hành', 'HĐXĐTH', '12 THÁNG', 'THAM GIA', '0793', '2026-08-22', '2027-08-21', 'VSDN6', 'Nhân viên'
        ),
        (
          'emp_90927', '90927', 'Bùi Văn Phú', 'Phòng Bảo trì vận hành', '24/08/2026', '', 1, '24/08/2026', 'workspace_vietsun_dong_nai_v1',
          '7', 'XMAY 03', 'LV', 'Văn phòng', 'P6', 'Phòng Bảo trì vận hành', 'BP. Bảo trì vận hành', 'Bùi Văn', 'Phú', 'Nhân viên Bảo trì vận hành', '24/08/2026',
          '08/04/2000', 'Tỉnh Lâm Đồng', '', 'Nam', 'Kinh', 'Không', 'Thôn 5', 'Xã Tân Minh',
          'Tỉnh Lâm Đồng', 'Thôn 5, Xã Tân Minh, Tỉnh Lâm Đồng', 'Thôn 5', 'Xã Tân Minh', 'Tỉnh Lâm Đồng', '060200009352',
          '21/04/2025', 'Bộ Công An', '08/04/2040', '12/12', '', '', '', 'x', '', '0867984715', 'Đã kết hôn', 'I', '',
          'BP. Bảo trì vận hành', 'HĐXĐTH', '12 THÁNG', 'THAM GIA', '0927', '2026-10-21', '2027-10-20', 'VSDN6', 'Nhân viên'
        ),
        (
          'emp_90993', '90993', 'Trương Minh Hiếu', 'Phòng Bảo trì vận hành', '02/10/2026', '', 1, '02/10/2026', 'workspace_vietsun_dong_nai_v1',
          '8', 'XMAY 03', 'LV', 'Văn phòng', 'P6', 'Phòng Bảo trì vận hành', 'BP. Bảo trì vận hành', 'Trương Minh', 'Hiếu', 'Nhân viên IT', '02/10/2026',
          '25/05/2001', 'Thành phố Đồng Nai', 'Thành phố Đồng Nai', 'Nam', 'Kinh', 'Không', 'Khu phố Suối Cát', 'Phường Xuân Lộc',
          'Thành phố Đồng Nai', 'Khu phố Suối Cát, Phường Xuân Lộc, Thành phố Đồng Nai', 'Khu phố Suối Cát', 'Phường Xuân Lộc', 'Thành phố Đồng Nai', '075201008006',
          '27/05/2024', 'Cục CSQLHCVTTXH', '25/05/2041', '12/12', 'Cao đẳng Kỹ thuật Cao Thắng', '', '', '', 'x', '0868960694', 'Độc thân', 'II', '',
          'BP. Bảo trì vận hành', 'HĐTV', '60 NGÀY', '', '0993', '2026-10-02', '2026-11-28', 'VSDN6', 'Nhân viên'
        )
      ON CONFLICT (msnv) DO UPDATE SET
        stt = EXCLUDED.stt,
        don_vi = EXCLUDED.don_vi,
        tinh_trang = EXCLUDED.tinh_trang,
        khoi = EXCLUDED.khoi,
        ky_hieu_pb = EXCLUDED.ky_hieu_pb,
        phong_ban = EXCLUDED.phong_ban,
        phong_ban_con = EXCLUDED.phong_ban_con,
        ho = EXCLUDED.ho,
        ten = EXCLUDED.ten,
        full_name = EXCLUDED.full_name,
        cong_viec = EXCLUDED.cong_viec,
        ngay_vao = EXCLUDED.ngay_vao,
        join_date = EXCLUDED.join_date,
        ngay_sinh = EXCLUDED.ngay_sinh,
        noi_sinh = EXCLUDED.noi_sinh,
        nguyen_quan = EXCLUDED.nguyen_quan,
        gioi_tinh = EXCLUDED.gioi_tinh,
        dan_toc = EXCLUDED.dan_toc,
        ton_giao = EXCLUDED.ton_giao,
        so_nha_thuong_tru = EXCLUDED.so_nha_thuong_tru,
        phuong_xa_thuong_tru = EXCLUDED.phuong_xa_thuong_tru,
        tinh_tp_thuong_tru = EXCLUDED.tinh_tp_thuong_tru,
        dia_chi_thuong_tru = EXCLUDED.dia_chi_thuong_tru,
        so_nha_tam_tru = EXCLUDED.so_nha_tam_tru,
        phuong_xa_tam_tru = EXCLUDED.phuong_xa_tam_tru,
        tinh_tp_tam_tru = EXCLUDED.tinh_tp_tam_tru,
        cccd = EXCLUDED.cccd,
        ngay_cap_cccd = EXCLUDED.ngay_cap_cccd,
        noi_cap_cccd = EXCLUDED.noi_cap_cccd,
        ngay_het_han_cccd = EXCLUDED.ngay_het_han_cccd,
        trinh_do_van_hoa = EXCLUDED.trinh_do_van_hoa,
        trinh_do_chuyen_mon = EXCLUDED.trinh_do_chuyen_mon,
        so_cmnd_cu = EXCLUDED.so_cmnd_cu,
        trinh_do_ngoai_ngu = EXCLUDED.trinh_do_ngoai_ngu,
        tay_nghe = EXCLUDED.tay_nghe,
        dao_tao = EXCLUDED.dao_tao,
        so_dien_thoai = EXCLUDED.so_dien_thoai,
        tinh_trang_hon_nhan = EXCLUDED.tinh_trang_hon_nhan,
        suc_khoe = EXCLUDED.suc_khoe,
        gioi_thieu = EXCLUDED.gioi_thieu,
        bo_phan = EXCLUDED.bo_phan,
        department = EXCLUDED.department,
        loai_hd = EXCLUDED.loai_hd,
        thoi_han = EXCLUDED.thoi_han,
        phan_loai = EXCLUDED.phan_loai,
        so_hd = EXCLUDED.so_hd,
        tu_ngay = EXCLUDED.tu_ngay,
        den_ngay = EXCLUDED.den_ngay,
        khoi2 = EXCLUDED.khoi2,
        chuc_vu = EXCLUDED.chuc_vu;
    `);
    res.json({ success: true });
  } catch (err) {
    console.error('Lỗi seed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// ĐƠN XIN NGHỈ VIỆC & THÔI VIỆC (RESIGNATION)
// ==========================================

router.get('/resignation-applications', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id, employee_id AS "employeeId", msnv, full_name AS "fullName",
        don_vi AS "donVi", vi_tri AS "viTri", so_hd AS "soHd", loai_hd AS "loaiHd",
        nhom_ly_do AS "nhomLyDo", ly_do AS "lyDo", ngay_nghi AS "ngayNghi",
        ngay_hen_tra_luong AS "ngayHenTraLuong", thang_bao_cao AS "thangBaoCao",
        nguoi_duyet AS "nguoiDuyet", y_kien AS "yKien", dien_giai AS "dienGiai",
        so_quyet_dinh AS "soQuyetDinh", quy_trinh_thoi_viec AS "quyTrinhThoiViec",
        trang_thai AS "trangThai", noi_dung_bo_sung AS "noiDungBoSung",
        danh_sach_cong_viec AS "danhSachCongViec", tai_lieu_dinh_kem AS "taiLieuDinhKem",
        owner_id AS "ownerId", created_at AS "createdAt", updated_at AS "updatedAt"
      FROM resignation_applications
      WHERE owner_id = $1
      ORDER BY 
        CASE 
          WHEN ngay_nghi ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$' THEN TO_DATE(ngay_nghi, 'DD/MM/YYYY')
          WHEN ngay_nghi ~ '^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}$' THEN TO_DATE(ngay_nghi, 'YYYY-MM-DD')
          ELSE NULL
        END DESC NULLS LAST,
        created_at DESC
    `, [WORKSPACE_ID]);
    res.json({ success: true, applications: result.rows });
  } catch (err) {
    console.error('Lỗi lấy danh sách đơn nghỉ việc:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/resignation-applications', async (req, res) => {
  try {
    const body = req.body;
    const id = body.id || `res_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const employeeId = body.employeeId || null;
    const msnv = (body.msnv || '').trim();
    const fullName = (body.fullName || '').trim();
    const donVi = (body.donVi || '').trim();
    const viTri = (body.viTri || '').trim();
    const soHd = (body.soHd || '').trim();
    const loaiHd = (body.loaiHd || '').trim();
    const nhomLyDo = (body.nhomLyDo || body.lyDo || 'Duyệt theo đơn').trim();
    const lyDo = (body.lyDo || body.nhomLyDo || 'Duyệt theo đơn').trim();
    const ngayNghi = (body.ngayNghi || '').trim();
    const ngayHenTraLuong = (body.ngayHenTraLuong || '').trim();
    const thangBaoCao = (body.thangBaoCao || '').trim();
    const nguoiDuyet = (body.nguoiDuyet || '').trim();
    const yKien = (body.yKien || '').trim();
    const dienGiai = (body.dienGiai || '').trim();
    const soQuyetDinh = (body.soQuyetDinh || '').trim();
    const quyTrinhThoiViec = (body.quyTrinhThoiViec || 'Quy trình bàn giao tiêu chuẩn').trim();
    const trangThai = (body.trangThai || 'Đang thực hiện').trim();
    const noiDungBoSung = (body.noiDungBoSung || '').trim();
    const danhSachCongViec = JSON.stringify(body.danhSachCongViec || []);
    const taiLieuDinhKem = JSON.stringify(body.taiLieuDinhKem || []);

    const result = await pool.query(`
      INSERT INTO resignation_applications (
        id, employee_id, msnv, full_name, don_vi, vi_tri, so_hd, loai_hd,
        nhom_ly_do, ly_do, ngay_nghi, ngay_hen_tra_luong, thang_bao_cao,
        nguoi_duyet, y_kien, dien_giai,
        so_quyet_dinh, quy_trinh_thoi_viec, trang_thai, noi_dung_bo_sung,
        danh_sach_cong_viec, tai_lieu_dinh_kem, owner_id, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13,
        $14, $15, $16,
        $17, $18, $19, $20,
        $21::jsonb, $22::jsonb, $23, CURRENT_TIMESTAMP
      )
      ON CONFLICT (id) DO UPDATE SET
        employee_id = EXCLUDED.employee_id,
        msnv = EXCLUDED.msnv,
        full_name = EXCLUDED.full_name,
        don_vi = EXCLUDED.don_vi,
        vi_tri = EXCLUDED.vi_tri,
        so_hd = EXCLUDED.so_hd,
        loai_hd = EXCLUDED.loai_hd,
        nhom_ly_do = EXCLUDED.nhom_ly_do,
        ly_do = EXCLUDED.ly_do,
        ngay_nghi = EXCLUDED.ngay_nghi,
        ngay_hen_tra_luong = EXCLUDED.ngay_hen_tra_luong,
        thang_bao_cao = EXCLUDED.thang_bao_cao,
        nguoi_duyet = EXCLUDED.nguoi_duyet,
        y_kien = EXCLUDED.y_kien,
        dien_giai = EXCLUDED.dien_giai,
        so_quyet_dinh = EXCLUDED.so_quyet_dinh,
        quy_trinh_thoi_viec = EXCLUDED.quy_trinh_thoi_viec,
        trang_thai = EXCLUDED.trang_thai,
        noi_dung_bo_sung = EXCLUDED.noi_dung_bo_sung,
        danh_sach_cong_viec = EXCLUDED.danh_sach_cong_viec,
        tai_lieu_dinh_kem = EXCLUDED.tai_lieu_dinh_kem,
        updated_at = CURRENT_TIMESTAMP
      RETURNING 
        id, employee_id AS "employeeId", msnv, full_name AS "fullName",
        don_vi AS "donVi", vi_tri AS "viTri", so_hd AS "soHd", loai_hd AS "loaiHd",
        nhom_ly_do AS "nhomLyDo", ly_do AS "lyDo", ngay_nghi AS "ngayNghi",
        ngay_hen_tra_luong AS "ngayHenTraLuong", thang_bao_cao AS "thangBaoCao",
        nguoi_duyet AS "nguoiDuyet", y_kien AS "yKien", dien_giai AS "dienGiai",
        so_quyet_dinh AS "soQuyetDinh", quy_trinh_thoi_viec AS "quyTrinhThoiViec",
        trang_thai AS "trangThai", noi_dung_bo_sung AS "noiDungBoSung",
        danh_sach_cong_viec AS "danhSachCongViec", tai_lieu_dinh_kem AS "taiLieuDinhKem",
        owner_id AS "ownerId", created_at AS "createdAt", updated_at AS "updatedAt"
    `, [
      id, employeeId, msnv, fullName, donVi, viTri, soHd, loaiHd,
      nhomLyDo, lyDo, ngayNghi, ngayHenTraLuong, thangBaoCao,
      nguoiDuyet, yKien, dienGiai,
      soQuyetDinh, quyTrinhThoiViec, trangThai, noiDungBoSung,
      danhSachCongViec, taiLieuDinhKem, WORKSPACE_ID
    ]);

    const savedApp = result.rows[0];

    // Tự động đồng bộ sang bảng employee_work_histories
    try {
      const empRes = await pool.query(
        `SELECT id, cccd, msnv, department, chuc_vu, loai_hd, ngay_vao FROM employees WHERE id = $1 OR LOWER(TRIM(msnv)) = LOWER($2) LIMIT 1`,
        [employeeId, msnv]
      );
      if (empRes.rows.length > 0) {
        const emp = empRes.rows[0];
        const empCccd = (emp.cccd || '').trim();
        if (empCccd) {
          let resType = 'khac';
          const r = String(lyDo || nhomLyDo || '').toLowerCase();
          if (r.includes('rút hồ sơ')) resType = 'rut_ho_so';
          else if (r.includes('bỏ việc')) resType = 'bo_viec';
          else if (r.includes('thôi việc') || r.includes('kỷ luật')) resType = 'cong_ty_cho_thoi_viec';
          else if (r.includes('hết hợp đồng') || r.includes('hết hiệu lực') || r.includes('hết hạn')) resType = 'het_hop_dong';
          else if (r.includes('đơn') || r.includes('xin nghỉ')) resType = 'tu_xin_nghi';

          let parsedEndDate = null;
          if (ngayNghi) {
            const parts = ngayNghi.split('/');
            if (parts.length === 3) {
              parsedEndDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            } else if (ngayNghi.includes('-')) {
              parsedEndDate = ngayNghi;
            }
          }

          const latestWh = await pool.query(
            `SELECT id, turn_number, status FROM employee_work_histories WHERE LOWER(TRIM(cccd)) = LOWER($1) ORDER BY turn_number DESC LIMIT 1`,
            [empCccd]
          );

          if (latestWh.rows.length > 0) {
            await pool.query(
              `UPDATE employee_work_histories
               SET end_date = COALESCE($1::date, end_date, CURRENT_DATE),
                   resignation_type = $2,
                   resignation_reason = $3,
                   status = 'terminated',
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $4`,
              [parsedEndDate, resType, (lyDo || nhomLyDo || 'Rút hồ sơ').trim(), latestWh.rows[0].id]
            );
          } else {
            const historyId = `wh_${emp.id}_t1`;
            let parsedStartDate = null;
            if (emp.ngay_vao) {
              const sp = emp.ngay_vao.split('/');
              if (sp.length === 3) parsedStartDate = `${sp[2]}-${sp[1].padStart(2, '0')}-${sp[0].padStart(2, '0')}`;
            }
            await pool.query(
              `INSERT INTO employee_work_histories (
                 id, employee_id, cccd, msnv, turn_number, start_date, end_date,
                 department, position, contract_type, resignation_type, resignation_reason,
                 rehire_eligibility, status, owner_id
               ) VALUES ($1, $2, $3, $4, 1, COALESCE($5::date, CURRENT_DATE), COALESCE($6::date, CURRENT_DATE), $7, $8, $9, $10, $11, 'eligible', 'terminated', $12)`,
              [
                historyId, emp.id, empCccd, emp.msnv, parsedStartDate, parsedEndDate,
                emp.department || 'Chưa phân bổ', emp.chuc_vu || 'Nhân viên',
                emp.loai_hd || 'Chính thức', resType, (lyDo || nhomLyDo || 'Rút hồ sơ').trim(), WORKSPACE_ID
              ]
            );
          }
        }
      }
    } catch (whSyncErr) {
      console.warn('[Resignation] Cảnh báo đồng bộ lịch sử làm việc:', whSyncErr.message);
    }

    res.json({ success: true, application: savedApp });
  } catch (err) {
    console.error('Lỗi lưu đơn nghỉ việc:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/resignation-applications/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query('BEGIN');

    // 1. Lấy thông tin đơn thôi việc để xác định nhân viên và kiểm tra trạng thái
    const appRes = await client.query(
      `SELECT employee_id, msnv, full_name, trang_thai FROM resignation_applications WHERE id = $1 AND owner_id = $2`,
      [id, WORKSPACE_ID]
    );

    if (appRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Không tìm thấy đơn thôi việc' });
    }

    const app = appRes.rows[0];

    // Đơn đã chuyển sang "Đã hoàn thành" thì không thể xóa
    if (app.trang_thai === 'Đã hoàn thành') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: 'Đơn xin thôi việc đã chuyển sang trạng thái "Đã hoàn thành" nên không thể xóa khỏi hệ thống.',
      });
    }

    let restoredEmployee = null;
    const rawMsnv = String(app.msnv || '').trim();

      // 2. Tìm nhân viên theo employee_id hoặc msnv
      let empRes;
      if (app.employee_id) {
        empRes = await client.query(`SELECT id, msnv, full_name, cccd, extra_data FROM employees WHERE id = $1`, [app.employee_id]);
      }
      if ((!empRes || empRes.rows.length === 0) && rawMsnv) {
        empRes = await client.query(
          `SELECT id, msnv, full_name, cccd, extra_data FROM employees WHERE LOWER(TRIM(msnv)) = LOWER($1) LIMIT 1`,
          [rawMsnv]
        );
      }

      // 3. Trả về trạng thái bình thường (tinh_trang: 'LV', trang_thai_hop_dong: 'Hiệu lực')
      if (empRes && empRes.rows.length > 0) {
        const emp = empRes.rows[0];
        let extra = typeof emp.extra_data === 'object' && emp.extra_data !== null ? { ...emp.extra_data } : {};
        delete extra.ngayNghi;
        delete extra.ngayHenTraLuong;
        delete extra.lyDoNghi;
        delete extra.nhomLyDo;
        delete extra.thangBaoCao;
        extra.tinhTrangHopDong = 'Hiệu lực';

        await client.query(
          `UPDATE employees
           SET tinh_trang = 'LV',
               trang_thai_hop_dong = 'Hiệu lực',
               extra_data = $1::jsonb,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [JSON.stringify(extra), emp.id]
        );

        if (emp.cccd && emp.cccd.trim()) {
          await client.query(
            `UPDATE employee_work_histories
             SET status = 'active',
                 end_date = NULL,
                 resignation_type = NULL,
                 resignation_reason = NULL,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = (
               SELECT id FROM employee_work_histories 
               WHERE LOWER(TRIM(cccd)) = LOWER($1) 
               ORDER BY turn_number DESC LIMIT 1
             )`,
            [emp.cccd.trim()]
          );
        }

        restoredEmployee = {
          id: emp.id,
          msnv: emp.msnv,
          fullName: emp.full_name,
          tinhTrang: 'LV',
          trangThaiHopDong: 'Hiệu lực',
          extraData: extra,
        };
      }

    // 4. Xóa đơn nghỉ việc
    await client.query('DELETE FROM resignation_applications WHERE id = $1 AND owner_id = $2', [id, WORKSPACE_ID]);

    await client.query('COMMIT');
    res.json({ success: true, id, restoredEmployee });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Lỗi xóa đơn nghỉ việc & khôi phục trạng thái nhân viên:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

// Phục hồi trạng thái bình thường cho người lao động (tinh_trang: 'LV', trang_thai_hop_dong: 'Hiệu lực')
// Áp dụng khi xóa khỏi Danh sách nhân viên nghỉ việc hoặc muốn hủy thôi việc
router.post('/employees/restore-status', async (req, res) => {
  const client = await pool.connect();
  try {
    const { ids, msnvs } = req.body;
    const targetIds = Array.isArray(ids) ? ids.filter(Boolean) : [];
    const targetMsnvs = Array.isArray(msnvs) ? msnvs.map((s) => String(s).trim()).filter(Boolean) : [];

    if (targetIds.length === 0 && targetMsnvs.length === 0) {
      return res.status(400).json({ success: false, error: 'Cần cung cấp danh sách ids hoặc msnvs' });
    }

    await client.query('BEGIN');

    let query = '';
    let params = [];
    if (targetIds.length > 0 && targetMsnvs.length > 0) {
      query = `SELECT id, msnv, full_name, cccd, extra_data FROM employees WHERE id = ANY($1) OR msnv = ANY($2)`;
      params = [targetIds, targetMsnvs];
    } else if (targetIds.length > 0) {
      query = `SELECT id, msnv, full_name, cccd, extra_data FROM employees WHERE id = ANY($1)`;
      params = [targetIds];
    } else {
      query = `SELECT id, msnv, full_name, cccd, extra_data FROM employees WHERE msnv = ANY($1)`;
      params = [targetMsnvs];
    }

    const empRes = await client.query(query, params);
    const restored = [];

    for (const emp of empRes.rows) {
      let extra = typeof emp.extra_data === 'object' && emp.extra_data !== null ? { ...emp.extra_data } : {};
      delete extra.ngayNghi;
      delete extra.ngayHenTraLuong;
      delete extra.lyDoNghi;
      delete extra.nhomLyDo;
      delete extra.thangBaoCao;
      extra.tinhTrangHopDong = 'Hiệu lực';

      await client.query(
        `UPDATE employees
         SET tinh_trang = 'LV',
             trang_thai_hop_dong = 'Hiệu lực',
             extra_data = $1::jsonb,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [JSON.stringify(extra), emp.id]
      );

      // Đồng thời cập nhật trạng thái làm việc lại thành active trong employee_work_histories
      if (emp.cccd && emp.cccd.trim()) {
        await client.query(
          `UPDATE employee_work_histories
           SET status = 'active',
               end_date = NULL,
               resignation_type = NULL,
               resignation_reason = NULL,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = (
             SELECT id FROM employee_work_histories 
             WHERE LOWER(TRIM(cccd)) = LOWER($1) 
             ORDER BY turn_number DESC LIMIT 1
           )`,
          [emp.cccd.trim()]
        );
      }

      // Đồng thời xóa khỏi đơn thôi việc nếu có
      await client.query(
        `DELETE FROM resignation_applications
         WHERE (employee_id = $1 OR LOWER(TRIM(msnv)) = LOWER($2)) AND owner_id = $3`,
        [emp.id, emp.msnv, WORKSPACE_ID]
      );

      restored.push({
        id: emp.id,
        msnv: emp.msnv,
        fullName: emp.full_name,
        tinhTrang: 'LV',
        trangThaiHopDong: 'Hiệu lực',
        extraData: extra,
      });
    }

    await client.query('COMMIT');
    res.json({ success: true, count: restored.length, restoredEmployees: restored });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Lỗi khôi phục trạng thái nhân viên:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

// =============================================================================
// TẢI FILE MẪU CHỐNG CACHE TRÌNH DUYỆT (NO-CACHE TEMPLATE DOWNLOADS)
// =============================================================================
router.get('/templates/download/salary-contract', (req, res) => {
  const filePath = path.join(process.cwd(), 'public', 'templates', 'DSHĐĐTMau.xlsx');
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: 'File mẫu không tồn tại' });
  }
  const fileBuffer = fs.readFileSync(filePath);
  const now = new Date();
  const timeSuffix = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="DSHDDTMau_${timeSuffix}.xlsx"`);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  res.send(fileBuffer);
});

router.get('/templates/download/employee', (req, res) => {
  const filePath = path.join(process.cwd(), 'public', 'templates', 'FileMauLamTheNV.xlsx');
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: 'File mẫu không tồn tại' });
  }
  const fileBuffer = fs.readFileSync(filePath);
  const now = new Date();
  const timeSuffix = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="FileMauLamTheNV_${timeSuffix}.xlsx"`);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  res.send(fileBuffer);
});

export default router;
