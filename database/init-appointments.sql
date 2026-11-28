-- =============================================================================
-- HỆ THỐNG QUẢN LÝ NHÂN SỰ VIETSUN
-- SCRIPT KHỞI TẠO BẢNG BỔ NHIỆM, MIỄN NHIỆM & LỊCH SỬ CHỨC VỤ
-- =============================================================================

CREATE TABLE IF NOT EXISTS appointment_decisions (
    id VARCHAR(100) PRIMARY KEY,
    decision_type VARCHAR(30) NOT NULL CHECK (decision_type IN ('bo_nhiem', 'mien_nhiem')),
    employee_id VARCHAR(100) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    msnv VARCHAR(50) NOT NULL DEFAULT '',
    full_name VARCHAR(150) NOT NULL DEFAULT '',
    position_title VARCHAR(150) NOT NULL,
    division_id VARCHAR(100) DEFAULT '',
    division_name VARCHAR(150) DEFAULT '',
    department_id VARCHAR(100) DEFAULT '',
    department_name VARCHAR(150) NOT NULL DEFAULT '',
    sub_department_id VARCHAR(100) DEFAULT '',
    sub_department_name VARCHAR(150) DEFAULT '',
    previous_position VARCHAR(150) DEFAULT '',
    previous_department VARCHAR(150) DEFAULT '',
    decision_number VARCHAR(100) NOT NULL,
    sign_date DATE NOT NULL,
    effective_date DATE NOT NULL,
    end_date DATE DEFAULT NULL,
    signer_name VARCHAR(150) NOT NULL DEFAULT '',
    reason TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    attachment_name VARCHAR(255) DEFAULT '',
    attachment_path VARCHAR(500) DEFAULT '',
    attachment_mime VARCHAR(150) DEFAULT '',
    attachment_size INT DEFAULT 0,
    status VARCHAR(40) NOT NULL DEFAULT 'effective',
    applied_to_employee BOOLEAN DEFAULT false,
    created_by VARCHAR(100) DEFAULT '',
    updated_by VARCHAR(100) DEFAULT '',
    owner_id VARCHAR(100) DEFAULT 'workspace_vietsun_dong_nai_v1',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_appointment_decision_number
    ON appointment_decisions (LOWER(TRIM(decision_number)));
CREATE INDEX IF NOT EXISTS idx_appointment_employee ON appointment_decisions(employee_id);
CREATE INDEX IF NOT EXISTS idx_appointment_type ON appointment_decisions(decision_type);
CREATE INDEX IF NOT EXISTS idx_appointment_effective ON appointment_decisions(effective_date);
CREATE INDEX IF NOT EXISTS idx_appointment_status ON appointment_decisions(status);

CREATE TABLE IF NOT EXISTS employee_position_histories (
    id VARCHAR(100) PRIMARY KEY,
    employee_id VARCHAR(100) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    msnv VARCHAR(50) NOT NULL DEFAULT '',
    full_name VARCHAR(150) NOT NULL DEFAULT '',
    position_title VARCHAR(150) NOT NULL,
    division_name VARCHAR(150) DEFAULT '',
    department_name VARCHAR(150) NOT NULL DEFAULT '',
    sub_department_name VARCHAR(150) DEFAULT '',
    appointment_decision_id VARCHAR(100) REFERENCES appointment_decisions(id) ON DELETE SET NULL,
    dismissal_decision_id VARCHAR(100) REFERENCES appointment_decisions(id) ON DELETE SET NULL,
    appointment_number VARCHAR(100) DEFAULT '',
    dismissal_number VARCHAR(100) DEFAULT '',
    start_date DATE NOT NULL,
    end_date DATE DEFAULT NULL,
    term_end_date DATE DEFAULT NULL,
    is_current BOOLEAN DEFAULT false,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    note TEXT DEFAULT '',
    owner_id VARCHAR(100) DEFAULT 'workspace_vietsun_dong_nai_v1',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pos_hist_emp ON employee_position_histories(employee_id);
CREATE INDEX IF NOT EXISTS idx_pos_hist_current ON employee_position_histories(employee_id, is_current);
CREATE INDEX IF NOT EXISTS idx_pos_hist_status ON employee_position_histories(status);
