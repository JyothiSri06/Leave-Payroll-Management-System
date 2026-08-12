const request = require('supertest');
const app = require('../src/app');
const db = require('../src/utils/db');

describe('Multi-Tenant Data Isolation Tests', () => {
    let tenantAToken;
    let tenantBToken;
    let tenantAEmployeeId;

    beforeAll(async () => {
        // Login Tenant A (Acme Corp) Admin
        const resA = await request(app)
            .post('/api/auth/login')
            .send({ email: 'john@example.com', password: 'password123' });
        tenantAToken = resA.body.token;

        // Login Tenant B (Globex Corp) Admin
        const resB = await request(app)
            .post('/api/auth/login')
            .send({ email: 'alice@globex.com', password: 'password123' });
        tenantBToken = resB.body.token;

        // Get an employee ID belonging to Tenant A
        const empRes = await request(app)
            .get('/api/employees')
            .set('Authorization', `Bearer ${tenantAToken}`);
        
        if (empRes.body.length > 0) {
            tenantAEmployeeId = empRes.body[0].id;
        }
    });

    test('1. Tenant A Admin can list Tenant A employees', async () => {
        const res = await request(app)
            .get('/api/employees')
            .set('Authorization', `Bearer ${tenantAToken}`);
        
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.some(e => e.email === 'alice@globex.com')).toBe(false); // Globex admin must not appear
    });

    test('2. Tenant B Admin CANNOT access Tenant A employee by ID (Multi-Tenant Isolation)', async () => {
        if (!tenantAEmployeeId) return;

        const res = await request(app)
            .get(`/api/employees/${tenantAEmployeeId}`)
            .set('Authorization', `Bearer ${tenantBToken}`);
        
        expect(res.statusCode).toBe(404);
        expect(res.body).toHaveProperty('error', 'Employee not found in your organization');
    });

    test('3. Tenant B Admin CANNOT query Tenant A payroll runs', async () => {
        const res = await request(app)
            .get('/api/payroll/admin/history')
            .set('Authorization', `Bearer ${tenantBToken}`);
        
        expect(res.statusCode).toBe(200);
        // Ensure no Tenant A employee records are present in Tenant B history
        expect(res.body.every(p => p.email !== 'employee@example.com')).toBe(true);
    });

    afterAll(async () => {
        if (db.pool) await db.pool.end();
    });
});
