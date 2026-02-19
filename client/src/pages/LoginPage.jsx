import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { Lock, User } from 'lucide-react';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');

        try {
            const res = await axios.post('/api/auth/login', { email, password });
            login(res.data);
            if (res.data.role === 'ADMIN') {
                navigate('/admin');
            } else {
                navigate('/employee');
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Login failed');
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 dark:bg-slate-950 flex items-center justify-center p-4 transition-colors duration-300">
            <div className="bg-white dark:bg-slate-900 p-8 rounded-xl shadow-lg w-full max-w-md border border-gray-100 dark:border-slate-800 transition-colors">
                <h2 className="text-2xl font-bold mb-6 text-center text-blue-600 dark:text-blue-400">Payroll ERP Login</h2>

                {error && (
                    <div className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 p-3 rounded mb-4 text-sm border dark:border-red-800">
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Email</label>
                        <div className="relative">
                            <User className="absolute left-3 top-3 text-gray-400 dark:text-slate-500" size={18} />
                            <input
                                type="email"
                                required
                                className="w-full pl-10 p-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-800 dark:text-slate-100 transition-colors"
                                placeholder="john@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Password</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-3 text-gray-400 dark:text-slate-500" size={18} />
                            <input
                                type="password"
                                required
                                className="w-full pl-10 p-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-800 dark:text-slate-100 transition-colors"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="text-right">
                        <Link to="/forgot-password" className="text-sm text-blue-600 hover:underline">
                            Forgot Password?
                        </Link>
                    </div>

                    <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded-lg font-bold hover:bg-blue-700 transition">
                        Sign In
                    </button>
                </form>

                <div className="mt-4 text-center text-sm">
                    <span className="text-gray-500">Don't have an account? </span>
                    <Link to="/signup" className="text-blue-600 font-semibold hover:underline">Sign Up</Link>
                </div>
                <div className="mt-2 text-center text-xs text-gray-400">
                    Default Admin: john@example.com / password123
                </div>
            </div>
        </div>
    );
}
