import React, { useState } from 'react';
import axios from 'axios';
import { Mail, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [resetLink, setResetLink] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage('');
        setError('');
        setResetLink('');
        setLoading(true);

        try {
            const res = await axios.post('/api/auth/forgot-password', { email });
            setMessage(res.data.message);
            if (res.data.resetLink) {
                setResetLink(res.data.resetLink);
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to send reset link');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 dark:bg-slate-950 flex items-center justify-center p-4 transition-colors duration-300">
            <div className="bg-white dark:bg-slate-900 p-8 rounded-xl shadow-lg w-full max-w-md border border-gray-100 dark:border-slate-800 transition-colors">
                <Link to="/login" className="flex items-center text-gray-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 mb-6 transition-colors">
                    <ArrowLeft size={18} className="mr-1" /> Back to Login
                </Link>

                <h2 className="text-2xl font-bold mb-2 text-center text-gray-800 dark:text-slate-100">Forgot Password</h2>
                <p className="text-gray-500 dark:text-slate-400 text-center mb-6 text-sm">
                    Enter your email address and we'll send you a link to reset your password.
                </p>

                {message && (
                    <div className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 p-3 rounded mb-4 text-sm border dark:border-green-800">
                        {message}
                        {resetLink && (
                            <div className="mt-2 font-bold break-all">
                                <a href={resetLink} className="underline text-blue-600 dark:text-blue-400">Click to Reset Password</a>
                            </div>
                        )}
                    </div>
                )}

                {error && (
                    <div className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 p-3 rounded mb-4 text-sm border dark:border-red-800">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Email</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-3 text-gray-400 dark:text-slate-500" size={18} />
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

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-blue-600 dark:bg-blue-500 text-white py-2 rounded-lg font-bold hover:bg-blue-700 dark:hover:bg-blue-600 transition-all shadow-md active:scale-95 disabled:bg-blue-400 dark:disabled:bg-slate-700"
                    >
                        {loading ? 'Sending...' : 'Send Reset Link'}
                    </button>
                </form>
            </div>
        </div>
    );
}
