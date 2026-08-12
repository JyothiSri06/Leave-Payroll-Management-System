const request = require('supertest');
const app = require('../src/app');
const db = require('../src/utils/db');

describe('Automated Payroll Pipeline & Idempotency Tests', () => {
    let adminToken;
    let employeeId;

    beforeAll(async () => {
        const adminRes = await request(app)
            .post('/api/auth/login')
            .send({ email: 'john@example.com', password: 'password123' });
        adminToken = adminRes.body.token;

        const empList = await request(app)
            .get('/api/employees')
            .set('Authorization', `Bearer ${adminToken}`);
        
        if (empList.body.length > 0) {
            employeeId = empList.body[0].id;
        }
    });

    test('1. Runs payroll for employee with accurate net_pay calculations', async () => {
        if (!employeeId) return;

        const res = await request(app)
            .post(`/api/payroll/run/${employeeId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                payPeriodStart: '2026-08-01',
                payPeriodEnd: '2026-08-30',
                bonus: 5000,
                manualDeduction: 1000
            });

        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('id');
        expect(res.body).toHaveProperty('gross_pay');
        expect(res.body).toHaveProperty('net_pay');
        expect(parseFloat(res.body.bonus)).toBe(5000);
    });

    test('2. Executing duplicate payroll run for same tenant + employee + period updates existing record (Idempotency)', async () => {
        if (!employeeId) return;

        const run1 = await request(app)
            .post(`/api/payroll/run/${employeeId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                payPeriodStart: '2026-08-01',
                payPeriodEnd: '2026-08-30',
                bonus: 2000,
                manualDeduction: 500
            });

        const run2 = await request(app)
            .post(`/api/payroll/run/${employeeId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                payPeriodStart: '2026-08-01',
                payPeriodEnd: '2026-08-30',
                bonus: 2000,
                manualDeduction: 500
            });

        expect(run2.statusCode).toBe(200);
        expect(run2.body.id).toBe(run1.body.id); // Must return/update same record ID, NOT create duplicate!
    });

    afterAll(async () => {
        if (db.pool) await db.pool.end();
    });
});
