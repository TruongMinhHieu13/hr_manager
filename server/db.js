import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const { Pool, Client } = pg;

const DB_USER = process.env.DB_USER || 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD || '123456';
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT || '5432', 10);
const DB_NAME = process.env.DB_NAME || 'hr_manager';

export const connectionString =
  process.env.DATABASE_URL ||
  `postgresql://${DB_USER}:${encodeURIComponent(DB_PASSWORD)}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;

export const pool = new Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

/**
 * Tự động kiểm tra và tạo database `hr_manager` nếu chưa có trên PostgreSQL Server
 */
export async function ensureDatabaseExists() {
  const adminClient = new Client({
    user: DB_USER,
    password: DB_PASSWORD,
    host: DB_HOST,
    port: DB_PORT,
    database: 'postgres', // Kết nối vào database mặc định của postgres
  });

  try {
    await adminClient.connect();
    const res = await adminClient.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [DB_NAME]
    );
    if (res.rowCount === 0) {
      console.log(`[PostgreSQL] Database "${DB_NAME}" chưa tồn tại. Đang tự động tạo...`);
      // CREATE DATABASE không cho phép dùng tham số $1 trong câu lệnh SQL
      await adminClient.query(`CREATE DATABASE "${DB_NAME}"`);
      console.log(`[PostgreSQL] Tạo thành công database "${DB_NAME}"!`);
    } else {
      console.log(`[PostgreSQL] Database "${DB_NAME}" đã sẵn sàng.`);
    }
  } catch (err) {
    console.warn(`[PostgreSQL] Kiểm tra tạo database:`, err.message);
  } finally {
    try {
      await adminClient.end();
    } catch {}
  }
}

/**
 * Tự động tạo các bảng và dữ liệu mẫu nếu chưa có
 */
export async function initTables() {
  await ensureDatabaseExists();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 0. divisions (Cấp 1: Khối)
    await client.query(`
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
    `);

    // 0.1 parent_departments (Giữ lại để tương thích ngược nếu cần)
    await client.query(`
      CREATE TABLE IF NOT EXISTS parent_departments (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(150) NOT NULL UNIQUE,
        owner_id VARCHAR(100) DEFAULT 'workspace_vietsun_dong_nai_v1',
        order_index INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE parent_departments ADD COLUMN IF NOT EXISTS order_index INT DEFAULT 0;
    `);

    // 1. departments (Cấp 2: Phòng ban / Bộ phận có Ký hiệu PB)
    await client.query(`
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
    `);

    // 1.1 sub_departments (Cấp 3: Phòng ban con / Bộ phận con)
    await client.query(`
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
    `);

    // 2. employees
    await client.query(`
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
    `);

    // Tự động bổ sung các cột mới nếu bảng employees đã tồn tại từ trước
    await client.query(`
      DO $$
      BEGIN
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS stt VARCHAR(20) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS don_vi VARCHAR(100) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS tinh_trang VARCHAR(50) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS khoi VARCHAR(100) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS ky_hieu_pb VARCHAR(50) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS phong_ban VARCHAR(150) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS phong_ban_con VARCHAR(150) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS ho VARCHAR(100) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS ten VARCHAR(50) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS cong_viec VARCHAR(150) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS ngay_vao VARCHAR(50) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS ngay_sinh VARCHAR(50) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS noi_sinh VARCHAR(150) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS nguyen_quan VARCHAR(150) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS gioi_tinh VARCHAR(20) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS dan_toc VARCHAR(50) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS ton_giao VARCHAR(50) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS so_nha_thuong_tru VARCHAR(150) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS phuong_xa_thuong_tru VARCHAR(150) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS tinh_tp_thuong_tru VARCHAR(150) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS dia_chi_thuong_tru TEXT DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS so_nha_tam_tru VARCHAR(150) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS phuong_xa_tam_tru VARCHAR(150) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS tinh_tp_tam_tru VARCHAR(150) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS cccd VARCHAR(50) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS ngay_cap_cccd VARCHAR(50) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS noi_cap_cccd VARCHAR(150) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS ngay_het_han_cccd VARCHAR(50) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS trinh_do_van_hoa VARCHAR(50) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS trinh_do_chuyen_mon VARCHAR(150) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS so_cmnd_cu VARCHAR(50) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS trinh_do_ngoai_ngu VARCHAR(100) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS tay_nghe VARCHAR(50) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS dao_tao VARCHAR(150) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS so_dien_thoai VARCHAR(50) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS tinh_trang_hon_nhan VARCHAR(50) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS suc_khoe VARCHAR(50) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS gioi_thieu VARCHAR(150) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS bo_phan VARCHAR(150) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS loai_hd VARCHAR(50) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS thoi_han VARCHAR(50) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS phan_loai VARCHAR(50) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS so_hd VARCHAR(50) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS tu_ngay VARCHAR(50) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS den_ngay VARCHAR(50) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS khoi2 VARCHAR(100) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS chuc_vu VARCHAR(100) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS division_id VARCHAR(100) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS department_id VARCHAR(100) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS sub_department_id VARCHAR(100) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS extra_data JSONB DEFAULT '{}'::jsonb;
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS luong_thu_viec VARCHAR(100) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS luong_chinh_thuc VARCHAR(100) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS bac_luong VARCHAR(50) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS ngach_luong VARCHAR(100) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS ghi_chu_hop_dong TEXT DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS trang_thai_hop_dong VARCHAR(50) DEFAULT 'Hiệu lực';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS da_ky_hop_dong BOOLEAN DEFAULT false;
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS ngay_ky_hop_dong VARCHAR(50) DEFAULT '';
      END $$;

      CREATE INDEX IF NOT EXISTS idx_employees_msnv ON employees(msnv);
      CREATE INDEX IF NOT EXISTS idx_employees_cccd ON employees(cccd);
      DO $$
      BEGIN
        CREATE UNIQUE INDEX IF NOT EXISTS uq_employees_cccd 
        ON employees(LOWER(TRIM(cccd))) 
        WHERE cccd IS NOT NULL AND TRIM(cccd) <> '';
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Không thể tạo unique index uq_employees_cccd: %', SQLERRM;
      END $$;
    `);

    // 3. card_templates
    await client.query(`
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
    `);

    // 4. import_logs
    await client.query(`
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
    `);

    // 5. print_logs
    await client.query(`
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
    `);

    // 6. app_settings
    await client.query(`
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
    `);

    // 7. document_templates (Mẫu văn bản Word / Hợp đồng / Quyết định)
    await client.query(`
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
    `);

    // 8. resignation_applications (Đơn xin nghỉ việc & Thôi việc)
    await client.query(`
      CREATE TABLE IF NOT EXISTS resignation_applications (
        id VARCHAR(100) PRIMARY KEY,
        employee_id VARCHAR(100),
        msnv VARCHAR(50) NOT NULL,
        full_name VARCHAR(150) NOT NULL,
        don_vi VARCHAR(255) DEFAULT '',
        vi_tri VARCHAR(255) DEFAULT '',
        so_hd VARCHAR(100) DEFAULT '',
        loai_hd VARCHAR(100) DEFAULT '',
        nhom_ly_do VARCHAR(150) DEFAULT 'Định hướng cá nhân',
        ly_do VARCHAR(255) DEFAULT '',
        ngay_nghi VARCHAR(50) DEFAULT '',
        ngay_hen_tra_luong VARCHAR(50) DEFAULT '',
        thang_bao_cao VARCHAR(50) DEFAULT '',
        nguoi_duyet VARCHAR(150) DEFAULT '',
        y_kien TEXT DEFAULT '',
        dien_giai TEXT DEFAULT '',
        so_quyet_dinh VARCHAR(100) DEFAULT '',
        quy_trinh_thoi_viec VARCHAR(150) DEFAULT 'Quy trình bàn giao tiêu chuẩn',
        trang_thai VARCHAR(50) DEFAULT 'Đang thực hiện',
        noi_dung_bo_sung TEXT DEFAULT '',
        danh_sach_cong_viec JSONB DEFAULT '[]'::jsonb,
        tai_lieu_dinh_kem JSONB DEFAULT '[]'::jsonb,
        owner_id VARCHAR(100) DEFAULT 'workspace_vietsun_dong_nai_v1',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      ALTER TABLE resignation_applications 
      ALTER COLUMN so_quyet_dinh DROP NOT NULL,
      ALTER COLUMN so_quyet_dinh SET DEFAULT '',
      ADD COLUMN IF NOT EXISTS ngay_hen_tra_luong VARCHAR(50) DEFAULT '',
      ADD COLUMN IF NOT EXISTS thang_bao_cao VARCHAR(50) DEFAULT '';
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_resignation_msnv ON resignation_applications(msnv);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_resignation_trang_thai ON resignation_applications(trang_thai);`);

    // 9. contracts (Lịch sử Hợp đồng lao động & Tái ký)
    await client.query(`
      CREATE TABLE IF NOT EXISTS contracts (
        id VARCHAR(100) PRIMARY KEY,
        employee_id VARCHAR(100) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        msnv VARCHAR(50) DEFAULT '',
        full_name VARCHAR(150) DEFAULT '',
        contract_number VARCHAR(100) DEFAULT '',
        contract_type VARCHAR(100) NOT NULL,
        contract_type_name VARCHAR(150) DEFAULT '',
        duration VARCHAR(50) DEFAULT '',
        start_date VARCHAR(50) NOT NULL,
        end_date VARCHAR(50) DEFAULT '',
        status VARCHAR(50) DEFAULT 'Hiệu lực',
        note TEXT DEFAULT '',
        owner_id VARCHAR(100) DEFAULT 'workspace_vietsun_dong_nai_v1',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_contracts_employee_id ON contracts(employee_id);
      CREATE INDEX IF NOT EXISTS idx_contracts_msnv ON contracts(msnv);
      CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);

      ALTER TABLE contracts ADD COLUMN IF NOT EXISTS salary VARCHAR(100) DEFAULT '';
      ALTER TABLE contracts ADD COLUMN IF NOT EXISTS probation_salary VARCHAR(100) DEFAULT '';
      ALTER TABLE contracts ADD COLUMN IF NOT EXISTS bac_luong VARCHAR(50) DEFAULT '';
      ALTER TABLE contracts ADD COLUMN IF NOT EXISTS ngach_luong VARCHAR(50) DEFAULT '';
      ALTER TABLE contracts ADD COLUMN IF NOT EXISTS department VARCHAR(150) DEFAULT '';
      ALTER TABLE contracts ADD COLUMN IF NOT EXISTS position VARCHAR(150) DEFAULT '';
      ALTER TABLE contracts ADD COLUMN IF NOT EXISTS sign_date VARCHAR(50) DEFAULT '';
      ALTER TABLE contracts ADD COLUMN IF NOT EXISTS extra_data JSONB DEFAULT '{}'::jsonb;

      -- Chuỗi số hợp đồng tự động tăng dần bắt đầu từ 1080
      CREATE SEQUENCE IF NOT EXISTS contract_number_seq START WITH 1080 INCREMENT BY 1;
    `);

    // Indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_employees_msnv ON employees(msnv);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_employees_dept ON employees(department);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_employees_owner ON employees(owner_id);`);

    // Tự động Seed dữ liệu mặc định 3 cấp chỉ khi có cấu hình SEED_DEMO_DATA=true
    if (process.env.SEED_DEMO_DATA === 'true') {
      const divCheck = await client.query('SELECT COUNT(*) FROM divisions');
      if (parseInt(divCheck.rows[0].count, 10) === 0) {
        console.log('[PostgreSQL] Đang nạp dữ liệu mẫu cấu trúc tổ chức 3 cấp (Khối -> Phòng ban -> Phòng ban con)...');
        await client.query(`
          INSERT INTO divisions (id, code, name, description, status, order_index, owner_id) VALUES
            ('div_bod', 'BOD', 'Khối Ban Giám Đốc', 'Cấp lãnh đạo cao nhất điều hành chi nhánh', 'active', 1, 'workspace_vietsun_dong_nai_v1'),
            ('div_vp', 'VP', 'Khối Văn Phòng', 'Khối các phòng ban khối hành chính, văn phòng, hỗ trợ', 'active', 2, 'workspace_vietsun_dong_nai_v1'),
            ('div_ktsx', 'KTSX', 'Khối Kỹ Thuật & Sản Xuất', 'Khối các xưởng sản xuất, kỹ thuật may, kho bãi', 'active', 3, 'workspace_vietsun_dong_nai_v1')
          ON CONFLICT (name) DO NOTHING;
        `);

        await client.query(`
          INSERT INTO departments (id, name, code, division_id, division_name, description, status, order_index, owner_id) VALUES
            ('dept_bod', 'Ban Giám Đốc', 'BGĐ', 'div_bod', 'Khối Ban Giám Đốc', 'Ban Giám Đốc Điều hành Chi nhánh', 'active', 1, 'workspace_vietsun_dong_nai_v1'),
            ('dept_btvh', 'Phòng Bảo trì vận hành', 'P6', 'div_vp', 'Khối Văn Phòng', 'Bảo trì máy móc thiết bị, cơ sở hạ tầng, hệ thống kỹ thuật', 'active', 2, 'workspace_vietsun_dong_nai_v1'),
            ('dept_hcns', 'Phòng Hành chính - Nhân sự', 'HCNS', 'div_vp', 'Khối Văn Phòng', 'Quản trị nhân sự, tuyển dụng, đào tạo, hành chính tổng hợp', 'active', 3, 'workspace_vietsun_dong_nai_v1'),
            ('dept_kttc', 'Phòng Kế toán - Tài chính', 'KTTC', 'div_vp', 'Khối Văn Phòng', 'Quản lý tài chính kế toán, thuế, thu chi ngân sách', 'active', 4, 'workspace_vietsun_dong_nai_v1'),
            ('dept_kdxnk', 'Phòng Kinh doanh - Xuất nhập khẩu', 'KDXNK', 'div_vp', 'Khối Văn Phòng', 'Kinh doanh, phát triển thị trường, thủ tục xuất nhập khẩu', 'active', 5, 'workspace_vietsun_dong_nai_v1'),
            ('dept_sxkt', 'Phòng Sản xuất - Kỹ thuật', 'SXKT', 'div_ktsx', 'Khối Kỹ Thuật & Sản Xuất', 'Điều hành kế hoạch sản xuất may mặc và kỹ thuật công nghệ', 'active', 6, 'workspace_vietsun_dong_nai_v1'),
            ('dept_qc', 'Phòng Kiểm soát chất lượng (QC)', 'QC', 'div_ktsx', 'Khối Kỹ Thuật & Sản Xuất', 'Kiểm soát chất lượng bán thành phẩm và thành phẩm may xuất khẩu', 'active', 7, 'workspace_vietsun_dong_nai_v1'),
            ('dept_kho', 'Phòng Kho vận - Logistics', 'KHO', 'div_ktsx', 'Khối Kỹ Thuật & Sản Xuất', 'Quản lý kho nguyên phụ liệu, kho phụ liệu và kho thành phẩm', 'active', 8, 'workspace_vietsun_dong_nai_v1')
          ON CONFLICT (name) DO NOTHING;
        `);

        await client.query(`
          INSERT INTO sub_departments (id, department_id, department_name, division_id, division_name, name, status, order_index, owner_id) VALUES
            ('sub_bod_1', 'dept_bod', 'Ban Giám Đốc', 'div_bod', 'Khối Ban Giám Đốc', 'Ban Giám Đốc', 'active', 1, 'workspace_vietsun_dong_nai_v1'),
            ('sub_btvh_1', 'dept_btvh', 'Phòng Bảo trì vận hành', 'div_vp', 'Khối Văn Phòng', 'BP. Bảo trì vận hành', 'active', 1, 'workspace_vietsun_dong_nai_v1'),
            ('sub_btvh_2', 'dept_btvh', 'Phòng Bảo trì vận hành', 'div_vp', 'Khối Văn Phòng', 'BP. Công nghệ thông tin (IT)', 'active', 2, 'workspace_vietsun_dong_nai_v1'),
            ('sub_hcns_1', 'dept_hcns', 'Phòng Hành chính - Nhân sự', 'div_vp', 'Khối Văn Phòng', 'BP. Hành chính', 'active', 1, 'workspace_vietsun_dong_nai_v1'),
            ('sub_hcns_2', 'dept_hcns', 'Phòng Hành chính - Nhân sự', 'div_vp', 'Khối Văn Phòng', 'BP. Tuyển dụng - Đào tạo', 'active', 2, 'workspace_vietsun_dong_nai_v1'),
            ('sub_hcns_3', 'dept_hcns', 'Phòng Hành chính - Nhân sự', 'div_vp', 'Khối Văn Phòng', 'BP. Tiền lương & Phúc lợi (C&B)', 'active', 3, 'workspace_vietsun_dong_nai_v1'),
            ('sub_kttc_1', 'dept_kttc', 'Phòng Kế toán - Tài chính', 'div_vp', 'Khối Văn Phòng', 'BP. Kế toán tổng hợp', 'active', 1, 'workspace_vietsun_dong_nai_v1'),
            ('sub_kttc_2', 'dept_kttc', 'Phòng Kế toán - Tài chính', 'div_vp', 'Khối Văn Phòng', 'BP. Kế toán thanh toán', 'active', 2, 'workspace_vietsun_dong_nai_v1'),
            ('sub_kttc_3', 'dept_kttc', 'Phòng Kế toán - Tài chính', 'div_vp', 'Khối Văn Phòng', 'BP. Thủ quỹ', 'active', 3, 'workspace_vietsun_dong_nai_v1'),
            ('sub_kdxnk_1', 'dept_kdxnk', 'Phòng Kinh doanh - Xuất nhập khẩu', 'div_vp', 'Khối Văn Phòng', 'BP. Kinh doanh nội địa', 'active', 1, 'workspace_vietsun_dong_nai_v1'),
            ('sub_kdxnk_2', 'dept_kdxnk', 'Phòng Kinh doanh - Xuất nhập khẩu', 'div_vp', 'Khối Văn Phòng', 'BP. Xuất nhập khẩu', 'active', 2, 'workspace_vietsun_dong_nai_v1'),
            ('sub_sxkt_1', 'dept_sxkt', 'Phòng Sản xuất - Kỹ thuật', 'div_ktsx', 'Khối Kỹ Thuật & Sản Xuất', 'BP. Kỹ thuật chuyền', 'active', 1, 'workspace_vietsun_dong_nai_v1'),
            ('sub_sxkt_2', 'dept_sxkt', 'Phòng Sản xuất - Kỹ thuật', 'div_ktsx', 'Khối Kỹ Thuật & Sản Xuất', 'Xưởng May 01', 'active', 2, 'workspace_vietsun_dong_nai_v1'),
            ('sub_sxkt_3', 'dept_sxkt', 'Phòng Sản xuất - Kỹ thuật', 'div_ktsx', 'Khối Kỹ Thuật & Sản Xuất', 'Xưởng May 02', 'active', 3, 'workspace_vietsun_dong_nai_v1'),
            ('sub_sxkt_4', 'dept_sxkt', 'Phòng Sản xuất - Kỹ thuật', 'div_ktsx', 'Khối Kỹ Thuật & Sản Xuất', 'Xưởng May 03', 'active', 4, 'workspace_vietsun_dong_nai_v1'),
            ('sub_qc_1', 'dept_qc', 'Phòng Kiểm soát chất lượng (QC)', 'div_ktsx', 'Khối Kỹ Thuật & Sản Xuất', 'BP. QA Chất lượng', 'active', 1, 'workspace_vietsun_dong_nai_v1'),
            ('sub_qc_2', 'dept_qc', 'Phòng Kiểm soát chất lượng (QC)', 'div_ktsx', 'Khối Kỹ Thuật & Sản Xuất', 'BP. QC May chuyền', 'active', 2, 'workspace_vietsun_dong_nai_v1'),
            ('sub_qc_3', 'dept_qc', 'Phòng Kiểm soát chất lượng (QC)', 'div_ktsx', 'Khối Kỹ Thuật & Sản Xuất', 'BP. KCS Hoàn thiện', 'active', 3, 'workspace_vietsun_dong_nai_v1'),
            ('sub_kho_1', 'dept_kho', 'Phòng Kho vận - Logistics', 'div_ktsx', 'Khối Kỹ Thuật & Sản Xuất', 'BP. Kho nguyên phụ liệu', 'active', 1, 'workspace_vietsun_dong_nai_v1'),
            ('sub_kho_2', 'dept_kho', 'Phòng Kho vận - Logistics', 'div_ktsx', 'Khối Kỹ Thuật & Sản Xuất', 'BP. Kho thành phẩm', 'active', 2, 'workspace_vietsun_dong_nai_v1'),
            ('sub_kho_3', 'dept_kho', 'Phòng Kho vận - Logistics', 'div_ktsx', 'Khối Kỹ Thuật & Sản Xuất', 'BP. Đóng gói & Bốc xếp', 'active', 3, 'workspace_vietsun_dong_nai_v1')
          ON CONFLICT (id) DO NOTHING;
        `);
      }
    }

    const tplCheck = await client.query('SELECT COUNT(*) FROM card_templates');
    if (parseInt(tplCheck.rows[0].count, 10) === 0) {
      console.log('[PostgreSQL] Đang nạp các mẫu thẻ mẫu...');
      await client.query(`
        INSERT INTO card_templates (
          id, name, layout_style, orientation, primary_color, secondary_color, background_color, text_color, border_color,
          font_family, company_branch, company_name_line1, company_name_line2, company_tagline, logo_text, logo_url,
          show_stamp, stamp_opacity, stamp_offset_x, stamp_offset_y, name_font_size, msnv_font_size, dept_font_size,
          date_font_size, header_font_size, dept_prefix, photo_bg_color, photo_width_percent, name_offset_y, msnv_offset_y,
          dept_offset_y, date_offset_y, back_title, back_rules, back_address, back_phone, show_qr_on_back, is_default, owner_id
        ) VALUES
        (
          'tpl_vietsun_table_default', 'Mẫu chuẩn VIETSUN ĐỒNG NAI (Khung bảng)', 'vietsun_table', 'landscape',
          '#57534e', '#f59e0b', '#ffffff', '#1c1917', '#292524', '''Noto Serif'', ''Times New Roman'', serif',
          'VIETSUN ĐỒNG NAI', 'CHI NHÁNH CÔNG TY CỔ PHẦN', 'ĐẦU TƯ MẶT TRỜI VIỆT', 'Warming Your Life',
          'VIETSUN', '/assets/aistudio/VIETSUN_b5e42dd9.png', false, 0, 0, 0, 13.5, 14, 12.5, 12, 8.5, '',
          '#ffffff', 22.5, 0, 0, 0, 0, '', '', '', '', false, true, 'workspace_vietsun_dong_nai_v1'
        ),
        (
          'tpl_modern_corporate', 'Mẫu Doanh Nghiệp Hiện Đại (Xanh Dương)', 'modern_corporate', 'landscape',
          '#1d4ed8', '#3b82f6', '#ffffff', '#0f172a', '#cbd5e1', '''Plus Jakarta Sans'', sans-serif',
          'VIETSUN ĐỒNG NAI', 'CHI NHÁNH CÔNG TY CỔ PHẦN', 'ĐẦU TƯ MẶT TRỜI VIỆT', 'Warming Your Life',
          'VIETSUN', '/assets/aistudio/VIETSUN_b5e42dd9.png', false, 0.7, 0, 0, 13, 12, 11, 10, 8, 'Bộ phận: ',
          '#ffffff', 30, 0, 0, 0, 0, 'QUY ĐỊNH SỬ DỤNG THẺ NHÂN VIÊN',
          '1. Nhân viên đeo thẻ trong suốt giờ làm việc.\n2. Bảo quản thẻ cẩn thận, không bẻ cong hoặc làm trầy xước.\n3. Nhặt được thẻ vui lòng liên hệ Phòng Nhân sự.',
          'Chi nhánh Đồng Nai - Công ty Cổ phần Đầu tư Mặt Trời Việt', 'ĐT: (0251) 388 9999', true, false, 'workspace_vietsun_dong_nai_v1'
        ),
        (
          'tpl_minimal_vertical', 'Mẫu Thẻ Đứng Hiện Đại (Portrait CR80)', 'minimal_vertical', 'portrait',
          '#1e40af', '#f59e0b', '#ffffff', '#0f172a', '#94a3b8', '''Plus Jakarta Sans'', sans-serif',
          'VIETSUN ĐỒNG NAI', 'CÔNG TY CP ĐẦU TƯ MẶT TRỜI VIỆT', 'THẺ NHÂN VIÊN', 'Warming Your Life',
          'VIETSUN', '/assets/aistudio/VIETSUN_b5e42dd9.png', false, 0.75, 0, 0, 13, 12, 11, 10, 8, '',
          '#ffffff', 35, 0, 0, 0, 0, 'THÔNG TIN & QUY ĐỊNH',
          '1. Đeo thẻ khi ra vào cổng và trong suốt ca làm việc.\n2. Không tự ý tẩy xóa, dán đè lên bề mặt thẻ.\n3. Liên hệ Phòng Nhân sự nếu thất lạc thẻ.',
          'Chi nhánh Đồng Nai - Công ty Cổ phần Đầu tư Mặt Trời Việt', 'ĐT: (0251) 388 9999', true, false, 'workspace_vietsun_dong_nai_v1'
        )
        ON CONFLICT (id) DO NOTHING;
      `);
    }

    const setCheck = await client.query('SELECT COUNT(*) FROM app_settings');
    if (parseInt(setCheck.rows[0].count, 10) === 0) {
      await client.query(`
        INSERT INTO app_settings (
          id, company_name, company_branch, company_sub_name, logo_url,
          default_paper_size, default_cols, default_rows, default_gap_mm, default_margin_mm,
          card_width_mm, card_height_mm, owner_id
        ) VALUES (
          'settings_vietsun_default', 'CÔNG TY CP ĐẦU TƯ MẶT TRỜI VIỆT', 'VIETSUN ĐỒNG NAI', '',
          '/assets/aistudio/VIETSUN_b5e42dd9.png', 'A4', 2, 5, 0, 0, 85.6, 54.0, 'workspace_vietsun_dong_nai_v1'
        ) ON CONFLICT (id) DO NOTHING;
      `);
    }

    if (process.env.SEED_DEMO_DATA === 'true') {
      console.log('[PostgreSQL] Đang nạp/đồng bộ danh sách nhân viên đầy đủ theo định dạng Excel...');
    await client.query(`
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
          'emp_90063', '90063', 'Phạm Văn Hiếu', 'BP. Bảo trì vận hành', '01/07/2025', '', 1, '01/07/2025', 'workspace_vietsun_dong_nai_v1',
          '2', 'XMAY 03', 'LV', 'Văn phòng', 'P6', 'Phòng Bảo trì vận hành', 'BP. Bảo trì vận hành', 'Phạm Văn', 'Hiếu', 'Nhân viên Bảo trì vận hành', '01/07/2025',
          '01/01/1994', 'Sóc Trăng', 'Sóc Trăng', 'Nam', 'Kinh', 'Không', 'Huỳnh Phẩm', 'Thạnh Qưới',
          'Thành phố Cần Thơ', 'Huỳnh Phẩm, Thạnh Qưới, Thành phố Cần Thơ', 'Huỳnh Phẩm', 'Thạnh Quới', 'Thành phố Cần Thơ', '094094002952',
          '24/03/2023', 'Cục CSQLHCVTTXH', '01/01/2034', '9/12', '', '365961212', '', '', 'x', '0366815871', 'Độc thân', 'II', '',
          'BP. Bảo trì vận hành', 'HĐXĐTH', '12 THÁNG', 'THAM GIA', '0063', '2026-07-01', '2027-06-30', 'VSDN6', 'Nhân viên'
        ),
        (
          'emp_00455', '00455', 'Bùi Nhật Duy', 'BP. Bảo trì vận hành', '21/10/2025', '', 1, '21/10/2025', 'workspace_vietsun_dong_nai_v1',
          '3', 'XMAY 03', 'LV', 'Văn phòng', 'P6', 'Phòng Bảo trì vận hành', 'BP. Bảo trì vận hành', 'Bùi Nhật', 'Duy', 'Nhân viên IT', '21/10/2025',
          '18/04/1997', 'Thành phố Đồng Nai', 'Quảng Ngãi', 'Nam', 'Kinh', 'Công Giáo', 'Ấp Xuân Tâm', 'Xã Xuân Hòa',
          'Thành phố Đồng Nai', 'Ấp Xuân Tâm, Xã Xuân Hòa, Thành phố Đồng Nai', 'Ấp Xuân Tâm', 'Xã Xuân Hòa', 'Thành phố Đồng Nai', '075097004601',
          '08/09/2022', 'Cục CSQLHCVTTXH', '18/04/2037', '12/12', 'Cao Đẳng công nghệ thủ đức', '', '', '', 'x', '0792192607', 'Đã kết hôn', 'I', '',
          'BP. Bảo trì vận hành', 'HĐXĐTH', '12 THÁNG', 'THAM GIA', '0455', '2025-12-18', '2026-12-17', 'VSDN6', 'Nhân viên'
        ),
        (
          'emp_36854', '36854', 'Đặng Văn Tuyển', 'BP. Bảo trì vận hành', '13/02/2025', '', 1, '13/02/2025', 'workspace_vietsun_dong_nai_v1',
          '4', 'XMAY 03', 'LV', 'Văn phòng', 'P6', 'Phòng Bảo trì vận hành', 'BP. Bảo trì vận hành', 'Đặng Văn', 'Tuyển', 'Nhân viên Bảo trì vận hành', '13/02/2025',
          '06/08/1986', 'Hà Nội', 'Hà Nội', 'Nam', 'Kinh', 'Không', 'Ấp Hòa Hưng', 'Xã Xuân Hòa',
          'Thành phố Đồng Nai', 'Ấp Hòa Hưng, Xã Xuân Hòa, Thành phố Đồng Nai', 'Ấp Hòa Hưng', 'Xã Xuân Hòa', 'Thành phố Đồng Nai', '001086017731',
          '04/05/2023', 'Cục CSQLHCVTTXH', '06/08/2046', '9/12', 'Chứng chỉ sơ cấp bảo trì máy may', '', '', 'x', '', '0979163833', 'Đã kết hôn', 'II', 'Hồng nhân sự',
          'BP. Bảo trì vận hành', 'HĐXĐTH', '12 THÁNG', 'THAM GIA', '6854', '2026-03-01', '2027-04-12', 'VSDN6', 'Nhân viên'
        ),
        (
          'emp_34433', '34433', 'Võ Đức Minh', 'BP. Bảo trì vận hành', '14/04/2021', '', 1, '14/04/2021', 'workspace_vietsun_dong_nai_v1',
          '5', 'XMAY 03', 'LV', 'Văn phòng', 'P6', 'Phòng Bảo trì vận hành', 'BP. Bảo trì vận hành', 'Võ Đức', 'Minh', 'Nhân viên Bảo trì vận hành', '14/04/2021',
          '22/12/1992', 'Thành phố Đồng Nai', 'Quảng Trị', 'Nam', 'Kinh', 'Phật Giáo', 'Ấp Hòa Hưng', 'Xã Xuân Hòa',
          'Thành phố Đồng Nai', 'Ấp Hòa Hưng, Xã Xuân Hòa, Thành phố Đồng Nai', 'Ấp Hòa Hưng', 'Xã Xuân Hòa', 'Thành phố Đồng Nai', '075092008536',
          '12/06/2022', 'Cục CSQLHCVTTXH', '22/12/2032', '12/12', 'Kỷ thuật điện', '', '', 'x', '', '0985483237', 'Độc thân', '', '',
          'BP. Bảo trì vận hành', 'HĐKXĐ', '', 'THAM GIA', '453', '2026-05-01', '', 'VSDN6', 'Nhân viên'
        ),
        (
          'emp_90793', '90793', 'Trịnh Minh Hùng', 'BP. Bảo trì vận hành', '25/06/2026', '', 1, '25/06/2026', 'workspace_vietsun_dong_nai_v1',
          '6', 'XMAY 03', 'LV', 'Văn phòng', 'P6', 'Phòng Bảo trì vận hành', 'BP. Bảo trì vận hành', 'Trịnh Minh', 'Hùng', 'Nhân viên Bảo trì vận hành', '25/06/2026',
          '16/05/1999', 'Thành phố Đồng Nai', '', 'Nam', 'Kinh', 'Phật Giáo', 'Ấp Hòa Hưng', 'Xã Xuân Hòa',
          'Thành phố Đồng Nai', 'Ấp Hòa Hưng, Xã Xuân Hòa, Thành phố Đồng Nai', 'Ấp Hòa Hưng', 'Xã Xuân Hòa', 'Thành phố Đồng Nai', '075099008189',
          '15/10/2024', 'Cục CSQLHCVTTXH', '16/05/2039', '12/12', '', '', '', '', 'x', '0916874360', 'Đã kết hôn', 'I', '34806 Mai Hoa',
          'BP. Bảo trì vận hành', 'HĐXĐTH', '12 THÁNG', 'THAM GIA', '0793', '2026-08-22', '2027-08-21', 'VSDN6', 'Nhân viên'
        ),
        (
          'emp_90927', '90927', 'Bùi Văn Phú', 'BP. Bảo trì vận hành', '24/08/2026', '', 1, '24/08/2026', 'workspace_vietsun_dong_nai_v1',
          '7', 'XMAY 03', 'LV', 'Văn phòng', 'P6', 'Phòng Bảo trì vận hành', 'BP. Bảo trì vận hành', 'Bùi Văn', 'Phú', 'Nhân viên Bảo trì vận hành', '24/08/2026',
          '08/04/2000', 'Tỉnh Lâm Đồng', '', 'Nam', 'Kinh', 'Không', 'Thôn 5', 'Xã Tân Minh',
          'Tỉnh Lâm Đồng', 'Thôn 5, Xã Tân Minh, Tỉnh Lâm Đồng', 'Thôn 5', 'Xã Tân Minh', 'Tỉnh Lâm Đồng', '060200009352',
          '21/04/2025', 'Bộ Công An', '08/04/2040', '12/12', '', '', '', 'x', '', '0867984715', 'Đã kết hôn', 'I', '',
          'BP. Bảo trì vận hành', 'HĐXĐTH', '12 THÁNG', 'THAM GIA', '0927', '2026-10-21', '2027-10-20', 'VSDN6', 'Nhân viên'
        ),
        (
          'emp_90993', '90993', 'Trương Minh Hiếu', 'BP. Bảo trì vận hành', '02/10/2026', '', 1, '02/10/2026', 'workspace_vietsun_dong_nai_v1',
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
    }

    // =========================================================================
    // 7. BẢNG LỊCH SỬ LÀM VIỆC (employee_work_histories) & AUDIT LOGS
    // =========================================================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS employee_work_histories (
        id VARCHAR(100) PRIMARY KEY,
        employee_id VARCHAR(100) NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
        cccd VARCHAR(50) NOT NULL,
        msnv VARCHAR(50) NOT NULL,
        turn_number INT NOT NULL DEFAULT 1,
        start_date DATE NOT NULL,
        department VARCHAR(150) NOT NULL DEFAULT '',
        position VARCHAR(100) DEFAULT '',
        job_title VARCHAR(150) DEFAULT '',
        contract_type VARCHAR(100) DEFAULT 'Thử việc',
        end_date DATE DEFAULT NULL,
        resignation_type VARCHAR(50) DEFAULT NULL,
        resignation_reason TEXT DEFAULT NULL,
        rehire_eligibility VARCHAR(30) DEFAULT 'eligible',
        status VARCHAR(30) NOT NULL DEFAULT 'active',
        approved_by VARCHAR(100) DEFAULT '',
        created_by VARCHAR(100) DEFAULT '',
        updated_by VARCHAR(100) DEFAULT '',
        owner_id VARCHAR(100) DEFAULT 'workspace_vietsun_dong_nai_v1',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_work_history_dates CHECK (end_date IS NULL OR end_date >= start_date)
      );

      CREATE INDEX IF NOT EXISTS idx_work_histories_cccd ON employee_work_histories(cccd);
      CREATE INDEX IF NOT EXISTS idx_work_histories_msnv ON employee_work_histories(msnv);
      CREATE INDEX IF NOT EXISTS idx_work_histories_emp_id ON employee_work_histories(employee_id);
      CREATE INDEX IF NOT EXISTS idx_work_histories_status ON employee_work_histories(status);
      CREATE INDEX IF NOT EXISTS idx_work_histories_start_date ON employee_work_histories(start_date);

      CREATE UNIQUE INDEX IF NOT EXISTS uq_active_work_per_cccd 
      ON employee_work_histories(cccd) 
      WHERE (status = 'active' OR end_date IS NULL);

      CREATE TABLE IF NOT EXISTS work_history_logs (
        id VARCHAR(100) PRIMARY KEY,
        work_history_id VARCHAR(100) NOT NULL REFERENCES employee_work_histories(id) ON DELETE CASCADE,
        cccd VARCHAR(50) NOT NULL,
        action VARCHAR(50) NOT NULL,
        changed_by VARCHAR(100) NOT NULL,
        changed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        old_data JSONB DEFAULT NULL,
        new_data JSONB DEFAULT NULL,
        change_note TEXT DEFAULT ''
      );

      CREATE INDEX IF NOT EXISTS idx_wh_logs_wh_id ON work_history_logs(work_history_id);
      CREATE INDEX IF NOT EXISTS idx_wh_logs_cccd ON work_history_logs(cccd);
    `);

    // Tự động migrate dữ liệu nhân sự sang bảng lịch sử làm việc theo từng CCCD và ngày vào làm
    await client.query(`
      DO $$
      DECLARE
          v_count INT;
      BEGIN
          SELECT COUNT(*) INTO v_count FROM employee_work_histories;
          -- Chỉ tự động migrate nếu bảng chưa có dữ liệu
          IF v_count = 0 THEN
              INSERT INTO employee_work_histories (
                  id, employee_id, cccd, msnv, turn_number,
                  start_date, end_date, department, position, contract_type,
                  resignation_type, resignation_reason, rehire_eligibility, status,
                  created_by, owner_id
              )
              SELECT 
                  'wh_' || e.id || '_t' || ROW_NUMBER() OVER (PARTITION BY TRIM(e.cccd) ORDER BY COALESCE(TO_DATE(NULLIF(TRIM(e.ngay_vao), ''), 'DD/MM/YYYY'), CURRENT_DATE) ASC, e.created_at ASC),
                  e.id,
                  TRIM(e.cccd),
                  e.msnv,
                  ROW_NUMBER() OVER (PARTITION BY TRIM(e.cccd) ORDER BY COALESCE(TO_DATE(NULLIF(TRIM(e.ngay_vao), ''), 'DD/MM/YYYY'), CURRENT_DATE) ASC, e.created_at ASC),
                  COALESCE(TO_DATE(NULLIF(TRIM(e.ngay_vao), ''), 'DD/MM/YYYY'), CURRENT_DATE),
                  CASE 
                    WHEN e.tinh_trang ILIKE '%hết hiệu lực%' OR e.tinh_trang ILIKE '%nghỉ%' OR e.tinh_trang ILIKE '%thôi việc%' OR e.tinh_trang ILIKE '%chấm dứt%'
                    THEN COALESCE(TO_DATE(NULLIF(TRIM(e.den_ngay), ''), 'DD/MM/YYYY'), CURRENT_DATE)
                    ELSE NULL
                  END,
                  COALESCE(e.department, 'Chưa phân bổ'),
                  COALESCE(e.chuc_vu, 'Nhân viên'),
                  COALESCE(e.loai_hd, 'Chính thức'),
                  CASE 
                    WHEN ra.ly_do ILIKE '%rút hồ sơ%' OR ra.nhom_ly_do ILIKE '%rút hồ sơ%' THEN 'rut_ho_so'
                    WHEN ra.ly_do ILIKE '%bỏ việc%' OR ra.nhom_ly_do ILIKE '%bỏ việc%' THEN 'bo_viec'
                    WHEN ra.ly_do ILIKE '%thôi việc%' OR ra.ly_do ILIKE '%kỷ luật%' THEN 'cong_ty_cho_thoi_viec'
                    WHEN ra.ly_do ILIKE '%hết hợp đồng%' OR ra.ly_do ILIKE '%hết hiệu lực%' THEN 'het_hop_dong'
                    WHEN ra.ly_do ILIKE '%đơn%' OR ra.ly_do ILIKE '%xin nghỉ%' THEN 'tu_xin_nghi'
                    WHEN e.tinh_trang ILIKE '%hết hiệu lực%' THEN 'het_hop_dong'
                    WHEN e.tinh_trang ILIKE '%nghỉ%' OR e.tinh_trang ILIKE '%thôi việc%' THEN 'tu_xin_nghi'
                    ELSE NULL
                  END,
                  CASE 
                    WHEN NULLIF(TRIM(ra.ly_do), '') IS NOT NULL THEN TRIM(ra.ly_do)
                    WHEN NULLIF(TRIM(ra.nhom_ly_do), '') IS NOT NULL THEN TRIM(ra.nhom_ly_do)
                    WHEN e.tinh_trang ILIKE '%hết hiệu lực%' OR e.tinh_trang ILIKE '%nghỉ%' OR e.tinh_trang ILIKE '%thôi việc%' THEN e.tinh_trang
                    ELSE NULL
                  END,
                  'eligible',
                  CASE 
                    WHEN ra.trang_thai = 'Đã hoàn thành' OR e.tinh_trang ILIKE '%hết hiệu lực%' OR e.tinh_trang ILIKE '%nghỉ%' OR e.tinh_trang ILIKE '%thôi việc%' OR e.tinh_trang ILIKE '%chấm dứt%'
                    THEN 'terminated'
                    ELSE 'active'
                  END,
                  'system_migration',
                  COALESCE(e.owner_id, 'workspace_vietsun_dong_nai_v1')
              FROM employees e
              LEFT JOIN LATERAL (
                  SELECT ly_do, nhom_ly_do, trang_thai
                  FROM resignation_applications
                  WHERE (employee_id = e.id OR LOWER(TRIM(msnv)) = LOWER(TRIM(e.msnv)))
                  ORDER BY created_at DESC LIMIT 1
              ) ra ON true
              WHERE e.cccd IS NOT NULL AND TRIM(e.cccd) <> '';
          END IF;
      END $$;
    `);

    // 12. Bảng Quyết định Bổ nhiệm & Miễn nhiệm (appointment_decisions)
    await client.query(`
      CREATE TABLE IF NOT EXISTS appointment_decisions (
        id VARCHAR(100) PRIMARY KEY,
        decision_type VARCHAR(30) NOT NULL CHECK (decision_type IN ('bo_nhiem', 'mien_nhiem')),
        employee_id VARCHAR(100) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        msnv VARCHAR(50) NOT NULL DEFAULT '',
        full_name VARCHAR(150) NOT NULL DEFAULT '',
        position_title VARCHAR(150) NOT NULL,
        division_id VARCHAR(100) DEFAULT '',
        division_name VARCHAR(150) DEFAULT '',
        department_id VARCHAR(100) DEFAULT '',
        department_name VARCHAR(150) NOT NULL DEFAULT '',
        sub_department_id VARCHAR(100) DEFAULT '',
        sub_department_name VARCHAR(150) DEFAULT '',
        previous_position VARCHAR(150) DEFAULT '',
        previous_department VARCHAR(150) DEFAULT '',
        decision_number VARCHAR(100) NOT NULL,
        sign_date DATE NOT NULL,
        effective_date DATE NOT NULL,
        end_date DATE DEFAULT NULL,
        signer_name VARCHAR(150) NOT NULL DEFAULT '',
        reason TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        attachment_name VARCHAR(255) DEFAULT '',
        attachment_path VARCHAR(500) DEFAULT '',
        attachment_mime VARCHAR(150) DEFAULT '',
        attachment_size INT DEFAULT 0,
        status VARCHAR(40) NOT NULL DEFAULT 'effective',
        applied_to_employee BOOLEAN DEFAULT false,
        created_by VARCHAR(100) DEFAULT '',
        updated_by VARCHAR(100) DEFAULT '',
        owner_id VARCHAR(100) DEFAULT 'workspace_vietsun_dong_nai_v1',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_appointment_decision_number
        ON appointment_decisions (LOWER(TRIM(decision_number)));
      CREATE INDEX IF NOT EXISTS idx_appointment_employee ON appointment_decisions(employee_id);
      CREATE INDEX IF NOT EXISTS idx_appointment_type ON appointment_decisions(decision_type);
      CREATE INDEX IF NOT EXISTS idx_appointment_effective ON appointment_decisions(effective_date);
      CREATE INDEX IF NOT EXISTS idx_appointment_status ON appointment_decisions(status);
    `);

    // 13. Bảng Lịch sử chức vụ nhân sự (employee_position_histories)
    await client.query(`
      CREATE TABLE IF NOT EXISTS employee_position_histories (
        id VARCHAR(100) PRIMARY KEY,
        employee_id VARCHAR(100) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        msnv VARCHAR(50) NOT NULL DEFAULT '',
        full_name VARCHAR(150) NOT NULL DEFAULT '',
        position_title VARCHAR(150) NOT NULL,
        division_name VARCHAR(150) DEFAULT '',
        department_name VARCHAR(150) NOT NULL DEFAULT '',
        sub_department_name VARCHAR(150) DEFAULT '',
        appointment_decision_id VARCHAR(100) REFERENCES appointment_decisions(id) ON DELETE SET NULL,
        dismissal_decision_id VARCHAR(100) REFERENCES appointment_decisions(id) ON DELETE SET NULL,
        appointment_number VARCHAR(100) DEFAULT '',
        dismissal_number VARCHAR(100) DEFAULT '',
        start_date DATE NOT NULL,
        end_date DATE DEFAULT NULL,
        term_end_date DATE DEFAULT NULL,
        is_current BOOLEAN DEFAULT false,
        status VARCHAR(40) NOT NULL DEFAULT 'active',
        note TEXT DEFAULT '',
        owner_id VARCHAR(100) DEFAULT 'workspace_vietsun_dong_nai_v1',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_pos_hist_emp ON employee_position_histories(employee_id);
      CREATE INDEX IF NOT EXISTS idx_pos_hist_current ON employee_position_histories(employee_id, is_current);
      CREATE INDEX IF NOT EXISTS idx_pos_hist_status ON employee_position_histories(status);
    `);

    await client.query('COMMIT');
    console.log('[PostgreSQL] Khởi tạo các bảng cơ sở dữ liệu thành công.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[PostgreSQL] Lỗi khi tạo bảng:', err);
    throw err;
  } finally {
    client.release();
  }
}
