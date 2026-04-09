
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { DailyTask } from '../lib/types';
import { api } from '../services/api';

const Chat: React.FC = () => {
  const [isActive, setIsActive] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const [transcription, setTranscription] = useState("");
  const [isEnding, setIsEnding] = useState(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const outputNodeRef = useRef<GainNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionRef = useRef<any>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);

  // Clean up session on unmount
  useEffect(() => {
    return () => {
      stopSessionImmediate();
    };
  }, []);

  const startSession = async () => {
    setIsEnding(false);
    setTranscription("");
    try {
      // Fetch API key securely from server
      let apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      try {
        const keyData = await api.get('/ai/session-key');
        if (keyData.key) apiKey = keyData.key;
      } catch { /* fallback to env var */ }

      const ai = new GoogleGenAI({ apiKey });

      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      inputCtxRef.current = inputCtx;
      audioContextRef.current = outputCtx;
      outputNodeRef.current = outputCtx.createGain();
      outputNodeRef.current.connect(outputCtx.destination);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Get pending tasks for context from API
      let pending: string[] = [];
      try {
        const taskData = await api.get('/tasks');
        pending = (taskData.tasks || []).filter((t: DailyTask) => !t.completed).map((t: DailyTask) => t.title);
      } catch {
        const savedTasks = localStorage.getItem('lumina_tasks');
        const tasks: DailyTask[] = savedTasks ? JSON.parse(savedTasks) : [];
        pending = tasks.filter(t => !t.completed).map(t => t.title);
      }

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setIsActive(true);
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessorRef.current = scriptProcessor;
            
            scriptProcessor.onaudioprocess = (e) => {
              // Only send audio if we are not in the process of ending the session
              // This prevents "double talk" or the AI getting interrupted during its goodbye
              if (!isEnding && sessionRef.current) {
                const inputData = e.inputBuffer.getChannelData(0);
                const int16 = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) int16[i] = inputData[i] * 32768;
                
                let binary = '';
                const bytes = new Uint8Array(int16.buffer);
                for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
                const base64 = btoa(binary);

                sessionPromise.then(session => {
                  session.sendRealtimeInput({ media: { data: base64, mimeType: 'audio/pcm;rate=16000' } });
                });
              }
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.outputTranscription) {
              setTranscription(message.serverContent?.outputTranscription?.text);
            }

            const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData) {
              setIsTalking(true);
              const binaryString = atob(audioData);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
              
              const dataInt16 = new Int16Array(bytes.buffer);
              const buffer = outputCtx.createBuffer(1, dataInt16.length, 24000);
              const channelData = buffer.getChannelData(0);
              for (let i = 0; i < dataInt16.length; i++) channelData[i] = dataInt16[i] / 32768.0;

              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
              const source = outputCtx.createBufferSource();
              source.buffer = buffer;
              source.connect(outputNodeRef.current!);
              source.onended = () => {
                sourcesRef.current.delete(source);
                if (sourcesRef.current.size === 0) {
                  setIsTalking(false);
                  // CRITICAL: If we are ending and the last audio chunk finished playing, shut it all down.
                  // We check isEnding ref/state here.
                  if (sessionRef.current?._isEndingFlag) {
                    stopSessionImmediate();
                  }
                }
              };
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(source);
            }

            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => s.stop());
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onclose: () => setIsActive(false),
          onerror: (e) => {
            console.error("Session Error", e);
            stopSessionImmediate();
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          systemInstruction: `You are Lumina, a smooth, gentle, and professional therapist. 
          Your tone is always calm, steady, and compassionate. 
          
          **CONVERSATION STRUCTURE:**
          1. GREETING: Start with a soft "Hello."
          2. MOOD CHECK: Ask the user about their mood immediately.
          3. EXPLORATION: Dig deeper. Ask questions like "Why do you feel that way?" and "What do you think is the root of this tension?" 
          4. SOLUTIONS: Provide gentle, actionable therapy solutions (CBT, grounding, reframing).
          5. EXIT PROTOCOL: If the user says they want to leave, or if you receive a special 'END' signal, you MUST say exactly: "looks like you are done with talking with me..its okay have a good day and also dont forget to [LIST UNCOMPLETED TASKS HERE]."
          
          CURRENT UNCOMPLETED TASKS: ${pending.length > 0 ? pending.join(', ') : 'Rest and breathe.'}
          
          Maintain the therapist role strictly. No slang.`,
          outputAudioTranscription: {}
        },
      });
      sessionRef.current = sessionPromise;
    } catch (err) {
      console.error(err);
    }
  };

  const initiateGoodbye = async () => {
    if (isEnding) return;
    setIsEnding(true);
    
    // We set a custom flag on the session ref to track that we are in the "winding down" phase
    if (sessionRef.current) {
      const session = await sessionRef.current;
      session._isEndingFlag = true;
      
      // Stop the microphone immediately to prevent feedback loop while goodbye plays
      if (scriptProcessorRef.current) {
        scriptProcessorRef.current.disconnect();
      }

      // Explicitly tell the AI to end the session
      session.sendRealtimeInput({
        text: "I want to end our session now. Please provide the goodbye message and remind me of my tasks as instructed."
      });
    } else {
      stopSessionImmediate();
    }
  };

  const stopSessionImmediate = () => {
    // Completely kill all audio and connections
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (inputCtxRef.current) {
      inputCtxRef.current.close();
      inputCtxRef.current = null;
    }
    if (sessionRef.current) {
      sessionRef.current.then((s: any) => {
        try { s.close(); } catch(e) {}
      });
      sessionRef.current = null;
    }
    sourcesRef.current.forEach(s => {
      try { s.stop(); } catch(e) {}
    });
    sourcesRef.current.clear();
    setIsActive(false);
    setIsTalking(false);
    setIsEnding(false);
    setTranscription("");
  };

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center space-y-12 px-4 animate-in fade-in duration-700">
      <div className="text-center space-y-4 max-w-lg">
        <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Lumina</h2>
        <p className="text-slate-500 leading-relaxed italic">Lumina is here to listen and guide you through the fog.</p>
      </div>

      <div className="relative flex items-center justify-center w-80 h-80">
        <div className={`absolute w-64 h-64 rounded-full transition-all duration-1000 aura-breathing ${
          isActive ? 'bg-indigo-400' : 'bg-slate-200'
        }`}></div>
        <div className={`absolute w-48 h-48 rounded-full bg-white/40 backdrop-blur-xl transition-all duration-500 flex items-center justify-center ${
          isTalking ? 'scale-110 shadow-2xl shadow-indigo-300' : 'scale-100'
        }`}>
          <div className="text-slate-800 text-4xl">
             {isActive ? <i className="fas fa-wave-square animate-pulse text-indigo-600"></i> : <i className="fas fa-spa text-slate-400"></i>}
          </div>
        </div>
      </div>

      <div className="w-full max-w-xl space-y-6">
        {isActive && transcription && (
          <div className="glass-card p-6 text-center animate-in fade-in slide-in-from-bottom-2 border-indigo-100 bg-white/80">
            <p className="text-lg font-medium text-slate-800 leading-relaxed italic">"{transcription}"</p>
          </div>
        )}

        <div className="flex flex-col gap-4">
          {isActive ? (
            <button 
              onClick={initiateGoodbye}
              disabled={isEnding}
              className="w-full bg-slate-900 text-white py-6 rounded-3xl font-bold hover:bg-black transition-all uppercase tracking-widest text-xs flex items-center justify-center gap-3 shadow-xl"
            >
              {isEnding ? (
                <>
                  <i className="fas fa-circle-notch animate-spin"></i>
                  Listening to Goodbye...
                </>
              ) : 'End Session'}
            </button>
          ) : (
            <button 
              onClick={startSession}
              className="w-full bg-indigo-600 text-white py-8 rounded-3xl font-bold text-xl shadow-2xl shadow-indigo-200 hover:bg-indigo-700 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-4"
            >
              <i className="fas fa-microphone"></i>
              Connect with Lumina
            </button>
          )}
          
          {isActive && !isEnding && (
            <button 
              onClick={stopSessionImmediate}
              className="text-xs text-slate-400 hover:text-rose-500 font-bold uppercase tracking-widest transition-colors"
            >
              Force Close
            </button>
          )}
        </div>
        
        <p className="text-[10px] text-slate-400 text-center uppercase font-bold tracking-[0.2em] pt-4">
          Encrypted • Professional • Private
        </p>
      </div>
    </div>
  );
};

export default Chat;
