const API_URL = 'http://127.0.0.1:5000/health';

async function check() {
    try {
        const res = await fetch(API_URL);
        console.log('Status:', res.status);
        const txt = await res.text();
        console.log('Body:', txt);
    } catch (err) {
        console.error('Fetch Failed:', err);
    }
}

check();
