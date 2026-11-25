import { pool } from './server/db.js';

function parseDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const s = dateStr.trim();
  // Match DD/MM/YYYY
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const d = dmy[1].padStart(2, '0');
    const m = dmy[2].padStart(2, '0');
    const y = dmy[3];
    return `${y}-${m}-${d}`;
  }
  // Match YYYY-MM-DD
  const ymd = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (ymd) {
    const y = ymd[1];
    const m = ymd[2].padStart(2, '0');
    const d = ymd[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return null;
}

function isTerminatedStatus(statusStr) {
  if (!statusStr) return false;
  const s = statusStr.trim().toLowerCase();
  return (
    s === 'hết hiệu lực' ||
    s === 'đã chấm dứt' ||
    s === 'chấm dứt' ||
    s === 'đã nghỉ việc' ||
    s === 'nghỉ việc' ||
    s === 'thôi việc' ||
    s.includes('nghỉ') ||
    s.includes('chấm dứt') ||
    s.includes('hết hạn')
  );
}

async function smartMigrateWorkHistories() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Tạm xóa sạch bảng work histories để tái tạo chuẩn xác
    await client.query('TRUNCATE TABLE work_history_logs CASCADE');
    await client.query('TRUNCATE TABLE employee_work_histories CASCADE');

    // Lấy tất cả nhân viên có CCCD
    const empRes = await client.query(`
      SELECT id, msnv, full_name, cccd, department, chuc_vu, loai_hd, 
             ngay_vao, join_date, tu_ngay, den_ngay, tinh_trang, owner_id, created_at
      FROM employees
      WHERE cccd IS NOT NULL AND TRIM(cccd) <> ''
      ORDER BY cccd, created_at ASC
    `);

    // Gom nhóm theo CCCD
    const cccdMap = new Map();
    for (const emp of empRes.rows) {
      const cccd = emp.cccd.trim();
      if (!cccdMap.has(cccd)) {
        cccdMap.set(cccd, []);
      }
      cccdMap.get(cccd).push(emp);
    }

    console.log(`Tìm thấy ${cccdMap.size} thể nhân (CCCD độc nhất). Đang xử lý các đợt làm việc...`);

    let totalCreatedTurns = 0;

    for (const [cccd, empList] of cccdMap.entries()) {
      // Sắp xếp các đợt theo ngày vào làm tăng dần
      empList.sort((a, b) => {
        const dateA = parseDate(a.ngay_vao) || parseDate(a.join_date) || '2026-01-01';
        const dateB = parseDate(b.ngay_vao) || parseDate(b.join_date) || '2026-01-01';
        if (dateA !== dateB) return dateA.localeCompare(dateB);
        return (new Date(a.created_at || 0)).getTime() - (new Date(b.created_at || 0)).getTime();
      });

      let turnNumber = 1;
      for (let i = 0; i < empList.length; i++) {
        const emp = empList[i];
        const isLastRecord = (i === empList.length - 1);

        const startDate = parseDate(emp.ngay_vao) || parseDate(emp.join_date) || '2026-01-01';
        let endDate = parseDate(emp.den_ngay);

        const isTerminated = isTerminatedStatus(emp.tinh_trang);

        let status = 'active';
        let resignationType = null;
        let resignationReason = null;
        let rehireEligibility = 'eligible';

        if (!isLastRecord) {
          // Các đợt trước đợt cuối cùng BẮT BUỘC phải là đã nghỉ/kết thúc
          status = 'terminated';
          resignationType = isTerminated ? 'het_hop_dong' : 'tu_xin_nghi';
          resignationReason = 'Chuyển sang đợt tuyển dụng / hồ sơ mới';
          const nextStartDate = parseDate(empList[i + 1].ngay_vao) || parseDate(empList[i + 1].join_date);
          if (!endDate || (nextStartDate && endDate > nextStartDate)) {
            endDate = nextStartDate || startDate;
          }
        } else {
          // Đợt cuối cùng
          if (isTerminated) {
            status = 'terminated';
            resignationType = 'het_hop_dong';
            resignationReason = emp.tinh_trang || 'Hết hiệu lực hợp đồng';
            if (!endDate) {
              endDate = startDate;
            }
          } else {
            status = 'active';
            endDate = null;
          }
        }

        // Đảm bảo logic: endDate >= startDate
        if (endDate && endDate < startDate) {
          endDate = startDate;
        }

        const historyId = `wh_${emp.id}_turn_${turnNumber}`;
        await client.query(`
          INSERT INTO employee_work_histories (
            id, employee_id, cccd, msnv, turn_number,
            start_date, end_date, department, position, contract_type,
            resignation_type, resignation_reason, rehire_eligibility, status,
            approved_by, created_by, owner_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        `, [
          historyId,
          emp.id,
          cccd,
          emp.msnv,
          turnNumber,
          startDate,
          endDate,
          emp.department || 'Chưa phân bổ',
          emp.chuc_vu || 'Nhân viên',
          emp.loai_hd || 'Chính thức',
          resignationType,
          resignationReason,
          rehireEligibility,
          status,
          'HR_System',
          'system_migration',
          emp.owner_id || 'workspace_vietsun_dong_nai_v1'
        ]);

        turnNumber++;
        totalCreatedTurns++;
      }
    }

    await client.query('COMMIT');
    console.log(`ĐỒNG BỘ THÀNH CÔNG! Đã tạo ${totalCreatedTurns} đợt làm việc cho ${cccdMap.size} nhân sự.`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Lỗi khi migration:', error);
  } finally {
    client.release();
  }
  process.exit(0);
}

smartMigrateWorkHistories();
