import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useNotificationStore, Notification } from '../../stores/notificationStore';

const NotificationToast: React.FC = () => {
  const navigate = useNavigate();
  const { notifications } = useNotificationStore();
  const [visible, setVisible] = useState<Notification | null>(null);

  useEffect(() => {
    if (notifications.length === 0) return;
    const latest = notifications[0];
    if (!latest.read) {
      setVisible(latest);
      const timer = setTimeout(() => setVisible(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notifications]);

  const handleClick = () => {
    if (!visible) return;
    if (visible.type === 'dm' && visible.senderId) {
      navigate(`/community/dm/${visible.senderId}`);
    } else if (visible.type === 'group-message' && visible.groupId) {
      navigate(`/community/group/${visible.groupId}`);
    }
    setVisible(null);
  };

  return (
    <div className="fixed top-4 right-4 z-[200]">
      <AnimatePresence>
        {visible && (
          <motion.button
            initial={{ opacity: 0, y: -20, x: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            onClick={handleClick}
            className="flex items-center gap-3 bg-white/95 backdrop-blur-xl border border-slate-100 rounded-2xl p-4 shadow-2xl shadow-slate-300/30 max-w-sm hover:scale-[1.02] active:scale-[0.98] transition-transform cursor-pointer"
          >
            <div className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-white ${
              visible.type === 'dm'
                ? 'bg-gradient-to-br from-indigo-400 to-purple-500'
                : 'bg-gradient-to-br from-emerald-400 to-teal-500'
            }`}>
              <i className={`fas ${visible.type === 'dm' ? 'fa-envelope' : 'fa-users'}`}></i>
            </div>
            <div className="text-left flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-800 truncate">{visible.title}</p>
              <p className="text-xs text-slate-500 truncate">{visible.preview}</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setVisible(null); }}
              className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 flex-shrink-0"
            >
              <i className="fas fa-times text-[10px]"></i>
            </button>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NotificationToast;
