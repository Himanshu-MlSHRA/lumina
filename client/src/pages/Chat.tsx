import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { useNavigate } from 'react-router-dom';
import { DailyTask } from '../lib/types';
import { api } from '../services/api';
import { useLuminaStore } from '../stores/luminaStore';

type Turn = {
  id: string;
  role: 'user' | 'lumina';
  text: string;
};

const Chat: React.FC = () => {
  const navigate = useNavigate();
  const [isActive, setIsActive] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [liveUserText, setLiveUserText] = useState('');
  const [liveLuminaText, setLiveLuminaText] = useState('');
  const [connecting, setConnecting] = useState(false);

  const setStoreActive = useLuminaStore(s => s.setActive);
  const registerEndHandler = useLuminaStore(s => s.registerEndHandler);

  const audioContextRef = useRef<AudioContext | null>(null);
  const outputNodeRef = useRef<GainNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionRef = useRef<any>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const screenIntervalRef = useRef<number | null>(null);
  const isEndingRef = useRef(false);
  const isMutedRef = useRef(false);
  const connectionOpenRef = useRef(false);
  const teardownInProgressRef = useRef(false);
  const userBufRef = useRef('');
  const luminaBufRef = useRef('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { isEndingRef.current = isEnding; }, [isEnding]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  useEffect(() => {
    return () => {
      stopSessionImmediate();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll transcript
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns, liveUserText, liveLuminaText]);

  const commitUserTurn = () => {
    const text = userBufRef.current.trim();
    userBufRef.current = '';
    setLiveUserText('');
    if (text) {
      setTurns(prev => [...prev, { id: `u-${Date.now()}`, role: 'user', text }]);
    }
  };

  const commitLuminaTurn = () => {
    const text = luminaBufRef.current.trim();
    luminaBufRef.current = '';
    setLiveLuminaText('');
    if (text) {
      setTurns(prev => [...prev, { id: `l-${Date.now()}`, role: 'lumina', text }]);
    }
  };

  const startSession = async () => {
    if (connecting || isActive) return;
    setConnecting(true);
    setIsEnding(false);
    setTurns([]);
    userBufRef.current = '';
    luminaBufRef.current = '';
    setLiveUserText('');
    setLiveLuminaText('');

    try {
      console.log('[Lumina] Fetching API key…');
      let apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      try {
        const keyData = await api.get('/ai/session-key');
        if (keyData.key) apiKey = keyData.key;
        console.log('[Lumina] Got key from server');
      } catch (e) {
        console.warn('[Lumina] Server key fetch failed, using env:', e);
      }

      if (!apiKey) {
        alert('Gemini API key missing — set GEMINI_API_KEY on the server.');
        setConnecting(false);
        return;
      }

      console.log('[Lumina] Creating GoogleGenAI client…');
      const ai = new GoogleGenAI({ apiKey });

      console.log('[Lumina] Creating AudioContexts…');
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      inputCtxRef.current = inputCtx;
      audioContextRef.current = outputCtx;
      outputNodeRef.current = outputCtx.createGain();
      outputNodeRef.current.connect(outputCtx.destination);

      console.log('[Lumina] Requesting mic permission…');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      micStreamRef.current = stream;
      console.log('[Lumina] Got mic stream');

      let pending: string[] = [];
      try {
        const taskData = await api.get('/tasks');
        pending = (taskData.tasks || []).filter((t: DailyTask) => !t.completed).map((t: DailyTask) => t.title);
      } catch {
        const savedTasks = localStorage.getItem('lumina_tasks');
        const tasks: DailyTask[] = savedTasks ? JSON.parse(savedTasks) : [];
        pending = tasks.filter(t => !t.completed).map(t => t.title);
      }

      // Personalization context — what we already know about the user
      let ctx: any = null;
      try {
        ctx = await api.get('/ai/context');
      } catch (e) {
        console.warn('[Lumina] Could not load context, continuing without it:', e);
      }

      const personalityBlock = ctx?.personality
        ? `**WHAT I KNOW ABOUT THEIR PERSONALITY (from Know Yourself):**
- Type: ${ctx.personality.type} — "${ctx.personality.profileName}" (${ctx.personality.profileTagline})
- Axis confidence: ${ctx.personality.axes.map((a: any) => `${a.dominant} ${a.confidence}%`).join(', ')}
You can reference this naturally — "I see you're an ${ctx.personality.type}, are you really the kind of person who..." but keep it light and curious, not a lecture.`
        : `**PERSONALITY:** Not yet completed Know Yourself — don't bring up MBTI letters.`;

      const todayBlock = ctx?.todaysAnswers?.length > 0
        ? `**TODAY THEY ALREADY ANSWERED THESE PERSONALITY QUESTIONS:**
${ctx.todaysAnswers.map((a: any) => `- "${a.question}" → score ${a.score}/5 (${a.score >= 4 ? 'agreed' : a.score <= 1 ? 'disagreed' : 'middle'})`).join('\n')}
You may ASK ABOUT one of these gently — "I noticed you said you ${ctx.todaysAnswers[0]?.score >= 3 ? 'agreed' : 'disagreed'} with '${ctx.todaysAnswers[0]?.question}' today — say more in your own words?" Pick AT MOST ONE per session, and only if it fits the flow.`
        : '';

      const moodBlock = ctx?.recentMoods?.length > 0
        ? `**RECENT MOOD CHECK-INS:**
${ctx.recentMoods.slice(0, 3).map((m: any) => `- ${m.label} (${m.score}/10)${m.note ? ` — note: "${m.note}"` : ''}`).join('\n')}`
        : '';

      const factsBlock = ctx?.facts && Object.keys(ctx.facts).length > 0
        ? `**THINGS THEY'VE SHARED WITH ME BEFORE (use sparingly, only when relevant):**
${Object.entries(ctx.facts as Record<string, string[]>).map(([cat, items]) => `- ${cat}: ${items.slice(0, 4).join('; ')}`).join('\n')}`
        : '';

      const dataCollectionBlock = `**DATA COLLECTION GOAL:**
This session is also a chance to learn more about them. Naturally, across the conversation, ASK gentle open questions about:
- How their day actually went (specifics, not just "good/bad")
- A hobby or activity they enjoy
- One person who matters to them
- Something they want to do more of, or less of
Don't make it feel like an interview. Spread these across the conversation — at most one new question per turn. If they don't want to answer, drop it.`;

      const moodCheckBlock = `**MOOD CHECK-IN — IMPORTANT:**
At the very start of the session, before anything else, GENTLY ask the user how they are feeling right now.
Mirror their language. Ask in a soft, warm way (e.g. "Hey, before anything — how are you actually feeling right now? On a rough scale of 1 to 10, or just a word or two.").
Listen for their answer. If they give you any signal — a number, a feeling word, "tired", "anxious", "okay", "great", "thoda low", anything — internalise that as today's mood.
Acknowledge it briefly ("got it — sounds like you're sitting around a 4 today") and move on; do not keep re-asking.
You only need this once, near the very beginning of the session. The system will save it automatically afterwards — you do NOT need to ask the user to log it themselves.`;

      const systemInstruction = `You are Lumina — a warm, real, emotionally-attuned companion (not a robotic therapist).

${personalityBlock}

${todayBlock}

${moodBlock}

${factsBlock}

${dataCollectionBlock}

${moodCheckBlock}

**LANGUAGE — CRITICAL:**
- Detect the user's language from their FIRST sentence and mirror it for the whole session.
- If the user speaks English → reply in natural English.
- If the user speaks Hindi → reply in natural conversational Hindi (Devanagari in transcription, natural Hindi when speaking).
- If the user mixes Hindi and English (Hinglish) → reply in the same Hinglish blend. e.g. "Arey yaar, that sounds really stressful. Kya hua exactly?"
- NEVER correct the user's language or force them to switch. Match them.

**TONE MIRRORING — CRITICAL:**
- Read the user's emotional energy in each turn and mirror it.
- Playful / casual user → be warm, light, use gentle humor.
- Sad / low user → slow down, soften, validate before anything else.
- Angry / frustrated user → stay calm, don't patronize, acknowledge the frustration directly.
- Tired / short replies → keep YOUR replies short too. Don't lecture.
- Energetic / excited → match the energy back.

**PACE — CRITICAL:**
- Reply in 1-3 short sentences unless the user explicitly asks for more.
- Respond FAST. Don't pause to think out loud. Be snappy and natural like a close friend on a call.
- Never monologue. Never give a list of 5 techniques unprompted.

**CONVERSATION FLOW:**
1. Open with a soft, warm greeting AND the mood check ("Hey, before anything — how are you actually feeling right now? On a rough 1-10, or just a word." / "Hey, sabse pehle — abhi kaisa feel ho raha hai? 1 se 10 mein, ya bas ek word.").
2. Once they give a signal, acknowledge it briefly and move into normal listening. Do not ask for the mood again.
3. Listen. Ask one follow-up at a time. Let the user lead.
4. When it fits, gently offer one small thing: a reframe, a breathing cue, a question that opens a door.
5. If the user shares something they're seeing on their screen, comment on it naturally and tie it to how they're feeling.

**SCREEN AWARENESS:**
- If you receive a screen image, you can SEE what the user is looking at. Comment on it gently and relate it to their emotional state when relevant. Don't narrate every pixel — pick what matters.

**EXIT PROTOCOL:**
- If the user says they want to end, or you receive an 'END_SESSION' signal, say a warm goodbye in their language and remind them of: ${pending.length > 0 ? pending.join(', ') : 'resting and breathing'}.

Never break character. Never say you're an AI. Never list disclaimers.`;

      console.log('[Lumina] Connecting to Gemini Live…');
      const connectTimeout = window.setTimeout(() => {
        if (connecting) {
          console.error('[Lumina] Connection timeout (15s)');
          alert('Lumina connection timed out. Check your API key and internet connection.');
          stopSessionImmediate();
        }
      }, 15000);

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-latest',
        callbacks: {
          onopen: () => {
            console.log('[Lumina] ✓ Connection OPEN');
            window.clearTimeout(connectTimeout);
            connectionOpenRef.current = true;
            sessionStartRef.current = Date.now();
            setIsActive(true);
            setStoreActive(true);
            setConnecting(false);
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(2048, 1, 1);
            scriptProcessorRef.current = scriptProcessor;

            scriptProcessor.onaudioprocess = (e) => {
              // Hard guards — bail immediately if any teardown condition met
              if (!connectionOpenRef.current) return;
              if (isEndingRef.current || isMutedRef.current) return;
              if (!sessionRef.current) return;

              const inputData = e.inputBuffer.getChannelData(0);
              const int16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) {
                const s = Math.max(-1, Math.min(1, inputData[i]));
                int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
              }
              let binary = '';
              const bytes = new Uint8Array(int16.buffer);
              for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
              const base64 = btoa(binary);

              // Only send if connection still open at send time
              if (!connectionOpenRef.current || !sessionRef.current) return;
              sessionPromise.then(session => {
                if (!connectionOpenRef.current) return;
                try {
                  session.sendRealtimeInput({ media: { data: base64, mimeType: 'audio/pcm;rate=16000' } });
                } catch (err) {
                  // Socket closed mid-send — swallow, teardown will handle it
                  connectionOpenRef.current = false;
                }
              }).catch(() => {});
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Input (user) transcription
            const inputText = (message.serverContent as any)?.inputTranscription?.text;
            if (inputText) {
              userBufRef.current += inputText;
              setLiveUserText(userBufRef.current);
            }

            // Output (Lumina) transcription
            const outputText = (message.serverContent as any)?.outputTranscription?.text;
            if (outputText) {
              luminaBufRef.current += outputText;
              setLiveLuminaText(luminaBufRef.current);
            }

            // Turn boundaries
            if ((message.serverContent as any)?.turnComplete) {
              commitUserTurn();
              commitLuminaTurn();
            }

            // Audio output
            const parts = message.serverContent?.modelTurn?.parts || [];
            for (const part of parts) {
              const audioData = part?.inlineData?.data;
              if (!audioData) continue;
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
                  if ((sessionRef.current as any)?._isEndingFlag) {
                    stopSessionImmediate();
                  }
                }
              };
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(source);
            }

            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => { try { s.stop(); } catch {} });
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onclose: (e: any) => {
            const code = e?.code;
            const reason = e?.reason || '';
            console.log('[Lumina] Connection CLOSED', { code, reason });
            // STOP sending audio IMMEDIATELY before any other cleanup
            connectionOpenRef.current = false;
            window.clearTimeout(connectTimeout);
            const wasOpen = connectionOpenRef.current; // already false, but capture
            stopSessionImmediate();
            if (!wasOpen && reason && code !== 1000 && code !== 1005) {
              alert(`Lumina disconnected.\nCode: ${code}\nReason: ${reason || '(empty)'}\n\nCheck console for details.`);
            }
          },
          onerror: (e: any) => {
            console.error('[Lumina] Connection ERROR:', e);
            connectionOpenRef.current = false;
            window.clearTimeout(connectTimeout);
            const msg = e?.message || e?.error?.message || e?.reason || 'unknown error';
            if (!teardownInProgressRef.current) {
              alert(`Lumina connection error: ${msg}\n\nCheck browser console (F12).`);
            }
            stopSessionImmediate();
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } } },
          systemInstruction,
          outputAudioTranscription: {},
        } as any,
      });

      sessionRef.current = sessionPromise;

      // Surface promise rejection (e.g. bad API key, invalid model)
      sessionPromise.catch((err) => {
        console.error('[Lumina] connect() rejected:', err);
        window.clearTimeout(connectTimeout);
        const msg = err?.message || String(err);
        alert(`Lumina could not connect: ${msg}`);
        stopSessionImmediate();
      });

      console.log('[Lumina] connect() promise registered, waiting for onopen…');
    } catch (err: any) {
      console.error('[Lumina] startSession threw:', err);
      setConnecting(false);
      alert(`Could not start Lumina: ${err?.message || err}. Check mic permissions.`);
    }
  };

  const toggleMute = () => {
    setIsMuted(m => !m);
  };

  const stopScreenShare = useCallback(() => {
    if (screenIntervalRef.current) {
      window.clearInterval(screenIntervalRef.current);
      screenIntervalRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
    }
    setIsSharingScreen(false);
  }, []);

  const startScreenShare = async () => {
    if (!sessionRef.current || isSharingScreen) return;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 2 }, audio: false,
      });
      screenStreamRef.current = stream;

      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      screenVideoRef.current = video;

      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 576;
      screenCanvasRef.current = canvas;
      const ctx = canvas.getContext('2d');

      stream.getVideoTracks()[0].onended = () => stopScreenShare();
      setIsSharingScreen(true);

      screenIntervalRef.current = window.setInterval(async () => {
        if (!ctx || !video || !sessionRef.current) return;
        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
          const base64 = dataUrl.split(',')[1];
          const session = await sessionRef.current;
          session.sendRealtimeInput({ media: { data: base64, mimeType: 'image/jpeg' } });
        } catch (e) {
          console.warn('screen frame send failed', e);
        }
      }, 1500);
    } catch (err) {
      console.warn('screen share cancelled', err);
      setIsSharingScreen(false);
    }
  };

  const initiateGoodbye = async () => {
    if (isEnding) return;
    setIsEnding(true);
    if (sessionRef.current) {
      const session = await sessionRef.current;
      (session as any)._isEndingFlag = true;
      if (scriptProcessorRef.current) scriptProcessorRef.current.disconnect();
      try {
        session.sendRealtimeInput({
          text: 'END_SESSION — I want to wrap up now. Say a short warm goodbye and remind me of my tasks.'
        });
      } catch {}
      // Fallback hard close if AI doesn't respond in 8s
      window.setTimeout(() => {
        if (sessionRef.current) stopSessionImmediate();
      }, 8000);
    } else {
      stopSessionImmediate();
    }
  };

  const finalizeSession = (capturedTurns: Turn[], startedAt: number | null) => {
    if (capturedTurns.length < 2) return;
    const transcript = capturedTurns
      .map((t) => `${t.role === 'user' ? 'User' : 'Lumina'}: ${t.text}`)
      .join('\n');
    const durationSec = startedAt ? Math.round((Date.now() - startedAt) / 1000) : undefined;
    api.post('/ai/extract-facts', {
      transcript,
      sessionType: 'voice',
      durationSec,
    }).catch((err) => {
      console.warn('[Lumina] fact extraction failed:', err);
    });
  };

  const sessionStartRef = useRef<number | null>(null);

  const stopSessionImmediate = () => {
    // Idempotent — skip if already tearing down
    if (teardownInProgressRef.current) return;
    teardownInProgressRef.current = true;
    connectionOpenRef.current = false;

    // Capture transcript before state is cleared
    const capturedTurns = [...turns];
    if (userBufRef.current.trim()) capturedTurns.push({ id: `u-final`, role: 'user', text: userBufRef.current.trim() });
    if (luminaBufRef.current.trim()) capturedTurns.push({ id: `l-final`, role: 'lumina', text: luminaBufRef.current.trim() });
    finalizeSession(capturedTurns, sessionStartRef.current);
    sessionStartRef.current = null;

    stopScreenShare();

    // 1. Disconnect script processor FIRST — stops mic → socket send loop
    if (scriptProcessorRef.current) {
      try { scriptProcessorRef.current.onaudioprocess = null as any; } catch {}
      try { scriptProcessorRef.current.disconnect(); } catch {}
      scriptProcessorRef.current = null;
    }

    // 2. Stop mic tracks
    if (micStreamRef.current) {
      try { micStreamRef.current.getTracks().forEach(t => t.stop()); } catch {}
      micStreamRef.current = null;
    }

    // 3. Close input AudioContext
    if (inputCtxRef.current) {
      try { inputCtxRef.current.close(); } catch {}
      inputCtxRef.current = null;
    }

    // 4. Close session (but don't re-enter on close callback — guard above prevents that)
    const sess = sessionRef.current;
    sessionRef.current = null;
    if (sess && typeof sess.then === 'function') {
      sess.then((session: any) => { try { session.close(); } catch {} }).catch(() => {});
    }

    // 5. Stop any playing audio
    sourcesRef.current.forEach(s => { try { s.stop(); } catch {} });
    sourcesRef.current.clear();
    nextStartTimeRef.current = 0;

    setIsActive(false);
    setIsTalking(false);
    setIsEnding(false);
    setIsMuted(false);
    setStoreActive(false);
    setConnecting(false);
    setLiveUserText('');
    setLiveLuminaText('');
    userBufRef.current = '';
    luminaBufRef.current = '';

    // Allow a fresh session to be started again
    window.setTimeout(() => { teardownInProgressRef.current = false; }, 100);
  };

  // Register end handler for navigation guard
  useEffect(() => {
    registerEndHandler(stopSessionImmediate);
    return () => registerEndHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerEndHandler]);

  // Warn on tab close while active
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isActive) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isActive]);

  // Hero / connect screen
  if (!isActive && !connecting) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 animate-in fade-in duration-500">
        <div className="relative mb-8">
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-indigo-300 to-purple-400 blur-3xl opacity-40 aura-breathing" />
          <div className="relative w-40 h-40 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-2xl shadow-indigo-300/50">
            <i className="fas fa-sun text-white text-6xl" />
          </div>
        </div>

        <h1 className="text-4xl md:text-5xl font-black text-slate-900 mb-3 tracking-tight">Lumina</h1>
        <p className="text-slate-600 text-center max-w-md mb-2 text-lg leading-relaxed">
          Your voice companion.
        </p>
        <p className="text-slate-500 text-center max-w-md mb-10 leading-relaxed">
          English, Hindi, ya Hinglish — jo bhi tumhe comfortable lage. Lumina sunti hai, samajhti hai, and tumhari vibe match karti hai.
        </p>

        <button
          onClick={startSession}
          className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-10 py-5 rounded-2xl font-bold text-lg shadow-xl shadow-indigo-300/40 hover:shadow-2xl hover:scale-[1.03] active:scale-95 transition-all flex items-center gap-3"
        >
          <i className="fas fa-microphone text-xl" />
          Connect with Lumina
        </button>
        <p className="text-xs text-slate-400 mt-5 uppercase tracking-[0.3em] font-bold">Encrypted • Private</p>

        <NavigationGuardModal onEndAndNavigate={(path) => { stopSessionImmediate(); navigate(path); }} />
      </div>
    );
  }

  // Connecting screen
  if (connecting) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-4">
        <div className="relative mb-8">
          <div className="absolute inset-0 rounded-full bg-indigo-300 blur-2xl opacity-60 animate-pulse" />
          <div className="relative w-32 h-32 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-xl">
            <i className="fas fa-circle-notch animate-spin text-white text-4xl" />
          </div>
        </div>
        <p className="text-slate-700 font-semibold text-lg">Connecting to Lumina…</p>
      </div>
    );
  }

  // Active chat screen
  return (
    <div className="flex flex-col h-[calc(100vh-140px)] md:h-[calc(100vh-100px)] max-w-3xl mx-auto animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-slate-200">
        <div className="relative w-11 h-11">
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 aura-breathing" />
          <div className={`absolute inset-1 rounded-full bg-white flex items-center justify-center ${
            isTalking ? 'scale-95' : 'scale-100'
          } transition-transform`}>
            <i className="fas fa-sun text-base text-indigo-600" />
          </div>
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-slate-900">Lumina</h2>
          <p className="text-xs font-semibold text-indigo-600">
            {isMuted ? '🔇 You are muted' : isTalking ? '💬 Speaking…' : '👂 Listening…'}
          </p>
        </div>
        {isSharingScreen && (
          <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full bg-rose-100 text-rose-600">
            <i className="fas fa-circle text-[8px] animate-pulse mr-1" />Screen
          </span>
        )}
      </div>

      {/* Transcript */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar py-6 space-y-4 pr-2">
        {turns.length === 0 && !liveUserText && !liveLuminaText && (
          <div className="text-center text-slate-500 italic pt-10">
            Start talking — Lumina is listening…
          </div>
        )}

        {turns.map(turn => (
          <MessageBubble key={turn.id} role={turn.role} text={turn.text} />
        ))}

        {liveUserText && <MessageBubble role="user" text={liveUserText} live />}
        {liveLuminaText && <MessageBubble role="lumina" text={liveLuminaText} live />}
      </div>

      {/* Controls */}
      <div className="border-t border-slate-200 pt-4 pb-2">
        <div className="flex items-center justify-center gap-3">
          <ControlButton
            onClick={toggleMute}
            active={isMuted}
            icon={isMuted ? 'fa-microphone-slash' : 'fa-microphone'}
            label={isMuted ? 'Unmute' : 'Mute'}
            variant={isMuted ? 'danger' : 'neutral'}
          />
          <ControlButton
            onClick={isSharingScreen ? stopScreenShare : startScreenShare}
            active={isSharingScreen}
            icon="fa-desktop"
            label={isSharingScreen ? 'Stop' : 'Share'}
            variant={isSharingScreen ? 'danger' : 'neutral'}
          />
          <button
            onClick={initiateGoodbye}
            disabled={isEnding}
            className="flex items-center gap-2 px-6 py-4 rounded-2xl bg-slate-900 text-white font-semibold text-sm hover:bg-black active:scale-95 transition-all disabled:opacity-60 shadow-lg"
          >
            {isEnding ? (
              <><i className="fas fa-circle-notch animate-spin" /> Ending…</>
            ) : (
              <><i className="fas fa-phone-slash" /> End</>
            )}
          </button>
        </div>
      </div>

      <NavigationGuardModal onEndAndNavigate={(path) => {
        stopSessionImmediate();
        navigate(path);
      }} />
    </div>
  );
};

