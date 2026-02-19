import React, { useState } from 'react';
import axios from 'axios';
import { Lock } from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';

export default function ResetPasswordPage() {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const navigate = useNavigate();

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage('');
        setError('');

        if (password !== confirmPassword) {
            setError("Passwords don't match");
            return;
        }

        setLoading(true);

        try {
            await axios.post('/api/auth/reset-password', { token, newPassword: password });
            setMessage('Password reset successful! Redirecting to login...');
            setTimeout(() => navigate('/login'), 2000);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to reset password');
        } finally {
            setLoading(false);
        }
    };

    if (!token) {
        return (
            <div className="min-h-screen bg-gray-100 flex items-center justify-center text-red-600">
                Invalid Request: Missing Token
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100 dark:bg-slate-950 flex items-center justify-center p-4 transition-colors duration-300">
            <div className="bg-white dark:bg-slate-900 p-8 rounded-xl shadow-lg w-full max-w-md border border-gray-100 dark:border-slate-800 transition-colors">
                <h2 className="text-2xl font-bold mb-6 text-center text-gray-800 dark:text-slate-100 transition-colors">Reset Password</h2>

                {message && (
                    <div className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 p-3 rounded mb-4 text-sm border dark:border-green-800">
                        {message}
                    </div>
                )}

                {error && (
                    <div className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 p-3 rounded mb-4 text-sm border dark:border-red-800">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">New Password</label>
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

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Confirm Password</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-3 text-gray-400 dark:text-slate-500" size={18} />
                            <input
                                type="password"
                                required
                                className="w-full pl-10 p-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-800 dark:text-slate-100 transition-colors"
                                placeholder="••••••••"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-blue-600 dark:bg-blue-500 text-white py-2 rounded-lg font-bold hover:bg-blue-700 dark:hover:bg-blue-600 transition-all shadow-md active:scale-95 disabled:bg-blue-400 dark:disabled:bg-slate-700"
                    >
                        {loading ? 'Resetting...' : 'Reset Password'}
                    </button>
                </form>
            </div>
        </div>
    );
}
