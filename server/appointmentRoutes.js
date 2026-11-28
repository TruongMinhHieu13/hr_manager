import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pool } from './db.js';

const router = express.Router();
const WORKSPACE_ID = 'workspace_vietsun_dong_nai_v1';

// Thư mục lưu file đính kèm quyết định trên server
const UPLOAD_ROOT = path.resolve(process.cwd(), 'uploads', 'decisions');
if (!fs.existsSync(UPLOAD_ROOT)) {
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
}

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.doc', '.docx']);
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/octet-stream',
]);
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024; // 15MB

// =============================================================================
// PHÂN QUYỀN (Tương thích cơ chế x-user-role hiện tại của hệ thống)
// =============================================================================
function getUserRole(req) {
  const raw = (req.headers['x-user-role'] || 'admin').toString().trim().toLowerCase();
  if (raw === 'admin' || raw === 'administrator') return 'admin';
  if (raw === 'hr' || raw === 'manager' || raw === 'nhansu') return 'hr';
  return 'user';
}

function requireCreateEditPermission(req, res, next) {
  const role = getUserRole(req);
  if (role !== 'admin' && role !== 'hr') {
    return res.status(403).json({
      success: false,
      error: 'Bạn không có quyền thêm hoặc chỉnh sửa quyết định bổ nhiệm/miễn nhiệm.',
    });
  }
  next();
}

function requireDeletePermission(req, res, next) {
  const role = getUserRole(req);
  if (role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Chỉ Quản trị viên mới có quyền xóa quyết định bổ nhiệm/miễn nhiệm.',
    });
  }
  next();
}