const MessageBubble: React.FC<{ role: 'user' | 'lumina'; text: string; live?: boolean }> = ({ role, text, live }) => {
  const isUser = role === 'user';
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${
        isUser ? 'bg-slate-700' : 'bg-gradient-to-br from-indigo-500 to-purple-600'
      }`}>
        {isUser ? <i className="fas fa-user text-xs" /> : <i className="fas fa-sun text-xs" />}
      </div>
      <div className={`max-w-[80%] px-4 py-3 rounded-2xl ${
        isUser
          ? 'bg-indigo-600 text-white rounded-tr-sm'
          : 'bg-white border border-slate-200 text-slate-900 rounded-tl-sm shadow-sm'
      } ${live ? 'opacity-80' : ''}`}>
        <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words font-medium">
          {text}
          {live && <span className="inline-block w-1 h-4 ml-1 bg-current animate-pulse align-middle rounded" />}
        </p>
      </div>
    </div>
  );
};

const ControlButton: React.FC<{
  onClick: () => void;
  active: boolean;
  icon: string;
  label: string;
  variant: 'neutral' | 'danger';
}> = ({ onClick, active, icon, label, variant }) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center justify-center w-16 h-16 rounded-2xl transition-all active:scale-95 ${
      active && variant === 'danger'
        ? 'bg-rose-100 text-rose-600'
        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
    }`}
    aria-label={label}
    title={label}
  >
    <i className={`fas ${icon} text-lg`} />
    <span className="text-[10px] font-bold mt-1 uppercase tracking-wider">{label}</span>
  </button>
);

const NavigationGuardModal: React.FC<{ onEndAndNavigate: (path: string) => void }> = ({ onEndAndNavigate }) => {
  const pending = useLuminaStore(s => s.pending);
  const resolve = useLuminaStore(s => s.resolvePending);

  if (!pending) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl animate-in slide-in-from-bottom-4 duration-300">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center mb-4">
          <i className="fas fa-pause text-indigo-600 text-xl" />
        </div>
        <h3 className="text-xl font-bold text-slate-900 mb-2">Leave Lumina?</h3>
        <p className="text-slate-600 mb-6 leading-relaxed">
          You're in a session. Do you want to continue talking, or end it now?
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => resolve('continue')}
            className="w-full py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-all"
          >
            Continue session
          </button>
          <button
            onClick={() => {
              const path = pending.path;
              resolve('end');
              onEndAndNavigate(path);
            }}
            className="w-full py-3 rounded-xl bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 transition-all"
          >
            End &amp; leave
          </button>
        </div>
      </div>
    </div>
  );
};

export default Chat;
