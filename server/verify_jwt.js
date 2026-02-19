// Native fetch in Node 18+

const API_URL = 'http://127.0.0.1:5002/api';
const EMP_EMAIL = 'jwt.test@example.com';
const EMP_PASS = 'password123';

async function verifyJWT() {
    try {
        console.log('--- JWT VERIFICATION ---');

        // 1. Try public route (should pass)
        const healthRes = await fetch(`${API_URL}/../health`);
        console.log(`Health Check: ${healthRes.status} (Expected 200)`);

        // 2. Try protected route without token (should fail)
        const failRes = await fetch(`${API_URL}/employees`);
        console.log(`Protected Route (No Token): ${failRes.status} (Expected 401)`);
        if (failRes.status !== 401) throw new Error('Route not protected!');

        // 3. Register/Login to get token
        // Use a unique email slightly to avoid conflict or just login if exists
        // Let's rely on login, assuming user exists or register fresh
        const uniqueEmail = `jwt.${Date.now()}@example.com`;

        console.log('Registering User...');
        const regRes = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                first_name: 'JWT', last_name: 'Tester',
                email: uniqueEmail, password: EMP_PASS, role: 'ADMIN'
            })
        });

        if (!regRes.ok) throw new Error('Registration Failed');

        console.log('Logging in...');
        const loginRes = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: uniqueEmail, password: EMP_PASS })
        });
        const loginData = await loginRes.json();
        const token = loginData.token;
        console.log(`Token Received: ${token ? 'YES' : 'NO'}`);

        if (!token) throw new Error('No token returned on login');

        // 4. Try protected route WITH token (should pass)
        const successRes = await fetch(`${API_URL}/employees`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        console.log(`Protected Route (With Token): ${successRes.status} (Expected 200)`);

        if (successRes.status === 200) {
            console.log('✅ JWT Authentication Verified');
        } else {
            console.error('❌ JWT Verification Failed');
        }

    } catch (err) {
        console.error('Test Failed:', err);
    }
}

verifyJWT();
