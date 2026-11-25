-- =============================================================================
-- HỆ THỐNG QUẢN LÝ THẺ NHÂN VIÊN VIETSUN
-- SCRIPT KHỞI TẠO CƠ SỞ DỮ LIỆU POSTGRESQL (TƯƠNG THÍCH PGADMIN 4)
-- =============================================================================

-- Hướng dẫn trong pgAdmin 4:
-- 1. Mở pgAdmin 4 -> Chuột phải vào 'Databases' -> Create -> Database...
-- 2. Đặt Database name: hr_manager -> Nhấn Save.
-- 3. Chuột phải vào database 'hr_manager' vừa tạo -> Chọn 'Query Tool'.
-- 4. Dán toàn bộ nội dung file này vào Query Tool -> Nhấn F5 (Execute/Refresh) để chạy.

-- 0. CẤP 1: BẢNG KHỐI (divisions)
CREATE TABLE IF NOT EXISTS divisions (
    id VARCHAR(100) PRIMARY KEY,
    code VARCHAR(50) DEFAULT '',
    name VARCHAR(150) NOT NULL UNIQUE,
    description TEXT DEFAULT '',
    status VARCHAR(30) DEFAULT 'active',
    order_index INT DEFAULT 0,
    owner_id VARCHAR(100) DEFAULT 'workspace_vietsun_dong_nai_v1',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_divisions_owner ON divisions(owner_id);

-- 1. BẢNG PHÒNG BAN CHA (parent_departments - tương thích ngược)
CREATE TABLE IF NOT EXISTS parent_departments (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(150) NOT NULL UNIQUE,
    owner_id VARCHAR(100) DEFAULT 'workspace_vietsun_dong_nai_v1',
    order_index INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE parent_departments ADD COLUMN IF NOT EXISTS order_index INT DEFAULT 0;

-- 2. CẤP 2: BẢNG PHÒNG BAN / BỘ PHẬN (departments - có Ký hiệu PB)
CREATE TABLE IF NOT EXISTS departments (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(150) NOT NULL UNIQUE,
    parent_id VARCHAR(100) REFERENCES parent_departments(id) ON DELETE SET NULL,
    parent_name VARCHAR(150) DEFAULT '',
    division_id VARCHAR(100) REFERENCES divisions(id) ON DELETE SET NULL,
    division_name VARCHAR(150) DEFAULT '',
    code VARCHAR(50) DEFAULT '',
    description TEXT DEFAULT '',
    status VARCHAR(30) DEFAULT 'active',
    owner_id VARCHAR(100) DEFAULT 'workspace_vietsun_dong_nai_v1',
    order_index INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE departments ADD COLUMN IF NOT EXISTS order_index INT DEFAULT 0;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS parent_id VARCHAR(100) REFERENCES parent_departments(id) ON DELETE SET NULL;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS parent_name VARCHAR(150) DEFAULT '';
ALTER TABLE departments ADD COLUMN IF NOT EXISTS division_id VARCHAR(100) REFERENCES divisions(id) ON DELETE SET NULL;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS division_name VARCHAR(150) DEFAULT '';
ALTER TABLE departments ADD COLUMN IF NOT EXISTS code VARCHAR(50) DEFAULT '';
ALTER TABLE departments ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE departments ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'active';
CREATE INDEX IF NOT EXISTS idx_departments_division ON departments(division_id);
CREATE INDEX IF NOT EXISTS idx_departments_code ON departments(code);

-- 3. CẤP 3: BẢNG PHÒNG BAN CON / BỘ PHẬN CON (sub_departments)
CREATE TABLE IF NOT EXISTS sub_departments (
    id VARCHAR(100) PRIMARY KEY,
    department_id VARCHAR(100) REFERENCES departments(id) ON DELETE CASCADE,
    department_name VARCHAR(150) DEFAULT '',
    division_id VARCHAR(100) REFERENCES divisions(id) ON DELETE SET NULL,
    division_name VARCHAR(150) DEFAULT '',
    name VARCHAR(150) NOT NULL,
    description TEXT DEFAULT '',
    status VARCHAR(30) DEFAULT 'active',
    order_index INT DEFAULT 0,
    owner_id VARCHAR(100) DEFAULT 'workspace_vietsun_dong_nai_v1',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sub_departments_dept ON sub_departments(department_id);
CREATE INDEX IF NOT EXISTS idx_sub_departments_owner ON sub_departments(owner_id);

-- 2. BẢNG NHÂN VIÊN (employees)
CREATE TABLE IF NOT EXISTS employees (
    id VARCHAR(100) PRIMARY KEY,
    msnv VARCHAR(50) NOT NULL UNIQUE,
    full_name VARCHAR(150) NOT NULL,
    department VARCHAR(150) NOT NULL,
    join_date VARCHAR(50) NOT NULL,
    photo_url TEXT DEFAULT '',
    print_count INT DEFAULT 1,
    last_printed_at VARCHAR(50) DEFAULT '',
    owner_id VARCHAR(100) DEFAULT 'workspace_vietsun_dong_nai_v1',
    stt VARCHAR(20) DEFAULT '',
    don_vi VARCHAR(100) DEFAULT '',
    tinh_trang VARCHAR(50) DEFAULT '',
    khoi VARCHAR(100) DEFAULT '',
    ky_hieu_pb VARCHAR(50) DEFAULT '',
    phong_ban VARCHAR(150) DEFAULT '',
    phong_ban_con VARCHAR(150) DEFAULT '',
    ho VARCHAR(100) DEFAULT '',
    ten VARCHAR(50) DEFAULT '',
    cong_viec VARCHAR(150) DEFAULT '',
    ngay_vao VARCHAR(50) DEFAULT '',
    ngay_sinh VARCHAR(50) DEFAULT '',
    noi_sinh VARCHAR(150) DEFAULT '',
    nguyen_quan VARCHAR(150) DEFAULT '',
    gioi_tinh VARCHAR(20) DEFAULT '',
    dan_toc VARCHAR(50) DEFAULT '',
    ton_giao VARCHAR(50) DEFAULT '',
    so_nha_thuong_tru VARCHAR(150) DEFAULT '',
    phuong_xa_thuong_tru VARCHAR(150) DEFAULT '',
    tinh_tp_thuong_tru VARCHAR(150) DEFAULT '',
    dia_chi_thuong_tru TEXT DEFAULT '',
    so_nha_tam_tru VARCHAR(150) DEFAULT '',
    phuong_xa_tam_tru VARCHAR(150) DEFAULT '',
    tinh_tp_tam_tru VARCHAR(150) DEFAULT '',
    cccd VARCHAR(50) DEFAULT '',
    ngay_cap_cccd VARCHAR(50) DEFAULT '',
    noi_cap_cccd VARCHAR(150) DEFAULT '',
    ngay_het_han_cccd VARCHAR(50) DEFAULT '',
    trinh_do_van_hoa VARCHAR(50) DEFAULT '',
    trinh_do_chuyen_mon VARCHAR(150) DEFAULT '',
    so_cmnd_cu VARCHAR(50) DEFAULT '',
    trinh_do_ngoai_ngu VARCHAR(100) DEFAULT '',
    tay_nghe VARCHAR(50) DEFAULT '',
    dao_tao VARCHAR(150) DEFAULT '',
    so_dien_thoai VARCHAR(50) DEFAULT '',
    tinh_trang_hon_nhan VARCHAR(50) DEFAULT '',
    suc_khoe VARCHAR(50) DEFAULT '',
    gioi_thieu VARCHAR(150) DEFAULT '',
    bo_phan VARCHAR(150) DEFAULT '',
    loai_hd VARCHAR(50) DEFAULT '',
    thoi_han VARCHAR(50) DEFAULT '',
    phan_loai VARCHAR(50) DEFAULT '',
    so_hd VARCHAR(50) DEFAULT '',
    tu_ngay VARCHAR(50) DEFAULT '',
    den_ngay VARCHAR(50) DEFAULT '',
    khoi2 VARCHAR(100) DEFAULT '',
    chuc_vu VARCHAR(100) DEFAULT '',
    extra_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 7. BẢNG MẪU VĂN BẢN WORD (document_templates)
CREATE TABLE IF NOT EXISTS document_templates (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) DEFAULT 'Hồ sơ',
    file_name VARCHAR(255) DEFAULT '',
    file_size INT DEFAULT 0,
    content_html TEXT DEFAULT '',
    raw_text TEXT DEFAULT '',
    file_data_base64 TEXT DEFAULT '',
    owner_id VARCHAR(100) DEFAULT 'workspace_vietsun_dong_nai_v1',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. BẢNG MẪU THẺ (card_templates)
CREATE TABLE IF NOT EXISTS card_templates (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    layout_style VARCHAR(50) DEFAULT 'vietsun_table',
    orientation VARCHAR(20) DEFAULT 'landscape',
    primary_color VARCHAR(30) DEFAULT '#57534e',
    secondary_color VARCHAR(30) DEFAULT '#f59e0b',
    background_color VARCHAR(30) DEFAULT '#ffffff',
    text_color VARCHAR(30) DEFAULT '#1c1917',
    border_color VARCHAR(30) DEFAULT '#292524',
    font_family VARCHAR(150) DEFAULT '''Noto Serif'', ''Times New Roman'', serif',
    company_branch VARCHAR(255) DEFAULT 'VIETSUN ĐỒNG NAI',
    company_name_line1 VARCHAR(255) DEFAULT 'CHI NHÁNH CÔNG TY CỔ PHẦN',
    company_name_line2 VARCHAR(255) DEFAULT 'ĐẦU TƯ MẶT TRỜI VIỆT',
    company_tagline VARCHAR(255) DEFAULT 'Warming Your Life',
    logo_text VARCHAR(100) DEFAULT 'VIETSUN',
    logo_url TEXT DEFAULT '/assets/aistudio/VIETSUN_b5e42dd9.png',
    show_stamp BOOLEAN DEFAULT false,
    stamp_opacity NUMERIC DEFAULT 0,
    stamp_offset_x NUMERIC DEFAULT 0,
    stamp_offset_y NUMERIC DEFAULT 0,
    name_font_size NUMERIC DEFAULT 13.5,
    msnv_font_size NUMERIC DEFAULT 14,
    dept_font_size NUMERIC DEFAULT 12.5,
    date_font_size NUMERIC DEFAULT 12,
    header_font_size NUMERIC DEFAULT 8.5,
    dept_prefix VARCHAR(50) DEFAULT '',
    photo_bg_color VARCHAR(30) DEFAULT '#ffffff',
    photo_width_percent NUMERIC DEFAULT 22.5,
    name_offset_y NUMERIC DEFAULT 0,
    msnv_offset_y NUMERIC DEFAULT 0,
    dept_offset_y NUMERIC DEFAULT 0,
    date_offset_y NUMERIC DEFAULT 0,
    back_title TEXT DEFAULT '',
    back_rules TEXT DEFAULT '',
    back_address TEXT DEFAULT '',
    back_phone TEXT DEFAULT '',
    show_qr_on_back BOOLEAN DEFAULT false,
    is_default BOOLEAN DEFAULT false,
    owner_id VARCHAR(100) DEFAULT 'workspace_vietsun_dong_nai_v1',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. BẢNG NHẬT KÝ IMPORT EXCEL (import_logs)
CREATE TABLE IF NOT EXISTS import_logs (
    id VARCHAR(100) PRIMARY KEY,
    file_name VARCHAR(255) NOT NULL,
    import_mode VARCHAR(50) DEFAULT 'add_only',
    total_rows INT DEFAULT 0,
    valid_count INT DEFAULT 0,
    error_count INT DEFAULT 0,
    imported_count INT DEFAULT 0,
    updated_count INT DEFAULT 0,
    summary_note TEXT DEFAULT '',
    owner_id VARCHAR(100) DEFAULT 'workspace_vietsun_dong_nai_v1',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 5. BẢNG NHẬT KÝ IN THẺ (print_logs)
CREATE TABLE IF NOT EXISTS print_logs (
    id VARCHAR(100) PRIMARY KEY,
    print_mode VARCHAR(50) DEFAULT 'a4_grid',
    template_name VARCHAR(150) DEFAULT '',
    total_cards INT DEFAULT 0,
    total_pages INT DEFAULT 1,
    paper_size VARCHAR(50) DEFAULT 'A4',
    duplex BOOLEAN DEFAULT false,
    employee_summary TEXT DEFAULT '',
    owner_id VARCHAR(100) DEFAULT 'workspace_vietsun_dong_nai_v1',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 6. BẢNG CÀI ĐẶT HỆ THỐNG (app_settings)
CREATE TABLE IF NOT EXISTS app_settings (
    id VARCHAR(100) PRIMARY KEY,
    company_name VARCHAR(255) DEFAULT 'CÔNG TY CP ĐẦU TƯ MẶT TRỜI VIỆT',
    company_branch VARCHAR(255) DEFAULT 'VIETSUN ĐỒNG NAI',
    company_sub_name VARCHAR(255) DEFAULT '',
    logo_url TEXT DEFAULT '/assets/aistudio/VIETSUN_b5e42dd9.png',
    default_paper_size VARCHAR(20) DEFAULT 'A4',
    default_cols INT DEFAULT 2,
    default_rows INT DEFAULT 5,
    default_gap_mm NUMERIC DEFAULT 0,
    default_margin_mm NUMERIC DEFAULT 0,
    card_width_mm NUMERIC DEFAULT 85.6,
    card_height_mm NUMERIC DEFAULT 54.0,
    owner_id VARCHAR(100) DEFAULT 'workspace_vietsun_dong_nai_v1',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- CHỈ MỤC (INDEXES) TỐI ƯU TRUY VẤN
CREATE INDEX IF NOT EXISTS idx_employees_msnv ON employees(msnv);
CREATE INDEX IF NOT EXISTS idx_employees_dept ON employees(department);
CREATE INDEX IF NOT EXISTS idx_employees_owner ON employees(owner_id);
CREATE INDEX IF NOT EXISTS idx_departments_owner ON departments(owner_id);
CREATE INDEX IF NOT EXISTS idx_templates_owner ON card_templates(owner_id);
CREATE INDEX IF NOT EXISTS idx_import_logs_owner ON import_logs(owner_id);
CREATE INDEX IF NOT EXISTS idx_print_logs_owner ON print_logs(owner_id);

-- DỮ LIỆU MẪU BAN ĐẦU (SEED DATA)
-- 1. Phòng ban mặc định
INSERT INTO departments (id, name, owner_id)
VALUES
    ('dept_1', 'BGĐ', 'workspace_vietsun_dong_nai_v1'),
    ('dept_2', 'BP. Bảo trì vận hành', 'workspace_vietsun_dong_nai_v1'),
    ('dept_3', 'BP. Hành chính - Nhân sự', 'workspace_vietsun_dong_nai_v1'),
    ('dept_4', 'BP. Kế toán - Tài chính', 'workspace_vietsun_dong_nai_v1'),
    ('dept_5', 'BP. Sản xuất - Kỹ thuật', 'workspace_vietsun_dong_nai_v1'),
    ('dept_6', 'BP. Kho vận - Logistics', 'workspace_vietsun_dong_nai_v1'),
    ('dept_7', 'BP. Kiểm soát chất lượng (QC)', 'workspace_vietsun_dong_nai_v1'),
    ('dept_8', 'BP. Kinh doanh - Xuất nhập khẩu', 'workspace_vietsun_dong_nai_v1')
ON CONFLICT (name) DO NOTHING;

-- 2. Mẫu thẻ mặc định (Chuẩn VIETSUN Đồng Nai, Corporate Xanh, Đứng CR80)
INSERT INTO card_templates (
    id, name, layout_style, orientation, primary_color, secondary_color, background_color, text_color, border_color,
    font_family, company_branch, company_name_line1, company_name_line2, company_tagline, logo_text, logo_url,
    show_stamp, stamp_opacity, stamp_offset_x, stamp_offset_y, name_font_size, msnv_font_size, dept_font_size,
    date_font_size, header_font_size, dept_prefix, photo_bg_color, photo_width_percent, name_offset_y, msnv_offset_y,
    dept_offset_y, date_offset_y, back_title, back_rules, back_address, back_phone, show_qr_on_back, is_default, owner_id
)
VALUES
(
    'tpl_vietsun_table_default',
    'Mẫu chuẩn VIETSUN ĐỒNG NAI (Khung bảng)',
    'vietsun_table', 'landscape', '#57534e', '#f59e0b', '#ffffff', '#1c1917', '#292524',
    '''Noto Serif'', ''Times New Roman'', serif', 'VIETSUN ĐỒNG NAI', 'CHI NHÁNH CÔNG TY CỔ PHẦN', 'ĐẦU TƯ MẶT TRỜI VIỆT',
    'Warming Your Life', 'VIETSUN', '/assets/aistudio/VIETSUN_b5e42dd9.png',
    false, 0, 0, 0, 13.5, 14, 12.5, 12, 8.5, '', '#ffffff', 22.5, 0, 0, 0, 0,
    '', '', '', '', false, true, 'workspace_vietsun_dong_nai_v1'
),
(
    'tpl_modern_corporate',
    'Mẫu Doanh Nghiệp Hiện Đại (Xanh Dương)',
    'modern_corporate', 'landscape', '#1d4ed8', '#3b82f6', '#ffffff', '#0f172a', '#cbd5e1',
    '''Plus Jakarta Sans'', sans-serif', 'VIETSUN ĐỒNG NAI', 'CHI NHÁNH CÔNG TY CỔ PHẦN', 'ĐẦU TƯ MẶT TRỜI VIỆT',
    'Warming Your Life', 'VIETSUN', '/assets/aistudio/VIETSUN_b5e42dd9.png',
    false, 0.7, 0, 0, 13, 12, 11, 10, 8, 'Bộ phận: ', '#ffffff', 30, 0, 0, 0, 0,
    'QUY ĐỊNH SỬ DỤNG THẺ NHÂN VIÊN',
    '1. Nhân viên đeo thẻ trong suốt giờ làm việc.\n2. Bảo quản thẻ cẩn thận, không bẻ cong hoặc làm trầy xước.\n3. Nhặt được thẻ vui lòng liên hệ Phòng Nhân sự.',
    'Chi nhánh Đồng Nai - Công ty Cổ phần Đầu tư Mặt Trời Việt', 'ĐT: (0251) 388 9999', true, false, 'workspace_vietsun_dong_nai_v1'
),
(
    'tpl_minimal_vertical',
    'Mẫu Thẻ Đứng Hiện Đại (Portrait CR80)',
    'minimal_vertical', 'portrait', '#1e40af', '#f59e0b', '#ffffff', '#0f172a', '#94a3b8',
    '''Plus Jakarta Sans'', sans-serif', 'VIETSUN ĐỒNG NAI', 'CÔNG TY CP ĐẦU TƯ MẶT TRỜI VIỆT', 'THẺ NHÂN VIÊN',
    'Warming Your Life', 'VIETSUN', '/assets/aistudio/VIETSUN_b5e42dd9.png',
    false, 0.75, 0, 0, 13, 12, 11, 10, 8, '', '#ffffff', 35, 0, 0, 0, 0,
    'THÔNG TIN & QUY ĐỊNH',
    '1. Đeo thẻ khi ra vào cổng và trong suốt ca làm việc.\n2. Không tự ý tẩy xóa, dán đè lên bề mặt thẻ.\n3. Liên hệ Phòng Nhân sự nếu thất lạc thẻ.',
    'Chi nhánh Đồng Nai - Công ty Cổ phần Đầu tư Mặt Trời Việt', 'ĐT: (0251) 388 9999', true, false, 'workspace_vietsun_dong_nai_v1'
)
ON CONFLICT (id) DO NOTHING;

-- 3. Cài đặt hệ thống mặc định
INSERT INTO app_settings (
    id, company_name, company_branch, company_sub_name, logo_url,
    default_paper_size, default_cols, default_rows, default_gap_mm, default_margin_mm,
    card_width_mm, card_height_mm, owner_id
)
VALUES (
    'settings_vietsun_default',
    'CÔNG TY CP ĐẦU TƯ MẶT TRỜI VIỆT',
    'VIETSUN ĐỒNG NAI',
    '',
    '/assets/aistudio/VIETSUN_b5e42dd9.png',
    'A4', 2, 5, 0, 0, 85.6, 54.0,
    'workspace_vietsun_dong_nai_v1'
)
ON CONFLICT (id) DO NOTHING;

-- 4. Nhân viên mẫu VietSun Đồng Nai
INSERT INTO employees (id, msnv, full_name, department, join_date, photo_url, print_count, last_printed_at, owner_id)
VALUES
    ('emp_90993', '90993', 'TRƯƠNG MINH HIẾU', 'BP. Bảo trì vận hành', '02/10/2025', '', 1, '02/10/2025', 'workspace_vietsun_dong_nai_v1'),
    ('emp_90994', '90994', 'NGUYỄN VĂN HOÀNG', 'BP. Bảo trì vận hành', '05/10/2026', '', 1, '05/10/2026', 'workspace_vietsun_dong_nai_v1'),
    ('emp_90995', '90995', 'TRẦN THỊ MINH TÂM', 'BP. Kế toán - Tài chính', '12/09/2026', '', 1, '12/09/2026', 'workspace_vietsun_dong_nai_v1'),
    ('emp_90996', '90996', 'LÊ QUỐC KHÁNH', 'BP. Sản xuất - Kỹ thuật', '15/08/2026', '', 1, '15/08/2026', 'workspace_vietsun_dong_nai_v1'),
    ('emp_90997', '90997', 'PHẠM THỊ THU HÀ', 'BP. Hành chính - Nhân sự', '01/06/2026', '', 1, '01/06/2026', 'workspace_vietsun_dong_nai_v1'),
    ('emp_90998', '90998', 'ĐỖ ĐỨC THẮNG', 'BP. Kho vận - Logistics', '20/10/2026', '', 1, '20/10/2026', 'workspace_vietsun_dong_nai_v1'),
    ('emp_90999', '90999', 'VŨ HOÀNG NAM', 'BP. Kiểm soát chất lượng (QC)', '25/10/2026', '', 1, '25/10/2026', 'workspace_vietsun_dong_nai_v1'),
    ('emp_91000', '91000', 'HOÀNG THỊ NGỌC ANH', 'BP. Kinh doanh - Xuất nhập khẩu', '01/11/2026', '', 1, '01/11/2026', 'workspace_vietsun_dong_nai_v1')
ON CONFLICT (msnv) DO NOTHING;
