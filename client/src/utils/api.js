import axios from 'axios';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || '/api',
});

// Add a request interceptor for logging/intercepting if needed
api.interceptors.request.use((config) => {
    // In production, Vite proxy is not used. 
    // Ensure all requests are relative to the baseURL.
    return config;
}, (error) => {
    return Promise.reject(error);
});

export default api;
