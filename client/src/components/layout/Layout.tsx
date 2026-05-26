import React, { useEffect } from 'react';
import { Link, useLocation, Outlet, useNavigate } from "react-router-dom";
import { motion } from 'framer-motion';
import { useAuthStore } from '../../stores/authStore';
import { useNotificationStore } from '../../stores/notificationStore';
import { useLuminaStore } from '../../stores/luminaStore';
import { connectSocket, disconnectSocket } from '../../services/socketService';
import { api } from '../../services/api';
import NotificationBell from '../notifications/NotificationBell';
import NotificationPanel from '../notifications/NotificationPanel';
import NotificationToast from '../notifications/NotificationToast';

const Layout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, token, logout } = useAuthStore();
  const addNotification = useNotificationStore(s => s.addNotification);

  // Persistent socket connection - listens globally for DMs and notifications
  useEffect(() => {
    if (!token) return;

    const socket = connectSocket(token);

    const handleNotification = (data: any) => {
      if (data.type === 'dm') {
        // Don't show notification if we're already on that DM page
        if (location.pathname === `/community/dm/${data.senderId}`) return;
        addNotification({
          type: 'dm',
          title: `${data.senderName}`,
          preview: data.preview,
          senderId: data.senderId,
          timestamp: new Date(data.timestamp),
        });
      } else if (data.type === 'group-message') {
        if (location.pathname === `/community/group/${data.groupId}`) return;
        addNotification({
          type: 'group-message',
          title: data.groupName,
          preview: `${data.senderName}: ${data.preview}`,
          groupId: data.groupId,
          timestamp: new Date(data.timestamp),
        });
      }
    };

    socket.on('notification', handleNotification);

    return () => {
      socket.off('notification', handleNotification);
    };
  }, [token, location.pathname, addNotification]);

  // Cleanup socket on logout
  useEffect(() => {
    if (!token) disconnectSocket();
  }, [token]);

  // Missed-day check for Know Yourself (once per app load)
  useEffect(() => {
    if (!token) return;
    const key = 'lumina_personality_missed_check';
    const lastCheck = sessionStorage.getItem(key);
    const today = new Date().toDateString();
    if (lastCheck === today) return;
    sessionStorage.setItem(key, today);

    api.get('/personality/result').then((data) => {
      if (data?.missedYesterday) {
        addNotification({
          type: 'personality',
          title: 'Your mirror is waiting',
          preview: 'You missed a Know Yourself day — come finish 10 questions ✨',
          link: '/know-yourself',
          timestamp: new Date(),
        });
      }
    }).catch(() => {});
  }, [token, addNotification]);

  const navItems = [
    { path: '/', icon: 'fa-home', label: 'Dashboard' },
    { path: '/chat', icon: 'fa-microphone', label: 'Lumina' },
    { path: '/games', icon: 'fa-leaf', label: 'Games' },
    { path: '/know-yourself', icon: 'fa-compass', label: 'Know Yourself' },
    { path: '/community', icon: 'fa-heart', label: 'Community' },
  ];

  const luminaActive = useLuminaStore(s => s.isActive);
  const requestNav = useLuminaStore(s => s.requestNavigation);

  const guardedNavigate = async (e: React.MouseEvent, path: string) => {
    if (!luminaActive || location.pathname === path) return;
    e.preventDefault();
    const decision = await requestNav(path);
    if (decision === 'end') {
      navigate(path);
    }
  };

  const handleLogout = async () => {
    if (luminaActive) {
      const decision = await requestNav('/login');
      if (decision !== 'end') return;
    }
    disconnectSocket();
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#fafbfe]">
      <NotificationToast />

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-24 lg:w-72 bg-white/70 backdrop-blur-2xl border-r border-slate-100/50 z-50">
        <div className="p-6 lg:p-8">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-lg shadow-indigo-200/50 flex items-center justify-center">
              <i className="fas fa-sun text-white text-sm"></i>
            </div>
            <span className="hidden lg:inline bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">Lumina</span>
          </h1>
        </div>

        <nav className="flex-1 px-3 lg:px-4 py-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={(e) => guardedNavigate(e, item.path)}
                className={`relative flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all duration-200 ${
                  isActive
                    ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-200/50 font-semibold'
                    : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                <i className={`fas ${item.icon} text-lg w-6 text-center`}></i>
                <span className="hidden lg:inline text-sm font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-slate-100/50">
          {user && (
            <div className="hidden lg:block space-y-3">
              <div className="flex items-center gap-3 px-2">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-bold text-sm shadow-md shadow-indigo-200/50">
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
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-2xl border-t border-slate-100 shadow-2xl shadow-slate-300/20 flex justify-around items-center py-3 px-4 z-50">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={(e) => guardedNavigate(e, item.path)}
              className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
                isActive ? 'text-indigo-600' : 'text-slate-400'
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                isActive ? 'bg-indigo-50' : ''
              }`}>
                <i className={`fas ${item.icon} text-lg`}></i>
              </div>
              <span className="text-[10px] font-semibold">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <main className="flex-1 md:ml-24 lg:ml-72 min-h-screen">
        <div className="max-w-6xl mx-auto w-full px-4 md:px-8 lg:px-12 py-6 md:py-8 pb-24 md:pb-8">
          {/* Top bar with notification */}
          <div className="flex items-center justify-end mb-6 relative">
            <NotificationBell />
            <NotificationPanel />
          </div>

          {/* Page content with animation */}
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <Outlet />
          </motion.div>
        </div>
      </main>
    </div>
  );
};

export default Layout;
