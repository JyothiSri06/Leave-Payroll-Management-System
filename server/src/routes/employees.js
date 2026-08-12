const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const cache = require('../utils/cache');
const { logAuditEvent } = require('../utils/auditLogger');
const { requireTenant, requireRole, requireSelfOrAdmin, isAdmin } = require('../middleware/authMiddleware');

// Get Employee by ID with Tenant Isolation & Namespaced Caching
router.get('/:id', requireTenant, requireSelfOrAdmin('id'), async (req, res) => {
    const { id } = req.params;
    const tenantId = req.user.tenant_id;
    const cacheKey = `tenant:${tenantId}:employee:${id}`;

    try {
        // 1. Check Redis Cache
        const cachedData = await cache.get(cacheKey);
        if (cachedData) {
            return res.json(JSON.parse(cachedData));
        }

        // 2. Query DB with Tenant Isolation & Field Selection (Excluding password hash)
        const result = await db.query(
            `SELECT id, tenant_id, first_name, last_name, email, phone, role, salary, basic_salary, hra, special_allowance, join_date, status 
             FROM employees 
             WHERE id = $1 AND tenant_id = $2`,
            [id, tenantId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Employee not found in your organization' });
        }

        const employee = result.rows[0];

        // 3. Set Cache (TTL 1 hour)
        await cache.set(cacheKey, JSON.stringify(employee), { EX: 3600 });

        res.json(employee);
    } catch (err) {
        console.error('Error fetching employee:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Create Employee (Admin only, tenant isolated)
router.post('/', requireTenant, isAdmin, async (req, res) => {
    const { first_name, last_name, email, phone, salary, tax_slab_id, basic_salary, hra, special_allowance } = req.body;
    const tenantId = req.user.tenant_id;

    try {
        await db.withTransaction(async (client) => {
            // Check unique email per tenant
            const emailCheck = await client.query(
                'SELECT id FROM employees WHERE tenant_id = $1 AND email = $2',
                [tenantId, email]
            );
            if (emailCheck.rows.length > 0) {
                return res.status(400).json({ error: 'An employee with this email already exists in your organization' });
            }

            const defaultPassword = 'ChangeMe123!';
            const bcrypt = require('bcrypt');
            const hashedPassword = await bcrypt.hash(defaultPassword, 10);

            const result = await client.query(
                `INSERT INTO employees (tenant_id, first_name, last_name, email, password, phone, salary, tax_slab_id, basic_salary, hra, special_allowance) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
                 RETURNING id, tenant_id, first_name, last_name, email, phone, role, salary, basic_salary, hra, special_allowance, status`,
                [tenantId, first_name, last_name, email, hashedPassword, phone, salary || 50000, tax_slab_id || 1, basic_salary || 25000, hra || 12500, special_allowance || 12500]
            );

            const newEmp = result.rows[0];

            // Initialize leave balances
            const currentYear = new Date().getFullYear();
            await client.query(
                `INSERT INTO leave_balances (tenant_id, employee_id, year, sick_leave_balance, casual_leave_balance, earned_leave_balance)
                 VALUES ($1, $2, $3, 12.00, 12.00, 15.00)
                 ON CONFLICT (tenant_id, employee_id, year) DO NOTHING`,
                [tenantId, newEmp.id, currentYear]
            );

            await logAuditEvent({
                tenant_id: tenantId,
                table_name: 'employees',
                record_id: newEmp.id,
                action: 'CREATE_EMPLOYEE',
                new_value: newEmp,
                changed_by: req.user.email
            }, client);

            await cache.del(`tenant:${tenantId}:employee_list`);
            res.status(201).json(newEmp);
        });
    } catch (err) {
        if (res.headersSent) return;
        console.error('Error creating employee:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Get All Employees in Tenant (Admin only or tenant list)
router.get('/', requireTenant, isAdmin, async (req, res) => {
    const tenantId = req.user.tenant_id;
    const cacheKey = `tenant:${tenantId}:employee_list`;

    try {
        const cached = await cache.get(cacheKey);
        if (cached) return res.json(JSON.parse(cached));

        const result = await db.query(
            `SELECT id, tenant_id, first_name, last_name, email, role, salary, basic_salary, hra, special_allowance, status, join_date 
             FROM employees 
             WHERE tenant_id = $1 AND role != 'ADMIN' 
             ORDER BY join_date DESC, id DESC`,
            [tenantId]
        );

        await cache.set(cacheKey, JSON.stringify(result.rows), { EX: 1800 });
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching employees list:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Update Employee Salary / Info with Transaction & Row Locking to prevent race conditions
router.put('/:id', requireTenant, isAdmin, async (req, res) => {
    const { id } = req.params;
    const tenantId = req.user.tenant_id;
    const { salary, basic_salary, hra, special_allowance } = req.body;

    try {
        await db.withTransaction(async (client) => {
            // Row-level lock on employee record to prevent concurrent updates (Resume Claim #7: Concurrency & Lock)
            const currentRes = await client.query(
                `SELECT salary, basic_salary, hra, special_allowance 
                 FROM employees 
                 WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
                [id, tenantId]
            );

            if (currentRes.rows.length === 0) {
                return res.status(404).json({ error: 'Employee not found in your tenant organization' });
            }

            const current = currentRes.rows[0];

            const result = await client.query(
                `UPDATE employees 
                 SET salary = $1, basic_salary = $2, hra = $3, special_allowance = $4 
                 WHERE id = $5 AND tenant_id = $6 
                 RETURNING id, tenant_id, first_name, last_name, email, salary, basic_salary, hra, special_allowance`,
                [salary, basic_salary || 0, hra || 0, special_allowance || 0, id, tenantId]
            );

            const updated = result.rows[0];

            // Log salary revision history if salary changed
            if (parseFloat(current.salary) !== parseFloat(salary)) {
                await client.query(
                    `INSERT INTO salary_revisions (tenant_id, employee_id, old_salary, new_salary, changed_by)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [tenantId, id, current.salary, salary, req.user.id]
                );

                await logAuditEvent({
                    tenant_id: tenantId,
                    table_name: 'employees',
                    record_id: id,
                    action: 'SALARY_UPDATE',
                    old_value: { salary: current.salary },
                    new_value: { salary: salary },
                    changed_by: req.user.email
                }, client);
            }

            // Invalidate Cache Entries for Tenant and Specific Employee
            await cache.del(`tenant:${tenantId}:employee:${id}`);
            await cache.del(`tenant:${tenantId}:employee_list`);

            res.json(updated);
        });

    } catch (err) {
        if (res.headersSent) return;
        console.error('Error updating employee:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Get Salary History (Tenant isolated, self or admin)
router.get('/:id/salary-history', requireTenant, requireSelfOrAdmin('id'), async (req, res) => {
    const { id } = req.params;
    const tenantId = req.user.tenant_id;

    try {
        const result = await db.query(
            `SELECT * FROM salary_revisions 
             WHERE employee_id = $1 AND tenant_id = $2 
             ORDER BY change_date DESC`,
            [id, tenantId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching salary history:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

module.exports = router;
