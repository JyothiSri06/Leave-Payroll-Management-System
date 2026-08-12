const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const validate = require('../middleware/validate');
const { logAuditEvent } = require('../utils/auditLogger');
const { registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema } = require('../schemas/auth.schema');
const SALT_ROUNDS = 10;

// Helper: Ensure default tenant exists
const getOrCreateDefaultTenant = async (client = db) => {
    let tenantRes = await client.query("SELECT id FROM tenants WHERE code = 'acme_corp' LIMIT 1");
    if (tenantRes.rows.length === 0) {
        tenantRes = await client.query(
            "INSERT INTO tenants (name, code) VALUES ('Acme Corp', 'acme_corp') RETURNING id"
        );
    }
    return tenantRes.rows[0].id;
};

// Register Endpoint (Multi-tenant aware)
router.post('/register', validate(registerSchema), async (req, res) => {
    const { first_name, last_name, email, password, role, tenant_code } = req.body;

    try {
        await db.withTransaction(async (client) => {
            // 1. Resolve Tenant ID
            let tenantId;
            if (tenant_code) {
                const tRes = await client.query('SELECT id FROM tenants WHERE code = $1', [tenant_code.toLowerCase()]);
                if (tRes.rows.length === 0) {
                    return res.status(400).json({ error: `Tenant with code "${tenant_code}" not found.` });
                }
                tenantId = tRes.rows[0].id;
            } else {
                tenantId = await getOrCreateDefaultTenant(client);
            }

            // 2. Check if user exists within this tenant
            const userCheck = await client.query(
                'SELECT id FROM employees WHERE tenant_id = $1 AND email = $2',
                [tenantId, email]
            );
            if (userCheck.rows.length > 0) {
                return res.status(400).json({ error: 'User already exists in this tenant organization' });
            }

            // 3. Fetch default tax slab
            const taxSlab = await client.query('SELECT id FROM tax_configuration ORDER BY min_salary ASC LIMIT 1');
            if (taxSlab.rows.length === 0) {
                return res.status(500).json({ error: 'No tax slabs found in configuration.' });
            }
            const defaultTaxSlabId = taxSlab.rows[0].id;

            // 4. Create User with bcrypt hash
            const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

            const newUser = await client.query(`
                INSERT INTO employees (tenant_id, first_name, last_name, email, password, role, salary, tax_slab_id, basic_salary, hra, special_allowance)
                VALUES ($1, $2, $3, $4, $5, $6, 50000, $7, 25000, 12500, 12500)
                RETURNING id, tenant_id, first_name, last_name, email, role
            `, [tenantId, first_name, last_name, email, hashedPassword, role || 'EMPLOYEE', defaultTaxSlabId]);

            const user = newUser.rows[0];

            // 5. Initialize default Leave Balance for tenant user
            const currentYear = new Date().getFullYear();
            await client.query(`
                INSERT INTO leave_balances (tenant_id, employee_id, year, sick_leave_balance, casual_leave_balance, earned_leave_balance)
                VALUES ($1, $2, $3, 12.00, 12.00, 15.00)
                ON CONFLICT (tenant_id, employee_id, year) DO NOTHING
            `, [tenantId, user.id, currentYear]);

            await logAuditEvent({
                tenant_id: tenantId,
                table_name: 'employees',
                record_id: user.id,
                action: 'REGISTER',
                new_value: user,
                changed_by: user.email
            }, client);

            res.status(201).json(user);
        });

    } catch (err) {
        if (res.headersSent) return;
        console.error('Registration Error:', err);
        res.status(500).json({ error: 'Server Error during registration', details: err.message });
    }
});


// Login Endpoint (JWT payload includes tenant_id & role)
router.post('/login', validate(loginSchema), async (req, res) => {
    const { email, password } = req.body;

    try {
        // 1. Query user by email across tenants or matching email
        const result = await db.query(
            `SELECT e.*, t.name as tenant_name, t.code as tenant_code 
             FROM employees e 
             LEFT JOIN tenants t ON e.tenant_id = t.id 
             WHERE e.email = $1`, 
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];

        // 2. Verify Password with bcrypt
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // 3. Generate JWT Token with tenant_id payload
        const secret = process.env.JWT_SECRET || 'fallback_jwt_secret_for_dev_env';
        const token = jwt.sign(
            { 
                id: user.id, 
                tenant_id: user.tenant_id, 
                role: user.role, 
                email: user.email 
            },
            secret,
            { expiresIn: '8h' }
        );

        // Audit Log Successful Login
        await logAuditEvent({
            tenant_id: user.tenant_id,
            table_name: 'employees',
            record_id: user.id,
            action: 'LOGIN',
            changed_by: user.email
        });

        // Safe Response without password
        res.json({
            id: user.id,
            tenant_id: user.tenant_id,
            tenant_name: user.tenant_name || 'Acme Corp',
            name: `${user.first_name} ${user.last_name}`,
            role: user.role,
            email: user.email,
            token: token
        });

    } catch (err) {
        console.error('Login Error:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Forgot Password Endpoint
router.post('/forgot-password', validate(forgotPasswordSchema), async (req, res) => {
    const { email } = req.body;
    const crypto = require('crypto');

    try {
        const user = await db.query('SELECT * FROM employees WHERE email = $1', [email]);
        if (user.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const token = crypto.randomBytes(20).toString('hex');
        const expiry = Date.now() + 3600000; // 1 hour

        await db.query(
            'UPDATE employees SET reset_password_token = $1, reset_password_expires = $2 WHERE email = $3',
            [token, expiry, email]
        );

        const resetLink = `http://localhost:5173/reset-password?token=${token}`;
        console.log(`[MOCK EMAIL] Password Reset Link: ${resetLink}`);

        res.json({
            message: 'Password reset link generated (See below)',
            resetLink: resetLink
        });

    } catch (err) {
        console.error('Forgot Password Error:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Reset Password Endpoint (bcrypt update)
router.post('/reset-password', validate(resetPasswordSchema), async (req, res) => {
    const { token, newPassword } = req.body;

    try {
        const result = await db.query(
            'SELECT * FROM employees WHERE reset_password_token = $1 AND reset_password_expires > $2',
            [token, Date.now()]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired token' });
        }

        const user = result.rows[0];

        const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
        await db.query(
            'UPDATE employees SET password = $1, reset_password_token = NULL, reset_password_expires = NULL WHERE id = $2',
            [hashedPassword, user.id]
        );

        await logAuditEvent({
            tenant_id: user.tenant_id,
            table_name: 'employees',
            record_id: user.id,
            action: 'PASSWORD_RESET',
            changed_by: user.email
        });

        res.json({ message: 'Password reset successful' });

    } catch (err) {
        console.error('Reset Password Error:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

module.exports = router;