// =============================================================================
// TIỆN ÍCH NGÀY THÁNG & LƯU FILE AN TOÀN
// =============================================================================
function normalizeIsoDate(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const ddmmyyyy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

function todayIsoDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function saveBase64Attachment(base64Data, originalName, mimeType) {
  if (!base64Data || !originalName) return null;

  const cleanName = path.basename(String(originalName).trim()).replace(/[^\w.\-\u00C0-\u1EF9\s]/g, '_');
  const ext = path.extname(cleanName).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error('Chỉ hỗ trợ tải lên file quyết định định dạng PDF hoặc Word (.pdf, .doc, .docx).');
  }

  const normalizedMime = (mimeType || '').toLowerCase();
  if (normalizedMime && !ALLOWED_MIME_TYPES.has(normalizedMime)) {
    throw new Error('Định dạng MIME của file đính kèm không hợp lệ.');
  }

  const base64Clean = String(base64Data).includes(',')
    ? String(base64Data).split(',')[1]
    : String(base64Data);
  const buffer = Buffer.from(base64Clean, 'base64');

  if (!buffer.length) {
    throw new Error('File đính kèm trống hoặc không hợp lệ.');
  }
  if (buffer.length > MAX_ATTACHMENT_BYTES) {
    throw new Error('Dung lượng file đính kèm vượt quá giới hạn 15MB.');
  }

  const uniqueName = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`;
  const fullPath = path.resolve(UPLOAD_ROOT, uniqueName);
  if (!fullPath.startsWith(UPLOAD_ROOT)) {
    throw new Error('Đường dẫn lưu file không hợp lệ.');
  }

  fs.writeFileSync(fullPath, buffer);
  return {
    attachmentName: cleanName,
    attachmentPath: uniqueName,
    attachmentMime:
      normalizedMime && normalizedMime !== 'application/octet-stream'
        ? normalizedMime
        : ext === '.pdf'
          ? 'application/pdf'
          : ext === '.docx'
            ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            : 'application/msword',
    attachmentSize: buffer.length,
  };
}

function removeAttachmentFile(relativePath) {
  if (!relativePath) return;
  try {
    const safeBase = path.basename(relativePath);
    const fullPath = path.resolve(UPLOAD_ROOT, safeBase);
    if (fullPath.startsWith(UPLOAD_ROOT) && fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch (err) {
    console.warn('[Appointments] Không thể xóa file đính kèm cũ:', err.message);
  }
}

// =============================================================================
// ĐỒNG BỘ QUYẾT ĐỊNH ĐẾN NGÀY HIỆU LỰC (CHẠY TRONG TRANSACTION)
// =============================================================================
async function applyAppointmentToEmployee(client, decisionRow) {
  const empId = decisionRow.employee_id;
  const effDate = decisionRow.effective_date;

  if (decisionRow.decision_type === 'bo_nhiem') {
    // 1. Kết thúc chức vụ hiện tại nếu có (mỗi người chỉ giữ 1 chức vụ)
    await client.query(
      `UPDATE employee_position_histories
       SET is_current = false,
           status = 'replaced',
           end_date = COALESCE(end_date, $2::date),
           updated_at = CURRENT_TIMESTAMP
       WHERE employee_id = $1
         AND is_current = true
         AND (appointment_decision_id IS NULL OR appointment_decision_id <> $3)`,
      [empId, effDate, decisionRow.id]
    );

    await client.query(
      `UPDATE appointment_decisions
       SET status = 'replaced', updated_at = CURRENT_TIMESTAMP
       WHERE employee_id = $1
         AND decision_type = 'bo_nhiem'
         AND status = 'effective'
         AND id <> $2`,
      [empId, decisionRow.id]
    );

    // 2. Kích hoạt bản ghi lịch sử chức vụ tương ứng
    const histRes = await client.query(
      `UPDATE employee_position_histories
       SET is_current = true,
           status = 'active',
           position_title = $2,
           division_name = $3,
           department_name = $4,
           sub_department_name = $5,
           appointment_number = $6,
           start_date = $7::date,
           term_end_date = $8::date,
           end_date = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE appointment_decision_id = $1
       RETURNING id`,
      [
        decisionRow.id,
        decisionRow.position_title,
        decisionRow.division_name || '',
        decisionRow.department_name || '',
        decisionRow.sub_department_name || '',
        decisionRow.decision_number,
        effDate,
        decisionRow.end_date || null,
      ]
    );

    if (histRes.rowCount === 0) {
      await client.query(
        `INSERT INTO employee_position_histories (
           id, employee_id, msnv, full_name, position_title,
           division_name, department_name, sub_department_name,
           appointment_decision_id, appointment_number,
           start_date, term_end_date, is_current, status, note, owner_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::date,$12::date,true,'active',$13,$14)`,
        [
          `pos_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
          empId,
          decisionRow.msnv || '',
          decisionRow.full_name || '',
          decisionRow.position_title,
          decisionRow.division_name || '',
          decisionRow.department_name || '',
          decisionRow.sub_department_name || '',
          decisionRow.id,
          decisionRow.decision_number,
          effDate,
          decisionRow.end_date || null,
          decisionRow.notes || '',
          decisionRow.owner_id || WORKSPACE_ID,
        ]
      );
    }

    // 3. Cập nhật chức vụ, công việc & đơn vị/phòng ban hiện tại trên bảng employees
    await client.query(
      `UPDATE employees
       SET chuc_vu = $2,
           cong_viec = $2,
           department = CASE WHEN $3 <> '' THEN $3 ELSE department END,
           phong_ban = CASE WHEN $3 <> '' THEN $3 ELSE phong_ban END,
           khoi = CASE WHEN $4 <> '' THEN $4 ELSE khoi END,
           phong_ban_con = CASE WHEN $5 <> '' THEN $5 ELSE phong_ban_con END,
           division_id = CASE WHEN $6 <> '' THEN $6 ELSE division_id END,
           department_id = CASE WHEN $7 <> '' THEN $7 ELSE department_id END,
           sub_department_id = CASE WHEN $8 <> '' THEN $8 ELSE sub_department_id END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [
        empId,
        decisionRow.position_title,
        decisionRow.department_name || '',
        decisionRow.division_name || '',
        decisionRow.sub_department_name || '',
        decisionRow.division_id || '',
        decisionRow.department_id || '',
        decisionRow.sub_department_id || '',
      ]
    );

    // 4. Đánh dấu quyết định đã được áp dụng
    await client.query(
      `UPDATE appointment_decisions
       SET applied_to_employee = true,
           status = 'effective',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [decisionRow.id]
    );
  } else if (decisionRow.decision_type === 'mien_nhiem') {
    // 1. Tìm chức vụ đang giữ để kết thúc
    const activeHist = await client.query(
      `SELECT id, appointment_decision_id
       FROM employee_position_histories
       WHERE employee_id = $1 AND is_current = true
       ORDER BY start_date DESC, created_at DESC
       LIMIT 1`,
      [empId]
    );

    if (activeHist.rowCount > 0) {
      const h = activeHist.rows[0];
      await client.query(
        `UPDATE employee_position_histories
         SET is_current = false,
             status = 'dismissed',
             end_date = $2::date,
             dismissal_decision_id = $3,
             dismissal_number = $4,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [h.id, effDate, decisionRow.id, decisionRow.decision_number]
      );

      if (h.appointment_decision_id) {
        await client.query(
          `UPDATE appointment_decisions
           SET status = 'dismissed', updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [h.appointment_decision_id]
        );
      }
    } else {
      // Nếu nhân sự trước đó chỉ có chức vụ từ hồ sơ (chưa có quyết định bổ nhiệm), vẫn ghi nhận lịch sử miễn nhiệm
      await client.query(
        `INSERT INTO employee_position_histories (
           id, employee_id, msnv, full_name, position_title,
           division_name, department_name, sub_department_name,
           dismissal_decision_id, dismissal_number,
           start_date, end_date, is_current, status, note, owner_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::date,$11::date,false,'dismissed',$12,$13)`,
        [
          `pos_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
          empId,
          decisionRow.msnv || '',
          decisionRow.full_name || '',
          decisionRow.position_title,
          decisionRow.division_name || '',
          decisionRow.department_name || '',
          decisionRow.sub_department_name || '',
          decisionRow.id,
          decisionRow.decision_number,
          effDate,
          decisionRow.reason || decisionRow.notes || '',
          decisionRow.owner_id || WORKSPACE_ID,
        ]
      );
    }

    // 2. Xóa chức vụ & công việc hiện tại của nhân sự (vì mỗi người chỉ giữ 1 chức vụ)
    await client.query(
      `UPDATE employees
       SET chuc_vu = '',
           cong_viec = '',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [empId]
    );

    // 3. Đánh dấu quyết định miễn nhiệm đã được áp dụng
    await client.query(
      `UPDATE appointment_decisions
       SET applied_to_employee = true,
           status = 'effective',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [decisionRow.id]
    );
  }
}

export async function syncDueAppointmentDecisions(externalClient = null) {
  const client = externalClient || (await pool.connect());
  const manageTx = !externalClient;
  try {
    if (manageTx) await client.query('BEGIN');

    const dueRes = await client.query(
      `SELECT *
       FROM appointment_decisions
       WHERE applied_to_employee = false
         AND status = 'pending_effective'
         AND effective_date <= CURRENT_DATE
       ORDER BY effective_date ASC, created_at ASC`
    );

    for (const row of dueRes.rows) {
      await applyAppointmentToEmployee(client, row);
    }

    // Cập nhật trạng thái hết nhiệm kỳ nếu quá end_date
    await client.query(
      `UPDATE appointment_decisions
       SET status = 'expired', updated_at = CURRENT_TIMESTAMP
       WHERE decision_type = 'bo_nhiem'
         AND status = 'effective'
         AND end_date IS NOT NULL
         AND end_date < CURRENT_DATE`
    );

    // Đảm bảo đồng bộ cong_viec cho các quyết định bổ nhiệm đang hiệu lực
    await client.query(
      `UPDATE employees e
       SET cong_viec = d.position_title
       FROM appointment_decisions d
       WHERE d.employee_id = e.id
         AND d.decision_type = 'bo_nhiem'
         AND d.status = 'effective'
         AND d.applied_to_employee = true
         AND COALESCE(e.cong_viec, '') <> d.position_title`
    );

    if (manageTx) await client.query('COMMIT');
  } catch (err) {
    if (manageTx) {
      try {
        await client.query('ROLLBACK');
      } catch {}
    }
    console.error('[Appointments] Lỗi đồng bộ quyết định đến hạn hiệu lực:', err);
  } finally {
    if (manageTx) client.release();
  }
}

function mapDecisionRow(r) {
  return {
    id: r.id,
    decisionType: r.decision_type,
    employeeId: r.employee_id,
    msnv: r.msnv,
    fullName: r.full_name,
    positionTitle: r.position_title,
    divisionId: r.division_id || '',
    divisionName: r.division_name || '',
    departmentId: r.department_id || '',
    departmentName: r.department_name || '',
    subDepartmentId: r.sub_department_id || '',
    subDepartmentName: r.sub_department_name || '',
    previousPosition: r.previous_position || '',
    previousDepartment: r.previous_department || '',
    decisionNumber: r.decision_number,
    signDate: r.sign_date ? new Date(r.sign_date).toISOString().slice(0, 10) : '',
    effectiveDate: r.effective_date ? new Date(r.effective_date).toISOString().slice(0, 10) : '',
    endDate: r.end_date ? new Date(r.end_date).toISOString().slice(0, 10) : '',
    signerName: r.signer_name || '',
    reason: r.reason || '',
    notes: r.notes || '',
    attachmentName: r.attachment_name || '',
    attachmentPath: r.attachment_path || '',
    attachmentMime: r.attachment_mime || '',
    attachmentSize: r.attachment_size || 0,
    status: r.status,
    appliedToEmployee: Boolean(r.applied_to_employee),
    createdBy: r.created_by || '',
    updatedBy: r.updated_by || '',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapPositionHistoryRow(r) {
  return {
    id: r.id,
    employeeId: r.employee_id,
    msnv: r.msnv,
    fullName: r.full_name,
    positionTitle: r.position_title,
    previousPosition: r.previous_position || '',
    previousDepartment: r.previous_department || '',
    divisionName: r.division_name || '',
    departmentName: r.department_name || '',
    subDepartmentName: r.sub_department_name || '',
    appointmentDecisionId: r.appointment_decision_id || null,
    dismissalDecisionId: r.dismissal_decision_id || null,
    appointmentNumber: r.appointment_number || '',
    dismissalNumber: r.dismissal_number || '',
    startDate: r.start_date ? new Date(r.start_date).toISOString().slice(0, 10) : '',
    endDate: r.end_date ? new Date(r.end_date).toISOString().slice(0, 10) : '',
    termEndDate: r.term_end_date ? new Date(r.term_end_date).toISOString().slice(0, 10) : '',
    isCurrent: Boolean(r.is_current),
    status: r.status,
    note: r.note || '',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// =============================================================================
// 1. DANH SÁCH QUYẾT ĐỊNH BỔ NHIỆM / MIỄN NHIỆM (CÓ LỌC & TÌM KIẾM)
// =============================================================================
router.get('/appointments', async (req, res) => {
  try {
    await syncDueAppointmentDecisions();

    const { type, search, position, department, status, fromDate, toDate } = req.query;
    const conditions = [];
    const params = [];

    if (type === 'bo_nhiem' || type === 'mien_nhiem') {
      params.push(type);
      conditions.push(`d.decision_type = $${params.length}`);
    }
    if (search && String(search).trim()) {
      params.push(`%${String(search).trim()}%`);
      conditions.push(
        `(d.full_name ILIKE $${params.length} OR d.msnv ILIKE $${params.length} OR d.decision_number ILIKE $${params.length} OR d.position_title ILIKE $${params.length})`
      );
    }
    if (position && String(position).trim()) {
      params.push(`%${String(position).trim()}%`);
      conditions.push(`d.position_title ILIKE $${params.length}`);
    }
    if (department && String(department).trim()) {
      params.push(String(department).trim());
      conditions.push(`d.department_name = $${params.length}`);
    }
    if (status && String(status).trim()) {
      params.push(String(status).trim());
      conditions.push(`d.status = $${params.length}`);
    }
    if (fromDate && normalizeIsoDate(fromDate)) {
      params.push(normalizeIsoDate(fromDate));
      conditions.push(`d.effective_date >= $${params.length}::date`);
    }
    if (toDate && normalizeIsoDate(toDate)) {
      params.push(normalizeIsoDate(toDate));
      conditions.push(`d.effective_date <= $${params.length}::date`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT d.*
       FROM appointment_decisions d
       ${whereClause}
       ORDER BY d.effective_date DESC, d.created_at DESC`,
      params
    );

    return res.json({
      success: true,
      decisions: result.rows.map(mapDecisionRow),
    });
  } catch (err) {
    console.error('[GET /appointments] Lỗi:', err);
    return res.status(500).json({ success: false, error: 'Không thể tải danh sách quyết định: ' + err.message });
  }
});

