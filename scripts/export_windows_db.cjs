const fs = require('fs');
const { Pool } = require('pg');

const pool = new Pool({
  host: '127.0.0.1',
  port: 5432,
  user: 'postgres',
  password: '123456',
  database: 'hr_manager',
});

async function exportData() {
  console.log('[Export] Đang kết nối tới PostgreSQL Windows (127.0.0.1:5432)...');
  const client = await pool.connect();

  try {
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

    const tables = tablesRes.rows.map(r => r.table_name);
    console.log('[Export] Danh sách bảng tìm thấy:', tables);

    let sqlDump = `-- Backup dữ liệu từ Windows PostgreSQL\nSET client_encoding = 'UTF8';\nSET session_replication_role = 'replica';\n\n`;

    // Truncate tất cả các bảng trước một lần duy nhất
    const truncateList = tables.map(t => `"${t}"`).join(', ');
    sqlDump += `TRUNCATE TABLE ${truncateList} CASCADE;\n\n`;

    for (const table of tables) {
      const countRes = await client.query(`SELECT count(*) FROM "${table}"`);
      const count = parseInt(countRes.rows[0].count, 10);
      console.log(`[Export] Đang đọc bảng "${table}" (${count} dòng)...`);

      if (count === 0) continue;

      const rowsRes = await client.query(`SELECT * FROM "${table}"`);
      const rows = rowsRes.rows;
      if (rows.length === 0) continue;

      const cols = Object.keys(rows[0]);
      const quotedCols = cols.map(c => `"${c}"`).join(', ');

      sqlDump += `-- Dữ liệu bảng ${table}\n`;

      for (const row of rows) {
        const values = cols.map(c => {
          const val = row[c];
          if (val === null || val === undefined) return 'NULL';
          if (typeof val === 'number' || typeof val === 'boolean') return val;
          if (val instanceof Date) return `'${val.toISOString()}'`;
          if (typeof val === 'object') {
            const jsonStr = JSON.stringify(val).replace(/'/g, "''");
            return `'${jsonStr}'`;
          }
          const str = String(val).replace(/'/g, "''");
          return `'${str}'`;
        });

        sqlDump += `INSERT INTO "${table}" (${quotedCols}) VALUES (${values.join(', ')});\n`;
      }
      sqlDump += `\n`;
    }

    sqlDump += `\nSET session_replication_role = 'origin';\n`;
    fs.writeFileSync('scripts/db_migration.sql', sqlDump, 'utf8');
    console.log(`[Export] Xuất thành công file scripts/db_migration.sql (${fs.statSync('scripts/db_migration.sql').size} bytes)`);
  } finally {
    client.release();
    await pool.end();
  }
}

exportData().catch(err => {
  console.error('[Export LỖI]:', err);
  process.exit(1);
});
