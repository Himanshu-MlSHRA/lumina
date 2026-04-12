import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useNotificationStore } from '../../stores/notificationStore';

const NotificationPanel: React.FC = () => {
  const navigate = useNavigate();
  const { notifications, showPanel, closePanel, markAllRead, markRead } = useNotificationStore();

  const handleClick = (n: typeof notifications[0]) => {
    markRead(n.id);
    if (n.link) {
      navigate(n.link);
    } else if (n.type === 'dm' && n.senderId) {
      navigate(`/community/dm/${n.senderId}`);
    } else if (n.type === 'group-message' && n.groupId) {
      navigate(`/community/group/${n.groupId}`);
    }
    closePanel();
  };

  return (
    <AnimatePresence>
      {showPanel && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90]"
            onClick={closePanel}
          />
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="absolute right-0 top-full mt-2 w-80 max-h-[400px] bg-white rounded-2xl border border-slate-100 shadow-2xl shadow-slate-200/50 overflow-hidden z-[100]"
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-50">
              <h3 className="font-bold text-slate-800 text-sm">Notifications</h3>
              {notifications.length > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-[11px] text-indigo-500 font-semibold hover:text-indigo-700"
                >
                  Mark all read
                </button>
              )}
            </div>
            <div className="overflow-y-auto max-h-[340px] no-scrollbar">
              {notifications.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <i className="fas fa-bell-slash text-2xl mb-2 opacity-50"></i>
                  <p className="text-sm font-medium">No notifications yet</p>
                </div>
              ) : (
                notifications.map((n, i) => (
                  <motion.button
                    key={n.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    onClick={() => handleClick(n)}
                    className={`w-full text-left p-4 flex items-start gap-3 hover:bg-slate-50 transition-colors border-b border-slate-50/50 ${
                      !n.read ? 'bg-indigo-50/30' : ''
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center text-white text-xs ${
                      n.type === 'dm'
                        ? 'bg-gradient-to-br from-indigo-400 to-purple-500'
                        : n.type === 'group-message'
                        ? 'bg-gradient-to-br from-emerald-400 to-teal-500'
                        : 'bg-gradient-to-br from-pink-400 to-purple-500'
                    }`}>
                      <i className={`fas ${
                        n.type === 'dm' ? 'fa-envelope' : n.type === 'group-message' ? 'fa-users' : 'fa-compass'
                      }`}></i>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{n.title}</p>
                      <p className="text-xs text-slate-500 truncate">{n.preview}</p>
                      <p className="text-[10px] text-slate-400 mt-1">
                        {formatTime(n.timestamp)}
                      </p>
                    </div>
                    {!n.read && (
                      <div className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0 mt-2" />
                    )}
                  </motion.button>
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

function formatTime(date: Date): string {
  const now = Date.now();
  const diff = now - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default NotificationPanel;
