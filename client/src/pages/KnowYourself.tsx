import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { api } from '../services/api';

// ---------- Types ----------
interface Question {
  id: string;
  text: string;
  axis: 'EI' | 'SN' | 'TF' | 'JP';
  direction: 'E' | 'I' | 'S' | 'N' | 'T' | 'F' | 'J' | 'P';
  answered: boolean;
}

interface AxisScore {
  axis: 'EI' | 'SN' | 'TF' | 'JP';
  leftLetter: string;
  rightLetter: string;
  leftPct: number;
  rightPct: number;
  dominant: string;
  confidence: number;
}

interface PersonalityResult {
  type: string;
  axes: AxisScore[];
  totalAnswers: number;
}

interface Profile {
  name: string;
  tagline: string;
  blurb: string;
  color: string;
}

// ---------- Likert scale ----------
const LIKERT_LABELS: Record<number, { short: string; full: string; tone: string }> = {
  0: { short: 'Strongly Disagree', full: 'Not me at all', tone: 'text-rose-500' },
  1: { short: 'Disagree', full: 'Rarely feels true', tone: 'text-orange-500' },
  2: { short: 'Slightly Disagree', full: 'Leans away', tone: 'text-amber-500' },
  3: { short: 'Slightly Agree', full: 'Leans toward', tone: 'text-teal-500' },
  4: { short: 'Agree', full: 'Sounds like me', tone: 'text-emerald-500' },
  5: { short: 'Strongly Agree', full: 'Exactly me', tone: 'text-indigo-600' },
};

const AXIS_COLORS: Record<string, string> = {
  EI: 'from-sky-500 to-cyan-500',
  SN: 'from-emerald-500 to-teal-500',
  TF: 'from-rose-500 to-pink-500',
  JP: 'from-amber-500 to-orange-500',
};

const AXIS_LABELS: Record<string, string> = {
  EI: 'Energy',
  SN: 'Mind',
  TF: 'Nature',
  JP: 'Tactics',
};

// ---------- Letter Guide (for the "What do the letters mean?" panel) ----------
interface LetterInfo {
  letter: 'E' | 'I' | 'S' | 'N' | 'T' | 'F' | 'J' | 'P';
  name: string;
  gradient: string;
  points: string[];
}

interface AxisInfo {
  axis: 'EI' | 'SN' | 'TF' | 'JP';
  title: string;
  subtitle: string;
  left: LetterInfo;
  right: LetterInfo;
}

const LETTER_GUIDE: AxisInfo[] = [
  {
    axis: 'EI',
    title: 'Energy',
    subtitle: 'Where do you get your fuel from?',
    left: {
      letter: 'E',
      name: 'Extraversion',
      gradient: 'from-sky-500 to-cyan-500',
      points: [
        'Recharges by being around people.',
        'Thinks out loud — ideas sharpen in conversation.',
        'Prefers action and external stimulation.',
        'Comfortable in groups and new crowds.',
      ],
    },
    right: {
      letter: 'I',
      name: 'Introversion',
      gradient: 'from-indigo-500 to-purple-600',
      points: [
        'Recharges through quiet and solitude.',
        'Processes deeply inside before speaking.',
        'Prefers depth over breadth in connection.',
        'Finds big gatherings draining, even enjoyable ones.',
      ],
    },
  },
  {
    axis: 'SN',
    title: 'Mind',
    subtitle: 'How do you take in information?',
    left: {
      letter: 'S',
      name: 'Sensing',
      gradient: 'from-emerald-500 to-teal-500',
      points: [
        'Trusts facts, data, and direct experience.',
        'Notices concrete, practical details.',
        'Prefers proven methods over untested ideas.',
        'Lives in the present and grounded reality.',
      ],
    },
    right: {
      letter: 'N',
      name: 'Intuition',
      gradient: 'from-violet-500 to-fuchsia-500',
      points: [
        'Sees patterns, possibilities, and "what ifs".',
        'Loves abstract ideas and metaphors.',
        'Focused on the future and what could be.',
        'Bored by routine, drawn to innovation.',
      ],
    },
  },
  {
    axis: 'TF',
    title: 'Nature',
    subtitle: 'How do you make decisions?',
    left: {
      letter: 'T',
      name: 'Thinking',
      gradient: 'from-slate-600 to-slate-800',
      points: [
        'Decides with logic and objective analysis.',
        'Values fairness and consistency.',
        'Comfortable giving honest, direct feedback.',
        'Prefers being respected to being liked.',
      ],
    },
    right: {
      letter: 'F',
      name: 'Feeling',
      gradient: 'from-rose-500 to-pink-500',
      points: [
        'Decides by weighing impact on people.',
        'Values harmony and empathy.',
        'Senses emotional undercurrents easily.',
        'Prefers being kind, even when correct hurts.',
      ],
    },
  },
  {
    axis: 'JP',
    title: 'Tactics',
    subtitle: 'How do you approach life?',
    left: {
      letter: 'J',
      name: 'Judging',
      gradient: 'from-blue-500 to-indigo-700',
      points: [
        'Loves plans, schedules, and checklists.',
        'Decides quickly and sticks with it.',
        'Feels calmer when the day has structure.',
        'Uncomfortable with loose ends.',
      ],
    },
    right: {
      letter: 'P',
      name: 'Perceiving',
      gradient: 'from-amber-500 to-orange-500',
      points: [
        'Keeps options open as long as possible.',
        'Works in bursts of inspiration.',
        'Thrives on spontaneity and flexibility.',
        'Finds rigid schedules suffocating.',
      ],
    },
  },
];

