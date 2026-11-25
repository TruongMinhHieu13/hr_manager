-- =============================================================================
-- HỆ THỐNG QUẢN LÝ NHÂN SỰ VIETSUN
-- SCRIPT KHỞI TẠO BẢNG LỊCH SỬ LÀM VIỆC & AUDIT LOGS (CCCD LÀM KHÓA NHẬN DIỆN)
-- =============================================================================

-- 1. BẢNG LỊCH SỬ LÀM VIỆC (employee_work_histories)
CREATE TABLE IF NOT EXISTS employee_work_histories (
    id VARCHAR(100) PRIMARY KEY,
    employee_id VARCHAR(100) NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    cccd VARCHAR(50) NOT NULL,                        -- Khóa nhận diện duy nhất một người
    msnv VARCHAR(50) NOT NULL,                        -- Mã NV ở lần làm việc này
    turn_number INT NOT NULL DEFAULT 1,               -- Lần thứ mấy (1, 2, 3...)
    
    -- Thông tin đầu vào đợt làm việc
    start_date DATE NOT NULL,                         -- Ngày vào làm
    department VARCHAR(150) NOT NULL DEFAULT '',      -- Phòng ban lúc vào
    position VARCHAR(100) DEFAULT '',                 -- Vị trí / chức vụ lúc vào
    job_title VARCHAR(150) DEFAULT '',                -- Công việc phụ trách
    contract_type VARCHAR(100) DEFAULT 'Thử việc',    -- Thử việc, Thời vụ, Chính thức...
    
    -- Thông tin kết thúc đợt làm việc (NULL nếu đang làm)
    end_date DATE DEFAULT NULL,                       -- Ngày nghỉ việc
    resignation_type VARCHAR(50) DEFAULT NULL,        -- tu_xin_nghi, cong_ty_cho_thoi_viec, bo_viec, het_hop_dong, khac
    resignation_reason TEXT DEFAULT NULL,             -- Lý do nghỉ việc (Ghi chú tự do)
    rehire_eligibility VARCHAR(30) DEFAULT 'eligible',-- eligible (Có), consider (Cân nhắc), ineligible (Không)
    
    -- Trạng thái & Phân quyền quản trị
    status VARCHAR(30) NOT NULL DEFAULT 'active',     -- active (Đang làm), terminated (Đã nghỉ)
    approved_by VARCHAR(100) DEFAULT '',              -- Người duyệt nghỉ / duyệt tuyển lại
    created_by VARCHAR(100) DEFAULT '',               -- Người tạo bản ghi
    updated_by VARCHAR(100) DEFAULT '',               -- Người cập nhật gần nhất
    owner_id VARCHAR(100) DEFAULT 'workspace_vietsun_dong_nai_v1',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    -- Ràng buộc logic ngày tháng: Ngày nghỉ phải lớn hơn hoặc bằng ngày vào
    CONSTRAINT chk_work_history_dates CHECK (end_date IS NULL OR end_date >= start_date)
);

-- Chỉ mục tối ưu tìm kiếm theo CCCD, MSNV và Phòng ban
CREATE INDEX IF NOT EXISTS idx_work_histories_cccd ON employee_work_histories(cccd);
CREATE INDEX IF NOT EXISTS idx_work_histories_msnv ON employee_work_histories(msnv);
CREATE INDEX IF NOT EXISTS idx_work_histories_emp_id ON employee_work_histories(employee_id);
CREATE INDEX IF NOT EXISTS idx_work_histories_status ON employee_work_histories(status);
CREATE INDEX IF NOT EXISTS idx_work_histories_start_date ON employee_work_histories(start_date);

-- RÀNG BUỘC TOÀN VẸN: Một CCCD chỉ được có tối đa 1 đợt làm việc đang active tại một thời điểm
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_work_per_cccd 
ON employee_work_histories(cccd) 
WHERE (status = 'active' OR end_date IS NULL);

-- 2. BẢNG AUDIT LOG THAY ĐỔI LỊCH SỬ LÀM VIỆC (work_history_logs)
CREATE TABLE IF NOT EXISTS work_history_logs (
    id VARCHAR(100) PRIMARY KEY,
    work_history_id VARCHAR(100) NOT NULL REFERENCES employee_work_histories(id) ON DELETE CASCADE,
    cccd VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL,                      -- CREATE, UPDATE, TERMINATE, REHIRE
    changed_by VARCHAR(100) NOT NULL,                 -- Người thực hiện sửa
    changed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    old_data JSONB DEFAULT NULL,                      -- Dữ liệu cũ trước khi sửa
    new_data JSONB DEFAULT NULL,                      -- Dữ liệu mới sau khi sửa
    change_note TEXT DEFAULT ''                       -- Lý do sửa
);

CREATE INDEX IF NOT EXISTS idx_wh_logs_wh_id ON work_history_logs(work_history_id);
CREATE INDEX IF NOT EXISTS idx_wh_logs_cccd ON work_history_logs(cccd);

-- 3. SCRIPT TỰ ĐỘNG CHUYỂN ĐỔI DỮ LIỆU HIỆN CÓ SANG ĐỢT LÀM VIỆC LẦN 1
DO $$
DECLARE
    rec RECORD;
    v_clean_cccd VARCHAR(50);
    v_start_date DATE;
    v_status VARCHAR(30);
    v_turn_count INT;
BEGIN
    FOR rec IN 
        SELECT id, msnv, cccd, full_name, department, chuc_vu, loai_hd, 
               ngay_vao, tinh_trang, owner_id 
        FROM employees 
        WHERE cccd IS NOT NULL AND TRIM(cccd) <> ''
    LOOP
        v_clean_cccd := TRIM(rec.cccd);
        
        BEGIN
            v_start_date := TO_DATE(NULLIF(TRIM(rec.ngay_vao), ''), 'DD/MM/YYYY');
        EXCEPTION WHEN OTHERS THEN
            BEGIN
                v_start_date := TO_DATE(NULLIF(TRIM(rec.ngay_vao), ''), 'YYYY-MM-DD');
            EXCEPTION WHEN OTHERS THEN
                v_start_date := CURRENT_DATE;
            END;
        END;

        IF rec.tinh_trang ILIKE '%nghỉ%' OR rec.tinh_trang ILIKE '%thôi việc%' THEN
            v_status := 'terminated';
        ELSE
            v_status := 'active';
        END IF;

        SELECT COUNT(*) INTO v_turn_count 
        FROM employee_work_histories 
        WHERE cccd = v_clean_cccd;

        IF v_turn_count = 0 THEN
            INSERT INTO employee_work_histories (
                id, employee_id, cccd, msnv, turn_number,
                start_date, department, position, contract_type,
                status, created_by, owner_id
            ) VALUES (
                'wh_' || rec.id,
                rec.id,
                v_clean_cccd,
                rec.msnv,
                1,
                v_start_date,
                COALESCE(rec.department, 'Chưa phân bổ'),
                COALESCE(rec.chuc_vu, 'Nhân viên'),
                COALESCE(rec.loai_hd, 'Chính thức'),
                v_status,
                'system_migration',
                COALESCE(rec.owner_id, 'workspace_vietsun_dong_nai_v1')
            );
        END IF;
    END LOOP;
END $$;
