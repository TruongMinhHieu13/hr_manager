import express from 'express';
import { pool } from './db.js';

const router = express.Router();
const WORKSPACE_ID = 'workspace_vietsun_dong_nai_v1';

// Middleware kiểm tra quyền HR / Quản lý
function checkHrOrManagerPermission(req, res, next) {
  const userRole = req.headers['x-user-role'] || 'HR';
  if (!['admin', 'manager', 'hr', 'HR', 'Admin'].includes(userRole)) {
    return res.status(403).json({ error: 'Bạn không có quyền truy cập thông tin lý do nghỉ việc và đánh giá tái tuyển dụng.' });
  }
  next();
}

// =============================================================================
// 1. API: KIỂM TRA CCCD & THỐNG KÊ LỊCH SỬ KHI NHẬP FORM NHÂN VIÊN MỚI
// =============================================================================
router.get('/work-history/check-cccd/:cccd', async (req, res) => {
  try {
    const cccd = (req.params.cccd || '').trim();
    if (!cccd) {
      return res.status(400).json({ error: 'Vui lòng cung cấp CCCD/CMND cần tra cứu' });
    }

    // 1. Kiểm tra tồn tại trong hồ sơ nhân viên
    const empCheck = await pool.query(
      `SELECT id, msnv, full_name, department, tinh_trang, ngay_vao, chuc_vu, loai_hd, so_dien_thoai 
       FROM employees 
       WHERE LOWER(TRIM(cccd)) = LOWER($1) 
       LIMIT 1`,
      [cccd]
    );

    // 2. Lấy thống kê lịch sử làm việc của CCCD này
    const statsQuery = await pool.query(
      `SELECT 
         COUNT(*) AS total_turns,
         COUNT(CASE WHEN status = 'terminated' OR end_date IS NOT NULL THEN 1 END) AS total_resignations,
         COUNT(CASE WHEN resignation_type = 'bo_viec' THEN 1 END) AS total_abandonments,
         COUNT(CASE WHEN status = 'active' AND end_date IS NULL THEN 1 END) AS active_turns,
         MAX(turn_number) AS max_turn
       FROM employee_work_histories
       WHERE LOWER(TRIM(cccd)) = LOWER($1)`,
      [cccd]
    );

    const stats = statsQuery.rows[0];
    const totalTurns = parseInt(stats.total_turns, 10) || (empCheck.rows.length > 0 ? 1 : 0);
    const totalResignations = parseInt(stats.total_resignations, 10) || 0;
    const totalAbandonments = parseInt(stats.total_abandonments, 10) || 0;
    const hasActiveTurn = (parseInt(stats.active_turns, 10) || 0) > 0 || 
      (empCheck.rows.length > 0 && empCheck.rows[0].tinh_trang !== 'Đã nghỉ việc');

    // Lấy thông tin đợt gần nhất
    const lastTurnQuery = await pool.query(
      `SELECT turn_number, start_date, end_date, resignation_type, resignation_reason, rehire_eligibility
       FROM employee_work_histories
       WHERE LOWER(TRIM(cccd)) = LOWER($1)
       ORDER BY turn_number DESC
       LIMIT 1`,
      [cccd]
    );

    const lastTurn = lastTurnQuery.rows[0] || null;

    let warningMessage = null;
    if (hasActiveTurn && empCheck.rows.length > 0) {
      const emp = empCheck.rows[0];
      warningMessage = `Nhân sự có CCCD ${cccd} hiện ĐANG LÀM VIỆC tại công ty (${emp.full_name} - MSNV: ${emp.msnv} - ${emp.department || 'Chưa phân bổ'}). Không thể tạo mới hoặc lưu trùng số CCCD!`;
    } else if (totalTurns > 0) {
      warningMessage = `Nhân sự này đã từng làm việc tại công ty ${totalTurns} lần (nghỉ việc ${totalResignations} lần). Vui lòng sử dụng tính năng "Tái tuyển dụng" để tiếp tục hồ sơ.`;
    }

    return res.json({
      exists: totalTurns > 0 || empCheck.rows.length > 0,
      employee: empCheck.rows[0] || null,
      summary: {
        totalTurns,
        totalResignations,
        totalAbandonments,
        hasActiveTurn,
        lastTurn,
        warningMessage,
        hasAbandonmentAlert: totalAbandonments > 0
      }
    });
  } catch (error) {
    console.error('Lỗi khi kiểm tra CCCD:', error);
    return res.status(500).json({ error: 'Lỗi hệ thống khi kiểm tra CCCD: ' + error.message });
  }
});

