-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tax Configuration Table
CREATE TABLE IF NOT EXISTS tax_configuration (
    id SERIAL PRIMARY KEY,
    min_salary DECIMAL(12, 2) NOT NULL,
    max_salary DECIMAL(12, 2) NOT NULL,
    tax_percentage DECIMAL(5, 2) NOT NULL,
    region VARCHAR(50) DEFAULT 'General',
    effective_date DATE DEFAULT CURRENT_DATE
);

-- 2. Employees Table
CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    role VARCHAR(20) CHECK (role IN ('ADMIN', 'EMPLOYEE')) DEFAULT 'EMPLOYEE',
    salary DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    basic_salary DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    hra DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    special_allowance DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    join_date DATE DEFAULT CURRENT_DATE,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    tax_slab_id INT REFERENCES tax_configuration(id),
    reset_password_token VARCHAR(255),
    reset_password_expires BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Leave Balances Table
CREATE TABLE IF NOT EXISTS leave_balances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    year INT NOT NULL,
    sick_leave_balance DECIMAL(5, 2) DEFAULT 12.00,
    casual_leave_balance DECIMAL(5, 2) DEFAULT 12.00,
    earned_leave_balance DECIMAL(5, 2) DEFAULT 15.00,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(employee_id, year)
);

-- 4. Leave Ledger Table
CREATE TABLE IF NOT EXISTS leave_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    leave_type VARCHAR(20) CHECK (leave_type IN ('SICK', 'CASUAL', 'EARNED')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    days_count INT NOT NULL,
    status VARCHAR(20) CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')) DEFAULT 'PENDING',
    reason TEXT,
    lop_days DECIMAL(5, 2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Attendance Table
CREATE TABLE IF NOT EXISTS attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    clock_in TIMESTAMP,
    clock_out TIMESTAMP,
    status VARCHAR(20) CHECK (status IN ('PRESENT', 'ABSENT', 'LATE', 'ON_LEAVE')) DEFAULT 'PRESENT',
    late_minutes INT DEFAULT 0,
    overtime_hours DECIMAL(5, 2) DEFAULT 0.00,
    UNIQUE(employee_id, date)
);

-- 6. Payroll Runs Table
CREATE TABLE IF NOT EXISTS payroll_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    pay_period_start DATE NOT NULL,
    pay_period_end DATE NOT NULL,
    gross_pay DECIMAL(12, 2) NOT NULL,
    deductions DECIMAL(12, 2) DEFAULT 0.00,
    net_pay DECIMAL(12, 2) NOT NULL,
    tax_deducted DECIMAL(12, 2) DEFAULT 0.00,
    ewa_deductions DECIMAL(12, 2) DEFAULT 0.00,
    bonus DECIMAL(12, 2) DEFAULT 0.00,
    basic_pay DECIMAL(12, 2) DEFAULT 0.00,
    hra_pay DECIMAL(12, 2) DEFAULT 0.00,
    special_allowance_pay DECIMAL(12, 2) DEFAULT 0.00,
    pf_deduction DECIMAL(12, 2) DEFAULT 0.00,
    professional_tax_deduction DECIMAL(12, 2) DEFAULT 0.00,
    income_tax_deduction DECIMAL(12, 2) DEFAULT 0.00,
    esi_deduction DECIMAL(12, 2) DEFAULT 0.00,
    manual_deductions DECIMAL(12, 2) DEFAULT 0.00,
    status VARCHAR(20) CHECK (status IN ('DRAFT', 'PROCESSED', 'PAID')) DEFAULT 'DRAFT',
    payment_date TIMESTAMP,
    run_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Salary Revisions (History)
CREATE TABLE IF NOT EXISTS salary_revisions (
    id SERIAL PRIMARY KEY,
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    old_salary DECIMAL(12, 2) NOT NULL,
    new_salary DECIMAL(12, 2) NOT NULL,
    changed_by UUID,
    change_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    table_name VARCHAR(50) NOT NULL,
    record_id UUID NOT NULL,
    action VARCHAR(20) NOT NULL,
    old_value JSONB,
    new_value JSONB,
    changed_by VARCHAR(50) DEFAULT 'SYSTEM',
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed Initial Tax Slabs
INSERT INTO tax_configuration (min_salary, max_salary, tax_percentage, region) 
SELECT 0, 500000, 0, 'General' WHERE NOT EXISTS (SELECT 1 FROM tax_configuration WHERE id = 1);

INSERT INTO tax_configuration (min_salary, max_salary, tax_percentage, region) 
SELECT 500001, 1000000, 10, 'General' WHERE NOT EXISTS (SELECT 1 FROM tax_configuration WHERE id = 2);

INSERT INTO tax_configuration (min_salary, max_salary, tax_percentage, region) 
SELECT 1000001, 99999999, 20, 'General' WHERE NOT EXISTS (SELECT 1 FROM tax_configuration WHERE id = 3);
