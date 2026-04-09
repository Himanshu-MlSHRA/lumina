import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
  const [showCallUI, setShowCallUI] = useState(false);
  const [callType, setCallType] = useState<'audio' | 'video' | null>(null);
  const [callState, setCallState] = useState<'idle' | 'calling' | 'incoming' | 'active'>('idle');
  const bottomRef = useRef<HTMLDivElement>(null);
  const seenIdsRef = useRef(new Set<string>());
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const incomingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addMessage = useCallback((msg: ChatMessage) => {
    if (seenIdsRef.current.has(msg.id)) return;
    seenIdsRef.current.add(msg.id);
    setMessages(prev => [...prev, msg]);
  }, []);

  useEffect(() => {
    if (!token || !otherUserId) return;

    const socket = connectSocket(token);

    // Wait for connection then join DM room
    waitForSocket().then(s => {
      if (s) s.emit('join-dm', { otherUserId });
    });

    // Load history
    api.get(`/messages/dm/${otherUserId}`).then(data => {
      const msgs = data.messages as ChatMessage[];
      msgs.forEach(m => seenIdsRef.current.add(m.id));
      setMessages(msgs);
    }).catch(console.error);

    // Listen for DMs — use `new-dm` event (separated from group messages now)
    const handleDm = ({ message }: { message: ChatMessage }) => {
      // Only add messages from this conversation
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

    // Call handlers
    const handleCallIncoming = ({ callerId, callerName, callType: ct, offer }: any) => {
      if (callerId === otherUserId) {
        setCallState('incoming');
        setCallType(ct);
        incomingOfferRef.current = offer;
      }
    };

    const handleCallAccepted = async ({ answer }: any) => {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        setCallState('active');
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

  useEffect(() => {
    if (messages.length > 0) {
      const other = messages.find(m => m.sender.id === otherUserId);
      if (other) setOtherName(other.sender.displayName);
    }
  }, [messages, otherUserId]);

  const sendMessage = () => {
    if (!input.trim()) return;
    const socket = getSocket();
    if (!socket) return;
    socket.emit('direct-message', { recipientId: otherUserId, content: input.trim() });
    setInput('');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    const socket = getSocket();
    if (socket && e.target.value.trim()) {
      socket.emit('typing', { recipientId: otherUserId });
    }
  };

  // ── WebRTC Calling ──────────────────────────────────────────

  const createPeerConnection = () => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
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
      setShowCallUI(true);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === 'video',
      });
      localStreamRef.current = stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

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
      setShowCallUI(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === 'video',
      });
      localStreamRef.current = stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      const pc = createPeerConnection();
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(incomingOfferRef.current));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      const socket = getSocket();
      socket?.emit('call-accept', { callerId: otherUserId, answer });
      setCallState('active');
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
    setShowCallUI(false);
    setCallType(null);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] md:h-[calc(100vh-8rem)] animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-100/80">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/community')}
            className="w-10 h-10 rounded-xl bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-all hover:scale-105 active:scale-95"
          >
            <i className="fas fa-arrow-left text-sm"></i>
          </button>
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-indigo-200/50">
                {otherName.charAt(0).toUpperCase()}
              </div>
              <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white transition-colors ${otherOnline ? 'bg-emerald-400' : 'bg-slate-300'}`} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">{otherName}</h2>
              <p className="text-[11px] text-slate-400 font-medium">
                {isTyping ? (
                  <span className="text-indigo-500 animate-pulse">typing...</span>
                ) : otherOnline ? 'Online' : 'Offline'}
              </p>
            </div>
          </div>
        </div>

        {/* Call buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => startCall('audio')}
            disabled={callState !== 'idle'}
            className="w-10 h-10 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-600 flex items-center justify-center transition-all hover:scale-105 active:scale-95 disabled:opacity-30"
          >
            <i className="fas fa-phone text-sm"></i>
          </button>
          <button
            onClick={() => startCall('video')}
            disabled={callState !== 'idle'}
            className="w-10 h-10 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-600 flex items-center justify-center transition-all hover:scale-105 active:scale-95 disabled:opacity-30"
          >
            <i className="fas fa-video text-sm"></i>
          </button>
        </div>
      </div>

      {/* Incoming Call Banner */}
      {callState === 'incoming' && (
        <div className="mx-2 mt-3 p-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white flex items-center justify-between animate-in slide-in-from-top duration-300 shadow-lg shadow-emerald-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center animate-pulse">
              <i className={`fas ${callType === 'video' ? 'fa-video' : 'fa-phone'}`}></i>
            </div>
            <div>
              <p className="font-bold text-sm">{otherName} is calling...</p>
              <p className="text-xs text-emerald-100">{callType === 'video' ? 'Video' : 'Audio'} call</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={acceptCall} className="w-10 h-10 rounded-full bg-white text-emerald-600 flex items-center justify-center hover:scale-110 transition-transform shadow-lg">
              <i className="fas fa-phone"></i>
            </button>
            <button onClick={rejectCall} className="w-10 h-10 rounded-full bg-red-500 text-white flex items-center justify-center hover:scale-110 transition-transform shadow-lg">
              <i className="fas fa-phone-slash"></i>
            </button>
          </div>
        </div>
      )}

      {/* Active Call / Calling UI */}
      {(callState === 'calling' || callState === 'active') && showCallUI && (
        <div className="mx-2 mt-3 rounded-2xl bg-slate-900 overflow-hidden animate-in fade-in zoom-in-95 duration-300 shadow-2xl">
          {callType === 'video' ? (
            <div className="relative aspect-video bg-black">
              <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
              <video ref={localVideoRef} autoPlay playsInline muted className="absolute bottom-3 right-3 w-28 h-20 rounded-xl object-cover border-2 border-white/30 shadow-lg" />
              {callState === 'calling' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                  <div className="text-center text-white">
                    <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-3 animate-pulse">
                      <i className="fas fa-video text-2xl"></i>
                    </div>
                    <p className="font-bold">Calling {otherName}...</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 flex flex-col items-center gap-4">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold shadow-xl">
                {otherName.charAt(0).toUpperCase()}
              </div>
              <p className="text-white font-bold">{otherName}</p>
              <p className="text-slate-400 text-sm">
                {callState === 'calling' ? 'Calling...' : 'Connected'}
              </p>
              {callState === 'calling' && (
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              )}
            </div>
          )}
          <div className="p-4 flex justify-center">
            <button
              onClick={endCall}
              className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-all hover:scale-110 active:scale-95 shadow-lg shadow-red-500/30"
            >
              <i className="fas fa-phone-slash text-lg"></i>
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-6 space-y-3 no-scrollbar">
        {messages.length === 0 && (
          <div className="text-center text-slate-400 py-20 animate-in fade-in duration-700">
            <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-envelope text-2xl text-slate-300"></i>
            </div>
            <p className="font-semibold text-slate-500">Start a private conversation</p>
            <p className="text-sm mt-1">Messages are only visible to you and {otherName}</p>
          </div>
        )}
        {messages.map((msg, i) => {
          const isMe = msg.sender.id === user?.id;
          const showAvatar = i === 0 || messages[i - 1].sender.id !== msg.sender.id;
          return (
            <div
              key={msg.id}
              className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-1 duration-200`}
            >
              <div className={`max-w-[75%] flex items-end gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
                {showAvatar ? (
                  <div className={`w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center text-[10px] font-bold ${
                    isMe
                      ? 'bg-gradient-to-br from-indigo-400 to-purple-500 text-white'
                      : 'bg-slate-100 text-slate-500'
                  }`}>
                    {msg.sender.displayName.charAt(0).toUpperCase()}
                  </div>
                ) : <div className="w-7" />}
                <div>
                  {showAvatar && (
                    <div className={`flex items-center gap-2 mb-1 ${isMe ? 'justify-end' : ''}`}>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        {msg.sender.displayName}
                      </span>
                      <span className="text-[10px] text-slate-300">
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  )}
                  <div className={`px-4 py-2.5 rounded-2xl transition-all ${
                    isMe
                      ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-br-md shadow-md shadow-indigo-200/50'
                      : 'bg-white border border-slate-100 text-slate-700 rounded-bl-md shadow-sm'
                  }`}>
                    <p className="text-sm leading-relaxed">{msg.content}</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {isTyping && (
          <div className="flex justify-start animate-in fade-in duration-300">
            <div className="px-4 py-3 rounded-2xl bg-white border border-slate-100 shadow-sm rounded-bl-md">
              <div className="flex gap-1 items-center">
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="pt-4 border-t border-slate-100/80">
        <div className="flex items-center gap-3">
          <input
            value={input}
            onChange={handleInputChange}
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
            placeholder="Type a message..."
            className="flex-1 px-5 py-3.5 rounded-2xl border border-slate-200/80 bg-white/80 backdrop-blur-sm focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 outline-none transition-all text-sm placeholder:text-slate-300"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim()}
            className="w-12 h-12 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-lg shadow-indigo-200/50 hover:shadow-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-30 disabled:hover:scale-100"
          >
            <i className="fas fa-paper-plane text-sm"></i>
          </button>
        </div>
      </div>
    </div>
  );
};

export default DirectMessage;
