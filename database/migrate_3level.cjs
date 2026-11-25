const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:123456@localhost:5432/hr_manager'
});

const WORKSPACE_ID = 'workspace_vietsun_dong_nai_v1';

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('[Migration] Bắt đầu triển khai mô hình tổ chức 3 cấp...');

    // 1. Tạo bảng divisions (Cấp 1: Khối)
    await client.query(`
      CREATE TABLE IF NOT EXISTS divisions (
        id VARCHAR(100) PRIMARY KEY,
        code VARCHAR(50) DEFAULT '',
        name VARCHAR(150) NOT NULL UNIQUE,
        description TEXT DEFAULT '',
        status VARCHAR(30) DEFAULT 'active',
        order_index INT DEFAULT 0,
        owner_id VARCHAR(100) DEFAULT '${WORKSPACE_ID}',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_divisions_owner ON divisions(owner_id);
    `);

    // 2. Nâng cấp bảng departments (Cấp 2: Phòng ban / Bộ phận có Ký hiệu PB)
    await client.query(`
      DO $$
      BEGIN
        ALTER TABLE departments ADD COLUMN IF NOT EXISTS division_id VARCHAR(100) REFERENCES divisions(id) ON DELETE SET NULL;
        ALTER TABLE departments ADD COLUMN IF NOT EXISTS division_name VARCHAR(150) DEFAULT '';
        ALTER TABLE departments ADD COLUMN IF NOT EXISTS code VARCHAR(50) DEFAULT '';
        ALTER TABLE departments ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
        ALTER TABLE departments ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'active';
      END $$;
      CREATE INDEX IF NOT EXISTS idx_departments_division ON departments(division_id);
      CREATE INDEX IF NOT EXISTS idx_departments_code ON departments(code);
    `);

    // 3. Tạo bảng sub_departments (Cấp 3: Phòng ban con / Bộ phận con)
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
        owner_id VARCHAR(100) DEFAULT '${WORKSPACE_ID}',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_sub_departments_dept ON sub_departments(department_id);
      CREATE INDEX IF NOT EXISTS idx_sub_departments_owner ON sub_departments(owner_id);
    `);

    // 4. Bổ sung các cột liên kết ID cho bảng employees (nếu chưa có)
    await client.query(`
      DO $$
      BEGIN
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS division_id VARCHAR(100) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS department_id VARCHAR(100) DEFAULT '';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS sub_department_id VARCHAR(100) DEFAULT '';
      END $$;
    `);

    // 5. Nạp cấu trúc 3 cấp mẫu chuẩn VIETSUN nếu chưa có
    const divCheck = await client.query('SELECT COUNT(*) FROM divisions');
    if (parseInt(divCheck.rows[0].count, 10) === 0) {
      console.log('[Migration] Nạp dữ liệu Khối ban đầu...');
      await client.query(`
        INSERT INTO divisions (id, code, name, description, status, order_index, owner_id)
        VALUES
          ('div_bod', 'BOD', 'Khối Ban Giám Đốc', 'Cấp lãnh đạo cao nhất điều hành chi nhánh', 'active', 1, '${WORKSPACE_ID}'),
          ('div_vp', 'VP', 'Khối Văn Phòng', 'Khối các phòng ban khối hành chính, văn phòng, hỗ trợ', 'active', 2, '${WORKSPACE_ID}'),
          ('div_ktsx', 'KTSX', 'Khối Kỹ Thuật & Sản Xuất', 'Khối các xưởng sản xuất, kỹ thuật may, kho bãi', 'active', 3, '${WORKSPACE_ID}')
        ON CONFLICT (name) DO NOTHING;
      `);
    }

    // 6. Cập nhật và chuẩn hóa dữ liệu cho bảng departments (Cấp 2)
    // Map các phòng ban hiện có vào đúng Khối và gán Ký hiệu PB
    const divRes = await client.query('SELECT id, code, name FROM divisions');
    const divMap = {};
    for (const d of divRes.rows) {
      divMap[d.code] = d;
      divMap[d.name] = d;
    }

    const bodDiv = divMap['BOD'] || divMap['Khối Ban Giám Đốc'];
    const vpDiv = divMap['VP'] || divMap['Khối Văn Phòng'];
    const ktsxDiv = divMap['KTSX'] || divMap['Khối Kỹ Thuật & Sản Xuất'];

    console.log('[Migration] Đồng bộ dữ liệu Cấp 2 (Phòng ban) và Cấp 3 (Phòng ban con)...');

    const defaultDepts = [
      {
        id: 'dept_bod',
        code: 'BGĐ',
        name: 'Ban Giám Đốc',
        divId: bodDiv?.id,
        divName: bodDiv?.name || 'Khối Ban Giám Đốc',
        desc: 'Ban Giám Đốc Điều hành Chi nhánh',
        subDepts: ['Ban Giám Đốc']
      },
      {
        id: 'dept_btvh',
        code: 'P6',
        name: 'Phòng Bảo trì vận hành',
        divId: vpDiv?.id,
        divName: vpDiv?.name || 'Khối Văn Phòng',
        desc: 'Bảo trì máy móc thiết bị, cơ sở hạ tầng, hệ thống kỹ thuật',
        subDepts: ['BP. Bảo trì vận hành', 'BP. Công nghệ thông tin (IT)']
      },
      {
        id: 'dept_hcns',
        code: 'HCNS',
        name: 'Phòng Hành chính - Nhân sự',
        divId: vpDiv?.id,
        divName: vpDiv?.name || 'Khối Văn Phòng',
        desc: 'Quản trị nhân sự, tuyển dụng, đào tạo, hành chính tổng hợp',
        subDepts: ['BP. Hành chính', 'BP. Tuyển dụng - Đào tạo', 'BP. Tiền lương & Phúc lợi (C&B)']
      },
      {
        id: 'dept_kttc',
        code: 'KTTC',
        name: 'Phòng Kế toán - Tài chính',
        divId: vpDiv?.id,
        divName: vpDiv?.name || 'Khối Văn Phòng',
        desc: 'Quản lý tài chính kế toán, thuế, thu chi ngân sách',
        subDepts: ['BP. Kế toán tổng hợp', 'BP. Kế toán thanh toán', 'BP. Thủ quỹ']
      },
      {
        id: 'dept_kdxnk',
        code: 'KDXNK',
        name: 'Phòng Kinh doanh - Xuất nhập khẩu',
        divId: vpDiv?.id,
        divName: vpDiv?.name || 'Khối Văn Phòng',
        desc: 'Kinh doanh, phát triển thị trường, thủ tục xuất nhập khẩu',
        subDepts: ['BP. Kinh doanh nội địa', 'BP. Xuất nhập khẩu']
      },
      {
        id: 'dept_sxkt',
        code: 'SXKT',
        name: 'Phòng Sản xuất - Kỹ thuật',
        divId: ktsxDiv?.id,
        divName: ktsxDiv?.name || 'Khối Kỹ Thuật & Sản Xuất',
        desc: 'Điều hành kế hoạch sản xuất may mặc và kỹ thuật công nghệ',
        subDepts: ['BP. Kỹ thuật chuyền', 'Xưởng May 01', 'Xưởng May 02', 'Xưởng May 03']
      },
      {
        id: 'dept_qc',
        code: 'QC',
        name: 'Phòng Kiểm soát chất lượng (QC)',
        divId: ktsxDiv?.id,
        divName: ktsxDiv?.name || 'Khối Kỹ Thuật & Sản Xuất',
        desc: 'Kiểm soát chất lượng bán thành phẩm và thành phẩm may xuất khẩu',
        subDepts: ['BP. QA Chất lượng', 'BP. QC May chuyền', 'BP. KCS Hoàn thiện']
      },
      {
        id: 'dept_kho',
        code: 'KHO',
        name: 'Phòng Kho vận - Logistics',
        divId: ktsxDiv?.id,
        divName: ktsxDiv?.name || 'Khối Kỹ Thuật & Sản Xuất',
        desc: 'Quản lý kho nguyên phụ liệu, kho phụ liệu và kho thành phẩm',
        subDepts: ['BP. Kho nguyên phụ liệu', 'BP. Kho thành phẩm', 'BP. Đóng gói & Bốc xếp']
      }
    ];

    let orderIdx = 1;
    for (const d of defaultDepts) {
      await client.query(`
        INSERT INTO departments (id, name, code, division_id, division_name, description, status, order_index, owner_id)
        VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, '${WORKSPACE_ID}')
        ON CONFLICT (name) DO UPDATE SET
          code = EXCLUDED.code,
          division_id = EXCLUDED.division_id,
          division_name = EXCLUDED.division_name,
          description = EXCLUDED.description,
          status = 'active';
      `, [d.id, d.name, d.code, d.divId, d.divName, d.desc, orderIdx++]);

      // Lấy id thực tế của department
      const currentDeptRes = await client.query('SELECT id, name, code FROM departments WHERE name = $1', [d.name]);
      const currentDept = currentDeptRes.rows[0];

      // Thêm các sub_departments
      let subOrder = 1;
      for (const sName of d.subDepts) {
        const subId = `sub_${currentDept.id}_${subOrder}`;
        await client.query(`
          INSERT INTO sub_departments (id, department_id, department_name, division_id, division_name, name, status, order_index, owner_id)
          VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, '${WORKSPACE_ID}')
          ON CONFLICT (id) DO UPDATE SET
            department_id = EXCLUDED.department_id,
            department_name = EXCLUDED.department_name,
            division_id = EXCLUDED.division_id,
            division_name = EXCLUDED.division_name,
            name = EXCLUDED.name,
            status = 'active';
        `, [subId, currentDept.id, currentDept.name, d.divId, d.divName, sName, subOrder++]);
      }
    }

    // 7. Đồng bộ thông tin nhân viên hiện tại khớp với cấu trúc 3 cấp
    console.log('[Migration] Đồng bộ hồ sơ nhân viên hiện tại...');
    // Đỗ Đặng Quốc Huy (BGĐ)
    await client.query(`
      UPDATE employees
      SET
        khoi = 'Khối Ban Giám Đốc',
        phong_ban = 'Ban Giám Đốc',
        ky_hieu_pb = 'BGĐ',
        phong_ban_con = 'Ban Giám Đốc',
        bo_phan = 'Ban Giám Đốc',
        department = 'Ban Giám Đốc',
        division_id = (SELECT id FROM divisions WHERE code = 'BOD' LIMIT 1),
        department_id = (SELECT id FROM departments WHERE code = 'BGĐ' LIMIT 1)
      WHERE msnv = '10448' OR ky_hieu_pb = 'BGĐ';
    `);

    // Nhân viên bảo trì / IT
    await client.query(`
      UPDATE employees
      SET
        khoi = 'Khối Văn Phòng',
        phong_ban = 'Phòng Bảo trì vận hành',
        ky_hieu_pb = 'P6',
        division_id = (SELECT id FROM divisions WHERE code = 'VP' LIMIT 1),
        department_id = (SELECT id FROM departments WHERE code = 'P6' LIMIT 1)
      WHERE ky_hieu_pb = 'P6' OR phong_ban ILIKE '%bảo trì%' OR bo_phan ILIKE '%bảo trì%';
    `);

    // Các nhân viên khác nếu có khoi = 'Văn phòng'
    await client.query(`
      UPDATE employees
      SET khoi = 'Khối Văn Phòng'
      WHERE khoi = 'Văn phòng';
    `);

    await client.query('COMMIT');
    console.log('[Migration] Migration cơ sở dữ liệu 3 cấp hoàn tất thành công!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Migration] Thất bại, đã ROLLBACK:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
