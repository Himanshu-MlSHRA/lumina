import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { api } from '../services/api';
import { useAuthStore } from '../stores/authStore';

const MOOD_LEVELS = [
  { score: 1, label: 'Very Low', icon: '\u{1F62B}', color: 'from-red-400 to-rose-500' },
  { score: 3, label: 'Struggling', icon: '\u{1F614}', color: 'from-orange-400 to-amber-500' },
  { score: 5, label: 'Okay', icon: '\u{1F610}', color: 'from-yellow-400 to-amber-400' },
  { score: 7, label: 'Good', icon: '\u{1F60A}', color: 'from-emerald-400 to-green-500' },
  { score: 9, label: 'Radiant', icon: '\u{2728}', color: 'from-indigo-400 to-purple-500' },
];

const TASK_ICONS: Record<string, string> = {
  movement: 'fa-person-walking',
  mindfulness: 'fa-brain',
  social: 'fa-hand-holding-heart',
  creative: 'fa-palette',
};

interface DailyTask {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  type: string;
}

interface MoodEntry {
  date: string;
  score: number;
  label: string;
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } },
};

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [moodHistory, setMoodHistory] = useState<MoodEntry[]>([]);
  const [activityMap, setActivityMap] = useState<number[]>(Array(28).fill(0));
  const [streak, setStreak] = useState(0);
  const [tasksCompleted, setTasksCompleted] = useState(0);
  const [showMoodPicker, setShowMoodPicker] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [personality, setPersonality] = useState<{
    type: string;
    profile: { name: string; tagline: string; color: string } | null;
    streak: number;
    totalAnswers: number;
  } | null>(null);

  useEffect(() => {
    loadTasks();
    loadMood();
    loadActivity();
    loadPersonality();
  }, []);

  const loadPersonality = async () => {
    try {
      const data = await api.get('/personality/result');
      if (data?.totalAnswers > 0) {
        setPersonality({
          type: data.result.type,
          profile: data.profile,
          streak: data.streak || 0,
          totalAnswers: data.totalAnswers,
        });
      }
    } catch { /* user hasn't started yet */ }
  };

  useEffect(() => {
    setTasksCompleted(tasks.filter(t => t.completed).length);
  }, [tasks]);

  const loadTasks = async () => {
    setLoadingTasks(true);
    try {
      const data = await api.get('/tasks');
      if (data.tasks.length === 0) {
        try {
          const aiData = await api.post('/ai/tasks', { mood: 'neutral' });
          if (aiData.tasks?.length > 0) {
            const batch = await api.post('/tasks/batch', { tasks: aiData.tasks });
            setTasks(batch.tasks || []);
            return;
          }
        } catch { /* fallback below */ }
        // Fallback tasks
        setTasks([
          { id: 'f1', title: 'Nature Walk', description: 'Take a 15-minute walk outside and notice 5 things you can see.', completed: false, type: 'movement' },
          { id: 'f2', title: 'Deep Breathing', description: 'Practice 3 sets of 4-4-6 box breathing.', completed: false, type: 'mindfulness' },
          { id: 'f3', title: 'Digital Detox', description: 'Put your phone away for 30 minutes.', completed: false, type: 'mindfulness' },
        ]);
      } else {
        setTasks(data.tasks);
      }
    } catch {
      setTasks([
        { id: 'f1', title: 'Nature Walk', description: 'Take a 15-minute walk outside.', completed: false, type: 'movement' },
        { id: 'f2', title: 'Deep Breathing', description: 'Practice 3 sets of box breathing.', completed: false, type: 'mindfulness' },
        { id: 'f3', title: 'Digital Detox', description: 'Put your phone away for 30 minutes.', completed: false, type: 'mindfulness' },
      ]);
    } finally {
      setLoadingTasks(false);
    }
  };

  const loadMood = async () => {
    try {
      const data = await api.get('/mood?days=7');
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const entries = data.entries.map((e: any) => ({
        date: days[new Date(e.createdAt).getDay()],
        score: e.score,
        label: e.label,
      }));
      setMoodHistory(entries.length > 0 ? entries : [
        { date: 'Mon', score: 5, label: 'Okay' },
        { date: 'Tue', score: 6, label: 'Stable' },
        { date: 'Wed', score: 5, label: 'Stable' },
        { date: 'Thu', score: 7, label: 'Good' },
        { date: 'Fri', score: 7, label: 'Good' },
      ]);
    } catch {
      setMoodHistory([
        { date: 'Mon', score: 5, label: 'Okay' },
        { date: 'Tue', score: 6, label: 'Stable' },
        { date: 'Wed', score: 7, label: 'Good' },
      ]);
    }
  };

  const loadActivity = async () => {
    try {
      const data = await api.get('/activity?days=28');
      const map = Array(28).fill(0);
      const now = Date.now();
      (data.logs || []).forEach((log: any) => {
        const daysAgo = Math.floor((now - new Date(log.createdAt).getTime()) / 86400000);
        if (daysAgo >= 0 && daysAgo < 28) {
          map[27 - daysAgo] = Math.min(4, map[27 - daysAgo] + 1);
        }
      });
      setActivityMap(map);
      let s = 0;
      for (let i = 27; i >= 0; i--) {
        if (map[i] > 0) s++;
        else break;
      }
      setStreak(s);
    } catch {
      setActivityMap(Array(28).fill(0));
    }
  };

  const toggleTask = async (id: string, completed: boolean) => {
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === id ? { ...t, completed: !completed } : t));
    try {
      await api.put(`/tasks/${id}`, { completed: !completed });
      if (!completed) {
        await api.post('/activity', { activityType: 'task_complete', metadata: { taskId: id } });
        loadActivity();
      }
    } catch {
      // Revert on error
      setTasks(prev => prev.map(t => t.id === id ? { ...t, completed } : t));
    }
  };

  const logMood = async (score: number, label: string) => {
    try {
      await api.post('/mood', { score, label });
      await api.post('/activity', { activityType: 'mood_log', metadata: { score } });
      setShowMoodPicker(false);
      loadMood();
      loadActivity();
    } catch (e) { console.error(e); }
  };

  const getIntensityColor = (intensity: number) => {
    const levels = ['bg-slate-100', 'bg-indigo-200', 'bg-indigo-300', 'bg-indigo-500', 'bg-indigo-700'];
    return levels[intensity] || levels[0];
  };

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const totalTasks = tasks.length;
  const completionPct = totalTasks > 0 ? Math.round((tasksCompleted / totalTasks) * 100) : 0;

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-8"
    >
      {/* Header */}
      <motion.header variants={item} className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-indigo-500">{greeting()}</p>
          <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight">
            {user ? `${user.displayName.split(' ')[0]}` : 'Welcome'} <span className="inline-block animate-float">&#x1F44B;</span>
          </h1>
          <p className="text-slate-500">How is your heart feeling today?</p>
        </div>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => navigate('/report')}
          className="relative overflow-hidden group flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-900 to-purple-900 text-white font-bold shadow-2xl shadow-indigo-300/40 hover:shadow-indigo-400/60 transition-all"
        >
          <div className="absolute inset-0 opacity-50 group-hover:opacity-80 transition-opacity">
            <div className="absolute -top-4 -left-4 w-20 h-20 rounded-full bg-pink-500/30 blur-2xl" />
            <div className="absolute -bottom-4 -right-4 w-20 h-20 rounded-full bg-indigo-500/40 blur-2xl" />
          </div>
          <div className="relative w-9 h-9 rounded-xl bg-white/15 backdrop-blur-xl flex items-center justify-center">
            <i className="fas fa-book-sparkles text-pink-200"></i>
          </div>
          <div className="relative text-left">
            <div className="text-[9px] font-bold text-pink-200 uppercase tracking-[0.2em]">Your story</div>
            <div className="text-sm">Progress Report</div>
          </div>
          <i className="relative fas fa-arrow-right text-pink-200 group-hover:translate-x-1 transition-transform"></i>
        </motion.button>
      </motion.header>

      {/* Mood Logger */}
      <motion.div variants={item}>
        <AnimatePresence mode="wait">
          {!showMoodPicker ? (
            <motion.button
              key="mood-cta"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              onClick={() => setShowMoodPicker(true)}
              className="w-full bg-gradient-to-r from-indigo-50/80 to-purple-50/80 backdrop-blur-sm border border-indigo-100/50 rounded-3xl p-5 flex items-center justify-between hover:shadow-lg hover:shadow-indigo-100/50 transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-200/50 group-hover:scale-110 group-hover:rotate-3 transition-transform">
                  <i className="fas fa-face-smile text-xl"></i>
                </div>
                <div className="text-left">
                  <p className="font-bold text-slate-800">Log your mood</p>
                  <p className="text-sm text-slate-500">Track how you're feeling right now</p>
                </div>
              </div>
              <i className="fas fa-chevron-right text-indigo-300 group-hover:translate-x-1 transition-transform"></i>
            </motion.button>
          ) : (
            <motion.div
              key="mood-picker"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-6 md:p-8 border border-slate-100 shadow-xl shadow-slate-100/50 space-y-6"
            >
              <h3 className="font-bold text-slate-800 text-lg">How are you feeling?</h3>
              <div className="flex justify-around flex-wrap gap-2">
                {MOOD_LEVELS.map((m, i) => (
                  <motion.button
                    key={m.score}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                    onClick={() => logMood(m.score, m.label)}
                    className="flex flex-col items-center gap-2 p-3 md:p-4 rounded-2xl hover:bg-indigo-50 transition-all hover:scale-110 active:scale-95"
                  >
                    <span className="text-3xl md:text-4xl">{m.icon}</span>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{m.label}</span>
                  </motion.button>
                ))}
              </div>
              <button onClick={() => setShowMoodPicker(false)} className="text-sm text-slate-400 hover:text-slate-600 font-medium">Cancel</button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Activity Pulse */}
        <motion.div variants={item} className="bg-white rounded-3xl p-6 md:p-8 border border-slate-100 shadow-sm hover:shadow-lg transition-shadow md:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-bold text-slate-800 uppercase tracking-widest text-[11px]">Activity Pulse</h2>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold">
              <span>Low</span>
              <div className="flex gap-0.5">
                {[0, 1, 2, 3, 4].map(i => <div key={i} className={`w-2.5 h-2.5 rounded-sm ${getIntensityColor(i)}`}></div>)}
              </div>
              <span>High</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 md:gap-2">
            {activityMap.map((intensity, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.015 }}
                className={`energy-block ${getIntensityColor(intensity)}`}
              />
            ))}
          </div>
          <div className="mt-6 pt-6 border-t border-slate-50 grid grid-cols-3 gap-4">
            <div>
              <p className="text-2xl md:text-3xl font-extrabold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">{streak}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Day Streak</p>
            </div>
            <div className="text-center">
              <p className="text-2xl md:text-3xl font-extrabold text-slate-800">{tasksCompleted}<span className="text-slate-300">/{totalTasks}</span></p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tasks Done</p>
            </div>
            <div className="text-right">
              <p className="text-2xl md:text-3xl font-extrabold text-emerald-500">{completionPct}%</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Complete</p>
            </div>
          </div>
        </motion.div>

        {/* Voice CTA */}
        <motion.div
          variants={item}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="bg-gradient-to-br from-indigo-500 via-purple-600 to-indigo-700 rounded-3xl p-6 md:p-8 flex flex-col justify-center items-center text-center space-y-5 shadow-xl shadow-indigo-200/50 cursor-pointer relative overflow-hidden"
          onClick={() => navigate('/chat')}
        >
          <div className="absolute inset-0 opacity-20">
            <div className="absolute top-4 right-4 w-32 h-32 rounded-full bg-white/20 blur-2xl" />
            <div className="absolute bottom-4 left-4 w-24 h-24 rounded-full bg-purple-300/30 blur-xl" />
          </div>
          <div className="relative">
            <div className="w-20 h-20 bg-white/20 backdrop-blur-xl rounded-full flex items-center justify-center text-white text-3xl shadow-inner animate-float">
              <i className="fas fa-microphone-lines"></i>
            </div>
          </div>
          <div className="relative">
            <h3 className="font-extrabold text-white text-lg">Voice Session</h3>
            <p className="text-sm text-indigo-100 mt-1">Talk to Lumina AI</p>
          </div>
          <button className="relative w-full bg-white text-indigo-600 py-3.5 rounded-2xl font-bold shadow-lg hover:bg-indigo-50 transition-colors text-sm">
            Start Talking
          </button>
        </motion.div>
      </div>

      {/* Know Yourself Tile */}
      <motion.div
        variants={item}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        onClick={() => navigate('/know-yourself')}
        className="relative overflow-hidden rounded-3xl p-6 md:p-8 cursor-pointer bg-gradient-to-br from-slate-900 via-indigo-900 to-purple-900 shadow-2xl shadow-indigo-300/40"
      >
        <div className="absolute inset-0 opacity-60">
          <div className="absolute -top-10 -left-10 w-60 h-60 rounded-full bg-indigo-500/40 blur-3xl" />
          <div className="absolute -bottom-10 -right-10 w-60 h-60 rounded-full bg-pink-500/30 blur-3xl" />
          <div className="absolute top-1/3 right-1/4 w-40 h-40 rounded-full bg-purple-400/30 blur-3xl" />
        </div>
        <div className="relative flex items-center justify-between gap-6 flex-wrap">
          <div className="flex-1 min-w-[200px] space-y-2">
            <div className="flex items-center gap-2">
              <i className="fas fa-compass text-pink-300"></i>
              <p className="text-[10px] font-bold text-pink-200 uppercase tracking-[0.25em]">Know Yourself</p>
            </div>
            <h3 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
              {personality ? `You're looking like ${personality.type}` : '10 questions. One mirror a day.'}
            </h3>
            <p className="text-indigo-200 text-sm max-w-lg">
              {personality?.profile
                ? `${personality.profile.name} — ${personality.profile.tagline}.`
                : 'Answer honestly, watch your personality take shape in real time.'}
            </p>
            {personality && (
              <div className="flex items-center gap-4 pt-2">
                <div className="text-center">
                  <div className="text-2xl font-black text-white">{personality.streak}</div>
                  <div className="text-[9px] font-bold text-pink-200 uppercase tracking-widest">Streak</div>
                </div>
                <div className="w-px h-8 bg-white/20" />
                <div className="text-center">
                  <div className="text-2xl font-black text-white">{personality.totalAnswers}</div>
                  <div className="text-[9px] font-bold text-pink-200 uppercase tracking-widest">Answered</div>
                </div>
              </div>
            )}
          </div>
          <div className="flex-shrink-0">
            {personality ? (
              <div className="w-24 h-24 md:w-28 md:h-28 rounded-3xl bg-white/15 backdrop-blur-xl border border-white/20 flex items-center justify-center shadow-2xl">
                <span className="text-white text-2xl md:text-3xl font-black tracking-tight">{personality.type}</span>
              </div>
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-white/15 backdrop-blur-xl flex items-center justify-center animate-float">
                <i className="fas fa-wand-magic-sparkles text-2xl text-pink-200"></i>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Tasks + Chart */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <motion.section variants={item} className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-800 uppercase tracking-widest text-[11px]">Daily Focus</h2>
            {totalTasks > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${completionPct}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                  />
                </div>
                <span className="text-[10px] font-bold text-slate-400">{completionPct}%</span>
              </div>
            )}
          </div>
          <div className="space-y-3">
            {loadingTasks ? (
              [1, 2, 3].map(i => (
                <div key={i} className="bg-white rounded-2xl p-5 border border-slate-100 animate-pulse">
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl bg-slate-100" />
                    <div className="flex-1 space-y-2">
                      <div className="w-32 h-4 bg-slate-100 rounded" />
                      <div className="w-48 h-3 bg-slate-50 rounded" />
                    </div>
                  </div>
                </div>
              ))
            ) : (
              tasks.map((task, i) => (
                <motion.div
                  key={task.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.08 }}
                  whileHover={{ scale: task.completed ? 1 : 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => toggleTask(task.id, task.completed)}
                  className={`bg-white rounded-2xl p-5 border transition-all cursor-pointer flex items-center gap-4 group ${
                    task.completed
                      ? 'border-emerald-100 bg-emerald-50/30'
                      : 'border-slate-100 hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-50/50'
                  }`}
                >
                  <div className={`w-11 h-11 rounded-xl flex-shrink-0 flex items-center justify-center transition-all ${
                    task.completed
                      ? 'bg-gradient-to-br from-emerald-400 to-green-500 text-white shadow-md shadow-emerald-200/50'
                      : 'bg-slate-50 text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-500'
                  }`}>
                    <i className={`fas ${task.completed ? 'fa-check' : (TASK_ICONS[task.type] || 'fa-circle-dot')}`}></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className={`font-bold text-sm ${task.completed ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{task.title}</h3>
                    <p className={`text-xs mt-0.5 ${task.completed ? 'text-slate-300' : 'text-slate-500'}`}>{task.description}</p>
                  </div>
                  {!task.completed && (
                    <div className="w-5 h-5 rounded-full border-2 border-slate-200 group-hover:border-indigo-400 transition-colors flex-shrink-0" />
                  )}
                </motion.div>
              ))
            )}
          </div>
        </motion.section>

        <motion.section variants={item} className="space-y-4">
          <h2 className="font-bold text-slate-800 uppercase tracking-widest text-[11px]">Emotional Trend</h2>
          <div className="bg-white rounded-3xl p-6 md:p-8 border border-slate-100 shadow-sm h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={moodHistory}>
                <defs>
                  <linearGradient id="moodGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#a855f7" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }} />
                <YAxis hide domain={[0, 10]} />
                <Tooltip
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 40px -10px rgba(0,0,0,0.08)', fontSize: '13px' }}
                  itemStyle={{ fontWeight: '600', color: '#6366f1' }}
                />
                <Area
                  type="monotone"
                  dataKey="score"
                  stroke="url(#lineGradient)"
                  strokeWidth={3}
                  fill="url(#moodGradient)"
                  dot={{ r: 5, fill: '#6366f1', strokeWidth: 3, stroke: '#fff' }}
                  activeDot={{ r: 7 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.section>
      </div>
    </motion.div>
  );
};

export default Dashboard;
