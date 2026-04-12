import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { api } from '../services/api';
import { useAuthStore } from '../stores/authStore';

interface Stats {
  periodDays: number;
  mood: {
    count: number;
    avg: number;
    min: number;
    max: number;
    slope: number;
    trend: 'rising' | 'falling' | 'steady';
    recentLabels: string[];
    firstScore: number | null;
    lastScore: number | null;
    weeklyAverages: { week: string; avg: number }[];
    lowestDay: { date: string; score: number; label: string } | null;
    highestDay: { date: string; score: number; label: string } | null;
  };
  tasks: {
    total: number;
    completed: number;
    completionRate: number;
    byType: Record<string, { total: number; completed: number }>;
    favoriteType: string | null;
  };
  activity: {
    totalEntries: number;
    activeDays: number;
    streak: number;
    byType: Record<string, number>;
  };
  personality: {
    type: string | null;
    profile: { name: string; tagline: string } | null;
    totalAnswers: number;
    axes: { axis: string; dominant: string; confidence: number }[];
    answeredAcrossDays: number;
  };
  conversations: { total: number };
}

interface Narrative {
  headline: string;
  snapshot: string;
  journey: string;
  shifts: string[];
  patterns: string[];
  wins: string[];
  lessons: string;
  reflections: string[];
  nextSteps: string[];
}

interface ReportPayload {
  stats: Stats;
  narrative: Narrative;
  generatedAt: string;
  cached: boolean;
}

const PERIOD_OPTIONS = [
  { days: 7, label: '1 week' },
  { days: 30, label: '1 month' },
  { days: 90, label: '3 months' },
];

const TREND_META = {
  rising: { icon: 'fa-arrow-trend-up', color: 'text-emerald-500', label: 'Rising' },
  falling: { icon: 'fa-arrow-trend-down', color: 'text-rose-500', label: 'Falling' },
  steady: { icon: 'fa-minus', color: 'text-slate-500', label: 'Steady' },
};

