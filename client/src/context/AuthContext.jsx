import React, { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '';
axios.defaults.baseURL = API_URL;

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    // Load user from localStorage on init (Lazy Initialization)
    const [user, setUser] = useState(() => {
        try {
            const storedUser = localStorage.getItem('user');
            return storedUser ? JSON.parse(storedUser) : null;
        } catch (error) {
            console.error("Failed to parse user from localStorage", error);
            return null;
        }
    });

    useEffect(() => {
        if (user && user.token) {
            axios.defaults.headers.common['Authorization'] = `Bearer ${user.token}`;
        } else {
            delete axios.defaults.headers.common['Authorization'];
        }
    }, [user]);

    const login = (userData) => {
        setUser(userData);
        localStorage.setItem('user', JSON.stringify(userData));
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('user');
    };

    return (
        <AuthContext.Provider value={{ user, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
