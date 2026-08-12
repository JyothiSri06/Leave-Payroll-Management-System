const request = require('supertest');
const app = require('../src/app');
const db = require('../src/utils/db');

describe('Authentication & Authorization Integration Tests', () => {
    let adminToken;
    let employeeToken;

    beforeAll(async () => {
        // Login as seeded admin
        const adminRes = await request(app)
            .post('/api/auth/login')
            .send({ email: 'john@example.com', password: 'password123' });
        
        adminToken = adminRes.body.token;

        // Login as seeded employee
        const empRes = await request(app)
            .post('/api/auth/login')
            .send({ email: 'employee@example.com', password: 'password123' });
        
        employeeToken = empRes.body.token;
    });

    test('1. Valid Login returns JWT token with tenant_id payload', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'john@example.com', password: 'password123' });
        
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('token');
        expect(res.body).toHaveProperty('tenant_id');
        expect(res.body.role).toBe('ADMIN');
    });

    test('2. Login with Invalid Password returns HTTP 401', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'john@example.com', password: 'wrongpassword' });
        
        expect(res.statusCode).toBe(401);
        expect(res.body).toHaveProperty('error', 'Invalid credentials');
    });

    test('3. Accessing Protected Route without JWT token returns HTTP 401', async () => {
        const res = await request(app).get('/api/employees');
        expect(res.statusCode).toBe(401);
        expect(res.body).toHaveProperty('error', 'Access Denied: No Token Provided');
    });

    test('4. Accessing Protected Route with Invalid JWT token returns HTTP 401', async () => {
        const res = await request(app)
            .get('/api/employees')
            .set('Authorization', 'Bearer invalid_token_xyz');
        
        expect(res.statusCode).toBe(401);
        expect(res.body).toHaveProperty('error', 'Invalid Token');
    });

    test('5. Non-Admin Employee attempting Admin Route returns HTTP 403 (RBAC)', async () => {
        const res = await request(app)
            .get('/api/employees')
            .set('Authorization', `Bearer ${employeeToken}`);
        
        expect(res.statusCode).toBe(403);
        expect(res.body).toHaveProperty('error', 'Access Denied: Insufficient Permissions');
    });

    afterAll(async () => {
        if (db.pool) await db.pool.end();
    });
});