const Report: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [periodDays, setPeriodDays] = useState(30);
  const [payload, setPayload] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const loadingPhraseRef = useRef(0);
  const [loadingPhrase, setLoadingPhrase] = useState('Lumina is reading your story…');

  useEffect(() => {
    loadReport(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodDays]);

  useEffect(() => {
    if (!loading) return;
    const phrases = [
      'Lumina is reading your story…',
      'Counting the quiet days…',
      'Measuring the slope of your moods…',
      'Looking for patterns between the lines…',
      'Writing your chapter so far…',
    ];
    const interval = setInterval(() => {
      loadingPhraseRef.current = (loadingPhraseRef.current + 1) % phrases.length;
      setLoadingPhrase(phrases[loadingPhraseRef.current]);
    }, 2200);
    return () => clearInterval(interval);
  }, [loading]);

  const loadReport = async (force: boolean) => {
    if (force) setRegenerating(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await api.get(`/report?days=${periodDays}${force ? '&force=1' : ''}`);
      setPayload(data);
    } catch (err: any) {
      setError(err?.message || 'Could not load report');
    } finally {
      setLoading(false);
      setRegenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center relative overflow-hidden">
        <AuroraBg />
        <div className="relative z-10 flex flex-col items-center gap-8">
          <div className="relative w-32 h-32">
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 blur-3xl opacity-40 animate-pulse" />
            <div className="relative w-32 h-32 rounded-full bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-2xl shadow-indigo-300/50">
              <motion.i
                className="fas fa-book-sparkles text-white text-4xl"
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 3, repeat: Infinity }}
              />
            </div>
          </div>
          <AnimatePresence mode="wait">
            <motion.p
              key={loadingPhrase}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="text-slate-600 text-lg font-semibold italic"
            >
              {loadingPhrase}
            </motion.p>
          </AnimatePresence>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em]">
            This may take a few seconds
          </p>
        </div>
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <i className="fas fa-triangle-exclamation text-4xl text-rose-400"></i>
        <p className="text-slate-600 font-semibold">{error || 'No report available'}</p>
        <button
          onClick={() => loadReport(true)}
          className="px-6 py-3 rounded-xl bg-indigo-600 text-white font-bold"
        >
          Try again
        </button>
      </div>
    );
  }

  const { stats, narrative, generatedAt } = payload;
  const trendMeta = TREND_META[stats.mood.trend];

  return (
    <div className="relative space-y-10 pb-20">
      <AuroraBg />

      <div className="relative z-10 space-y-10">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start justify-between gap-4 flex-wrap"
        >
          <div className="min-w-0">
            <button
              onClick={() => navigate('/')}
              className="text-xs font-bold text-slate-400 hover:text-indigo-500 uppercase tracking-widest mb-2 flex items-center gap-2"
            >
              <i className="fas fa-arrow-left text-[10px]"></i>
              Dashboard
            </button>
            <p className="text-xs font-bold text-indigo-500 uppercase tracking-[0.25em]">Progress Report</p>
            <h1 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tight mt-1 leading-tight">
              {narrative.headline}
            </h1>
            <p className="text-slate-500 mt-2">
              For {user?.displayName || 'you'} · Generated {formatTime(generatedAt)}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex bg-white rounded-2xl border border-slate-200 p-1 shadow-sm">
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.days}
                  onClick={() => setPeriodDays(opt.days)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    periodDays === opt.days
                      ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => loadReport(true)}
              disabled={regenerating}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white border border-slate-200 hover:border-indigo-300 text-xs font-bold text-slate-700 hover:text-indigo-600 transition-all disabled:opacity-50"
            >
              <i className={`fas fa-arrows-rotate ${regenerating ? 'animate-spin' : ''}`}></i>
              {regenerating ? 'Regenerating…' : 'Regenerate'}
            </button>
          </div>
        </motion.header>

        {/* Stat strip */}
        <StatStrip stats={stats} trendMeta={trendMeta} />

        {/* Snapshot */}
        <Section icon="fa-eye" iconColor="from-indigo-500 to-purple-600" title="Snapshot" delay={0.1}>
          <p className="text-xl md:text-2xl text-slate-800 font-semibold leading-relaxed italic">
            "{narrative.snapshot}"
          </p>
        </Section>

        {/* Journey with sparkline */}
        <Section icon="fa-wave-square" iconColor="from-sky-500 to-cyan-500" title="The journey" delay={0.15}>
          <p className="text-base md:text-lg text-slate-700 leading-relaxed mb-6">{narrative.journey}</p>
          {stats.mood.weeklyAverages.length > 0 && (
            <div className="h-48 bg-slate-50/50 rounded-2xl p-4 border border-slate-100">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.mood.weeklyAverages}>
                  <defs>
                    <linearGradient id="reportMood" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <YAxis hide domain={[0, 10]} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 40px rgba(0,0,0,0.1)', fontSize: '12px' }} />
                  <Area type="monotone" dataKey="avg" stroke="#6366f1" strokeWidth={3} fill="url(#reportMood)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Section>

        {/* Shifts */}
        {narrative.shifts.length > 0 && (
          <Section icon="fa-bolt" iconColor="from-amber-500 to-orange-500" title="What shifted" delay={0.2}>
            <div className="space-y-3">
              {narrative.shifts.map((shift, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.25 + i * 0.08 }}
                  className="flex gap-4 p-4 bg-amber-50/40 rounded-2xl border border-amber-100"
                >
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-xs font-black">
                    {i + 1}
                  </div>
                  <p className="text-slate-700 leading-relaxed flex-1">{shift}</p>
                </motion.div>
              ))}
            </div>
          </Section>
        )}

        {/* Patterns */}
        <Section icon="fa-chart-line" iconColor="from-emerald-500 to-teal-500" title="Patterns Lumina noticed" delay={0.25}>
          <ul className="space-y-3">
            {narrative.patterns.map((p, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.05 }}
                className="flex items-start gap-3 text-slate-700"
              >
                <i className="fas fa-check-circle text-emerald-500 mt-1.5 text-sm"></i>
                <span className="leading-relaxed">{p}</span>
              </motion.li>
            ))}
          </ul>
        </Section>

        {/* Wins */}
        <Section icon="fa-trophy" iconColor="from-yellow-400 to-orange-500" title="Your wins" delay={0.3}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {narrative.wins.map((win, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.35 + i * 0.08 }}
                className="flex items-center gap-3 p-4 bg-gradient-to-br from-yellow-50 to-orange-50/50 rounded-2xl border border-yellow-100"
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center shadow-md">
                  <i className="fas fa-star text-white text-sm"></i>
                </div>
                <p className="text-sm font-semibold text-slate-700 leading-snug">{win}</p>
              </motion.div>
            ))}
          </div>
        </Section>

        {/* Lessons */}
        <Section icon="fa-lightbulb" iconColor="from-purple-500 to-pink-500" title="What the numbers say you learned" delay={0.35}>
          <p className="text-lg text-slate-700 leading-relaxed italic">"{narrative.lessons}"</p>
        </Section>

        {/* Reflections — the "if & but" questions */}
        <Section icon="fa-circle-question" iconColor="from-rose-500 to-pink-500" title="If & but questions" delay={0.4}>
          <p className="text-sm text-slate-500 mb-4">Questions to sit with. No right answers.</p>
          <div className="space-y-3">
            {narrative.reflections.map((r, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45 + i * 0.08 }}
                className="relative p-5 rounded-2xl bg-gradient-to-br from-rose-50/50 to-pink-50/30 border border-rose-100"
              >
                <div className="absolute -left-2 -top-2 w-7 h-7 rounded-full bg-gradient-to-br from-rose-500 to-pink-500 flex items-center justify-center text-white text-xs font-black shadow-md">
                  ?
                </div>
                <p className="text-slate-700 leading-relaxed pl-4 italic">{r}</p>
              </motion.div>
            ))}
          </div>
        </Section>

        {/* Next steps */}
        <Section icon="fa-shoe-prints" iconColor="from-indigo-500 to-blue-500" title="Small next steps" delay={0.45}>
          <div className="space-y-3">
            {narrative.nextSteps.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -15 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.08 }}
                className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-slate-100 hover:border-indigo-200 hover:shadow-lg transition-all"
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center text-white font-black shadow-md">
                  {i + 1}
                </div>
                <p className="text-slate-700 font-medium flex-1">{step}</p>
              </motion.div>
            ))}
          </div>
        </Section>

        {/* Footer */}
        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-center pt-8 space-y-2"
        >
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-widest">
            Generated by Lumina · {stats.periodDays} days of data
          </p>
          <p className="text-[10px] text-slate-400">
            This report is a reflection, not a diagnosis. If you're struggling, please talk to someone qualified.
          </p>
        </motion.footer>
      </div>
    </div>
  );
};

