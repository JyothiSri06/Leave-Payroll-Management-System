import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { User, Mail, Lock, Briefcase } from 'lucide-react';

export default function SignupPage() {
    const [formData, setFormData] = useState({
        first_name: '',
        last_name: '',
        email: '',
        password: '',
        role: 'EMPLOYEE'
    });
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSignup = async (e) => {
        e.preventDefault();
        setError('');

        try {
            await axios.post('/api/auth/register', formData);
            alert('Registration Successful! Please Login.');
            navigate('/login');
        } catch (err) {
            setError(err.response?.data?.error || 'Registration failed');
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 dark:bg-slate-950 flex items-center justify-center p-4 transition-colors duration-300">
            <div className="bg-white dark:bg-slate-900 p-8 rounded-xl shadow-lg w-full max-w-md border border-gray-100 dark:border-slate-800 transition-colors">
                <h2 className="text-2xl font-bold mb-6 text-center text-blue-600 dark:text-blue-400">Create Account</h2>

                {error && (
                    <div className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 p-3 rounded mb-4 text-sm border dark:border-red-800">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSignup} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">First Name</label>
                            <input
                                name="first_name"
                                type="text"
                                required
                                className="w-full p-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-800 dark:text-slate-100 transition-colors"
                                onChange={handleChange}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Last Name</label>
                            <input
                                name="last_name"
                                type="text"
                                required
                                className="w-full p-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-800 dark:text-slate-100 transition-colors"
                                onChange={handleChange}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Email</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-3 text-gray-400 dark:text-slate-500" size={18} />
                            <input
                                name="email"
                                type="email"
                                required
                                className="w-full pl-10 p-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-800 dark:text-slate-100 transition-colors"
                                onChange={handleChange}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Password</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-3 text-gray-400 dark:text-slate-500" size={18} />
                            <input
                                name="password"
                                type="password"
                                required
                                className="w-full pl-10 p-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-800 dark:text-slate-100 transition-colors"
                                onChange={handleChange}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Role</label>
                        <div className="relative">
                            <Briefcase className="absolute left-3 top-3 text-gray-400 dark:text-slate-500" size={18} />
                            <select
                                name="role"
                                className="w-full pl-10 p-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-800 dark:text-slate-100 transition-colors"
                                onChange={handleChange}
                                value={formData.role}
                            >
                                <option value="EMPLOYEE">Employee</option>
                                <option value="ADMIN">Admin</option>
                            </select>
                        </div>
                    </div>

                    <button type="submit" className="w-full bg-blue-600 dark:bg-blue-500 text-white py-2 rounded-lg font-bold hover:bg-blue-700 dark:hover:bg-blue-600 transition-all shadow-md active:scale-95">
                        Sign Up
                    </button>
                </form>

                <div className="mt-4 text-center text-sm">
                    <span className="text-gray-500 dark:text-slate-400">Already have an account? </span>
                    <Link to="/login" className="text-blue-600 dark:text-blue-400 font-semibold hover:underline transition-colors">Sign In</Link>
                </div>
            </div>
        </div>
    );
}
