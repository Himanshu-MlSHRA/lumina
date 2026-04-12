import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../services/api';
import { connectSocket, getSocket, waitForSocket } from '../services/socketService';
import { useAuthStore } from '../stores/authStore';

interface ChatMessage {
  id: string;
  content: string;
  isAnonymous: boolean;
  createdAt: string;
  sender: { id: string; displayName: string; avatarUrl: string | null };
}

const GroupChat: React.FC = () => {
  const { groupId } = useParams<{ groupId: string }>();
  const { user, token } = useAuthStore();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [groupName, setGroupName] = useState('');
  const [memberCount, setMemberCount] = useState(0);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const seenIdsRef = useRef(new Set<string>());

  useEffect(() => {
    if (!token || !groupId) return;

    const socket = connectSocket(token);

    waitForSocket().then(s => {
      if (s) s.emit('join-group', { groupId });
    });

    // Load history
    api.get(`/messages?groupId=${groupId}`).then(data => {
      const msgs = data.messages as ChatMessage[];
      msgs.forEach(m => seenIdsRef.current.add(m.id));
      setMessages(msgs);
    }).catch(console.error);

    // Load group info
    api.get('/groups').then(data => {
      const g = data.groups.find((g: any) => g.id === groupId);
      if (g) {
        setGroupName(g.name);
        setMemberCount(g.memberCount);
      }
    }).catch(console.error);

    const handleNewMessage = ({ message }: { message: ChatMessage }) => {
      if (seenIdsRef.current.has(message.id)) return;
      seenIdsRef.current.add(message.id);
      setMessages(prev => [...prev, message]);
    };
    socket.on('new-group-message', handleNewMessage);

    return () => {
      socket.emit('leave-group', { groupId });
      socket.off('new-group-message', handleNewMessage);
    };
  }, [token, groupId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = () => {
    if (!input.trim()) return;
    const socket = getSocket();
    if (!socket) return;
    socket.emit('group-message', { groupId, content: input.trim(), isAnonymous });
    setInput('');
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] md:h-[calc(100vh-7rem)]">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 pb-4 border-b border-slate-100"
      >
        <button
          onClick={() => navigate('/community')}
          className="w-9 h-9 rounded-xl bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-all hover:scale-105 active:scale-95"
        >
          <i className="fas fa-arrow-left text-sm"></i>
        </button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white shadow-lg shadow-emerald-200/30">
            <i className="fas fa-users text-sm"></i>
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">{groupName || 'Group Chat'}</h2>
            <p className="text-[11px] text-slate-400 font-medium">{memberCount} members &middot; {messages.length} messages</p>
          </div>
        </div>
      </motion.div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-2 no-scrollbar">
        {messages.length === 0 && (
          <div className="text-center text-slate-400 py-16">
            <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-3">
              <i className="fas fa-comments text-xl text-slate-300"></i>
            </div>
            <p className="font-semibold text-slate-500 text-sm">No messages yet</p>
            <p className="text-xs mt-1">Start the conversation!</p>
          </div>
        )}
        {messages.map((msg, i) => {
          const isMe = msg.sender.id === user?.id;
          const showAvatar = i === 0 || messages[i - 1].sender.id !== msg.sender.id;
          return (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[78%] flex items-end gap-1.5 ${isMe ? 'flex-row-reverse' : ''}`}>
                {showAvatar ? (
                  <div className={`w-6 h-6 rounded-lg flex-shrink-0 flex items-center justify-center text-[9px] font-bold ${
                    isMe
                      ? 'bg-gradient-to-br from-indigo-400 to-purple-500 text-white'
                      : 'bg-slate-100 text-slate-500'
                  }`}>
                    {(msg.isAnonymous ? 'A' : msg.sender.displayName.charAt(0)).toUpperCase()}
                  </div>
                ) : <div className="w-6" />}
                <div>
                  {showAvatar && (
                    <div className={`flex items-center gap-1.5 mb-1 ${isMe ? 'justify-end' : ''}`}>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        {msg.isAnonymous ? 'Anonymous' : msg.sender.displayName}
                      </span>
                      <span className="text-[10px] text-slate-300">
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  )}
                  <div className={`px-3.5 py-2 rounded-2xl text-sm leading-relaxed ${
                    isMe
                      ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-br-md shadow-sm shadow-indigo-200/30'
                      : 'bg-white border border-slate-100 text-slate-700 rounded-bl-md shadow-sm'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="pt-3 border-t border-slate-100 space-y-2"
      >
        <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none ml-1">
          <input type="checkbox" checked={isAnonymous} onChange={e => setIsAnonymous(e.target.checked)} className="accent-indigo-500 rounded w-3.5 h-3.5" />
          Post anonymously
        </label>
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
            placeholder="Type a message..."
            className="flex-1 px-4 py-3 rounded-2xl border border-slate-200/80 bg-white/90 backdrop-blur-sm focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 outline-none transition-all text-sm placeholder:text-slate-300"
          />
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.9 }}
            onClick={sendMessage}
            disabled={!input.trim()}
            className="w-11 h-11 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-lg shadow-indigo-200/50 disabled:opacity-30 disabled:shadow-none transition-all"
          >
            <i className="fas fa-paper-plane text-sm"></i>
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
};

export default GroupChat;