// =============================================================================
// 2. API: LẤY CHI TIẾT LỊCH SỬ LÀM VIỆC CỦA MỘT NHÂN VIÊN THEO EMPLOYEE_ID
// =============================================================================
router.get('/work-history/by-employee/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const userRole = req.headers['x-user-role'] || 'HR';
    const isHrOrManager = ['admin', 'manager', 'hr', 'HR', 'Admin'].includes(userRole);

    const empRes = await pool.query(
      `SELECT id, cccd, full_name, msnv, department, chuc_vu, ngay_vao, tinh_trang 
       FROM employees WHERE id = $1`, 
      [employeeId]
    );
    if (empRes.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy hồ sơ nhân viên' });
    }
    const emp = empRes.rows[0];
    const cccd = (emp.cccd || '').trim();

    let listRes = { rows: [] };
    if (cccd) {
      const reasonField = isHrOrManager ? 'resignation_reason AS "resignationReason"' : 'NULL AS "resignationReason"';
      const rehireField = isHrOrManager ? 'rehire_eligibility AS "rehireEligibility"' : "'restricted' AS \"rehireEligibility\"";

      listRes = await pool.query(
        `SELECT 
           id, employee_id AS "employeeId", cccd, msnv, turn_number AS "turnNumber",
           TO_CHAR(start_date, 'YYYY-MM-DD') AS "startDate",
           TO_CHAR(end_date, 'YYYY-MM-DD') AS "endDate",
           department, position, job_title AS "jobTitle", contract_type AS "contractType",
           resignation_type AS "resignationType",
           ${reasonField},
           ${rehireField},
           status, approved_by AS "approvedBy", created_by AS "createdBy",
           COALESCE(end_date, CURRENT_DATE) - start_date + 1 AS "workingDays",
           created_at AS "createdAt", updated_at AS "updatedAt"
         FROM employee_work_histories
         WHERE cccd = $1
         ORDER BY turn_number DESC`,
        [cccd]
      );
    }

    // Nếu chưa có bản ghi nào trong bảng lịch sử, tạo dữ liệu ảo từ bảng nhân viên
    if (listRes.rows.length === 0) {
      const isTerminated = (emp.tinh_trang || '').toLowerCase().includes('nghỉ');
      listRes.rows.push({
        id: 'wh_' + emp.id,
        employeeId: emp.id,
        cccd: emp.cccd,
        msnv: emp.msnv,
        turnNumber: 1,
        startDate: emp.ngay_vao || '2026-01-01',
        endDate: isTerminated ? '2026-11-01' : null,
        department: emp.department || 'Chưa phân bổ',
        position: emp.chuc_vu || 'Nhân viên',
        jobTitle: emp.chuc_vu || '',
        contractType: 'Chính thức',
        resignationType: isTerminated ? 'tu_xin_nghi' : null,
        resignationReason: isTerminated ? 'Đã nghỉ việc' : null,
        rehireEligibility: 'eligible',
        status: isTerminated ? 'terminated' : 'active',
        workingDays: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    let cumulativeDays = 0;
    let totalAbandonments = 0;
    let totalResignations = 0;

    listRes.rows.forEach(r => {
      cumulativeDays += Math.max(0, parseInt(r.workingDays, 10) || 0);
      if (r.resignationType === 'bo_viec') totalAbandonments++;
      if (r.status === 'terminated' || r.endDate) totalResignations++;
    });

    return res.json({
      cccd: emp.cccd,
      fullName: emp.full_name,
      currentMsnv: emp.msnv,
      statistics: {
        totalTurns: listRes.rows.length,
        totalResignations,
        cumulativeWorkingDays: cumulativeDays,
        totalAbandonments,
        alerts: [
          ...(listRes.rows.length >= 3 ? [`Đã vào làm từ ${listRes.rows.length} lần trở lên`] : []),
          ...(totalAbandonments > 0 ? [`Có ${totalAbandonments} lần bỏ việc không báo trước`] : [])
        ]
      },
      histories: listRes.rows
    });
  } catch (error) {
    console.error('Lỗi lấy lịch sử công tác:', error);
    return res.status(500).json({ error: error.message });
  }
});

// =============================================================================
// 3. API: THỰC HIỆN "CHO NGHỈ VIỆC" (TERMINATE WORK TURN)
// =============================================================================
router.post('/work-history/terminate', async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      employeeId,
      endDate,
      resignationType,
      resignationReason,
      rehireEligibility = 'eligible',
      approvedBy,
      performedBy = 'HR_Admin'
    } = req.body;

    if (!employeeId || !endDate || !resignationType) {
      return res.status(400).json({ error: 'Bắt buộc nhập ngày nghỉ việc, loại nghỉ việc và mã nhân viên.' });
    }

    await client.query('BEGIN');

    // 1. Lấy thông tin nhân viên
    const empRes = await client.query(
      `SELECT id, cccd, msnv, full_name, department, ngay_vao FROM employees WHERE id = $1 FOR UPDATE`, 
      [employeeId]
    );
    if (empRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Không tìm thấy nhân viên' });
    }
    const emp = empRes.rows[0];
    const cccd = (emp.cccd || '').trim();

    // 2. Tìm đợt làm việc đang active của CCCD này
    const activeTurnRes = await client.query(
      `SELECT * FROM employee_work_histories 
       WHERE cccd = $1 AND (status = 'active' OR end_date IS NULL)
       ORDER BY turn_number DESC LIMIT 1 FOR UPDATE`,
      [cccd]
    );

    let historyId;
    if (activeTurnRes.rows.length > 0) {
      const activeTurn = activeTurnRes.rows[0];
      historyId = activeTurn.id;

      const startDate = new Date(activeTurn.start_date);
      const terminateDate = new Date(endDate);
      if (terminateDate < startDate) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Ngày nghỉ việc không được nhỏ hơn ngày vào làm.' });
      }

      await client.query(
        `UPDATE employee_work_histories
         SET end_date = $1,
             resignation_type = $2,
             resignation_reason = $3,
             rehire_eligibility = $4,
             status = 'terminated',
             approved_by = $5,
             updated_by = $6,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $7`,
        [endDate, resignationType, resignationReason, rehireEligibility, approvedBy, performedBy, historyId]
      );

      await client.query(
        `INSERT INTO work_history_logs (id, work_history_id, cccd, action, changed_by, old_data, new_data, change_note)
         VALUES ($1, $2, $3, 'TERMINATE', $4, $5, $6, $7)`,
        [
          'log_' + Date.now(),
          historyId,
          cccd,
          performedBy,
          JSON.stringify(activeTurn),
          JSON.stringify({ endDate, resignationType, resignationReason, rehireEligibility, status: 'terminated' }),
          'Thực hiện thủ tục cho nghỉ việc'
        ]
      );
    } else {
      // Trường hợp chưa có đợt trong bảng (tạo mới và đóng luôn)
      historyId = 'wh_' + Date.now();
      await client.query(
        `INSERT INTO employee_work_histories (
           id, employee_id, cccd, msnv, turn_number, start_date, end_date,
           department, resignation_type, resignation_reason, rehire_eligibility, status,
           approved_by, created_by, owner_id
         ) VALUES ($1, $2, $3, $4, 1, CURRENT_DATE, $5, $6, $7, $8, $9, 'terminated', $10, $11, $12)`,
        [historyId, emp.id, cccd, emp.msnv, endDate, emp.department || 'Chưa phân bổ', resignationType, resignationReason, rehireEligibility, approvedBy, performedBy, WORKSPACE_ID]
      );
    }

    // 3. Cập nhật trạng thái trong bảng employees
    await client.query(
      `UPDATE employees 
       SET tinh_trang = 'Đã nghỉ việc', 
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1`,
      [employeeId]
    );

    await client.query('COMMIT');
    return res.json({ success: true, message: 'Đã hoàn tất thủ tục cho nghỉ việc và đóng lượt công tác.' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Lỗi cho nghỉ việc:', error);
    return res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// =============================================================================
// 4. API: TÁI TUYỂN DỤNG (REHIRE) - TẠO ĐỢT LÀM VIỆC MỚI
// =============================================================================
router.post('/work-history/rehire', async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      cccd,
      newMsnv,
      startDate,
      department,
      position,
      jobTitle,
      contractType = 'Thử việc',
      performedBy = 'HR_Admin'
    } = req.body;

    if (!cccd || !startDate || !department) {
      return res.status(400).json({ error: 'Bắt buộc cung cấp CCCD, ngày vào làm mới và phòng ban tiếp nhận.' });
    }

    await client.query('BEGIN');

    // 1. Kiểm tra xem người này có lượt làm việc nào đang mở hay không
    const checkActive = await client.query(
      `SELECT id, turn_number FROM employee_work_histories 
       WHERE cccd = $1 AND (status = 'active' OR end_date IS NULL) FOR UPDATE`,
      [cccd]
    );

    if (checkActive.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Nhân sự có CCCD ${cccd} đang có một đợt làm việc (Lần ${checkActive.rows[0].turn_number}) chưa đóng. Vui lòng hoàn tất thủ tục cho nghỉ việc đợt cũ trước khi tái tuyển dụng!`
      });
    }

    // 2. Tìm số lần cao nhất hiện tại của CCCD này
    const maxTurnRes = await client.query(
      `SELECT COALESCE(MAX(turn_number), 0) AS max_turn FROM employee_work_histories WHERE cccd = $1`,
      [cccd]
    );
    const nextTurn = (parseInt(maxTurnRes.rows[0].max_turn, 10) || 0) + 1;

    // 3. Tìm hồ sơ nhân viên trong bảng employees
    const empRes = await client.query(`SELECT id, msnv, owner_id FROM employees WHERE LOWER(TRIM(cccd)) = LOWER($1) LIMIT 1 FOR UPDATE`, [cccd]);
    if (empRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Không tìm thấy hồ sơ gốc của nhân sự này để tái tuyển dụng.' });
    }
    const employeeId = empRes.rows[0].id;
    const finalMsnv = newMsnv ? newMsnv.trim() : empRes.rows[0].msnv;
    const actualOwnerId = empRes.rows[0].owner_id || WORKSPACE_ID;

    if (newMsnv && newMsnv.trim() !== empRes.rows[0].msnv) {
      const checkMsnv = await client.query('SELECT id, full_name FROM employees WHERE msnv = $1 AND id <> $2', [newMsnv.trim(), employeeId]);
      if (checkMsnv.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Mã số nhân viên mới "${newMsnv}" đã được dùng cho nhân viên ${checkMsnv.rows[0].full_name}. Vui lòng chọn MSNV khác!` });
      }
    }

    // 4. Tạo bản ghi lượt làm việc mới
    const newHistoryId = 'wh_' + Date.now();
    await client.query(
      `INSERT INTO employee_work_histories (
         id, employee_id, cccd, msnv, turn_number,
         start_date, department, position, job_title, contract_type,
         status, created_by, owner_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active', $11, $12)`,
      [newHistoryId, employeeId, cccd, finalMsnv, nextTurn, startDate, department, position || 'Công nhân', jobTitle || '', contractType, performedBy, actualOwnerId]
    );

    // 5. Cập nhật thông tin nhân viên trong bảng employees (kích hoạt lại trạng thái)
    await client.query(
      `UPDATE employees 
       SET msnv = $1,
           department = $2,
           chuc_vu = $3,
           loai_hd = $4,
           ngay_vao = $5,
           tinh_trang = 'Đang làm việc',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6`,
      [finalMsnv, department, position || 'Công nhân', contractType, startDate, employeeId]
    );

    // 6. Ghi Audit Log
    await client.query(
      `INSERT INTO work_history_logs (id, work_history_id, cccd, action, changed_by, new_data, change_note)
       VALUES ($1, $2, $3, 'REHIRE', $4, $5, $6)`,
      [
        'log_' + Date.now(),
        newHistoryId,
        cccd,
        performedBy,
        JSON.stringify({ turn_number: nextTurn, startDate, department, position, finalMsnv }),
        `Tái tuyển dụng lần thứ ${nextTurn}`
      ]
    );

    await client.query('COMMIT');
    return res.json({
      success: true,
      message: `Tái tuyển dụng thành công! Đã tạo đợt làm việc Lần thứ ${nextTurn}.`,
      turnNumber: nextTurn
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Lỗi tái tuyển dụng:', error);
    return res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// =============================================================================
// 5. API: SỬA THÔNG TIN ĐỢT LÀM VIỆC (CẤM XÓA, BẮT BUỘC GHI LOG)
// =============================================================================
router.put('/work-history/:id', checkHrOrManagerPermission, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const {
      startDate,
      endDate,
      department,
      position,
      contractType,
      resignationType,
      resignationReason,
      rehireEligibility,
      changeNote,
      performedBy = 'HR_Manager'
    } = req.body;

    if (!changeNote || !changeNote.trim()) {
      return res.status(400).json({ error: 'Bắt buộc nhập lý do thay đổi thông tin lịch sử làm việc để ghi log kiểm toán.' });
    }

    await client.query('BEGIN');

    const oldDataRes = await client.query(`SELECT * FROM employee_work_histories WHERE id = $1 FOR UPDATE`, [id]);
    if (oldDataRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Không tìm thấy bản ghi lịch sử làm việc.' });
    }
    const oldData = oldDataRes.rows[0];

    const updateRes = await client.query(
      `UPDATE employee_work_histories
       SET start_date = COALESCE($1, start_date),
           end_date = $2,
           department = COALESCE($3, department),
           position = COALESCE($4, position),
           contract_type = COALESCE($5, contract_type),
           resignation_type = $6,
           resignation_reason = $7,
           rehire_eligibility = COALESCE($8, rehire_eligibility),
           status = CASE WHEN $2 IS NOT NULL THEN 'terminated' ELSE 'active' END,
           updated_by = $9,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $10
       RETURNING *`,
      [startDate, endDate || null, department, position, contractType, resignationType || null, resignationReason || null, rehireEligibility, performedBy, id]
    );

    await client.query(
      `INSERT INTO work_history_logs (id, work_history_id, cccd, action, changed_by, old_data, new_data, change_note)
       VALUES ($1, $2, $3, 'UPDATE', $4, $5, $6, $7)`,
      [
        'log_' + Date.now(),
        id,
        oldData.cccd,
        performedBy,
        JSON.stringify(oldData),
        JSON.stringify(updateRes.rows[0]),
        changeNote
      ]
    );

    await client.query('COMMIT');
    return res.json({ success: true, message: 'Cập nhật thành công và đã ghi log kiểm toán.', data: updateRes.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// =============================================================================
// 6. API: BÁO CÁO NHÂN SỰ VÀO LÀM TỪ N LẦN TRỞ LÊN & TÌM KIẾM NHANH
// =============================================================================
router.get('/work-history/report', async (req, res) => {
  try {
    const {
      minTurns = 1,
      department,
      resignationType,
      fromDate,
      toDate,
      keyword
    } = req.query;

    let filterConditions = [`1=1`];
    let queryParams = [];

    if (department) {
      queryParams.push(department);
      filterConditions.push(`wh.department = $${queryParams.length}`);
    }

    if (resignationType) {
      queryParams.push(resignationType);
      filterConditions.push(`wh.resignation_type = $${queryParams.length}`);
    }

    if (fromDate) {
      queryParams.push(fromDate);
      filterConditions.push(`wh.start_date >= $${queryParams.length}`);
    }

    if (toDate) {
      queryParams.push(toDate);
      filterConditions.push(`wh.start_date <= $${queryParams.length}`);
    }

    queryParams.push(parseInt(minTurns, 10) || 1);
    const minTurnsParamIndex = queryParams.length;

    let keywordCondition = '';
    if (keyword && keyword.trim()) {
      queryParams.push(`%${keyword.trim().toLowerCase()}%`);
      const kwIdx = queryParams.length;
      keywordCondition = `AND (LOWER(COALESCE(e.full_name, '')) LIKE $${kwIdx} OR ps.cccd LIKE $${kwIdx} OR LOWER(COALESCE(e.msnv, '')) LIKE $${kwIdx} OR LOWER(COALESCE(e.so_dien_thoai, '')) LIKE $${kwIdx})`;
    }

    const reportQuery = `
      WITH person_stats AS (
        SELECT 
          wh.cccd,
          COUNT(wh.id) AS total_turns,
          COUNT(CASE WHEN wh.status = 'terminated' OR wh.end_date IS NOT NULL THEN 1 END) AS total_resignations,
          SUM(COALESCE(wh.end_date, CURRENT_DATE) - wh.start_date + 1) AS total_working_days,
          COUNT(CASE WHEN wh.resignation_type = 'bo_viec' THEN 1 END) AS total_abandonments,
          MAX(wh.start_date) AS last_start_date
        FROM employee_work_histories wh
        WHERE ${filterConditions.join(' AND ')}
        GROUP BY wh.cccd
        HAVING COUNT(wh.id) >= $${minTurnsParamIndex}
      )
      SELECT 
        ps.*,
        e.id AS "employeeId",
        COALESCE(e.full_name, 'Nhân viên') AS "fullName",
        COALESCE(e.msnv, '') AS "currentMsnv",
        COALESCE(e.department, 'Chưa phân bổ') AS "currentDepartment",
        COALESCE(e.so_dien_thoai, '') AS "phoneNumber",
        COALESCE(e.tinh_trang, '') AS "currentStatus",
        TO_CHAR(last_turn.end_date, 'YYYY-MM-DD') AS "lastEndDate",
        last_turn.resignation_type AS "lastResignationType",
        last_turn.resignation_reason AS "lastResignationReason",
        last_turn.rehire_eligibility AS "lastRehireEligibility"
      FROM person_stats ps
      LEFT JOIN LATERAL (
        SELECT id, full_name, msnv, department, so_dien_thoai, tinh_trang
        FROM employees 
        WHERE cccd = ps.cccd
        ORDER BY 
          CASE WHEN tinh_trang NOT IN ('Hết hiệu lực', 'Đã nghỉ việc', 'Nghỉ việc', 'Thôi việc', 'Chấm dứt') THEN 0 ELSE 1 END,
          created_at DESC
        LIMIT 1
      ) e ON true
      LEFT JOIN LATERAL (
        SELECT end_date, resignation_type, resignation_reason, rehire_eligibility
        FROM employee_work_histories 
        WHERE cccd = ps.cccd AND end_date IS NOT NULL 
        ORDER BY turn_number DESC LIMIT 1
      ) last_turn ON true
      WHERE 1=1 ${keywordCondition}
      ORDER BY ps.total_turns DESC, ps.last_start_date DESC;
    `;

    const result = await pool.query(reportQuery, queryParams);
    return res.json({ data: result.rows });
  } catch (error) {
    console.error('Lỗi truy vấn báo cáo:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;
