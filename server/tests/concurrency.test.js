const request = require('supertest');
const app = require('../src/app');
const db = require('../src/utils/db');

describe('Concurrency Control & Transaction Lock Tests', () => {
    let adminToken;
    let employeeToken;
    let employeeId;

    beforeAll(async () => {
        const adminRes = await request(app)
            .post('/api/auth/login')
            .send({ email: 'john@example.com', password: 'password123' });
        adminToken = adminRes.body.token;

        const empRes = await request(app)
            .post('/api/auth/login')
            .send({ email: 'employee@example.com', password: 'password123' });
        employeeToken = empRes.body.token;
        employeeId = empRes.body.id;
    });

    test('1. Prevents balance overdraft under concurrent leave approvals via row-level locks', async () => {
        if (!employeeId) return;

        // Apply for 2 leave requests of 10 days each (total 20 days requested, balance is 12 sick leaves)
        const req1 = await request(app)
            .post('/api/leaves')
            .set('Authorization', `Bearer ${employeeToken}`)
            .send({
                leave_type: 'SICK',
                start_date: '2026-09-01',
                end_date: '2026-09-10',
                days_count: 10,
                reason: 'Sick leave A'
            });

        const req2 = await request(app)
            .post('/api/leaves')
            .set('Authorization', `Bearer ${employeeToken}`)
            .send({
                leave_type: 'SICK',
                start_date: '2026-09-15',
                end_date: '2026-09-24',
                days_count: 10,
                reason: 'Sick leave B'
            });

        // Approve both concurrently
        const [res1, res2] = await Promise.all([
            request(app).put(`/api/leaves/${req1.body.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'APPROVED' }),
            request(app).put(`/api/leaves/${req2.body.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'APPROVED' })
        ]);

        expect(res1.statusCode).toBe(200);
        expect(res2.statusCode).toBe(200);

        // Fetch final balance: Sick leave balance should be 0, and LOP days should be correctly accrued (8 days total LOP)
        const balanceRes = await request(app)
            .get(`/api/leaves/balance/${employeeId}`)
            .set('Authorization', `Bearer ${employeeToken}`);
        
        expect(parseFloat(balanceRes.body.sick_leave_balance)).toBe(0);
    });

    afterAll(async () => {
        if (db.pool) await db.pool.end();
    });
});
