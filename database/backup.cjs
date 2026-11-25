const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:123456@localhost:5432/hr_manager'
});

async function runBackup() {
  const tables = ['parent_departments', 'departments', 'employees', 'card_templates', 'app_settings', 'import_logs', 'print_logs', 'document_templates'];
  const backup = {};
  for (const t of tables) {
    try {
      const res = await pool.query('SELECT * FROM ' + t);
      backup[t] = res.rows;
      console.log(`[Backup] Bảng ${t}: ${res.rows.length} records`);
    } catch (e) {
      console.log(`[Backup] Bảng ${t} bỏ qua: ${e.message}`);
    }
  }

  const backupPath = path.join(__dirname, 'backup_before_3level_migration.json');
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2), 'utf8');
  console.log(`[Backup] Đã lưu bản sao lưu an toàn tại: ${backupPath}`);
  await pool.end();
}

runBackup().catch(err => {
  console.error('[Backup Error]:', err);
  pool.end();
  process.exit(1);
});
