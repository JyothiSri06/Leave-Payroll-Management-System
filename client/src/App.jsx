import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, Outlet } from 'react-router-dom';
import AdminDashboard from './pages/AdminDashboard';
import EmployeePortal from './pages/EmployeePortal';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { Home, Users, Calculator, LogOut, Sun, Moon } from 'lucide-react';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();

  if (loading) return <div>Loading...</div>;

  if (!user) return <Navigate to="/login" replace />;

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Redirect based on role if unauthorized for current route
    if (user.role === 'ADMIN') return <Navigate to="/admin" replace />;
    if (user.role === 'EMPLOYEE') return <Navigate to="/employee" replace />;
    return <Navigate to="/" replace />;
  }

  return children ? children : <Outlet />;
};

function NavBar() {
  const { user, logout } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();
  if (!user) return null;

  return (
    <nav className="bg-white dark:bg-slate-900 shadow-md p-4 transition-colors">
      <div className="container mx-auto flex justify-between items-center">
        <h1 className="text-xl font-bold text-blue-600 dark:text-blue-400 flex items-center gap-2">
          <Calculator size={24} />
          Payroll ERP
        </h1>
        <div className="flex gap-4 items-center">
          {user.role === 'ADMIN' && (
            <Link to="/admin" className="flex items-center gap-1 text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400">
              <Users size={18} /> Admin
            </Link>
          )}
          {user.role === 'EMPLOYEE' && (
            <Link to="/employee" className="flex items-center gap-1 text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400">
              <Home size={18} /> My Portal
            </Link>
          )}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-600 dark:text-gray-300 transition-colors"
            title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <button onClick={logout} className="flex items-center gap-1 text-red-500 hover:text-red-700 ml-4">
            <LogOut size={18} /> Logout
          </button>
        </div>
      </div>
    </nav>
  );
}

function AppLayout() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 text-gray-900 dark:text-slate-50 transition-colors duration-300">
      <NavBar />
      <div className="container mx-auto p-4">
        <Outlet />
      </div>
    </div>
  );
}

function App() {
  return (
    <Router>
      <ThemeProvider>
        <AuthProvider>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />

              <Route path="/admin" element={
                <ProtectedRoute allowedRoles={['ADMIN']}>
                  <AdminDashboard />
                </ProtectedRoute>
              } />

              <Route path="/employee" element={
                <ProtectedRoute allowedRoles={['EMPLOYEE']}>
                  <EmployeePortal />
                </ProtectedRoute>
              } />

              <Route path="/" element={<Navigate to="/login" replace />} />
            </Route>
          </Routes>
        </AuthProvider>
      </ThemeProvider>
    </Router>
  );
}

export default App;
