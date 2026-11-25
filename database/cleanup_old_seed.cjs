const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:123456@localhost:5432/hr_manager'
});

async function run() {
  const oldIds = ['dept_1', 'dept_2', 'dept_3', 'dept_4', 'dept_5', 'dept_6', 'dept_7', 'dept_8'];
  const res = await pool.query(`DELETE FROM departments WHERE id = ANY($1) AND code = ''`, [oldIds]);
  console.log(`Đã xóa ${res.rowCount} phòng ban cũ chưa phân cấp.`);
  const depts = await pool.query('SELECT id, code, name, division_name FROM departments ORDER BY order_index');
  console.table(depts.rows);
  await pool.end();
}

run();
