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
    phone VARCHAR(20),
    role VARCHAR(20) CHECK (role IN ('ADMIN', 'EMPLOYEE')) DEFAULT 'EMPLOYEE',
    salary DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    join_date DATE DEFAULT CURRENT_DATE,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    tax_slab_id INT REFERENCES tax_configuration(id)
);

-- 3. Leave Ledger Table
CREATE TABLE IF NOT EXISTS leave_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    leave_type VARCHAR(20) CHECK (leave_type IN ('SICK', 'CASUAL', 'EARNED')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    days_count INT NOT NULL,
    status VARCHAR(20) CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')) DEFAULT 'PENDING',
    reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Payroll Runs Table
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
    status VARCHAR(20) CHECK (status IN ('DRAFT', 'PROCESSED', 'PAID')) DEFAULT 'DRAFT',
    run_date DATE DEFAULT CURRENT_DATE
);

-- 5. Audit Logs Table (Read-Only via Application, Populated by Triggers)
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

-- Trigger Function: Log Salary Changes
CREATE OR REPLACE FUNCTION log_salary_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.salary IS DISTINCT FROM NEW.salary THEN
        INSERT INTO audit_logs (table_name, record_id, action, old_value, new_value, changed_by)
        VALUES (
            'employees',
            NEW.id,
            'UPDATE_SALARY',
            jsonb_build_object('salary', OLD.salary),
            jsonb_build_object('salary', NEW.salary),
            current_user
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Attach to Employees
DROP TRIGGER IF EXISTS trg_audit_salary ON employees;
CREATE TRIGGER trg_audit_salary
AFTER UPDATE ON employees
FOR EACH ROW
EXECUTE FUNCTION log_salary_changes();

-- Trigger Function: Log Payroll Generation
CREATE OR REPLACE FUNCTION log_payroll_generation()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO audit_logs (table_name, record_id, action, new_value, changed_by)
    VALUES (
        'payroll_runs',
        NEW.id,
        'CREATE_PAYROLL',
        row_to_json(NEW)::jsonb,
        current_user
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Attach to Payroll Runs
DROP TRIGGER IF EXISTS trg_audit_payroll ON payroll_runs;
CREATE TRIGGER trg_audit_payroll
AFTER INSERT ON payroll_runs
FOR EACH ROW
EXECUTE FUNCTION log_payroll_generation();

-- Seed Initial Tax Slabs (Example)
INSERT INTO tax_configuration (min_salary, max_salary, tax_percentage, region) VALUES
(0, 500000, 0, 'General'),
(500001, 1000000, 10, 'General'),
(1000001, 99999999, 20, 'General')
ON CONFLICT DO NOTHING;