// ---------- Reactions ----------
function buildReaction(result: PersonalityResult | null, question: Question, score: number): string | null {
  if (score === 2 || score === 3 || !result) return null;
  const axisRes = result.axes.find((a) => a.axis === question.axis);
  if (!axisRes) return null;
  const strong = score >= 4 || score <= 1;
  const agreeing = score >= 3;
  const toward = agreeing ? question.direction : oppositeOf(question.direction);
  const fits = axisRes.dominant === toward && axisRes.confidence > 20;
  if (strong && fits) {
    return `That's very ${toward} of you ✨`;
  }
  if (strong && !fits) {
    return `Interesting — that surprises me a little.`;
  }
  return null;
}

function oppositeOf(d: string): string {
  const map: Record<string, string> = { E: 'I', I: 'E', S: 'N', N: 'S', T: 'F', F: 'T', J: 'P', P: 'J' };
  return map[d] || d;
}

// ---------- Main ----------
const KnowYourself: React.FC = () => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [runningResult, setRunningResult] = useState<PersonalityResult | null>(null);
  const [runningProfile, setRunningProfile] = useState<Profile | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reaction, setReaction] = useState<string | null>(null);
  const [hoverScore, setHoverScore] = useState<number | null>(null);
  const [completedToday, setCompletedToday] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [finalResult, setFinalResult] = useState<PersonalityResult | null>(null);
  const [finalProfile, setFinalProfile] = useState<Profile | null>(null);
  const [streak, setStreak] = useState(0);

  // Ask Lumina overlay
  const [askOpen, setAskOpen] = useState(false);
  const [askContext, setAskContext] = useState<{ topic: string; text: string } | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  const reactionTimerRef = useRef<number | null>(null);

  // ---------- Load ----------
  useEffect(() => {
    loadToday();
  }, []);

  const loadToday = async () => {
    setLoading(true);
    try {
      const [today, result] = await Promise.all([
        api.get('/personality/today'),
        api.get('/personality/result').catch(() => null),
      ]);
      setQuestions(today.questions || []);
      setCompletedToday(today.completed);
      if (result) {
        setRunningResult(result.result);
        setRunningProfile(result.profile);
        setStreak(result.streak || 0);
      }
      // Skip past already-answered questions in case the user returned mid-day
      const firstUnanswered = (today.questions || []).findIndex((q: Question) => !q.answered);
      setCurrentIdx(firstUnanswered === -1 ? 0 : firstUnanswered);
      if (today.completed) {
        setShowResult(true);
        setFinalResult(result?.result || null);
        setFinalProfile(result?.profile || null);
      }
    } catch (err) {
      console.error('Failed to load personality today:', err);
    } finally {
      setLoading(false);
    }
  };

  // ---------- Answer ----------
  const submitAnswer = useCallback(
    async (score: number) => {
      if (submitting || showResult) return;
      const q = questions[currentIdx];
      if (!q) return;
      setSubmitting(true);
      setAnswers((prev) => ({ ...prev, [q.id]: score }));

      try {
        const data = await api.post('/personality/answer', {
          questionId: q.id,
          score,
          sessionId,
        });
        if (data.sessionId) setSessionId(data.sessionId);
        setRunningResult(data.result);
        setRunningProfile(data.profile);

        const msg = buildReaction(data.result, q, score);
        if (msg) {
          setReaction(msg);
          if (reactionTimerRef.current) window.clearTimeout(reactionTimerRef.current);
          reactionTimerRef.current = window.setTimeout(() => setReaction(null), 2600);
        }

        if (data.sessionComplete) {
          setTimeout(() => {
            setFinalResult(data.result);
            setFinalProfile(data.profile);
            setShowResult(true);
            setCompletedToday(true);
          }, 600);
        } else {
          setTimeout(() => {
            setCurrentIdx((idx) => Math.min(idx + 1, questions.length - 1));
          }, 450);
        }
      } catch (err) {
        console.error('Submit answer failed', err);
        setAnswers((prev) => {
          const { [q.id]: _, ...rest } = prev;
          return rest;
        });
      } finally {
        setSubmitting(false);
      }
    },
    [questions, currentIdx, sessionId, submitting, showResult]
  );

  // ---------- Keyboard ----------
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (askOpen || showResult) return;
      if (e.key >= '0' && e.key <= '5') {
        e.preventDefault();
        submitAnswer(parseInt(e.key, 10));
      } else if (e.key === 'ArrowLeft' && currentIdx > 0) {
        setCurrentIdx((i) => i - 1);
      } else if (e.key === 'ArrowRight' && currentIdx < questions.length - 1) {
        setCurrentIdx((i) => i + 1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [submitAnswer, askOpen, showResult, currentIdx, questions.length]);

  // ---------- Swipe ----------
  const handleSwipe = (_: unknown, info: PanInfo) => {
    if (submitting || showResult) return;
    const threshold = 80;
    if (info.offset.x < -threshold) {
      // Swipe left → agree (higher)
      submitAnswer(5);
    } else if (info.offset.x > threshold) {
      // Swipe right → disagree (lower)
      submitAnswer(0);
    } else if (info.offset.y < -threshold) {
      submitAnswer(4);
    } else if (info.offset.y > threshold) {
      submitAnswer(1);
    }
  };

  const q = questions[currentIdx];
  const progress = questions.length > 0 ? ((currentIdx + (answers[q?.id] != null ? 1 : 0)) / questions.length) * 100 : 0;

  // ---------- Render ----------
  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="text-slate-400 font-semibold tracking-widest text-xs uppercase animate-pulse">
          Tuning the mirror…
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[85vh] overflow-visible">
      {/* Aurora background */}
      <AuroraBackground />

      <AnimatePresence mode="wait">
        {showResult && finalResult && finalProfile ? (
          <ResultScreen
            key="result"
            result={finalResult}
            profile={finalProfile}
            streak={streak}
            onReplay={() => {
              setShowResult(false);
              setCurrentIdx(0);
              setAnswers({});
              loadToday();
            }}
          />
        ) : (
          <motion.div
            key="questions"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="relative z-10 space-y-8 pt-2"
          >
            {/* Header */}
            <header className="space-y-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-indigo-500 uppercase tracking-[0.25em]">Know Yourself</p>
                  <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
                    A mirror, 10 questions deep.
                  </h1>
                  <p className="text-slate-500 text-sm mt-1">
                    Press <Kbd>0</Kbd>–<Kbd>5</Kbd>, swipe, or tap. Answer honestly.
                  </p>
                </div>
                {runningProfile && (
                  <div className="hidden md:flex flex-col items-end gap-0.5">
                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Current type</div>
                    <div className={`text-2xl font-black tracking-tight bg-gradient-to-r ${runningProfile.color} bg-clip-text text-transparent`}>
                      {runningResult?.type}
                    </div>
                    <div className="text-[9px] text-slate-400">{runningProfile.name}</div>
                  </div>
                )}
              </div>

              {/* Quick actions row */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setGuideOpen(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white border border-slate-200 hover:border-indigo-300 hover:shadow-lg hover:shadow-indigo-100/50 transition-all text-sm font-bold text-slate-700 group"
                >
                  <i className="fas fa-book-open text-indigo-500 group-hover:scale-110 transition-transform"></i>
                  What do the letters mean?
                </button>
                <button
                  onClick={() => {
                    setAskContext(null);
                    setAskOpen(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-bold shadow-lg shadow-indigo-200/60 hover:scale-[1.03] active:scale-95 transition-all"
                >
                  <i className="fas fa-wand-magic-sparkles"></i>
                  Ask Lumina
                </button>
              </div>
            </header>

            {/* Progress */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                />
              </div>
              <div className="text-[11px] font-bold text-slate-500 tabular-nums">
                {currentIdx + 1} / {questions.length}
              </div>
            </div>

            {/* Card */}
            <div className="relative flex justify-center pt-4">
              <AnimatePresence mode="wait">
                {q && (
                  <motion.div
                    key={q.id}
                    drag={!submitting}
                    dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
                    dragElastic={0.4}
                    onDragEnd={handleSwipe}
                    initial={{ opacity: 0, y: 30, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -180, rotate: -6, transition: { duration: 0.3 } }}
                    transition={{ type: 'spring', stiffness: 240, damping: 26 }}
                    className="relative w-full max-w-xl cursor-grab active:cursor-grabbing select-none"
                  >
                    {/* Axis tag */}
                    <div className="absolute -top-3 left-6 z-10">
                      <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest text-white bg-gradient-to-r ${AXIS_COLORS[q.axis]} shadow-md`}>
                        {AXIS_LABELS[q.axis]} · {q.axis}
                      </div>
                    </div>

                    <div className="relative bg-white/85 backdrop-blur-2xl rounded-[2rem] p-8 md:p-10 border border-white/80 shadow-[0_30px_60px_-15px_rgba(99,102,241,0.25)]">
                      <p className="text-xl md:text-2xl font-bold text-slate-900 leading-snug tracking-tight text-center">
                        {q.text}
                      </p>
                    </div>

                    {/* Swipe hints */}
                    <div className="absolute left-0 right-0 -bottom-6 flex justify-between px-4 text-[9px] font-bold uppercase tracking-widest text-slate-400 pointer-events-none">
                      <span>← Disagree</span>
                      <span>Agree →</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Likert legend + buttons */}
            <div className="pt-10 space-y-3">
              <div className="h-5 flex items-center justify-center">
                <AnimatePresence mode="wait">
                  {hoverScore !== null && (
                    <motion.p
                      key={hoverScore}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      className={`text-xs font-bold ${LIKERT_LABELS[hoverScore].tone}`}
                    >
                      {LIKERT_LABELS[hoverScore].full}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex justify-center gap-2 md:gap-3 flex-wrap">
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <motion.button
                    key={n}
                    disabled={submitting}
                    onMouseEnter={() => setHoverScore(n)}
                    onMouseLeave={() => setHoverScore(null)}
                    onClick={() => submitAnswer(n)}
                    whileHover={{ scale: 1.08, y: -3 }}
                    whileTap={{ scale: 0.9 }}
                    className="relative group"
                  >
                    <div
                      className={`w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center font-black text-lg md:text-xl transition-all ${
                        n <= 1
                          ? 'bg-gradient-to-br from-rose-400 to-orange-400 text-white'
                          : n === 2
                          ? 'bg-gradient-to-br from-amber-300 to-yellow-400 text-white'
                          : n === 3
                          ? 'bg-gradient-to-br from-teal-300 to-emerald-400 text-white'
                          : n === 4
                          ? 'bg-gradient-to-br from-emerald-400 to-green-500 text-white'
                          : 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white'
                      } shadow-lg shadow-indigo-100/60 group-hover:shadow-xl`}
                    >
                      {n}
                    </div>
                    <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                      {LIKERT_LABELS[n].short.split(' ')[0]}
                    </div>
                  </motion.button>
                ))}
              </div>

              {/* Small contextual Ask Lumina link */}
              <div className="flex justify-center pt-6">
                <button
                  onClick={() => {
                    if (q) setAskContext({ topic: 'question', text: q.text });
                    setAskOpen(true);
                  }}
                  className="flex items-center gap-2 text-xs text-slate-500 hover:text-indigo-600 font-semibold transition-colors group"
                >
                  <i className="fas fa-circle-question group-hover:scale-110 transition-transform"></i>
                  Confused by this question? Ask Lumina about it
                </button>
              </div>
            </div>

            {/* Reaction bubble */}
            <div className="h-14 flex justify-center items-center">
              <AnimatePresence>
                {reaction && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.9 }}
                    className="glass-card px-5 py-3 flex items-center gap-3 shadow-lg"
                  >
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs shadow-md">
                      <i className="fas fa-sparkles"></i>
                    </div>
                    <p className="text-sm font-semibold text-slate-700 italic">{reaction}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Live type preview */}
            {runningResult && (
              <LiveTypePreview result={runningResult} profile={runningProfile} />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Ask Lumina FAB — always visible */}
      {!showResult && !askOpen && !guideOpen && (
        <motion.button
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          onClick={() => {
            setAskContext(null);
            setAskOpen(true);
          }}
          className="fixed bottom-24 md:bottom-8 right-4 md:right-8 z-40 flex items-center gap-3 pl-4 pr-5 py-4 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold shadow-2xl shadow-indigo-400/50 hover:shadow-indigo-400/70 transition-all"
          aria-label="Ask Lumina"
        >
          <span className="relative flex w-3 h-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-60"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
          </span>
          <i className="fas fa-wand-magic-sparkles"></i>
          <span className="text-sm">Ask Lumina</span>
        </motion.button>
      )}

      {/* Letter Guide Modal */}
      <AnimatePresence>
        {guideOpen && (
          <LetterGuideModal
            onClose={() => setGuideOpen(false)}
            onAskLumina={(topic, text) => {
              setAskContext({ topic, text });
              setGuideOpen(false);
              setAskOpen(true);
            }}
          />
        )}
      </AnimatePresence>

      {/* Ask Lumina Overlay */}
      <AnimatePresence>
        {askOpen && (
          <AskLuminaOverlay
            question={q}
            currentType={runningResult?.type || null}
            context={askContext}
            onClose={() => {
              setAskOpen(false);
              setAskContext(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

// ---------- Sub-components ----------
const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="px-1.5 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[10px] font-mono font-bold text-slate-600 mx-0.5">
    {children}
  </kbd>
);

const AuroraBackground: React.FC = () => (
  <div className="fixed inset-0 pointer-events-none overflow-hidden -z-0">
    <motion.div
      className="absolute top-[-20%] left-[-10%] w-[50rem] h-[50rem] rounded-full bg-indigo-300/30 blur-[120px]"
      animate={{ x: [0, 60, 0], y: [0, 40, 0] }}
      transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
    />
    <motion.div
      className="absolute top-[10%] right-[-15%] w-[45rem] h-[45rem] rounded-full bg-purple-300/30 blur-[120px]"
      animate={{ x: [0, -50, 0], y: [0, 60, 0] }}
      transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
    />
    <motion.div
      className="absolute bottom-[-10%] left-[20%] w-[40rem] h-[40rem] rounded-full bg-pink-300/25 blur-[120px]"
      animate={{ x: [0, 40, 0], y: [0, -30, 0] }}
      transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
    />
  </div>
);

const LiveTypePreview: React.FC<{ result: PersonalityResult; profile: Profile | null }> = ({ result, profile }) => (
  <div className="max-w-2xl mx-auto glass-card p-5 flex items-center gap-5">
    <div className={`flex-shrink-0 w-16 h-16 rounded-2xl bg-gradient-to-br ${profile?.color || 'from-indigo-500 to-purple-600'} flex items-center justify-center shadow-xl`}>
      <span className="text-white font-black text-xs tracking-tight">{result.type}</span>
    </div>
    <div className="flex-1 grid grid-cols-4 gap-3">
      {result.axes.map((a) => (
        <div key={a.axis} className="text-center">
          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">{AXIS_LABELS[a.axis]}</div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <motion.div
              className={`h-full bg-gradient-to-r ${AXIS_COLORS[a.axis]}`}
              animate={{ width: `${Math.max(a.leftPct, a.rightPct)}%` }}
              transition={{ duration: 0.6 }}
            />
          </div>
          <div className="text-[10px] font-black text-slate-600 mt-1">{a.dominant}</div>
        </div>
      ))}
    </div>
  </div>
);

const ResultScreen: React.FC<{
  result: PersonalityResult;
  profile: Profile;
  streak: number;
  onReplay: () => void;
}> = ({ result, profile, streak, onReplay }) => {
  const letters = result.type.split('');
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="relative z-10 flex flex-col items-center justify-center min-h-[70vh] text-center space-y-8 pt-4"
    >
      <div>
        <p className="text-xs font-bold text-indigo-500 uppercase tracking-[0.3em]">Today's mirror</p>
        <p className="text-slate-500 mt-2 text-sm">This is who you looked like today.</p>
      </div>

      {/* Letter reveal */}
      <div className="flex items-center gap-2 md:gap-4">
        {letters.map((letter, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 40, rotateX: -90 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            transition={{ delay: 0.3 + i * 0.25, type: 'spring', stiffness: 180, damping: 14 }}
            className={`relative w-20 h-28 md:w-28 md:h-40 rounded-3xl bg-gradient-to-br ${profile.color} flex items-center justify-center shadow-2xl`}
          >
            <span className="text-white text-6xl md:text-8xl font-black tracking-tight drop-shadow-lg">{letter}</span>
            <motion.div
              className="absolute inset-0 rounded-3xl bg-white/30"
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              transition={{ delay: 0.3 + i * 0.25 + 0.3, duration: 0.5 }}
            />
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.7 }}
        className="space-y-3 max-w-xl px-4"
      >
        <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900">{profile.name}</h2>
        <p className="text-indigo-500 font-bold text-sm uppercase tracking-widest">{profile.tagline}</p>
        <p className="text-slate-600 leading-relaxed text-base md:text-lg italic">"{profile.blurb}"</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2 }}
        className="flex items-center gap-6"
      >
        <Stat label="Answers" value={result.totalAnswers} />
        <div className="w-px h-10 bg-slate-200" />
        <Stat label="Day Streak" value={streak} accent />
        <div className="w-px h-10 bg-slate-200" />
        <Stat label="Sharpest Trait" value={`${sharpestAxis(result)}`} />
      </motion.div>

      <motion.button
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 2.3 }}
        onClick={onReplay}
        className="px-8 py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold shadow-xl shadow-indigo-200/60 hover:scale-105 active:scale-95 transition"
      >
        Come back tomorrow ✨
      </motion.button>
    </motion.div>
  );
};

const Stat: React.FC<{ label: string; value: React.ReactNode; accent?: boolean }> = ({ label, value, accent }) => (
  <div className="text-center">
    <div className={`text-3xl font-black ${accent ? 'bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent' : 'text-slate-800'}`}>{value}</div>
    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{label}</div>
  </div>
);

function sharpestAxis(result: PersonalityResult): string {
  const top = [...result.axes].sort((a, b) => b.confidence - a.confidence)[0];
  if (!top) return '—';
  return top.dominant;
}

// ---------- Letter Guide Modal ----------
const LetterGuideModal: React.FC<{
  onClose: () => void;
  onAskLumina: (topic: string, text: string) => void;
}> = ({ onClose, onAskLumina }) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-start justify-center p-4 md:p-8 bg-slate-900/60 backdrop-blur-xl overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        transition={{ type: 'spring', stiffness: 220, damping: 24 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-3xl bg-white rounded-[2rem] shadow-2xl overflow-hidden my-auto"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-xl border-b border-slate-100 px-6 md:px-10 py-5 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-[0.25em]">Letter Guide</p>
            <h3 className="text-xl md:text-2xl font-extrabold text-slate-900 mt-0.5">What do the letters mean?</h3>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition flex-shrink-0"
            aria-label="Close"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        {/* Axes */}
        <div className="px-6 md:px-10 py-6 space-y-8">
          {LETTER_GUIDE.map((axis) => (
            <section key={axis.axis} className="space-y-4">
              <div className="flex items-baseline gap-3">
                <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest text-white bg-gradient-to-r ${AXIS_COLORS[axis.axis]}`}>
                  {axis.title}
                </div>
                <p className="text-sm text-slate-500 italic">{axis.subtitle}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[axis.left, axis.right].map((info) => (
                  <div
                    key={info.letter}
                    className="relative bg-slate-50 border border-slate-100 rounded-2xl p-5 hover:shadow-lg hover:border-indigo-200 transition-all"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div
                        className={`w-12 h-12 rounded-xl bg-gradient-to-br ${info.gradient} flex items-center justify-center text-white font-black text-xl shadow-md`}
                      >
                        {info.letter}
                      </div>
                      <div>
                        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Letter</div>
                        <div className="text-base font-extrabold text-slate-800 leading-tight">{info.name}</div>
                      </div>
                    </div>

                    <ul className="space-y-2 mb-4">
                      {info.points.map((p, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-slate-600 leading-snug">
                          <i className="fas fa-circle text-[5px] mt-2 text-indigo-400 flex-shrink-0"></i>
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>

                    <button
                      onClick={() =>
                        onAskLumina(
                          `${info.letter} (${info.name})`,
                          `Explain what ${info.letter} (${info.name}) means in a personality test, in a warm conversational way.`
                        )
                      }
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 text-xs font-bold text-slate-700 hover:text-indigo-600 transition-all"
                    >
                      <i className="fas fa-wand-magic-sparkles text-indigo-500"></i>
                      Ask Lumina about {info.letter}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 md:px-10 py-5 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
            16 types · 4 axes · Based on MBTI
          </p>
          <button
            onClick={() =>
              onAskLumina('letters', 'Give me a quick overview of the 4 personality axes and what each letter means.')
            }
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xs font-bold shadow-lg shadow-indigo-200/60 hover:scale-[1.03] transition"
          >
            <i className="fas fa-wand-magic-sparkles"></i>
            Ask Lumina for a tour
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ---------- Ask Lumina (Gemini Live Audio + Screen) ----------
const AskLuminaOverlay: React.FC<{
  question: Question | undefined;
  currentType: string | null;
  context: { topic: string; text: string } | null;
  onClose: () => void;
}> = ({ question, currentType, context, onClose }) => {
  const [active, setActive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [talking, setTalking] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [screenShared, setScreenShared] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const outputNodeRef = useRef<GainNode | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const screenIntervalRef = useRef<number | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    return () => stopSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startSession = async () => {
    setError(null);
    setConnecting(true);
    try {
      let apiKey = (import.meta as any).env.VITE_GEMINI_API_KEY;
      try {
        const keyData = await api.get('/ai/session-key');
        if (keyData.key) apiKey = keyData.key;
      } catch {
        /* fallback */
      }
      if (!apiKey) throw new Error('Gemini API key not available');

      const ai = new GoogleGenAI({ apiKey });

      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      inputCtxRef.current = inputCtx;
      outputCtxRef.current = outputCtx;
      outputNodeRef.current = outputCtx.createGain();
      outputNodeRef.current.connect(outputCtx.destination);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      // Attempt screen capture (optional - user can decline)
      let screenStream: MediaStream | null = null;
      try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 1 },
          audio: false,
        });
        screenStreamRef.current = screenStream;
        setScreenShared(true);
      } catch {
        // User declined screen share — session still works without it
      }

      const contextBlock = context
        ? `The user specifically wants help with: ${context.topic}
Their request: "${context.text}"
Answer their request directly in 1-3 short sentences.`
        : `The user is currently on this Likert-scale statement (0 = strongly disagree, 5 = strongly agree):
"${question?.text ?? ''}"
This question measures the ${question?.axis ?? '?'} axis (direction: ${question?.direction ?? '?'}).`;

      const systemInstruction = `You are Lumina, a warm, gentle companion helping the user with a personality self-assessment.

${contextBlock}

Their running personality type is currently: ${currentType || 'not yet determined'}.

Your job is to help them understand — never to influence their answer. You can:
- Read the question aloud in a warm voice.
- Rephrase it in simpler, everyday language.
- Give a concrete example of what it would look like.
- Explain what a letter like E, I, N, or T means.
- Reassure them that there's no right answer.

Keep replies short, 1-3 sentences. Don't push them toward any answer. If they ask you to pick one, decline gently and remind them only they know.
If the user shares their screen you may briefly comment on what's visible, but stay focused on helping.`;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setActive(true);
            setConnecting(false);
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessorRef.current = scriptProcessor;

            scriptProcessor.onaudioprocess = (e) => {
              if (!sessionRef.current) return;
              const inputData = e.inputBuffer.getChannelData(0);
              const int16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) int16[i] = inputData[i] * 32768;
              let binary = '';
              const bytes = new Uint8Array(int16.buffer);
              for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
              const base64 = btoa(binary);
              sessionPromise.then((session) =>
                session.sendRealtimeInput({ media: { data: base64, mimeType: 'audio/pcm;rate=16000' } })
              );
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);

            // Screen frame sampling
            if (screenStream) {
              const video = document.createElement('video');
              video.srcObject = screenStream;
              video.muted = true;
              video.play().catch(() => {});
              videoElRef.current = video;
              const canvas = document.createElement('canvas');
              canvasRef.current = canvas;

              screenIntervalRef.current = window.setInterval(() => {
                if (!video.videoWidth || !sessionRef.current) return;
                const w = Math.min(video.videoWidth, 960);
                const scale = w / video.videoWidth;
                canvas.width = w;
                canvas.height = video.videoHeight * scale;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                canvas.toBlob(
                  async (blob) => {
                    if (!blob) return;
                    const reader = new FileReader();
                    reader.onloadend = () => {
                      const dataUrl = reader.result as string;
                      const base64 = dataUrl.split(',')[1];
                      if (base64 && sessionRef.current) {
                        sessionPromise.then((session) =>
                          session.sendRealtimeInput({ media: { data: base64, mimeType: 'image/jpeg' } })
                        );
                      }
                    };
                    reader.readAsDataURL(blob);
                  },
                  'image/jpeg',
                  0.7
                );
              }, 1500);
            }
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.outputTranscription) {
              setTranscription(message.serverContent.outputTranscription.text || '');
            }
            const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData) {
              setTalking(true);
              const binaryString = atob(audioData);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
              const dataInt16 = new Int16Array(bytes.buffer);
              const buffer = outputCtx.createBuffer(1, dataInt16.length, 24000);
              const channelData = buffer.getChannelData(0);
              for (let i = 0; i < dataInt16.length; i++) channelData[i] = dataInt16[i] / 32768.0;

              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
              const src = outputCtx.createBufferSource();
              src.buffer = buffer;
              src.connect(outputNodeRef.current!);
              src.onended = () => {
                sourcesRef.current.delete(src);
                if (sourcesRef.current.size === 0) setTalking(false);
              };
              src.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(src);
            }
            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach((s) => s.stop());
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onclose: () => setActive(false),
          onerror: (e) => {
            console.error('Ask Lumina session error', e);
            setError('Connection dropped. Try again.');
            stopSession();
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          systemInstruction,
          outputAudioTranscription: {},
        },
      });
      sessionRef.current = sessionPromise;
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Could not start voice session');
      setConnecting(false);
      stopSession();
    }
  };

  const stopSession = () => {
    if (screenIntervalRef.current) {
      clearInterval(screenIntervalRef.current);
      screenIntervalRef.current = null;
    }
    if (scriptProcessorRef.current) {
      try { scriptProcessorRef.current.disconnect(); } catch {}
      scriptProcessorRef.current = null;
    }
    if (inputCtxRef.current) {
      try { inputCtxRef.current.close(); } catch {}
      inputCtxRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }
    if (sessionRef.current) {
      sessionRef.current.then((s: any) => { try { s.close(); } catch {} });
      sessionRef.current = null;
    }
    sourcesRef.current.forEach((s) => { try { s.stop(); } catch {} });
    sourcesRef.current.clear();
    setActive(false);
    setTalking(false);
    setScreenShared(false);
    setTranscription('');
  };

  const handleClose = () => {
    stopSession();
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xl"
    >
      <motion.div
        initial={{ scale: 0.9, y: 30 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 30 }}
        transition={{ type: 'spring', stiffness: 220, damping: 24 }}
        className="relative w-full max-w-lg bg-white rounded-[2rem] p-8 md:p-10 shadow-2xl overflow-hidden"
      >
        {/* Aurora inside overlay */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-20 -left-20 w-80 h-80 rounded-full bg-indigo-200/50 blur-[80px]" />
          <div className="absolute -bottom-20 -right-20 w-80 h-80 rounded-full bg-purple-200/50 blur-[80px]" />
        </div>

        <div className="relative space-y-6">
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-[0.25em]">Ask Lumina</p>
              <h3 className="text-2xl font-extrabold text-slate-900 mt-1 truncate">
                {context ? `Help with ${context.topic}` : 'Voice companion'}
              </h3>
            </div>
            <button
              onClick={handleClose}
              className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition"
            >
              <i className="fas fa-times"></i>
            </button>
          </div>

          {/* Pulse orb */}
          <div className="relative flex items-center justify-center h-48">
            <div
              className={`absolute w-40 h-40 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 opacity-40 ${
                active ? 'aura-breathing' : ''
              }`}
            />
            <div
              className={`relative w-28 h-28 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-2xl shadow-indigo-300/50 transition-transform ${
                talking ? 'scale-110' : 'scale-100'
              }`}
            >
              <i className={`fas ${active ? 'fa-wave-square animate-pulse' : 'fa-microphone'} text-white text-3xl`}></i>
            </div>
          </div>

          {/* Status */}
          <div className="text-center min-h-[3rem]">
            {error && <p className="text-rose-500 text-sm font-semibold">{error}</p>}
            {!error && !active && !connecting && (
              <p className="text-slate-500 text-sm">Lumina can read the question, simplify it, or just keep you company.</p>
            )}
            {connecting && <p className="text-indigo-500 text-sm font-bold animate-pulse">Connecting…</p>}
            {active && !transcription && (
              <p className="text-slate-400 text-xs uppercase tracking-widest font-bold">
                {talking ? 'Lumina is speaking…' : 'Listening…'}
                {screenShared && <span className="ml-2 text-emerald-500">• screen shared</span>}
              </p>
            )}
            {active && transcription && (
              <p className="text-slate-700 text-sm italic leading-relaxed">"{transcription}"</p>
            )}
          </div>

          {/* Controls */}
          <div className="flex flex-col gap-3">
            {!active ? (
              <button
                onClick={startSession}
                disabled={connecting}
                className="w-full py-5 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold shadow-xl shadow-indigo-200/50 hover:scale-[1.02] active:scale-95 transition disabled:opacity-50 flex items-center justify-center gap-3"
              >
                <i className="fas fa-microphone"></i>
                {connecting ? 'Starting…' : 'Start voice session'}
              </button>
            ) : (
              <button
                onClick={stopSession}
                className="w-full py-5 rounded-2xl bg-slate-900 text-white font-bold hover:bg-black transition flex items-center justify-center gap-3"
              >
                <i className="fas fa-stop"></i>
                End session
              </button>
            )}
            <p className="text-[10px] text-slate-400 text-center font-bold uppercase tracking-[0.2em]">
              Mic + optional screen share • Private
            </p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default KnowYourself;
