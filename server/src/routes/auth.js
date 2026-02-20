const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const jwt = require('jsonwebtoken');

// Register Endpoint
router.post('/register', async (req, res) => {
    const { first_name, last_name, email, password, role } = req.body;

    try {
        // 1. Check if user exists
        const userCheck = await db.query('SELECT * FROM employees WHERE email = $1', [email]);
        if (userCheck.rows.length > 0) {
            return res.status(400).json({ error: 'User already exists' });
        }

        // 2. Fetch a default tax slab (instead of hardcoding ID 1)
        const taxSlab = await db.query('SELECT id FROM tax_configuration ORDER BY min_salary ASC LIMIT 1');
        if (taxSlab.rows.length === 0) {
            return res.status(500).json({ error: 'Database configuration error: No tax slabs found. Please run the schema.sql seed data.' });
        }
        const defaultTaxSlabId = taxSlab.rows[0].id;

        // 3. Create User
        // Defaulting salary/tax components
        const newUser = await db.query(`
            INSERT INTO employees (first_name, last_name, email, password, role, salary, tax_slab_id, basic_salary, hra, special_allowance)
            VALUES ($1, $2, $3, $4, $5, 50000, $6, 25000, 12500, 12500)
            RETURNING id, first_name, last_name, email, role
        `, [first_name, last_name, email, password, role || 'EMPLOYEE', defaultTaxSlabId]);

        res.status(201).json(newUser.rows[0]);

    } catch (err) {
        console.error('Registration Error:', err);
        res.status(500).json({
            error: 'Server Error during registration',
            details: err.message,
            hint: 'Ensure uuid-ossp extension is enabled in Supabase and all tables were created correctly.'
        });
    }
});


// Login Endpoint
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        // 1. Check User
        const result = await db.query('SELECT * FROM employees WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];

        // 2. Check Password (Simple check for demo, use bcrypt in prod)
        // In a real app: await bcrypt.compare(password, user.password)
        if (password !== user.password) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // 3. Generate Token
        const token = jwt.sign(
            { id: user.id, role: user.role, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.json({
            id: user.id,
            name: `${user.first_name} ${user.last_name}`,
            role: user.role,
            email: user.email,
            token: token
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Forgot Password Endpoint
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    const crypto = require('crypto');

    try {
        const user = await db.query('SELECT * FROM employees WHERE email = $1', [email]);
        if (user.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Generate Token
        const token = crypto.randomBytes(20).toString('hex');
        const expiry = Date.now() + 3600000; // 1 hour

        // Save to DB
        await db.query(
            'UPDATE employees SET reset_password_token = $1, reset_password_expires = $2 WHERE email = $3',
            [token, expiry, email]
        );

        // Mock Email Sending
        const resetLink = `http://localhost:5173/reset-password?token=${token}`;
        console.log(`[MOCK EMAIL] Password Reset Link: ${resetLink}`);

        res.json({
            message: 'Password reset link generated (See below)',
            resetLink: resetLink
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Reset Password Endpoint
router.post('/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;

    try {
        // Verify Token
        const result = await db.query(
            'SELECT * FROM employees WHERE reset_password_token = $1 AND reset_password_expires > $2',
            [token, Date.now()]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired token' });
        }

        const user = result.rows[0];

        // Update Password
        await db.query(
            'UPDATE employees SET password = $1, reset_password_token = NULL, reset_password_expires = NULL WHERE id = $2',
            [newPassword, user.id]
        );

        res.json({ message: 'Password reset successful' });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

module.exports = router;