// =============================================================================
// 2. LỊCH SỬ CHỨC VỤ TOÀN CÔNG TY HOẶC THEO NHÂN SỰ
// =============================================================================
router.get('/appointments/position-histories', async (req, res) => {
  try {
    await syncDueAppointmentDecisions();
    const { employeeId, search } = req.query;

    const conditions = [];
    const params = [];
    if (employeeId && String(employeeId).trim()) {
      params.push(String(employeeId).trim());
      conditions.push(`h.employee_id = $${params.length}`);
    }
    if (search && String(search).trim()) {
      params.push(`%${String(search).trim()}%`);
      conditions.push(
        `(h.full_name ILIKE $${params.length} OR h.msnv ILIKE $${params.length} OR h.position_title ILIKE $${params.length} OR h.department_name ILIKE $${params.length})`
      );
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT h.*,
              COALESCE(ad.previous_position, md.previous_position, '') AS previous_position,
              COALESCE(ad.previous_department, md.previous_department, '') AS previous_department
       FROM employee_position_histories h
       LEFT JOIN appointment_decisions ad ON ad.id = h.appointment_decision_id
       LEFT JOIN appointment_decisions md ON md.id = h.dismissal_decision_id
       ${whereClause}
       ORDER BY h.is_current DESC, h.start_date DESC, h.created_at DESC`,
      params
    );

    return res.json({
      success: true,
      histories: result.rows.map(mapPositionHistoryRow),
    });
  } catch (err) {
    console.error('[GET /appointments/position-histories] Lỗi:', err);
    return res.status(500).json({ success: false, error: 'Không thể tải lịch sử chức vụ: ' + err.message });
  }
});

router.get('/appointments/by-employee/:employeeId', async (req, res) => {
  try {
    await syncDueAppointmentDecisions();
    const { employeeId } = req.params;

    const [empRes, histRes, decRes] = await Promise.all([
      pool.query(
        `SELECT id, msnv, full_name AS "fullName", department, chuc_vu AS "chucVu", ngay_vao AS "ngayVao"
         FROM employees WHERE id = $1`,
        [employeeId]
      ),
      pool.query(
        `SELECT h.*,
                COALESCE(ad.previous_position, md.previous_position, '') AS previous_position,
                COALESCE(ad.previous_department, md.previous_department, '') AS previous_department
         FROM employee_position_histories h
         LEFT JOIN appointment_decisions ad ON ad.id = h.appointment_decision_id
         LEFT JOIN appointment_decisions md ON md.id = h.dismissal_decision_id
         WHERE h.employee_id = $1
         ORDER BY h.start_date DESC, h.created_at DESC`,
        [employeeId]
      ),
      pool.query(
        `SELECT * FROM appointment_decisions
         WHERE employee_id = $1
         ORDER BY effective_date DESC, created_at DESC`,
        [employeeId]
      ),
    ]);

    if (empRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy nhân sự.' });
    }

    return res.json({
      success: true,
      employee: empRes.rows[0],
      histories: histRes.rows.map(mapPositionHistoryRow),
      decisions: decRes.rows.map(mapDecisionRow),
    });
  } catch (err) {
    console.error('[GET /appointments/by-employee/:employeeId] Lỗi:', err);
    return res.status(500).json({ success: false, error: 'Lỗi tải lịch sử chức vụ: ' + err.message });
  }
});

// =============================================================================
// 3. XEM CHI TIẾT & TẢI FILE ĐÍNH KÈM
// =============================================================================
router.get('/appointments/:id', async (req, res) => {
  try {
    await syncDueAppointmentDecisions();
    const result = await pool.query(`SELECT * FROM appointment_decisions WHERE id = $1`, [req.params.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy quyết định.' });
    }
    return res.json({ success: true, decision: mapDecisionRow(result.rows[0]) });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/appointments/:id/attachment', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT attachment_name, attachment_path, attachment_mime FROM appointment_decisions WHERE id = $1`,
      [req.params.id]
    );
    if (result.rowCount === 0 || !result.rows[0].attachment_path) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy file đính kèm.' });
    }

    const row = result.rows[0];
    const safeBase = path.basename(row.attachment_path);
    const fullPath = path.resolve(UPLOAD_ROOT, safeBase);
    if (!fullPath.startsWith(UPLOAD_ROOT) || !fs.existsSync(fullPath)) {
      return res.status(404).json({ success: false, error: 'File đính kèm không tồn tại trên máy chủ.' });
    }

    const disposition = req.query.download === '1' ? 'attachment' : 'inline';
    res.setHeader('Content-Type', row.attachment_mime || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename*=UTF-8''${encodeURIComponent(row.attachment_name || safeBase)}`
    );
    return res.sendFile(fullPath);
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Lỗi tải file đính kèm: ' + err.message });
  }
});

// =============================================================================
// 4. TẠO MỚI QUYẾT ĐỊNH BỔ NHIỆM / MIỄN NHIỆM (TRANSACTION)
// =============================================================================
router.post('/appointments', requireCreateEditPermission, async (req, res) => {
  const client = await pool.connect();
  let savedAttachment = null;

  try {
    const {
      decisionType,
      employeeId,
      positionTitle,
      divisionId = '',
      divisionName = '',
      departmentId = '',
      departmentName = '',
      subDepartmentId = '',
      subDepartmentName = '',
      decisionNumber,
      signDate,
      effectiveDate,
      endDate = null,
      signerName = '',
      reason = '',
      notes = '',
      attachmentBase64,
      attachmentName,
      attachmentMime,
    } = req.body || {};

    if (!['bo_nhiem', 'mien_nhiem'].includes(decisionType)) {
      return res.status(400).json({ success: false, error: 'Loại quyết định không hợp lệ.' });
    }
    if (!employeeId) {
      return res.status(400).json({ success: false, error: 'Vui lòng chọn nhân sự.' });
    }
    if (!positionTitle || !String(positionTitle).trim()) {
      return res.status(400).json({ success: false, error: 'Vui lòng nhập chức vụ.' });
    }
    if (!decisionNumber || !String(decisionNumber).trim()) {
      return res.status(400).json({ success: false, error: 'Vui lòng nhập số quyết định.' });
    }

    const isoSignDate = normalizeIsoDate(signDate);
    const isoEffectiveDate = normalizeIsoDate(effectiveDate);
    const isoEndDate = endDate ? normalizeIsoDate(endDate) : null;

    if (!isoSignDate || !isoEffectiveDate) {
      return res.status(400).json({ success: false, error: 'Ngày ký và ngày hiệu lực không hợp lệ.' });
    }
    if (isoEndDate && isoEndDate < isoEffectiveDate) {
      return res.status(400).json({
        success: false,
        error: 'Ngày kết thúc nhiệm kỳ phải lớn hơn hoặc bằng ngày có hiệu lực.',
      });
    }
    if (decisionType === 'mien_nhiem' && (!reason || !String(reason).trim())) {
      return res.status(400).json({ success: false, error: 'Vui lòng nhập lý do miễn nhiệm.' });
    }

    if (attachmentBase64 && attachmentName) {
      savedAttachment = saveBase64Attachment(attachmentBase64, attachmentName, attachmentMime);
    }

    await client.query('BEGIN');

    // Kiểm tra trùng số quyết định (không phân biệt hoa thường/khoảng trắng)
    const dupCheck = await client.query(
      `SELECT id FROM appointment_decisions WHERE LOWER(TRIM(decision_number)) = LOWER(TRIM($1)) LIMIT 1`,
      [decisionNumber]
    );
    if (dupCheck.rowCount > 0) {
      await client.query('ROLLBACK');
      if (savedAttachment) removeAttachmentFile(savedAttachment.attachmentPath);
      return res.status(409).json({
        success: false,
        error: `Số quyết định "${String(decisionNumber).trim()}" đã tồn tại trong hệ thống.`,
      });
    }

    // Kiểm tra nhân sự tồn tại
    const empRes = await client.query(
      `SELECT id, msnv, full_name, department, chuc_vu, cong_viec FROM employees WHERE id = $1`,
      [employeeId]
    );
    if (empRes.rowCount === 0) {
      await client.query('ROLLBACK');
      if (savedAttachment) removeAttachmentFile(savedAttachment.attachmentPath);
      return res.status(404).json({ success: false, error: 'Không tìm thấy nhân sự được chọn.' });
    }
    const emp = empRes.rows[0];

    const finalDeptName = String(departmentName || emp.department || '').trim();
    if (!finalDeptName) {
      await client.query('ROLLBACK');
      if (savedAttachment) removeAttachmentFile(savedAttachment.attachmentPath);
      return res.status(400).json({ success: false, error: 'Vui lòng chọn đơn vị/phòng ban công tác.' });
    }

    const isFuture = isoEffectiveDate > todayIsoDate();
    const newId = `dec_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const userRole = getUserRole(req);

    const insertRes = await client.query(
      `INSERT INTO appointment_decisions (
         id, decision_type, employee_id, msnv, full_name,
         position_title, division_id, division_name, department_id, department_name,
         sub_department_id, sub_department_name, previous_position, previous_department,
         decision_number, sign_date, effective_date, end_date, signer_name, reason, notes,
         attachment_name, attachment_path, attachment_mime, attachment_size,
         status, applied_to_employee, created_by, updated_by, owner_id
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::date,$17::date,$18::date,$19,$20,$21,
         $22,$23,$24,$25,$26,$27,$28,$28,$29
       )
       RETURNING *`,
      [
        newId,
        decisionType,
        emp.id,
        emp.msnv || '',
        emp.full_name || '',
        String(positionTitle).trim(),
        divisionId,
        divisionName,
        departmentId,
        finalDeptName,
        subDepartmentId,
        subDepartmentName,
        emp.cong_viec || emp.chuc_vu || '',
        emp.department || '',
        String(decisionNumber).trim(),
        isoSignDate,
        isoEffectiveDate,
        isoEndDate,
        String(signerName || '').trim(),
        String(reason || '').trim(),
        String(notes || '').trim(),
        savedAttachment?.attachmentName || '',
        savedAttachment?.attachmentPath || '',
        savedAttachment?.attachmentMime || '',
        savedAttachment?.attachmentSize || 0,
        isFuture ? 'pending_effective' : 'effective',
        false,
        userRole,
        WORKSPACE_ID,
      ]
    );

    const createdRow = insertRes.rows[0];

    if (isFuture) {
      // Quyết định hiệu lực tương lai: nếu là bổ nhiệm, ghi nhận bản ghi lịch sử trạng thái 'pending'
      if (decisionType === 'bo_nhiem') {
        await client.query(
          `INSERT INTO employee_position_histories (
             id, employee_id, msnv, full_name, position_title,
             division_name, department_name, sub_department_name,
             appointment_decision_id, appointment_number,
             start_date, term_end_date, is_current, status, note, owner_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::date,$12::date,false,'pending',$13,$14)`,
          [
            `pos_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
            emp.id,
            emp.msnv || '',
            emp.full_name || '',
            String(positionTitle).trim(),
            divisionName,
            finalDeptName,
            subDepartmentName,
            createdRow.id,
            createdRow.decision_number,
            isoEffectiveDate,
            isoEndDate,
            String(notes || '').trim(),
            WORKSPACE_ID,
          ]
        );
      }
    } else {
      // Hiệu lực ngay: áp dụng trực tiếp vào lịch sử chức vụ & nhân sự
      await applyAppointmentToEmployee(client, createdRow);
    }

    await client.query('COMMIT');

    const finalRes = await pool.query(`SELECT * FROM appointment_decisions WHERE id = $1`, [newId]);
    return res.status(201).json({
      success: true,
      decision: mapDecisionRow(finalRes.rows[0]),
      message: isFuture
        ? 'Đã lưu quyết định ở trạng thái Chờ hiệu lực (sẽ tự động cập nhật khi đến ngày hiệu lực).'
        : decisionType === 'bo_nhiem'
          ? 'Đã ban hành quyết định bổ nhiệm và cập nhật chức vụ, đơn vị cho nhân sự.'
          : 'Đã ban hành quyết định miễn nhiệm và cập nhật trạng thái chức vụ cho nhân sự.',
    });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    if (savedAttachment) removeAttachmentFile(savedAttachment.attachmentPath);
    console.error('[POST /appointments] Lỗi:', err);
    return res.status(400).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

// =============================================================================
// 5. CẬP NHẬT QUYẾT ĐỊNH (TRANSACTION)
// =============================================================================
router.put('/appointments/:id', requireCreateEditPermission, async (req, res) => {
  const client = await pool.connect();
  let newSavedAttachment = null;

  try {
    const { id } = req.params;
    const {
      positionTitle,
      divisionId = '',
      divisionName = '',
      departmentId = '',
      departmentName = '',
      subDepartmentId = '',
      subDepartmentName = '',
      decisionNumber,
      signDate,
      effectiveDate,
      endDate = null,
      signerName = '',
      reason = '',
      notes = '',
      attachmentBase64,
      attachmentName,
      attachmentMime,
      removeAttachment = false,
    } = req.body || {};

    const existingRes = await client.query(`SELECT * FROM appointment_decisions WHERE id = $1`, [id]);
    if (existingRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy quyết định cần sửa.' });
    }
    const existing = existingRes.rows[0];

    if (!positionTitle || !String(positionTitle).trim()) {
      return res.status(400).json({ success: false, error: 'Vui lòng nhập chức vụ.' });
    }
    if (!decisionNumber || !String(decisionNumber).trim()) {
      return res.status(400).json({ success: false, error: 'Vui lòng nhập số quyết định.' });
    }

    const isoSignDate = normalizeIsoDate(signDate);
    const isoEffectiveDate = normalizeIsoDate(effectiveDate);
    const isoEndDate = endDate ? normalizeIsoDate(endDate) : null;

    if (!isoSignDate || !isoEffectiveDate) {
      return res.status(400).json({ success: false, error: 'Ngày ký và ngày hiệu lực không hợp lệ.' });
    }
    if (isoEndDate && isoEndDate < isoEffectiveDate) {
      return res.status(400).json({
        success: false,
        error: 'Ngày kết thúc nhiệm kỳ phải lớn hơn hoặc bằng ngày có hiệu lực.',
      });
    }
    if (existing.decision_type === 'mien_nhiem' && (!reason || !String(reason).trim())) {
      return res.status(400).json({ success: false, error: 'Vui lòng nhập lý do miễn nhiệm.' });
    }

    if (attachmentBase64 && attachmentName) {
      newSavedAttachment = saveBase64Attachment(attachmentBase64, attachmentName, attachmentMime);
    }

    await client.query('BEGIN');

    // Kiểm tra trùng số quyết định (trừ chính nó)
    const dupCheck = await client.query(
      `SELECT id FROM appointment_decisions
       WHERE LOWER(TRIM(decision_number)) = LOWER(TRIM($1)) AND id <> $2
       LIMIT 1`,
      [decisionNumber, id]
    );
    if (dupCheck.rowCount > 0) {
      await client.query('ROLLBACK');
      if (newSavedAttachment) removeAttachmentFile(newSavedAttachment.attachmentPath);
      return res.status(409).json({
        success: false,
        error: `Số quyết định "${String(decisionNumber).trim()}" đã được sử dụng cho quyết định khác.`,
      });
    }

    const nextAttachName = newSavedAttachment
      ? newSavedAttachment.attachmentName
      : removeAttachment
        ? ''
        : existing.attachment_name;
    const nextAttachPath = newSavedAttachment
      ? newSavedAttachment.attachmentPath
      : removeAttachment
        ? ''
        : existing.attachment_path;
    const nextAttachMime = newSavedAttachment
      ? newSavedAttachment.attachmentMime
      : removeAttachment
        ? ''
        : existing.attachment_mime;
    const nextAttachSize = newSavedAttachment
      ? newSavedAttachment.attachmentSize
      : removeAttachment
        ? 0
        : existing.attachment_size;

    const isFuture = isoEffectiveDate > todayIsoDate();
    const nextStatus = isFuture
      ? 'pending_effective'
      : existing.status === 'pending_effective'
        ? 'effective'
        : existing.status;

    const updatedRes = await client.query(
      `UPDATE appointment_decisions
       SET position_title = $2,
           division_id = $3,
           division_name = $4,
           department_id = $5,
           department_name = $6,
           sub_department_id = $7,
           sub_department_name = $8,
           decision_number = $9,
           sign_date = $10::date,
           effective_date = $11::date,
           end_date = $12::date,
           signer_name = $13,
           reason = $14,
           notes = $15,
           attachment_name = $16,
           attachment_path = $17,
           attachment_mime = $18,
           attachment_size = $19,
           status = $20,
           updated_by = $21,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [
        id,
        String(positionTitle).trim(),
        divisionId,
        divisionName,
        departmentId,
        String(departmentName || existing.department_name || '').trim(),
        subDepartmentId,
        subDepartmentName,
        String(decisionNumber).trim(),
        isoSignDate,
        isoEffectiveDate,
        isoEndDate,
        String(signerName || '').trim(),
        String(reason || '').trim(),
        String(notes || '').trim(),
        nextAttachName,
        nextAttachPath,
        nextAttachMime,
        nextAttachSize,
        nextStatus,
        getUserRole(req),
      ]
    );

    const updatedRow = updatedRes.rows[0];

    if (updatedRow.decision_type === 'bo_nhiem') {
      await client.query(
        `UPDATE employee_position_histories
         SET position_title = $2,
             division_name = $3,
             department_name = $4,
             sub_department_name = $5,
             appointment_number = $6,
             start_date = $7::date,
             term_end_date = $8::date,
             note = $9,
             updated_at = CURRENT_TIMESTAMP
         WHERE appointment_decision_id = $1`,
        [
          id,
          updatedRow.position_title,
          updatedRow.division_name,
          updatedRow.department_name,
          updatedRow.sub_department_name,
          updatedRow.decision_number,
          isoEffectiveDate,
          isoEndDate,
          updatedRow.notes,
        ]
      );

      // Nếu quyết định đang hiệu lực, đồng bộ lại thông tin chức vụ & phòng ban lên employees
      if (!isFuture && updatedRow.status === 'effective') {
        await applyAppointmentToEmployee(client, updatedRow);
      }
    } else if (updatedRow.decision_type === 'mien_nhiem') {
      await client.query(
        `UPDATE employee_position_histories
         SET dismissal_number = $2,
             end_date = $3::date,
             updated_at = CURRENT_TIMESTAMP
         WHERE dismissal_decision_id = $1`,
        [id, updatedRow.decision_number, isoEffectiveDate]
      );

      if (!isFuture && !updatedRow.applied_to_employee) {
        await applyAppointmentToEmployee(client, updatedRow);
      }
    }

    await client.query('COMMIT');

    if ((newSavedAttachment || removeAttachment) && existing.attachment_path) {
      removeAttachmentFile(existing.attachment_path);
    }

    const finalRes = await pool.query(`SELECT * FROM appointment_decisions WHERE id = $1`, [id]);
    return res.json({
      success: true,
      decision: mapDecisionRow(finalRes.rows[0]),
      message: 'Đã cập nhật quyết định thành công.',
    });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    if (newSavedAttachment) removeAttachmentFile(newSavedAttachment.attachmentPath);
    console.error('[PUT /appointments/:id] Lỗi:', err);
    return res.status(400).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

// =============================================================================
// 6. XÓA QUYẾT ĐỊNH (CHỈ ADMIN - TRANSACTION)
// =============================================================================
router.delete('/appointments/:id', requireDeletePermission, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query('BEGIN');

    const existingRes = await client.query(`SELECT * FROM appointment_decisions WHERE id = $1`, [id]);
    if (existingRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Không tìm thấy quyết định cần xóa.' });
    }
    const dec = existingRes.rows[0];

    if (dec.decision_type === 'bo_nhiem') {
      // Nếu quyết định này đang là chức vụ hiện tại của nhân sự -> khôi phục chức vụ trước đó
      if (dec.applied_to_employee && dec.status === 'effective') {
        await client.query(
          `UPDATE employees
           SET chuc_vu = $2,
               cong_viec = $2,
               department = CASE WHEN $3 <> '' THEN $3 ELSE department END,
               phong_ban = CASE WHEN $3 <> '' THEN $3 ELSE phong_ban END,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [dec.employee_id, dec.previous_position || '', dec.previous_department || '']
        );
      }
      await client.query(`DELETE FROM employee_position_histories WHERE appointment_decision_id = $1`, [id]);
    } else if (dec.decision_type === 'mien_nhiem') {
      // Nếu quyết định miễn nhiệm này đã áp dụng, khôi phục lại trạng thái chức vụ trước khi miễn nhiệm
      if (dec.applied_to_employee) {
        const linkedHist = await client.query(
          `SELECT id, appointment_decision_id, position_title
           FROM employee_position_histories
           WHERE dismissal_decision_id = $1
           LIMIT 1`,
          [id]
        );
        if (linkedHist.rowCount > 0) {
          const lh = linkedHist.rows[0];
          if (lh.appointment_decision_id) {
            await client.query(
              `UPDATE employee_position_histories
               SET is_current = true, status = 'active', end_date = NULL,
                   dismissal_decision_id = NULL, dismissal_number = '',
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $1`,
              [lh.id]
            );
            await client.query(
              `UPDATE appointment_decisions
               SET status = 'effective', updated_at = CURRENT_TIMESTAMP
               WHERE id = $1`,
              [lh.appointment_decision_id]
            );
          } else {
            await client.query(`DELETE FROM employee_position_histories WHERE id = $1`, [lh.id]);
          }
          await client.query(
            `UPDATE employees SET chuc_vu = $2, cong_viec = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [dec.employee_id, dec.position_title]
          );
        }
      }
    }

    await client.query(`DELETE FROM appointment_decisions WHERE id = $1`, [id]);
    await client.query('COMMIT');

    if (dec.attachment_path) {
      removeAttachmentFile(dec.attachment_path);
    }

    return res.json({ success: true, message: 'Đã xóa quyết định và đồng bộ lại dữ liệu nhân sự.' });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    console.error('[DELETE /appointments/:id] Lỗi:', err);
    return res.status(500).json({ success: false, error: 'Lỗi khi xóa quyết định: ' + err.message });
  } finally {
    client.release();
  }
});

export default router;
