import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { api } from '../services/api';
import { useAuthStore } from '../stores/authStore';

interface MLInsights {
  feelings: {
    dominantTone: 'positive' | 'negative' | 'mixed' | 'neutral';
    positiveRatio: number;
    negativeRatio: number;
    topWords: { word: string; count: number }[];
    sampleSize: number;
  } | null;
  relaxers: {
    taskType: string;
    moodLift: number;
    daysWith: number;
    daysWithout: number;
    avgWith: number;
    avgWithout: number;
  }[];
  capabilities: { name: string; score: number; evidence: string }[];
  preferences: { activity: string; frequency: number; recencyDays: number; score: number }[];
  social: {
    groupCount: number;
    postsTotal: number;
    messagesSent: number;
    dmCount: number;
    groupChatCount: number;
    anonymityRate: number;
    socialMode: 'lurker' | 'connector' | 'poster' | 'private' | 'balanced';
    topGroupIds: string[];
  } | null;
  whatIfs: { pattern: string; observation: string; evidence: string }[];
  statedLikes: {
    hobbies: string[];
    preferences: string[];
    goals: string[];
    concerns: string[];
    relationships: string[];
    totalFacts: number;
  } | null;
}

interface Angle {
  key: string;
  question: string;
  fact: string;
  numbers: Record<string, number | string>;
}

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
  mlInsights: MLInsights;
  angles: Angle[];
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
  mlFeelings: string;
  mlRelaxers: string;
  mlCapabilities: string[];
  mlLikes: string;
  mlPeople: string;
  mlWhatIfs: string[];
}

