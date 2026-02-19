// Native fetch in Node 18+

const API_URL = 'http://127.0.0.1:5002/api';
// Use the ADMIN email/pass from verify_jwt.js or defaults
const ADMIN_EMAIL = 'salary.test@example.com';
const ADMIN_PASS = 'password123';

async function verifySalaryHistory() {
    try {
        console.log('--- SALARY HISTORY VERIFICATION ---');

        // 1. Register/Login as Admin
        console.log('Logging in as Admin...');
        // Try login first
        let token = '';
        let empId = '';

        let loginRes = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASS })
        });

        if (!loginRes.ok) {
            console.log('Registering Admin...');
            await fetch(`${API_URL}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    first_name: 'Salary', last_name: 'Admin',
                    email: ADMIN_EMAIL, password: ADMIN_PASS, role: 'ADMIN'
                })
            });
            // Login again
            loginRes = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASS })
            });
        }

        const loginData = await loginRes.json();
        token = loginData.token;
        empId = loginData.id;

        if (!token) throw new Error('Failed to get token');

        // 2. Create a Target Employee
        console.log('Creating Target Employee...');
        const uniqueEmail = `target.${Date.now()}@example.com`;
        const createRes = await fetch(`${API_URL}/employees`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                first_name: 'Target', last_name: 'Emp',
                email: uniqueEmail, phone: '1234567890',
                salary: 50000, tax_slab_id: 1,
                basic_salary: 25000, hra: 12500, special_allowance: 12500
            })
        });
        const targetEmp = await createRes.json();
        const targetId = targetEmp.id;

        // 3. Update Salary
        console.log(`Updating Salary for ${targetId} (50k -> 60k)...`);
        const updateRes = await fetch(`${API_URL}/employees/${targetId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                salary: 60000,
                basic_salary: 30000, hra: 15000, special_allowance: 15000
            })
        });

        if (!updateRes.ok) throw new Error('Update Failed');

        // 4. Verify DB Logic via API
        console.log('Fetching Salary History...');
        const historyRes = await fetch(`${API_URL}/employees/${targetId}/salary-history`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!historyRes.ok) throw new Error('Failed to fetch history');

        const history = await historyRes.json();
        console.log(`History Count: ${history.length}`);
        if (history.length > 0) {
            console.log('Latest Revision:', history[0]);
            if (history[0].old_salary === '50000.00' && history[0].new_salary === '60000.00') {
                console.log('✅ Salary History Verified!');
            } else {
                console.error('❌ Mismatch in salary values', history[0]);
            }
        } else {
            console.error('❌ No history found.');
        }

    } catch (err) {
        console.error('Test Failed:', err);
    }
}

verifySalaryHistory();
