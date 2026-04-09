import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { connectSocket, getSocket } from '../services/socketService';
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
  const [isAnonymous, setIsAnonymous] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token || !groupId) return;

    const socket = connectSocket(token);
    socket.emit('join-group', { groupId });

    // Load history
    api.get(`/messages?groupId=${groupId}`).then(data => {
      setMessages(data.messages);
    }).catch(console.error);

    // Load group info
    api.get('/groups').then(data => {
      const g = data.groups.find((g: any) => g.id === groupId);
      if (g) setGroupName(g.name);
    }).catch(console.error);

    // Listen for new messages
    const handleNewMessage = ({ message }: { message: any }) => {
      if (message.groupId === groupId) {
        setMessages(prev => [...prev, message]);
      }
    };
    socket.on('new-message', handleNewMessage);

    return () => {
      socket.emit('leave-group', { groupId });
      socket.off('new-message', handleNewMessage);
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
    <div className="flex flex-col h-[calc(100vh-6rem)] md:h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center gap-4 pb-6 border-b border-slate-100">
        <button onClick={() => navigate('/community')} className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors">
          <i className="fas fa-arrow-left"></i>
        </button>
        <div>
          <h2 className="text-xl font-bold text-slate-900">{groupName || 'Group Chat'}</h2>
          <p className="text-xs text-slate-400 font-medium">{messages.length} messages</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-6 space-y-4 no-scrollbar">
        {messages.length === 0 && (
          <div className="text-center text-slate-400 py-20">
            <i className="fas fa-comments text-4xl mb-3 opacity-30"></i>
            <p className="font-medium">No messages yet. Start the conversation!</p>
          </div>
        )}
        {messages.map(msg => {
          const isMe = msg.sender.id === user?.id;
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] ${isMe ? 'order-2' : ''}`}>
                <div className={`flex items-center gap-2 mb-1 ${isMe ? 'justify-end' : ''}`}>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    {msg.isAnonymous ? 'Anonymous' : msg.sender.displayName}
                  </span>
                  <span className="text-[10px] text-slate-300">
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className={`px-5 py-3 rounded-2xl ${
                  isMe
                    ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-br-md shadow-lg shadow-indigo-200'
                    : 'bg-white border border-slate-100 text-slate-700 rounded-bl-md shadow-sm'
                }`}>
                  <p className="text-sm leading-relaxed">{msg.content}</p>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="pt-4 border-t border-slate-100 space-y-3">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
            <input type="checkbox" checked={isAnonymous} onChange={e => setIsAnonymous(e.target.checked)} className="accent-indigo-500 rounded" />
            Anonymous
          </label>
        </div>
        <div className="flex items-center gap-3">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
            placeholder="Type a message..."
            className="flex-1 px-5 py-4 rounded-2xl border border-slate-200 bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 outline-none transition-all text-sm"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim()}
            className="w-12 h-12 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-lg shadow-indigo-200 hover:shadow-xl transition-all disabled:opacity-30"
          >
            <i className="fas fa-paper-plane"></i>
          </button>
        </div>
      </div>
    </div>
  );
};

export default GroupChat;
