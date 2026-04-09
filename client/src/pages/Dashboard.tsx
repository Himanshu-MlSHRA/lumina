import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../services/api';
import { useAuthStore } from '../stores/authStore';

const MOOD_LEVELS = [
  { score: 1, label: 'Very Low', icon: String.fromCodePoint(0x1F62B) },
  { score: 3, label: 'Struggling', icon: String.fromCodePoint(0x1F614) },
  { score: 5, label: 'Okay', icon: String.fromCodePoint(0x1F610) },
  { score: 7, label: 'Good', icon: String.fromCodePoint(0x1F60A) },
  { score: 9, label: 'Radiant', icon: String.fromCodePoint(0x2728) },
];

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

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [moodHistory, setMoodHistory] = useState<MoodEntry[]>([]);
  const [activityMap, setActivityMap] = useState<number[]>(Array(28).fill(0));
  const [streak, setStreak] = useState(0);
  const [tasksCompleted, setTasksCompleted] = useState(0);
  const [showMoodPicker, setShowMoodPicker] = useState(false);

  useEffect(() => {
    loadTasks();
    loadMood();
    loadActivity();
  }, []);

  const loadTasks = async () => {
    try {
      const data = await api.get('/tasks');
      if (data.tasks.length === 0) {
        // Generate AI tasks if none exist for today
        try {
          const aiData = await api.post('/ai/tasks', { mood: 'neutral' });
          if (aiData.tasks?.length > 0) {
            const batch = await api.post('/tasks/batch', { tasks: aiData.tasks });
            setTasks(batch.tasks || []);
            return;
          }
        } catch { /* fallback to empty */ }
      }
      setTasks(data.tasks);
      setTasksCompleted(data.tasks.filter((t: DailyTask) => t.completed).length);
    } catch {
      // Fallback tasks if server/AI unavailable
      setTasks([
        { id: '1', title: 'Nature Walk', description: 'Take a 15-minute walk outside.', completed: false, type: 'movement' },
        { id: '2', title: 'Deep Breathing', description: 'Practice 3 sets of box breathing.', completed: false, type: 'mindfulness' },
        { id: '3', title: 'Digital Detox', description: 'Put your phone away for 30 minutes.', completed: false, type: 'mindfulness' },
      ]);
    }
  };

  const loadMood = async () => {
    try {
      const data = await api.get('/mood?days=7');
      const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
      const entries = data.entries.map((e: any) => ({
        date: days[new Date(e.createdAt).getDay()],
        score: e.score,
        label: e.label,
      }));
      setMoodHistory(entries.length > 0 ? entries : [
        { date: 'M', score: 5, label: 'Okay' },
        { date: 'T', score: 6, label: 'Stable' },
        { date: 'W', score: 5, label: 'Stable' },
        { date: 'T', score: 7, label: 'Good' },
        { date: 'F', score: 7, label: 'Good' },
      ]);
    } catch {
      setMoodHistory([
        { date: 'M', score: 5, label: 'Okay' },
        { date: 'T', score: 6, label: 'Stable' },
        { date: 'W', score: 7, label: 'Good' },
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
      // Calculate streak
      let s = 0;
      for (let i = 27; i >= 0; i--) {
        if (map[i] > 0) s++;
        else break;
      }
      setStreak(s);
    } catch {
      setActivityMap(Array.from({ length: 28 }, () => Math.floor(Math.random() * 5)));
    }
  };

  const toggleTask = async (id: string, completed: boolean) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, completed: !completed } : t));
    try {
      await api.put(`/tasks/${id}`, { completed: !completed });
      if (!completed) {
        await api.post('/activity', { activityType: 'task_complete', metadata: { taskId: id } });
      }
    } catch { /* revert on error handled by next load */ }
  };

  const logMood = async (score: number, label: string) => {
    try {
      await api.post('/mood', { score, label });
      await api.post('/activity', { activityType: 'mood_log', metadata: { score } });
      setShowMoodPicker(false);
      loadMood();
    } catch (e) { console.error(e); }
  };

  const getIntensityColor = (intensity: number) => {
    const levels = ['bg-slate-50', 'bg-indigo-100', 'bg-indigo-300', 'bg-indigo-500', 'bg-indigo-700'];
    return levels[intensity] || levels[0];
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      {/* Header */}
      <header className="space-y-2">
        <h1 className="text-4xl font-bold text-slate-900 tracking-tight">
          Welcome back{user ? `, ${user.displayName.split(' ')[0]}` : ''}.
        </h1>
        <p className="text-lg text-slate-500">How is your heart feeling today?</p>
      </header>

      {/* Mood Logger */}
      {!showMoodPicker ? (
        <button
          onClick={() => setShowMoodPicker(true)}
          className="w-full bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-3xl p-6 flex items-center justify-between hover:shadow-lg hover:shadow-indigo-50 transition-all group"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-200 group-hover:scale-110 transition-transform">
              <i className="fas fa-face-smile text-xl"></i>
            </div>
            <div className="text-left">
              <p className="font-bold text-slate-800">Log your mood</p>
              <p className="text-sm text-slate-500">Track how you're feeling right now</p>
            </div>
          </div>
          <i className="fas fa-chevron-right text-indigo-300 group-hover:translate-x-1 transition-transform"></i>
        </button>
      ) : (
        <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-xl shadow-slate-100 space-y-6">
          <h3 className="font-bold text-slate-800">How are you feeling?</h3>
          <div className="flex justify-around">
            {MOOD_LEVELS.map(m => (
              <button
                key={m.score}
                onClick={() => logMood(m.score, m.label)}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl hover:bg-indigo-50 transition-all hover:scale-110 active:scale-95"
              >
                <span className="text-3xl">{m.icon}</span>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{m.label}</span>
              </button>
            ))}
          </div>
          <button onClick={() => setShowMoodPicker(false)} className="text-sm text-slate-400 hover:text-slate-600 font-medium">Cancel</button>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Activity Pulse */}
        <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm hover:shadow-lg transition-shadow md:col-span-2">
          <div className="flex items-center justify-between mb-8">
            <h2 className="font-bold text-slate-800 uppercase tracking-widest text-xs">Activity Pulse</h2>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold">
              <span>Low</span>
              <div className="flex gap-1">
                {[0, 1, 2, 3, 4].map(i => <div key={i} className={`w-2.5 h-2.5 rounded-sm ${getIntensityColor(i)}`}></div>)}
              </div>
              <span>High</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 md:gap-3">
            {activityMap.map((intensity, i) => (
              <div key={i} className={`energy-block ${getIntensityColor(intensity)}`}></div>
            ))}
          </div>
          <div className="mt-8 pt-8 border-t border-slate-50 flex justify-between items-center">
            <div>
              <p className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">{streak}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Days</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-slate-800">{tasksCompleted}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tasks Done</p>
            </div>
          </div>
        </div>

        {/* Voice CTA */}
        <div
          className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl p-8 flex flex-col justify-center items-center text-center space-y-6 shadow-xl shadow-indigo-200 group cursor-pointer hover:scale-[1.02] transition-transform"
          onClick={() => navigate('/chat')}
        >
          <div className="w-20 h-20 bg-white/20 backdrop-blur-xl rounded-full flex items-center justify-center text-white text-3xl group-hover:scale-110 transition-transform shadow-inner">
            <i className="fas fa-microphone-lines"></i>
          </div>
          <div>
            <h3 className="font-bold text-white text-lg">Voice Session</h3>
            <p className="text-sm text-indigo-100 mt-2 leading-relaxed">Talk to Lumina</p>
          </div>
          <button className="w-full bg-white text-indigo-600 py-4 rounded-2xl font-bold shadow-lg hover:bg-indigo-50 transition-colors">
            Start Talking
          </button>
        </div>
      </div>

      {/* Tasks + Chart */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <section className="space-y-6">
          <h2 className="font-bold text-slate-800 uppercase tracking-widest text-xs">Daily Focus</h2>
          <div className="space-y-4">
            {tasks.map(task => (
              <div
                key={task.id}
                onClick={() => toggleTask(task.id, task.completed)}
                className={`bg-white rounded-3xl p-6 border border-slate-100 transition-all cursor-pointer flex items-center gap-6 group ${
                  task.completed
                    ? 'opacity-40 grayscale scale-[0.98]'
                    : 'hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-50'
                }`}
              >
                <div className={`w-12 h-12 rounded-2xl flex-shrink-0 flex items-center justify-center transition-colors ${
                  task.completed
                    ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md'
                    : 'bg-slate-50 text-slate-400 group-hover:bg-indigo-50'
                }`}>
                  <i className={`fas ${task.completed ? 'fa-check' : 'fa-circle-dot'}`}></i>
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">{task.title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{task.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-6">
          <h2 className="font-bold text-slate-800 uppercase tracking-widest text-xs">Emotional Trend</h2>
          <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={moodHistory}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 'bold' }} />
                <YAxis hide domain={[0, 10]} />
                <Tooltip
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 40px -10px rgba(0,0,0,0.1)' }}
                  itemStyle={{ fontWeight: '600', color: '#6366f1' }}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="url(#gradient)"
                  strokeWidth={4}
                  dot={{ r: 6, fill: '#6366f1', strokeWidth: 3, stroke: '#fff' }}
                  activeDot={{ r: 8 }}
                />
                <defs>
                  <linearGradient id="gradient" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#a855f7" />
                  </linearGradient>
                </defs>
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Dashboard;
