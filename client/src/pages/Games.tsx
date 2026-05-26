"use client"

import React, { useState, useEffect, useRef } from "react"
import { motion } from 'framer-motion'
import { api } from '../services/api'

const logActivity = (game: string, metadata?: any) => {
  // Tag activity with the specific game so the report's "What you like to do"
  // can rank which mindful activity the user actually returns to.
  const safe = (game || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  api.post('/activity', { activityType: `game_${safe}`, metadata: { game, ...metadata } }).catch(() => {});
};

type TaskType = "none" | "breathing" | "walk" | "detox" | "grounding" | "mixer"

const GROUNDING_STAGES = [
  { count: 5, label: "Things you can SEE", description: "Look around you and notice 5 things you hadn't noticed before.", icon: "fas fa-eye", color: "text-blue-500", bg: "bg-blue-100" },
  { count: 4, label: "Things you can FEEL", description: "Pay attention to your body and what you're touching.", icon: "fas fa-hand-sparkles", color: "text-emerald-500", bg: "bg-emerald-100" },
  { count: 3, label: "Things you can HEAR", description: "Listen carefully to the sounds in the background.", icon: "fas fa-ear-listen", color: "text-amber-500", bg: "bg-amber-100" },
  { count: 2, label: "Things you can SMELL", description: "Take a deep breath. What scents are around you?", icon: "fas fa-wind", color: "text-rose-500", bg: "bg-rose-100" },
  { count: 1, label: "Good thing about YOURSELF", description: "Acknowledge one positive trait or fact about yourself.", icon: "fas fa-heart", color: "text-purple-500", bg: "bg-purple-100" }
];

const SOUNDS = [
  { id: 'rain', label: 'Heavy Rain', url: 'https://actions.google.com/sounds/v1/weather/rain_heavy_loud.ogg', icon: 'fas fa-cloud-rain', color: 'text-blue-500', bg: 'bg-blue-100' },
  { id: 'fire', label: 'Campfire', url: 'https://actions.google.com/sounds/v1/foley/fire_crackling.ogg', icon: 'fas fa-fire', color: 'text-orange-500', bg: 'bg-orange-100' },
  { id: 'forest', label: 'Forest Birds', url: 'https://actions.google.com/sounds/v1/water/woodland_stream_with_birds.ogg', icon: 'fas fa-tree', color: 'text-emerald-500', bg: 'bg-emerald-100' },
  { id: 'ocean', label: 'Ocean Waves', url: 'https://actions.google.com/sounds/v1/water/ocean_waves_steady.ogg', icon: 'fas fa-water', color: 'text-cyan-500', bg: 'bg-cyan-100' }
];

const SoundscapeMixer = ({ onBack }: { onBack: () => void }) => {
  const [volumes, setVolumes] = useState<{ [key: string]: number }>({
    rain: 0, fire: 0, forest: 0, ocean: 0
  });
  
  // Use generic HTMLAudioElement map to store instance refs
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement }>({});

  useEffect(() => {
    // initialize audio elements globally but paused
    SOUNDS.forEach(sound => {
      const audio = new Audio(sound.url);
      audio.loop = true;
      audio.volume = 0;
      audioRefs.current[sound.id] = audio;
    });

    return () => {
      Object.keys(audioRefs.current).forEach(key => {
        const a = audioRefs.current[key];
        if (a) {
          a.pause();
          a.removeAttribute("src");
          a.load();
        }
      });
    };
  }, []);

  const handleVolumeChange = (id: string, val: number) => {
    setVolumes(prev => ({ ...prev, [id]: val }));
    const audio = audioRefs.current[id];
    if (audio) {
      if (audio.paused && val > 0) {
        audio.play().catch(e => console.log("Audio play blocked by browser", e));
      }
      audio.volume = val / 100;
      if (val === 0) audio.pause();
    }
  };

  return (
    <div className="relative min-h-[80vh] w-full flex flex-col items-center justify-center bg-slate-900 rounded-3xl space-y-10 animate-in fade-in zoom-in-95 duration-700 p-8 overflow-hidden shadow-2xl">
      
      {/* Background Ambience Layer based on active sounds */}
      <div className="absolute inset-0 opacity-20 pointer-events-none transition-colors duration-1000 bg-center bg-cover mix-blend-overlay"></div>

      <button 
        onClick={onBack}
        className="absolute top-8 left-8 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white shadow-sm backdrop-blur-md flex items-center justify-center transition-all duration-300 z-50 cursor-pointer border border-white/10"
      >
        <i className="fas fa-arrow-left"></i>
      </button>
      
      <div className="z-10 text-center space-y-2 mt-8">
        <h2 className="text-4xl font-black text-white tracking-tight">
          Soundscape
        </h2>
        <p className="text-slate-400 font-medium tracking-wide">Mix continuous audio streams for ultimate focus.</p>
      </div>

      <div className="z-10 w-full max-w-xl space-y-6 bg-white/5 backdrop-blur-3xl border border-white/10 p-8 rounded-[2rem] shadow-black/50 shadow-2xl">
        {SOUNDS.map((sound) => {
          const v = volumes[sound.id] || 0;
          return (
            <div key={sound.id} className="flex items-center gap-6 group p-2 hover:bg-white/5 rounded-2xl transition-colors">
              <div className={`w-14 h-14 rounded-2xl shadow-inner flex items-center justify-center flex-shrink-0 transition-all duration-500 ${v > 0 ? sound.bg + ' scale-110 shadow-lg' : 'bg-slate-800'}`}>
                 <i className={`${sound.icon} text-2xl transition-all duration-500 ${v > 0 ? sound.color : 'text-slate-600'}`}></i>
              </div>
              <div className="flex-1 space-y-3">
                <div className="flex justify-between items-center text-sm font-bold tracking-wide">
                  <span className={`transition-colors duration-500 ${v > 0 ? 'text-white' : 'text-slate-500'}`}>{sound.label}</span>
                  <span className={`transition-colors duration-500 ${v > 0 ? sound.color : 'text-slate-600'}`}>{v}%</span>
                </div>
                <input 
                  type="range" 
                  min="0" max="100" 
                  value={v}
                  onChange={(e) => handleVolumeChange(sound.id, parseInt(e.target.value))}
                  className="w-full h-2 rounded-lg appearance-none bg-slate-800 cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition-all"
                />
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
};

export default function MindfulFlow() {
  const [activeTask, setActiveTask] = useState<TaskType>("none")
  const [greeting, setGreeting] = useState("Welcome to your sanctuary.")

  // ===== Dynamic Greeting =====
  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting("Good morning. Start your day with intention.");
    else if (hour < 17) setGreeting("Good afternoon. Take a moment to center yourself.");
    else if (hour < 21) setGreeting("Good evening. Time to unwind and release the day.");
    else setGreeting("Peaceful night. Prepare your mind for rest.");
  }, []);

  // ===== Timer States (Walk + Detox) =====
  const [timeLeft, setTimeLeft] = useState(0)
  const [isRunning, setIsRunning] = useState(false)

  // ===== Positive Quotes =====
  const [quoteIndex, setQuoteIndex] = useState(0)

  const positiveQuotes = [
    "You are stronger than you think 💪",
    "Every step counts 🌿",
    "Your mind is becoming calmer 🌊",
    "You are building discipline 🔥",
    "Small progress is still progress 🌱",
    "You are improving every minute ✨",
    "Peace begins with you 🧘",
    "You chose growth today 🌞"
  ]

  // ===== Breathing States =====
  const [phase, setPhase] = useState<"Inhale" | "Hold" | "Exhale">("Inhale")
  const [cycleCount, setCycleCount] = useState(0)

  // ===== Grounding States =====
  const [groundingStageIndex, setGroundingStageIndex] = useState(0)
  const [itemsFound, setItemsFound] = useState(0)

  // ================= TIMER LOGIC =================
  useEffect(() => {
    if (!isRunning) return
    if (timeLeft === 0) {
      // Log completion
      if (activeTask === 'walk') logActivity('walk', { duration_sec: 900 });
      if (activeTask === 'detox') logActivity('detox', { duration_sec: 300 });
      return
    }

    const timer = setTimeout(() => {
      setTimeLeft((prev) => prev - 1)
    }, 1000)

    return () => clearTimeout(timer)
  }, [timeLeft, isRunning])

  // ================= AUTO QUOTE CHANGE =================
  useEffect(() => {
    if (activeTask === "none") return

    const interval = setInterval(() => {
      setQuoteIndex((prev) => (prev + 1) % positiveQuotes.length)
    }, 10000)

    return () => clearInterval(interval)
  }, [activeTask])

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s < 10 ? "0" : ""}${s}`
  }

  // ================= BREATHING LOGIC =================
  useEffect(() => {
    if (activeTask !== "breathing") return

    const duration = phase === "Exhale" ? 6000 : 4000

    const timer = setTimeout(() => {
      if (phase === "Inhale") setPhase("Hold")
      else if (phase === "Hold") setPhase("Exhale")
      else {
        setPhase("Inhale")
        setCycleCount((prev) => prev + 1)
      }
    }, duration)

    return () => clearTimeout(timer)
  }, [phase, activeTask])

  // ================= SHARED BACK BUTTON =================
  const BackButton = () => (
    <button 
      onClick={() => {
        setActiveTask("none");
        setIsRunning(false);
      }}
      className="absolute top-8 left-8 w-12 h-12 rounded-full bg-white/50 hover:bg-white text-slate-500 hover:text-slate-800 shadow-sm hover:shadow-md backdrop-blur-md flex items-center justify-center transition-all duration-300 z-50 cursor-pointer"
    >
      <i className="fas fa-arrow-left"></i>
    </button>
  );

  // ================= MAIN CARD VIEW =================
  if (activeTask === "none") {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="min-h-screen bg-transparent"
      >
        <header className="mb-8">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight"
          >
            Mindful Flow
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-slate-500 mt-1 font-medium italic text-sm"
          >
            {greeting}
          </motion.p>
        </header>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          
          {/* Soundscape Mixer */}
          <div className="bg-white rounded-[2rem] shadow-lg hover:shadow-2xl hover:shadow-cyan-100 hover:-translate-y-2 p-6 space-y-6 transition-all duration-500 border border-slate-100 group lg:col-span-2">
            <div className="rounded-2xl w-full h-48 bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center relative overflow-hidden group-hover:scale-[1.01] transition-transform duration-500">
                <i className="fas fa-headphones text-cyan-400/20 text-9xl absolute -bottom-8 -right-8 transition-transform group-hover:scale-110 group-hover:rotate-12 duration-700"></i>
                <i className="fas fa-sliders text-cyan-400 text-6xl z-10 drop-shadow-lg"></i>
            </div>
            <div>
              <h3 className="text-2xl font-bold text-slate-800">Soundscape Mixer</h3>
              <p className="text-slate-500 mt-2 text-sm leading-relaxed">
                Mix continuous ambient audio streams to create your perfect focus or relaxation zone.
              </p>
            </div>
            <button
              onClick={() => setActiveTask("mixer")}
              className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold hover:bg-cyan-600 transition-colors duration-300 shadow-lg"
            >
              Open Mixer
            </button>
          </div>

          {/* 5-4-3-2-1 Grounding */}
          <div className="bg-white rounded-[2rem] shadow-lg hover:shadow-2xl hover:shadow-indigo-100 hover:-translate-y-2 p-6 space-y-6 transition-all duration-500 border border-slate-100 group">
            <div className="rounded-2xl w-full h-48 bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center relative overflow-hidden group-hover:scale-[1.02] transition-transform duration-500">
                <i className="fas fa-hand-holding-heart text-indigo-400/50 text-8xl absolute -bottom-4 -right-4 transition-transform group-hover:rotate-12 duration-700"></i>
                <i className="fas fa-spa text-indigo-600 text-5xl z-10 drop-shadow-md"></i>
            </div>
            <div>
              <h3 className="text-2xl font-bold text-slate-800">Grounding</h3>
              <p className="text-slate-500 mt-2 text-sm leading-relaxed">
                Interactive sensory hunt to bring your focus back to the present.
              </p>
            </div>
            <button
              onClick={() => {
                setActiveTask("grounding")
                setGroundingStageIndex(0)
                setItemsFound(0)
              }}
              className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold hover:bg-indigo-600 transition-colors duration-300"
            >
              Start Practice
            </button>
          </div>

          {/* Harmony Breath */}
          <div className="bg-white rounded-[2rem] shadow-lg hover:shadow-2xl hover:shadow-emerald-100 hover:-translate-y-2 p-6 space-y-6 transition-all duration-500 border border-slate-100 group">
            <div className="rounded-2xl w-full h-48 bg-gradient-to-br from-emerald-50 to-teal-100 flex items-center justify-center relative overflow-hidden group-hover:scale-[1.02] transition-transform duration-500">
                <i className="fas fa-wind text-emerald-400/30 text-8xl absolute -bottom-4 -right-4 transition-transform group-hover:translate-x-4 duration-700"></i>
                <i className="fas fa-lungs text-emerald-600 text-5xl z-10 drop-shadow-md"></i>
            </div>
            <div>
              <h3 className="text-2xl font-bold text-slate-800">Breathwork</h3>
              <p className="text-slate-500 mt-2 text-sm leading-relaxed">
                Guided 4-4-6 breathing exercise to calm your nervous system.
              </p>
            </div>
            <button
              onClick={() => {
                setActiveTask("breathing")
                setCycleCount(0)
                setPhase("Inhale")
              }}
              className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold hover:bg-emerald-600 transition-colors duration-300"
            >
              Start Breathing
            </button>
          </div>

          {/* Walk */}
          <div className="bg-white rounded-[2rem] shadow-lg hover:shadow-2xl hover:shadow-amber-100 hover:-translate-y-2 p-6 space-y-6 transition-all duration-500 border border-slate-100 group">
            <div className="rounded-2xl w-full h-48 bg-gradient-to-br from-amber-50 to-orange-100 flex items-center justify-center relative overflow-hidden group-hover:scale-[1.02] transition-transform duration-500">
                <i className="fas fa-shoe-prints text-amber-400/30 text-8xl absolute -bottom-4 -right-4 transition-transform group-hover:-translate-x-4 duration-700"></i>
                <i className="fas fa-person-walking text-amber-600 text-5xl z-10 drop-shadow-md"></i>
            </div>
            <div>
              <h3 className="text-2xl font-bold text-slate-800">Mindful Walk</h3>
              <p className="text-slate-500 mt-2 text-sm leading-relaxed">
                Refresh your mind with a guided 15-minute walking break.
              </p>
            </div>
            <button
              onClick={() => {
                setActiveTask("walk")
                setTimeLeft(900)
                setIsRunning(true)
              }}
              className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold hover:bg-amber-600 transition-colors duration-300"
            >
              Start Walk
            </button>
          </div>

          {/* Detox */}
          <div className="bg-white rounded-[2rem] shadow-lg hover:shadow-2xl hover:shadow-rose-100 hover:-translate-y-2 p-6 space-y-6 transition-all duration-500 border border-slate-100 group">
            <div className="rounded-2xl w-full h-48 bg-gradient-to-br from-rose-50 to-pink-100 flex items-center justify-center relative overflow-hidden group-hover:scale-[1.02] transition-transform duration-500">
                <i className="fas fa-mobile-screen text-rose-400/30 text-8xl absolute -bottom-4 -right-4 transition-transform group-hover:translate-y-4 duration-700"></i>
                <i className="fas fa-power-off text-rose-600 text-5xl z-10 drop-shadow-md"></i>
            </div>
            <div>
              <h3 className="text-2xl font-bold text-slate-800">Digital Detox</h3>
              <p className="text-slate-500 mt-2 text-sm leading-relaxed">
                Disconnect totally. Take a 5-minute break away from screens.
              </p>
            </div>
            <button
              onClick={() => {
                setActiveTask("detox")
                setTimeLeft(300)
                setIsRunning(true)
              }}
              className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold hover:bg-rose-600 transition-colors duration-300"
            >
              Start Detox
            </button>
          </div>

        </div>
      </motion.div>
    )
  }

  // ================= SOUNDSCAPE MIXER SCREEN =================
  if (activeTask === "mixer") {
    return <SoundscapeMixer onBack={() => setActiveTask("none")} />;
  }

  // ================= BREATHING SCREEN =================
  if (activeTask === "breathing") {
    return (
      <div className="relative min-h-[80vh] w-full flex flex-col items-center justify-center bg-emerald-50/50 rounded-3xl space-y-10 animate-in fade-in zoom-in-95 duration-700">
        <BackButton />
        
        <h2 className="text-3xl font-bold text-emerald-800 tracking-tight">
          Harmony Breath
        </h2>

        <p className="text-emerald-600/80 font-medium text-xl uppercase tracking-widest">{phase}</p>

        <div className="relative w-80 h-80 flex items-center justify-center">
          <div className="absolute w-full h-full bg-emerald-200 rounded-full opacity-30 animate-pulse"></div>

          <div
            className={`
              bg-gradient-to-br from-emerald-400 to-teal-500 text-white rounded-full flex items-center justify-center shadow-2xl shadow-emerald-200
              text-3xl font-bold transition-all ease-in-out
              ${phase === "Inhale" ? "w-72 h-72 duration-[4000ms]" : ""}
              ${phase === "Hold" ? "w-72 h-72 duration-[4000ms]" : ""}
              ${phase === "Exhale" ? "w-48 h-48 duration-[6000ms]" : ""}
            `}
          >
            {phase}
          </div>
        </div>

        <p className="text-emerald-600/60 font-medium">
          Cycles completed: {cycleCount}
        </p>
      </div>
    )
  }

  // ================= GROUNDING SCREEN =================
  if (activeTask === "grounding") {
    const isComplete = groundingStageIndex >= GROUNDING_STAGES.length;
    const currentStage = isComplete ? null : GROUNDING_STAGES[groundingStageIndex];
    
    return (
      <div className="relative min-h-[80vh] w-full flex flex-col items-center justify-center bg-indigo-50/50 rounded-3xl space-y-10 animate-in fade-in zoom-in-95 duration-700">
        <BackButton />
        
        <h2 className="text-3xl font-bold text-indigo-800 tracking-tight">
          5-4-3-2-1 Grounding
        </h2>

        {!isComplete ? (
          <>
            <p className="text-slate-600 text-xl font-medium">
              Find <span className="font-bold text-indigo-600">{currentStage!.count}</span> {currentStage!.label}
            </p>
            
            <p className="text-slate-500 max-w-sm text-center">
              {currentStage!.description}
            </p>

            <div className="relative w-80 h-80 flex items-center justify-center">
              <div className="absolute w-full h-full bg-indigo-200 rounded-full opacity-30 animate-pulse"></div>
              
              <div className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-full flex flex-col items-center justify-center w-72 h-72 space-y-4 shadow-2xl shadow-indigo-200 transition-all duration-500">
                <i className={`${currentStage!.icon} text-5xl mb-2`}></i>
                <span className="text-5xl font-black">{itemsFound} <span className="text-indigo-200 text-3xl">/ {currentStage!.count}</span></span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={() => {
                  if (itemsFound + 1 >= currentStage!.count) {
                    const nextIdx = groundingStageIndex + 1;
                    setGroundingStageIndex(nextIdx);
                    setItemsFound(0);
                    if (nextIdx >= GROUNDING_STAGES.length) logActivity('grounding');
                  } else {
                    setItemsFound(prev => prev + 1);
                  }
                }}
                className="bg-slate-900 hover:bg-black text-white px-10 py-4 rounded-2xl font-bold text-lg shadow-xl transition-all hover:scale-105 active:scale-95"
              >
                {itemsFound + 1 >= currentStage!.count ? "Move to Next Stage" : "I Found One"}
              </button>
            </div>
          </>
        ) : (
          <div className="text-center space-y-6 max-w-md animate-in slide-in-from-bottom-4 duration-700">
            <div className="w-24 h-24 bg-green-100 text-green-500 rounded-full flex items-center justify-center text-4xl mx-auto shadow-inner">
              <i className="fas fa-check"></i>
            </div>
            <h3 className="text-3xl font-bold text-slate-800">You are safe.</h3>
            <p className="text-slate-500 leading-relaxed text-lg">
              You've successfully grounded yourself in the present moment. Take a deep breath. 
            </p>
          </div>
        )}
      </div>
    );
  }

  // ================= PREMIUM WALK & DETOX =================
  const totalTime = activeTask === "walk" ? 900 : 300
  const progress = ((totalTime - timeLeft) / totalTime) * 100
  const isWalk = activeTask === "walk";

  return (
    <div className={`relative min-h-[80vh] w-full flex flex-col items-center justify-center rounded-3xl space-y-10 animate-in fade-in zoom-in-95 duration-700
      ${isWalk ? 'bg-amber-50/50' : 'bg-rose-50/50'}
    `}>
      <BackButton />
      
      <h2 className={`text-3xl font-bold tracking-tight ${isWalk ? 'text-amber-800' : 'text-rose-800'}`}>
        {isWalk ? "Mindful Walk" : "Digital Detox"}
      </h2>

      <div className="relative w-80 h-80 flex items-center justify-center">

        <div
          className="absolute inset-0 rounded-full transition-all duration-1000 opacity-20"
          style={{
            background: `conic-gradient(${isWalk ? '#d97706' : '#e11d48'} ${progress}%, transparent ${progress}%)`
          }}
        />

        <div className={`absolute w-72 h-72 bg-white rounded-full flex flex-col items-center justify-center shadow-2xl transition-all duration-500 ${!isRunning && timeLeft !== 0 && timeLeft !== totalTime ? 'scale-95 opacity-80' : 'scale-100'}`}>

          <div className={`text-6xl font-black mb-2 ${isWalk ? 'text-amber-600' : 'text-rose-600'}`}>
            {formatTime(timeLeft)}
          </div>

          <p className="text-slate-500 mt-2 text-center px-8 text-sm font-medium leading-relaxed italic h-10 flex items-center justify-center">
            "{positiveQuotes[quoteIndex]}"
          </p>

        </div>
      </div>

      {timeLeft === 0 ? (
        <div className="text-green-600 text-2xl font-bold animate-pulse">
           Session Completed!
        </div>
      ) : (
        <button
          onClick={() => setIsRunning(!isRunning)}
          className={`px-10 py-4 rounded-2xl font-bold text-lg shadow-xl transition-all hover:scale-105 active:scale-95 text-white ${isWalk ? 'bg-amber-600 hover:bg-amber-700' : 'bg-rose-600 hover:bg-rose-700'}`}
        >
          {isRunning ? "Pause Session" : "Resume Session"}
        </button>
      )}

    </div>
  )
}