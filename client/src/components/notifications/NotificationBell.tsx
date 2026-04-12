import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotificationStore } from '../../stores/notificationStore';

const NotificationBell: React.FC = () => {
  const { unreadCount, togglePanel } = useNotificationStore();

  return (
    <button
      onClick={togglePanel}
      className="relative w-10 h-10 rounded-xl bg-white/80 backdrop-blur-sm border border-slate-100 flex items-center justify-center text-slate-500 hover:text-indigo-600 hover:border-indigo-200 transition-all hover:scale-105 active:scale-95"
    >
      <i className="fas fa-bell text-sm"></i>
      <AnimatePresence>
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-lg shadow-red-200"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
};

export default NotificationBell;
