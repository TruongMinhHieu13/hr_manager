const { Pool } = require('pg');
const { execSync } = require('child_process');
const fs = require('fs');

// Kết nối tới Windows PostgreSQL (máy Dev cá nhân)
const devPool = new Pool({
  host: '127.0.0.1',
  port: 5432,
  user: 'postgres',
  password: '123456',
  database: 'hr_manager',
});

async function syncSchemaOnly() {
  console.log('========================================================');
  console.log('  ĐỒNG BỘ CẤU TRÚC (BẢNG & CỘT) SANG DOCKER');
  console.log('  * BẢO TOÀN 100% DỮ LIỆU CHÍNH CỦA DOCKER');
  console.log('  * KHÔNG ĐÈ / KHÔNG COPY DỮ LIỆU DEV');
  console.log('========================================================\n');

  const client = await devPool.connect();

  try {
    // 1. Lấy danh sách bảng trên Dev DB
    const devTablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    const devTables = devTablesRes.rows.map(r => r.table_name);

    // 2. Lấy danh sách bảng hiện có trên Docker DB
    const dockerTablesOutput = execSync(
      `docker exec hr-postgres psql -U postgres -d hr_manager -t -A -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';"`
    ).toString();
    const dockerTables = dockerTablesOutput.split('\n').map(s => s.trim()).filter(Boolean);

    console.log(`[Dev DB] Số lượng bảng: ${devTables.length}`);
    console.log(`[Docker DB] Số lượng bảng: ${dockerTables.length}\n`);

    let migrationSql = `-- Migration cấu trúc bảng và cột (Schema only)\n`;
    let changesCount = 0;

    // 3. Kiểm tra các bảng mới trên Dev mà Docker chưa có
    for (const table of devTables) {
      if (!dockerTables.includes(table)) {
        console.log(`[+ BẢNG MỚI] Phát hiện bảng "${table}" chưa có trên Docker. Đang trích xuất cấu trúc...`);

        // Lấy định nghĩa cột để tạo bảng
        const colsRes = await client.query(`
          SELECT column_name, data_type, udt_name, character_maximum_length, column_default, is_nullable
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1
          ORDER BY ordinal_position;
        `, [table]);

        const colDefs = colsRes.rows.map(col => {
          let typeStr = col.udt_name.toUpperCase();
          if (typeStr === 'VARCHAR' && col.character_maximum_length) {
            typeStr = `VARCHAR(${col.character_maximum_length})`;
          } else if (typeStr === 'INT4') {
            typeStr = 'INT';
          } else if (typeStr === 'INT8') {
            typeStr = 'BIGINT';
          } else if (typeStr === 'BOOL') {
            typeStr = 'BOOLEAN';
          } else if (typeStr === 'TIMESTAMPTZ') {
            typeStr = 'TIMESTAMPTZ';
          }

          let def = `"${col.column_name}" ${typeStr}`;
          if (col.column_default) {
            def += ` DEFAULT ${col.column_default}`;
          }
          if (col.is_nullable === 'NO') {
            def += ` NOT NULL`;
          }
          return def;
        });

        // Lấy khóa chính nếu có
        const pkRes = await client.query(`
          SELECT c.column_name
          FROM information_schema.table_constraints tc 
          JOIN information_schema.constraint_column_usage AS ccu USING (constraint_schema, constraint_name) 
          JOIN information_schema.columns AS c ON c.table_schema = tc.constraint_schema
            AND tc.table_name = c.table_name AND ccu.column_name = c.column_name
          WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_name = $1;
        `, [table]);

        if (pkRes.rows.length > 0) {
          const pkCols = pkRes.rows.map(r => `"${r.column_name}"`).join(', ');
          colDefs.push(`PRIMARY KEY (${pkCols})`);
        }

        migrationSql += `CREATE TABLE IF NOT EXISTS "${table}" (\n  ${colDefs.join(',\n  ')}\n);\n\n`;
        changesCount++;
      } else {
        // 4. Nếu bảng đã có, so sánh từng cột để xem có cột nào mới không
        const devColsRes = await client.query(`
          SELECT column_name, data_type, udt_name, character_maximum_length, column_default
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1;
        `, [table]);

        const dockerColsOutput = execSync(
          `docker exec hr-postgres psql -U postgres -d hr_manager -t -A -c "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${table}';"`
        ).toString();
        const dockerCols = dockerColsOutput.split('\n').map(s => s.trim()).filter(Boolean);

        for (const col of devColsRes.rows) {
          if (!dockerCols.includes(col.column_name)) {
            console.log(`[+ CỘT MỚI] Bảng "${table}" có cột mới: "${col.column_name}"`);

            let typeStr = col.udt_name.toUpperCase();
            if (typeStr === 'VARCHAR' && col.character_maximum_length) {
              typeStr = `VARCHAR(${col.character_maximum_length})`;
            } else if (typeStr === 'INT4') {
              typeStr = 'INT';
            } else if (typeStr === 'INT8') {
              typeStr = 'BIGINT';
            } else if (typeStr === 'BOOL') {
              typeStr = 'BOOLEAN';
            } else if (typeStr === 'TIMESTAMPTZ') {
              typeStr = 'TIMESTAMPTZ';
            }

            let alterSql = `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${col.column_name}" ${typeStr}`;
            if (col.column_default) {
              alterSql += ` DEFAULT ${col.column_default}`;
            }
            alterSql += `;\n`;

            migrationSql += alterSql;
            changesCount++;
          }
        }
      }
    }

    if (changesCount === 0) {
      console.log('✓ Cấu trúc giữa Dev và Docker ĐÃ ĐỒNG BỘ HOÀN TOÀN!');
      console.log('  Không có bảng hoặc cột nào mới cần cập nhật.');
      return;
    }

    console.log(`\nPhát hiện ${changesCount} thay đổi cấu trúc. Đang áp dụng vào Docker DB...`);
    fs.writeFileSync('scripts/temp_schema_migration.sql', migrationSql, 'utf8');

    execSync(`docker cp scripts/temp_schema_migration.sql hr-postgres:/tmp/schema_migration.sql`);
    execSync(`docker exec hr-postgres psql -U postgres -d hr_manager -f /tmp/schema_migration.sql`);
    execSync(`docker exec hr-postgres rm -f /tmp/schema_migration.sql`);
    fs.unlinkSync('scripts/temp_schema_migration.sql');

    console.log('\n========================================================');
    console.log('✓ ĐÃ CẬP NHẬT XONG BẢNG VÀ CỘT MỚI VÀO DOCKER!');
    console.log('✓ DỮ LIỆU THỰC TẾ TRONG DOCKER ĐƯỢC GIỮ NGUYÊN 100%!');
    console.log('========================================================');
  } finally {
    client.release();
    await devPool.end();
  }
}

syncSchemaOnly().catch(err => {
  console.error('[LỖI ĐỒNG BỘ CẤU TRÚC]:', err);
  process.exit(1);
});