interface ExtraInsight {
  key: string;
  question: string;
  answer: string;
  evidence: string;
  numbers: Record<string, number | string>;
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
  const [extras, setExtras] = useState<ExtraInsight[]>([]);
  const [loadingExtra, setLoadingExtra] = useState(false);
  const [extrasDone, setExtrasDone] = useState(false);
  const [extrasError, setExtrasError] = useState<string | null>(null);
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
      setExtras([]);
      setExtrasDone(false);
      setExtrasError(null);
    } catch (err: any) {
      setError(err?.message || 'Could not load report');
    } finally {
      setLoading(false);
      setRegenerating(false);
    }
  };

  const loadMoreInsight = async () => {
    if (loadingExtra || extrasDone) return;
    setLoadingExtra(true);
    setExtrasError(null);
    try {
      const seenKeys = extras.map((e) => e.key);
      const data = await api.post('/report/insight', { days: periodDays, exclude: seenKeys });
      if (data.done) {
        setExtrasDone(true);
      } else {
        setExtras((prev) => [...prev, {
          key: data.key,
          question: data.question,
          answer: data.answer,
          evidence: data.evidence,
          numbers: data.numbers,
        }]);
        if (data.remaining === 0) setExtrasDone(true);
      }
    } catch (err: any) {
      setExtrasError(err?.message || 'Could not load another insight');
    } finally {
      setLoadingExtra(false);
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

        {/* ----------- ML CHAPTER ----------- */}
        <MLDivider />

        {/* ML: Feelings */}
        <MLSection icon="fa-heart-pulse" iconColor="from-pink-500 to-rose-500" title="ML thinks you feel…" delay={0.36}>
          <p className="text-base md:text-lg text-slate-700 leading-relaxed">{narrative.mlFeelings}</p>
          {stats.mlInsights.feelings && (
            <div className="mt-5 flex flex-wrap gap-2">
              {stats.mlInsights.feelings.topWords.map((w) => (
                <span
                  key={w.word}
                  className="px-3 py-1.5 rounded-full bg-pink-50 border border-pink-100 text-xs font-bold text-pink-700"
                >
                  {w.word} <span className="text-pink-400 font-normal">×{w.count}</span>
                </span>
              ))}
              <span className="px-3 py-1.5 rounded-full bg-slate-50 border border-slate-100 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                tone: {stats.mlInsights.feelings.dominantTone}
              </span>
            </div>
          )}
        </MLSection>

        {/* ML: Relaxers */}
        <MLSection icon="fa-leaf" iconColor="from-emerald-500 to-teal-500" title="ML thinks this relaxes you" delay={0.38}>
          <p className="text-base md:text-lg text-slate-700 leading-relaxed">{narrative.mlRelaxers}</p>
          {stats.mlInsights.relaxers.length > 0 && (
            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
              {stats.mlInsights.relaxers.slice(0, 4).map((r) => (
                <div
                  key={r.taskType}
                  className="p-4 rounded-2xl bg-emerald-50/40 border border-emerald-100"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold text-slate-800 capitalize">{r.taskType}</span>
                    <span className={`text-xs font-black ${r.moodLift > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                      {r.moodLift > 0 ? '+' : ''}{r.moodLift} mood
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    avg {r.avgWith} on do-days vs {r.avgWithout} on skip-days
                  </p>
                </div>
              ))}
            </div>
          )}
        </MLSection>

        {/* ML: Capabilities */}
        <MLSection icon="fa-bolt-lightning" iconColor="from-amber-500 to-orange-500" title="ML thinks you're capable of…" delay={0.4}>
          <ul className="space-y-3">
            {narrative.mlCapabilities.map((c, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.42 + i * 0.05 }}
                className="flex items-start gap-3 text-slate-700"
              >
                <i className="fas fa-bolt text-amber-500 mt-1.5 text-sm"></i>
                <span className="leading-relaxed">{c}</span>
              </motion.li>
            ))}
          </ul>
          {stats.mlInsights.capabilities.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {stats.mlInsights.capabilities.map((c) => (
                <span
                  key={c.name}
                  className="px-3 py-1.5 rounded-full bg-amber-50 border border-amber-100 text-xs font-bold text-amber-700"
                >
                  {c.name} <span className="text-amber-400">{c.score}</span>
                </span>
              ))}
            </div>
          )}
        </MLSection>

        {/* ML: Likes */}
        <MLSection icon="fa-heart" iconColor="from-violet-500 to-fuchsia-500" title="ML thinks you like to…" delay={0.42}>
          <p className="text-base md:text-lg text-slate-700 leading-relaxed">{narrative.mlLikes}</p>

          {stats.mlInsights.statedLikes && (stats.mlInsights.statedLikes.hobbies.length > 0 || stats.mlInsights.statedLikes.preferences.length > 0 || stats.mlInsights.statedLikes.goals.length > 0) && (
            <div className="mt-5 space-y-3">
              {stats.mlInsights.statedLikes.hobbies.length > 0 && (
                <FactChipRow label="Hobbies" items={stats.mlInsights.statedLikes.hobbies} color="violet" />
              )}
              {stats.mlInsights.statedLikes.preferences.length > 0 && (
                <FactChipRow label="Preferences" items={stats.mlInsights.statedLikes.preferences} color="fuchsia" />
              )}
              {stats.mlInsights.statedLikes.goals.length > 0 && (
                <FactChipRow label="Goals" items={stats.mlInsights.statedLikes.goals} color="indigo" />
              )}
            </div>
          )}

          {stats.mlInsights.preferences.length > 0 && (
            <div className="mt-5 space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Activity-derived</p>
              {stats.mlInsights.preferences.slice(0, 4).map((p) => (
                <div key={p.activity} className="flex items-center gap-3">
                  <div className="text-xs font-bold text-slate-700 w-32 truncate capitalize">{p.activity.replace(/_/g, ' ')}</div>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
                      style={{ width: `${Math.min(100, p.score)}%` }}
                    />
                  </div>
                  <div className="text-[10px] font-bold text-slate-500 w-16 text-right">{p.frequency}×</div>
                </div>
              ))}
            </div>
          )}

          {Object.keys(stats.tasks.byType).length > 0 && (
            <div className="mt-5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                Task types you actually finish
              </p>
              <div className="flex flex-wrap gap-2">
                {(Object.entries(stats.tasks.byType) as [string, { total: number; completed: number }][])
                  .sort((a, b) => b[1].completed - a[1].completed)
                  .map(([type, v]) => (
                    <span
                      key={type}
                      className="px-3 py-1.5 rounded-full bg-violet-50 border border-violet-100 text-xs font-bold text-violet-700 capitalize"
                    >
                      {type} <span className="text-violet-400 font-normal">{v.completed}/{v.total}</span>
                    </span>
                  ))}
              </div>
            </div>
          )}
        </MLSection>

        {/* ML: People */}
        <MLSection icon="fa-people-group" iconColor="from-sky-500 to-cyan-500" title="ML thinks about your people" delay={0.44}>
          <p className="text-base md:text-lg text-slate-700 leading-relaxed">{narrative.mlPeople}</p>
          {stats.mlInsights.social && (
            <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
              <MiniStat label="Mode" value={stats.mlInsights.social.socialMode} />
              <MiniStat label="DMs" value={stats.mlInsights.social.dmCount} />
              <MiniStat label="Group msgs" value={stats.mlInsights.social.groupChatCount} />
              <MiniStat label="Anonymous" value={`${Math.round(stats.mlInsights.social.anonymityRate * 100)}%`} />
            </div>
          )}
          {stats.mlInsights.statedLikes && stats.mlInsights.statedLikes.relationships.length > 0 && (
            <div className="mt-5">
              <FactChipRow label="People you mentioned" items={stats.mlInsights.statedLikes.relationships} color="sky" />
            </div>
          )}
        </MLSection>

        {/* ML: What-ifs */}
        <MLSection icon="fa-shuffle" iconColor="from-indigo-500 to-purple-600" title="ML's what's & if's" delay={0.46}>
          <p className="text-sm text-slate-500 mb-4">Statistical patterns from your own data — not guesses.</p>
          <div className="space-y-3">
            {narrative.mlWhatIfs.map((w, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.48 + i * 0.06 }}
                className="p-4 rounded-2xl bg-indigo-50/40 border border-indigo-100"
              >
                <p className="text-slate-700 leading-relaxed">{w}</p>
              </motion.div>
            ))}
          </div>
        </MLSection>

        {/* ML: Load more */}
        <MoreInsights
          extras={extras}
          loading={loadingExtra}
          done={extrasDone}
          error={extrasError}
          onLoad={loadMoreInsight}
        />

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

// ---------- ML chapter components ----------
const MLDivider: React.FC = () => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ delay: 0.34 }}
    className="flex items-center gap-4 py-4"
  >
    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-indigo-200 to-transparent" />
    <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100">
      <i className="fas fa-microchip text-indigo-500 text-xs"></i>
      <span className="text-[10px] font-black uppercase tracking-[0.25em] text-indigo-600">ML chapter</span>
    </div>
    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-indigo-200 to-transparent" />
  </motion.div>
);

const MLSection: React.FC<{
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
    className="relative bg-white/85 backdrop-blur-xl rounded-[2rem] p-6 md:p-10 border border-indigo-100/80 shadow-[0_20px_60px_-20px_rgba(99,102,241,0.18)]"
  >
    <div className="absolute -top-2 right-6">
      <span className="px-2.5 py-1 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-[9px] font-black uppercase tracking-widest shadow-md">
        ML
      </span>
    </div>
    <div className="flex items-center gap-4 mb-5">
      <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${iconColor} flex items-center justify-center shadow-lg`}>
        <i className={`fas ${icon} text-white`}></i>
      </div>
      <h2 className="text-lg md:text-xl font-extrabold text-slate-900 tracking-tight">{title}</h2>
    </div>
    <div>{children}</div>
  </motion.section>
);

const MiniStat: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="bg-slate-50/60 rounded-xl p-3 border border-slate-100">
    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
    <p className="text-lg font-black text-slate-800 mt-0.5 capitalize">{value}</p>
  </div>
);

const CHIP_PALETTE: Record<string, string> = {
  violet: 'bg-violet-50 border-violet-100 text-violet-700',
  fuchsia: 'bg-fuchsia-50 border-fuchsia-100 text-fuchsia-700',
  indigo: 'bg-indigo-50 border-indigo-100 text-indigo-700',
  sky: 'bg-sky-50 border-sky-100 text-sky-700',
  rose: 'bg-rose-50 border-rose-100 text-rose-700',
};

const FactChipRow: React.FC<{ label: string; items: string[]; color: keyof typeof CHIP_PALETTE | string }> = ({ label, items, color }) => (
  <div>
    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
      {label} <span className="text-slate-300 font-normal normal-case">· in your own words</span>
    </p>
    <div className="flex flex-wrap gap-2">
      {items.slice(0, 6).map((item, i) => (
        <span
          key={i}
          className={`px-3 py-1.5 rounded-full border text-xs font-semibold ${CHIP_PALETTE[color] || CHIP_PALETTE.violet}`}
        >
          {item}
        </span>
      ))}
    </div>
  </div>
);

const MoreInsights: React.FC<{
  extras: ExtraInsight[];
  loading: boolean;
  done: boolean;
  error: string | null;
  onLoad: () => void;
}> = ({ extras, loading, done, error, onLoad }) => (
  <motion.section
    initial={{ opacity: 0, y: 30 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 0.48, duration: 0.5 }}
    className="relative bg-gradient-to-br from-indigo-50/60 to-purple-50/40 backdrop-blur-xl rounded-[2rem] p-6 md:p-10 border border-indigo-100"
  >
    <div className="flex items-center gap-4 mb-5">
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
        <i className="fas fa-circle-plus text-white"></i>
      </div>
      <div>
        <h2 className="text-lg md:text-xl font-extrabold text-slate-900 tracking-tight">More about you</h2>
        <p className="text-xs text-slate-500 mt-0.5">Each one is computed from your data — never invented.</p>
      </div>
    </div>

    <div className="space-y-3">
      <AnimatePresence>
        {extras.map((e, i) => (
          <motion.div
            key={e.key}
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ delay: i * 0.04 }}
            className="p-5 rounded-2xl bg-white border border-indigo-100 shadow-sm"
          >
            <div className="flex items-start gap-3 mb-3">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-black shadow-md">
                ?
              </div>
              <p className="text-base font-bold text-slate-900 leading-snug pt-0.5">{e.question}</p>
            </div>
            <p className="text-slate-700 leading-relaxed pl-10">{e.answer}</p>
            <p className="text-[10px] text-slate-400 mt-3 pl-10 italic">Evidence: {e.evidence}</p>
          </motion.div>
        ))}
      </AnimatePresence>

      {error && (
        <p className="text-rose-500 text-sm font-semibold text-center py-2">{error}</p>
      )}
    </div>

    <div className="mt-5 flex justify-center">
      {done && extras.length > 0 ? (
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
          That's everything Lumina can confidently say from this window
        </p>
      ) : done ? (
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
          Not enough data yet for extra insights — keep logging
        </p>
      ) : (
        <button
          onClick={onLoad}
          disabled={loading}
          className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold shadow-lg shadow-indigo-200/50 hover:scale-[1.03] active:scale-95 transition disabled:opacity-50"
        >
          <i className={`fas ${loading ? 'fa-spinner animate-spin' : 'fa-wand-magic-sparkles'}`}></i>
          {loading ? 'Computing…' : extras.length === 0 ? 'Ask ML another question about me' : 'Load another insight'}
        </button>
      )}
    </div>
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
