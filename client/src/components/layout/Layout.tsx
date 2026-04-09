import React from 'react';
import { Link, useLocation, Outlet, useNavigate } from "react-router-dom";
import { useAuthStore } from '../../stores/authStore';

const Layout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  const navItems = [
    { path: '/', icon: 'fa-home', label: 'Dashboard' },
    { path: '/chat', icon: 'fa-microphone', label: 'Lumina' },
    { path: '/games', icon: 'fa-leaf', label: 'Games' },
    { path: '/community', icon: 'fa-heart', label: 'Community' },
  ];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#fdfdfd]">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-24 lg:w-64 bg-white/80 backdrop-blur-xl border-r border-slate-100/50 z-50">
        <div className="p-8">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg shadow-indigo-200 flex items-center justify-center">
              <i className="fas fa-sun text-white text-xs"></i>
            </div>
            <span className="hidden lg:inline bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">Lumina</span>
          </h1>
        </div>

        <nav className="flex-1 px-4 py-8 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-4 px-4 py-4 rounded-2xl transition-all duration-200 ${
                location.pathname === item.path
                  ? 'bg-gradient-to-r from-indigo-50 to-purple-50 text-indigo-600 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <i className={`fas ${item.icon} text-lg w-6 text-center`}></i>
              <span className="hidden lg:inline text-sm font-medium">{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-slate-100/50">
          {user && (
            <div className="hidden lg:block space-y-4">
              <div className="flex items-center gap-3 px-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-bold text-sm shadow-md">
                  {user.displayName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{user.displayName}</p>
                  <p className="text-[10px] text-slate-400 truncate">{user.email}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all text-sm font-medium"
              >
                <i className="fas fa-arrow-right-from-bracket w-5 text-center"></i>
                <span>Sign out</span>
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-6 left-6 right-6 bg-white/80 backdrop-blur-xl border border-white/20 shadow-2xl shadow-slate-300/30 rounded-3xl flex justify-around items-center py-4 z-50">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`flex flex-col items-center gap-1 transition-colors ${
              location.pathname === item.path ? 'text-indigo-600' : 'text-slate-400'
            }`}
          >
            <i className={`fas ${item.icon} text-xl`}></i>
            <span className="text-[10px] font-semibold">{item.label}</span>
          </Link>
        ))}
      </nav>

      <main className="flex-1 md:ml-24 lg:ml-64 p-6 md:p-12">
        <div className="max-w-5xl mx-auto w-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;
