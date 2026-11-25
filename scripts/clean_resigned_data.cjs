const pg = require('pg');
require('dotenv').config();

const { Pool } = pg;
const DB_USER = process.env.DB_USER || 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD || '123456';
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT || '5432', 10);
const DB_NAME = process.env.DB_NAME || 'hr_manager';

const connectionString =
  process.env.DATABASE_URL ||
  `postgresql://${DB_USER}:${encodeURIComponent(DB_PASSWORD)}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;

const pool = new Pool({ connectionString });

async function run() {
  const client = await pool.connect();
  try {
    console.log('=== KIỂM TRA DỮ LIỆU NHÂN VIÊN ĐÃ NGHỈ VIỆC ===');

    // 1. resignation_applications
    const rApps = await client.query('SELECT COUNT(*) FROM resignation_applications');
    console.log('- Đơn / hồ sơ thôi việc (resignation_applications):', rApps.rows[0].count);

    // 2. employees
    const rEmps = await client.query(`
      SELECT id, msnv, full_name, tinh_trang, extra_data
      FROM employees 
      WHERE tinh_trang ILIKE '%nghỉ%' 
         OR tinh_trang ILIKE '%chấm dứt%' 
         OR tinh_trang ILIKE '%thôi việc%' 
         OR tinh_trang = 'Hết hiệu lực'
         OR tinh_trang = 'Nghỉ việc'
         OR tinh_trang = 'Đã nghỉ việc'
    `);
    console.log('- Nhân viên có trạng thái nghỉ việc (employees):', rEmps.rowCount);

    // 3. employee_work_histories
    const rHist = await client.query(`
      SELECT COUNT(*) 
      FROM employee_work_histories 
      WHERE status != 'active' 
         OR end_date IS NOT NULL 
         OR resignation_type IS NOT NULL
    `);
    console.log('- Đợt làm việc đã kết thúc/nghỉ việc (employee_work_histories):', rHist.rows[0].count);

    // 4. contracts
    const rContracts = await client.query(`
      SELECT COUNT(*) 
      FROM contracts 
      WHERE status ILIKE '%hết%' OR status ILIKE '%chấm dứt%'
    `);
    console.log('- Hợp đồng đã chấm dứt (contracts):', rContracts.rows[0].count);

    // Bắt đầu transaction xóa sạch
    console.log('\n=== TIẾN HÀNH XÓA SẠCH DỮ LIỆU NHÂN VIÊN ĐÃ NGHỈ VIỆC ===');
    await client.query('BEGIN');

    // 1. Xóa toàn bộ đơn / hồ sơ thôi việc trong resignation_applications
    const delApps = await client.query('DELETE FROM resignation_applications');
    console.log(`- Đã xóa ${delApps.rowCount} bản ghi khỏi resignation_applications.`);

    // 2. Xóa các đợt làm việc đã kết thúc/nghỉ việc trong employee_work_histories
    const delHist = await client.query(`
      DELETE FROM employee_work_histories 
      WHERE status != 'active' 
         OR end_date IS NOT NULL 
         OR resignation_type IS NOT NULL
    `);
    console.log(`- Đã xóa ${delHist.rowCount} bản ghi khỏi employee_work_histories.`);

    // 3. Xóa các hợp đồng đã chấm dứt/hết hạn
    const delContracts = await client.query(`
      DELETE FROM contracts 
      WHERE status ILIKE '%hết%' OR status ILIKE '%chấm dứt%'
    `);
    console.log(`- Đã xóa ${delContracts.rowCount} bản ghi khỏi contracts.`);

    // 4. Nếu có nhân viên trong bảng employees có trạng thái nghỉ việc, xóa hồ sơ nhân viên đó
    // Lưu ý trước khi xóa employees: xóa các khóa ngoại liên quan (nếu có)
    if (rEmps.rowCount > 0) {
      const empIds = rEmps.rows.map(r => r.id);
      await client.query('DELETE FROM employee_work_histories WHERE employee_id = ANY($1)', [empIds]);
      await client.query('DELETE FROM contracts WHERE employee_id = ANY($1)', [empIds]);
      const delEmps = await client.query('DELETE FROM employees WHERE id = ANY($1)', [empIds]);
      console.log(`- Đã xóa ${delEmps.rowCount} nhân viên đã nghỉ việc khỏi employees.`);
    }

    await client.query('COMMIT');
    console.log('\n>>> HOÀN TẤT XÓA SẠCH TOÀN BỘ DỮ LIỆU NHÂN VIÊN ĐÃ NGHỈ VIỆC THÀNH CÔNG! <<<');

    // Kiểm tra lại sau khi xóa
    const afterApps = await client.query('SELECT COUNT(*) FROM resignation_applications');
    const afterEmps = await client.query('SELECT COUNT(*) FROM employees');
    const afterHist = await client.query('SELECT COUNT(*) FROM employee_work_histories');
    console.log('\n=== TÌNH TRẠNG SAU KHI DỌN DẸP ===');
    console.log('- Số lượng nhân viên còn lại:', afterEmps.rows[0].count);
    console.log('- Số lượng lịch sử làm việc còn lại:', afterHist.rows[0].count);
    console.log('- Số lượng đơn/hồ sơ nghỉ việc còn lại:', afterApps.rows[0].count);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Lỗi khi xóa dữ liệu:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