// ---------- Components ----------
const AuroraBg: React.FC = () => (
  <div className="fixed inset-0 pointer-events-none overflow-hidden -z-0">
    <motion.div
      className="absolute top-[-20%] left-[-10%] w-[50rem] h-[50rem] rounded-full bg-indigo-200/40 blur-[120px]"
      animate={{ x: [0, 60, 0], y: [0, 40, 0] }}
      transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
    />
    <motion.div
      className="absolute bottom-[-10%] right-[-15%] w-[45rem] h-[45rem] rounded-full bg-purple-200/40 blur-[120px]"
      animate={{ x: [0, -50, 0], y: [0, -40, 0] }}
      transition={{ duration: 24, repeat: Infinity, ease: 'easeInOut' }}
    />
  </div>
);

const StatStrip: React.FC<{ stats: Stats; trendMeta: typeof TREND_META[keyof typeof TREND_META] }> = ({ stats, trendMeta }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 0.05 }}
    className="grid grid-cols-2 md:grid-cols-4 gap-3"
  >
    <StatCard
      label="Avg Mood"
      value={stats.mood.avg > 0 ? `${stats.mood.avg}` : '—'}
      sub={
        <span className={`flex items-center gap-1 ${trendMeta.color}`}>
          <i className={`fas ${trendMeta.icon}`}></i> {trendMeta.label}
        </span>
      }
    />
    <StatCard label="Tasks done" value={`${stats.tasks.completed}`} sub={`${stats.tasks.completionRate}% rate`} />
    <StatCard label="Active days" value={`${stats.activity.activeDays}`} sub={`${stats.activity.streak} day streak`} />
    <StatCard
      label="Personality"
      value={stats.personality.type || '—'}
      sub={stats.personality.profile?.name || 'not started'}
    />
  </motion.div>
);

const StatCard: React.FC<{ label: string; value: React.ReactNode; sub: React.ReactNode }> = ({ label, value, sub }) => (
  <div className="bg-white/80 backdrop-blur-xl rounded-2xl p-5 border border-white/80 shadow-sm">
    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
    <p className="text-3xl font-black text-slate-900 mt-1 tracking-tight">{value}</p>
    <p className="text-[11px] font-semibold text-slate-500 mt-1">{sub}</p>
  </div>
);

const Section: React.FC<{
  icon: string;
  iconColor: string;
  title: string;
  delay?: number;
  children: React.ReactNode;
}> = ({ icon, iconColor, title, delay = 0, children }) => (
  <motion.section
    initial={{ opacity: 0, y: 30 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay, duration: 0.5, ease: 'easeOut' }}
    className="bg-white/85 backdrop-blur-xl rounded-[2rem] p-6 md:p-10 border border-white/80 shadow-[0_20px_60px_-20px_rgba(99,102,241,0.15)]"
  >
    <div className="flex items-center gap-4 mb-5">
      <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${iconColor} flex items-center justify-center shadow-lg`}>
        <i className={`fas ${icon} text-white`}></i>
      </div>
      <h2 className="text-lg md:text-xl font-extrabold text-slate-900 tracking-tight">{title}</h2>
    </div>
    <div>{children}</div>
  </motion.section>
);

function formatTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString();
}

export default Report;
