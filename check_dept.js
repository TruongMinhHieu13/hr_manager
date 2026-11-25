import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgresql://postgres:123456@localhost:5432/hr_manager' });

async function check() {
  const empRes = await pool.query(`
    SELECT msnv, full_name, department, phong_ban, phong_ban_con, bo_phan
    FROM employees
    WHERE department ILIKE '%bảo tr%' OR phong_ban ILIKE '%bảo tr%' OR phong_ban_con ILIKE '%bảo tr%' OR bo_phan ILIKE '%bảo tr%'
  `);
  console.log('Employees found:', empRes.rows.length);
  console.log(empRes.rows);

  const deptRes = await pool.query(`
    SELECT id, name FROM departments WHERE name ILIKE '%bảo tr%'
  `);
  console.log('Departments found in departments table:');
  console.log(deptRes.rows);

  const distinctDepts = await pool.query(`
    SELECT DISTINCT department FROM employees
  `);
  console.log('Distinct department from employees:');
  console.log(distinctDepts.rows.map(r => r.department));

  const distinctPhongBan = await pool.query(`
    SELECT DISTINCT phong_ban FROM employees
  `);
  console.log('Distinct phong_ban from employees:');
  console.log(distinctPhongBan.rows.map(r => r.phong_ban));

  const distinctPhongBanCon = await pool.query(`
    SELECT DISTINCT phong_ban_con FROM employees
  `);
  console.log('Distinct phong_ban_con from employees:');
  console.log(distinctPhongBanCon.rows.map(r => r.phong_ban_con));

  const distinctBoPhan = await pool.query(`
    SELECT DISTINCT bo_phan FROM employees
  `);
  console.log('Distinct bo_phan from employees:');
  console.log(distinctBoPhan.rows.map(r => r.bo_phan));

  await pool.end();
}

check().catch(e => { console.error(e); pool.end(); });
