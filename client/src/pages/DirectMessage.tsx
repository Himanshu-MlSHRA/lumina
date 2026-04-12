import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../services/api';
import { connectSocket, waitForSocket, getSocket } from '../services/socketService';
import { useAuthStore } from '../stores/authStore';

interface ChatMessage {
  id: string;
  content: string;
  createdAt: string;
  sender: { id: string; displayName: string; avatarUrl: string | null };
}

const DirectMessage: React.FC = () => {
  const { userId: otherUserId } = useParams<{ userId: string }>();
  const { user, token } = useAuthStore();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [otherName, setOtherName] = useState('User');
  const [otherOnline, setOtherOnline] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [callType, setCallType] = useState<'audio' | 'video' | null>(null);
  const [callState, setCallState] = useState<'idle' | 'calling' | 'incoming' | 'active'>('idle');
  const [callDuration, setCallDuration] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const seenIdsRef = useRef(new Set<string>());
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const incomingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const addMessage = useCallback((msg: ChatMessage) => {
    if (seenIdsRef.current.has(msg.id)) return;
    seenIdsRef.current.add(msg.id);
    setMessages(prev => [...prev, msg]);
  }, []);

  useEffect(() => {
    if (!token || !otherUserId) return;

    const socket = connectSocket(token);

    waitForSocket().then(s => {
      if (s) s.emit('join-dm', { otherUserId });
    });

    // Load history
    api.get(`/messages/dm/${otherUserId}`).then(data => {
      const msgs = data.messages as ChatMessage[];
      msgs.forEach(m => seenIdsRef.current.add(m.id));
      setMessages(msgs);
      // Get other user's name from messages or load it
      const other = msgs.find(m => m.sender.id === otherUserId);
      if (other) setOtherName(other.sender.displayName);
    }).catch(console.error);

    const handleDm = ({ message }: { message: ChatMessage }) => {
      const isMine = message.sender.id === user?.id;
      const isFromOther = message.sender.id === otherUserId;
      if (isMine || isFromOther) {
        addMessage(message);
      }
    };

    const handleTyping = ({ userId }: { userId: string }) => {
      if (userId === otherUserId) {
        setIsTyping(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 2000);
      }
    };

    const handleStopTyping = ({ userId }: { userId: string }) => {
      if (userId === otherUserId) setIsTyping(false);
    };

    const handleOnline = ({ userId, online }: { userId: string; online: boolean }) => {
      if (userId === otherUserId) setOtherOnline(online);
    };

    const handleCallIncoming = ({ callerId, callerName, callType: ct, offer }: any) => {
      if (callerId === otherUserId) {
        setCallState('incoming');
        setCallType(ct);
        incomingOfferRef.current = offer;
        if (callerName) setOtherName(callerName);
      }
    };

    const handleCallAccepted = async ({ answer }: any) => {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        setCallState('active');
        startCallTimer();
      }
    };

    const handleCallRejected = () => {
      cleanupCall();
      setCallState('idle');
    };

    const handleCallEnded = () => {
      cleanupCall();
      setCallState('idle');
    };

    const handleIceCandidate = async ({ candidate }: any) => {
      if (peerConnectionRef.current && candidate) {
        try {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) { console.error('ICE candidate error:', e); }
      }
    };

    socket.on('new-dm', handleDm);
    socket.on('user-typing', handleTyping);
    socket.on('user-stop-typing', handleStopTyping);
    socket.on('user-online', handleOnline);
    socket.on('call-incoming', handleCallIncoming);
    socket.on('call-accepted', handleCallAccepted);
    socket.on('call-rejected', handleCallRejected);
    socket.on('call-ended', handleCallEnded);
    socket.on('ice-candidate', handleIceCandidate);

    return () => {
      socket.emit('leave-dm', { otherUserId });
      socket.off('new-dm', handleDm);
      socket.off('user-typing', handleTyping);
      socket.off('user-stop-typing', handleStopTyping);
      socket.off('user-online', handleOnline);
      socket.off('call-incoming', handleCallIncoming);
      socket.off('call-accepted', handleCallAccepted);
      socket.off('call-rejected', handleCallRejected);
      socket.off('call-ended', handleCallEnded);
      socket.off('ice-candidate', handleIceCandidate);
      cleanupCall();
    };
  }, [token, otherUserId, user?.id, addMessage]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const startCallTimer = () => {
    setCallDuration(0);
    callTimerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const sendMessage = () => {
    if (!input.trim()) return;
    const socket = getSocket();
    if (!socket) return;
    socket.emit('direct-message', { recipientId: otherUserId, content: input.trim() });
    setInput('');
    socket.emit('stop-typing', { recipientId: otherUserId });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    const socket = getSocket();
    if (socket && e.target.value.trim()) {
      socket.emit('typing', { recipientId: otherUserId });
    } else if (socket) {
      socket.emit('stop-typing', { recipientId: otherUserId });
    }
  };

  // WebRTC
  const createPeerConnection = () => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        const socket = getSocket();
        socket?.emit('ice-candidate', { targetUserId: otherUserId, candidate: e.candidate });
      }
    };

    pc.ontrack = (e) => {
      remoteStreamRef.current = e.streams[0];
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = e.streams[0];
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        cleanupCall();
        setCallState('idle');
      }
    };

    peerConnectionRef.current = pc;
    return pc;
  };

  const startCall = async (type: 'audio' | 'video') => {
    try {
      setCallType(type);
      setCallState('calling');

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === 'video',
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      const pc = createPeerConnection();
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const socket = getSocket();
      socket?.emit('call-initiate', { recipientId: otherUserId, callType: type, offer });
    } catch (e) {
      console.error('Failed to start call:', e);
      cleanupCall();
      setCallState('idle');
    }
  };

  const acceptCall = async () => {
    if (!incomingOfferRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === 'video',
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      const pc = createPeerConnection();
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(incomingOfferRef.current));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      const socket = getSocket();
      socket?.emit('call-accept', { callerId: otherUserId, answer });
      setCallState('active');
      startCallTimer();
      incomingOfferRef.current = null;
    } catch (e) {
      console.error('Failed to accept call:', e);
      cleanupCall();
    }
  };

  const rejectCall = () => {
    const socket = getSocket();
    socket?.emit('call-reject', { callerId: otherUserId });
    incomingOfferRef.current = null;
    setCallState('idle');
  };

  const endCall = () => {
    const socket = getSocket();
    socket?.emit('call-end', { otherUserId });
    cleanupCall();
    setCallState('idle');
  };

  const cleanupCall = () => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    incomingOfferRef.current = null;
    setCallType(null);
    setCallDuration(0);
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] md:h-[calc(100vh-7rem)]">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between pb-4 border-b border-slate-100"
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/community')}
            className="w-9 h-9 rounded-xl bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-all hover:scale-105 active:scale-95"
          >
            <i className="fas fa-arrow-left text-sm"></i>
          </button>
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-indigo-200/30">
                {otherName.charAt(0).toUpperCase()}
              </div>
              <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white transition-colors ${otherOnline ? 'bg-emerald-400' : 'bg-slate-300'}`} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">{otherName}</h2>
              <p className="text-[11px] text-slate-400 font-medium">
                {isTyping ? (
                  <span className="text-indigo-500">typing...</span>
                ) : otherOnline ? 'Online' : 'Offline'}
              </p>
            </div>
          </div>
        </div>

        {/* Call buttons */}
        <div className="flex items-center gap-1.5">
          <motion.button
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            onClick={() => startCall('audio')}
            disabled={callState !== 'idle'}
            className="w-9 h-9 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-600 flex items-center justify-center transition-all disabled:opacity-30"
          >
            <i className="fas fa-phone text-sm"></i>
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            onClick={() => startCall('video')}
            disabled={callState !== 'idle'}
            className="w-9 h-9 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-600 flex items-center justify-center transition-all disabled:opacity-30"
          >
            <i className="fas fa-video text-sm"></i>
          </motion.button>
        </div>
      </motion.div>

      {/* Incoming Call Banner */}
      <AnimatePresence>
        {callState === 'incoming' && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mx-1 mt-3 p-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white flex items-center justify-between shadow-xl shadow-emerald-200/30"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center relative pulse-ring">
                <i className={`fas ${callType === 'video' ? 'fa-video' : 'fa-phone'}`}></i>
              </div>
              <div>
                <p className="font-bold text-sm">{otherName} is calling...</p>
                <p className="text-xs text-emerald-100">{callType === 'video' ? 'Video' : 'Audio'} call</p>
              </div>
            </div>
            <div className="flex gap-2">
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={acceptCall}
                className="w-10 h-10 rounded-full bg-white text-emerald-600 flex items-center justify-center shadow-lg"
              >
                <i className="fas fa-phone"></i>
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={rejectCall}
                className="w-10 h-10 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg"
              >
                <i className="fas fa-phone-slash"></i>
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active Call UI */}
      <AnimatePresence>
        {(callState === 'calling' || callState === 'active') && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="mx-1 mt-3 rounded-2xl bg-slate-900 overflow-hidden shadow-2xl"
          >
            {callType === 'video' ? (
              <div className="relative aspect-video bg-black max-h-[300px]">
                <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
                <video ref={localVideoRef} autoPlay playsInline muted className="absolute bottom-3 right-3 w-24 h-16 rounded-lg object-cover border-2 border-white/30 shadow-lg" />
                {callState === 'calling' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                    <div className="text-center text-white">
                      <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-3 animate-pulse">
                        <i className="fas fa-video text-xl"></i>
                      </div>
                      <p className="font-bold text-sm">Calling {otherName}...</p>
                    </div>
                  </div>
                )}
                {callState === 'active' && (
                  <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-black/40 backdrop-blur-sm text-white text-xs font-semibold">
                    {formatDuration(callDuration)}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6 flex flex-col items-center gap-3">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xl font-bold shadow-xl">
                  {otherName.charAt(0).toUpperCase()}
                </div>
                <p className="text-white font-bold text-sm">{otherName}</p>
                <p className="text-slate-400 text-xs">
                  {callState === 'calling' ? 'Calling...' : formatDuration(callDuration)}
                </p>
                {callState === 'calling' && (
                  <div className="flex gap-1">
                    {[0, 1, 2].map(i => (
                      <div key={i} className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="p-3 flex justify-center">
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={endCall}
                className="w-12 h-12 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-lg shadow-red-500/30"
              >
                <i className="fas fa-phone-slash text-sm"></i>
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-2 no-scrollbar">
        {messages.length === 0 && (
          <div className="text-center text-slate-400 py-16">
            <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-3">
              <i className="fas fa-paper-plane text-xl text-slate-300"></i>
            </div>
            <p className="font-semibold text-slate-500 text-sm">Start a conversation</p>
            <p className="text-xs mt-1">Messages are private between you and {otherName}</p>
          </div>
        )}
        {messages.map((msg, i) => {
          const isMe = msg.sender.id === user?.id;
          const showAvatar = i === 0 || messages[i - 1].sender.id !== msg.sender.id;
          const showTime = i === 0 || messages[i - 1].sender.id !== msg.sender.id;
          return (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
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
                    {msg.sender.displayName.charAt(0).toUpperCase()}
                  </div>
                ) : <div className="w-6" />}
                <div>
                  {showTime && (
                    <div className={`flex items-center gap-1.5 mb-1 ${isMe ? 'justify-end' : ''}`}>
                      <span className="text-[10px] text-slate-300 font-medium">
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
        {isTyping && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-start"
          >
            <div className="px-4 py-2.5 rounded-2xl bg-white border border-slate-100 shadow-sm rounded-bl-md">
              <div className="flex gap-1 items-center">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                ))}
              </div>
            </div>
          </motion.div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="pt-3 border-t border-slate-100"
      >
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={handleInputChange}
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

export default DirectMessage;
