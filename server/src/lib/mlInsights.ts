/**
 * mlInsights — derives statistical insights about a user from their data.
 * Pure functions: no AI, no I/O. The route layer does DB fetching and (optionally)
 * passes computed facts to Gemini for natural-language phrasing.
 *
 * Anti-hallucination contract: every insight here is computed from real numbers.
 * If a metric lacks enough data to be meaningful, the insight is omitted (returns null).
 */

interface MoodLike {
  score: number;
  label: string;
  note: string | null;
  createdAt: Date;
}

interface TaskLike {
  type: string;
  completed: boolean;
  date: Date;
}

interface ActivityLike {
  activityType: string;
  createdAt: Date;
}

interface MessageLike {
  senderId: string;
  recipientId: string | null;
  groupId: string | null;
  content: string;
  isAnonymous: boolean;
  createdAt: Date;
}

interface PostLike {
  content: string;
  groupId: string;
  isAnonymous: boolean;
  createdAt: Date;
}

interface AIConvoLike {
  moodBefore: number | null;
  moodAfter: number | null;
  durationSec: number | null;
  createdAt: Date;
}

interface PersonalityAxis {
  axis: string;
  dominant: string;
  confidence: number;
}

interface UserFactLike {
  category: string;
  content: string;
  createdAt: Date;
}

export interface MLInputs {
  userId: string;
  moods: MoodLike[];
  tasks: TaskLike[];
  activities: ActivityLike[];
  messages: MessageLike[];
  posts: PostLike[];
  aiConvos: AIConvoLike[];
  personalityType: string | null;
  personalityAxes: PersonalityAxis[];
  groupCount: number;
  userFacts: UserFactLike[];
}

// ---------- Sentiment lexicon (compact) ----------
const POSITIVE_WORDS = new Set([
  'happy', 'good', 'great', 'love', 'calm', 'peace', 'peaceful', 'relaxed', 'joy', 'joyful',
  'grateful', 'thankful', 'excited', 'hopeful', 'proud', 'content', 'confident', 'energized',
  'rested', 'inspired', 'safe', 'free', 'light', 'easy', 'won', 'progress', 'better', 'okay',
  'alright', 'fine', 'kind', 'soft', 'warm', 'glow', 'smile', 'laugh', 'gentle', 'breathe',
]);
const NEGATIVE_WORDS = new Set([
  'sad', 'tired', 'angry', 'anxious', 'anxiety', 'stress', 'stressed', 'lonely', 'alone',
  'empty', 'hopeless', 'numb', 'worried', 'scared', 'afraid', 'overwhelmed', 'exhausted',
  'frustrated', 'upset', 'hurt', 'pain', 'cry', 'crying', 'broken', 'lost', 'stuck',
  'heavy', 'dark', 'bad', 'worse', 'worst', 'hate', 'fear', 'panic', 'shame', 'guilt',
  'cant', 'cannot', 'fail', 'failed', 'failure', 'angry', 'rage', 'sick', 'restless',
]);
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may',
  'might', 'must', 'can', 'i', 'me', 'my', 'we', 'us', 'our', 'you', 'your', 'he', 'she',
  'it', 'they', 'them', 'their', 'this', 'that', 'these', 'those', 'in', 'on', 'at', 'to',
  'for', 'of', 'with', 'by', 'from', 'as', 'so', 'if', 'than', 'then', 'too', 'very',
  'just', 'also', 'only', 'when', 'where', 'how', 'what', 'why', 'no', 'not', 'yes',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z\s']/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function dayOfWeek(d: Date): string {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function pearson(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length || xs.length < 2) return 0;
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom === 0 ? 0 : num / denom;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
}

// ---------- Core insight blocks ----------

export interface FeelingsInsight {
  dominantTone: 'positive' | 'negative' | 'mixed' | 'neutral';
  positiveRatio: number;
  negativeRatio: number;
  topWords: { word: string; count: number }[];
  sampleSize: number;
}

export function computeFeelings(inputs: MLInputs): FeelingsInsight | null {
  const corpus: string[] = [];
  for (const m of inputs.moods) if (m.note) corpus.push(m.note);
  for (const msg of inputs.messages) corpus.push(msg.content);
  for (const p of inputs.posts) corpus.push(p.content);
  if (corpus.length < 3) return null;

  const wordCounts = new Map<string, number>();
  let pos = 0, neg = 0, total = 0;
  for (const text of corpus) {
    for (const w of tokenize(text)) {
      total++;
      if (POSITIVE_WORDS.has(w)) pos++;
      else if (NEGATIVE_WORDS.has(w)) neg++;
      wordCounts.set(w, (wordCounts.get(w) || 0) + 1);
    }
  }
  if (total < 10) return null;

  const topWords = Array.from(wordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([word, count]) => ({ word, count }));

  const posR = pos / total;
  const negR = neg / total;
  let dominant: FeelingsInsight['dominantTone'];
  if (posR > negR * 1.5) dominant = 'positive';
  else if (negR > posR * 1.5) dominant = 'negative';
  else if (pos + neg < total * 0.05) dominant = 'neutral';
  else dominant = 'mixed';

  return {
    dominantTone: dominant,
    positiveRatio: Math.round(posR * 1000) / 1000,
    negativeRatio: Math.round(negR * 1000) / 1000,
    topWords,
    sampleSize: corpus.length,
  };
}

export interface RelaxerInsight {
  taskType: string;
  moodLift: number;
  daysWith: number;
  daysWithout: number;
  avgWith: number;
  avgWithout: number;
}

export function computeRelaxers(inputs: MLInputs): RelaxerInsight[] {
  if (inputs.moods.length < 5 || inputs.tasks.length < 3) return [];
  const moodByDay = new Map<string, number[]>();
  for (const m of inputs.moods) {
    const k = dayKey(m.createdAt);
    if (!moodByDay.has(k)) moodByDay.set(k, []);
    moodByDay.get(k)!.push(m.score);
  }
  const dayMood = new Map<string, number>();
  moodByDay.forEach((arr, k) => dayMood.set(k, mean(arr)));

  const types = Array.from(new Set(inputs.tasks.map((t) => t.type)));
  const results: RelaxerInsight[] = [];

  for (const type of types) {
    const daysWith = new Set<string>();
    for (const t of inputs.tasks) {
      if (t.type === type && t.completed) daysWith.add(dayKey(t.date));
    }
    const withScores: number[] = [];
    const withoutScores: number[] = [];
    dayMood.forEach((score, day) => {
      if (daysWith.has(day)) withScores.push(score);
      else withoutScores.push(score);
    });
    if (withScores.length < 2 || withoutScores.length < 2) continue;
    const avgWith = mean(withScores);
    const avgWithout = mean(withoutScores);
    results.push({
      taskType: type,
      moodLift: Math.round((avgWith - avgWithout) * 100) / 100,
      daysWith: withScores.length,
      daysWithout: withoutScores.length,
      avgWith: Math.round(avgWith * 10) / 10,
      avgWithout: Math.round(avgWithout * 10) / 10,
    });
  }
  return results.sort((a, b) => b.moodLift - a.moodLift);
}

export interface CapabilityInsight {
  name: string;
  score: number;
  evidence: string;
}

const AXIS_CAPABILITY_HINTS: Record<string, Record<string, string>> = {
  EI: { E: 'connecting with others', I: 'deep solo focus' },
  SN: { S: 'practical execution', N: 'pattern recognition' },
  TF: { T: 'analytical reasoning', F: 'emotional attunement' },
  JP: { J: 'follow-through and structure', P: 'adaptive improvisation' },
};

export function computeCapabilities(inputs: MLInputs): CapabilityInsight[] {
  const out: CapabilityInsight[] = [];

  for (const a of inputs.personalityAxes) {
    if (a.confidence < 15) continue;
    const hint = AXIS_CAPABILITY_HINTS[a.axis]?.[a.dominant];
    if (!hint) continue;
    out.push({
      name: hint,
      score: Math.round(a.confidence),
      evidence: `${a.confidence}% confidence on ${a.axis} axis (${a.dominant})`,
    });
  }

  // Capability from completion follow-through
  const completed = inputs.tasks.filter((t) => t.completed).length;
  const total = inputs.tasks.length;
  if (total >= 5) {
    const rate = (completed / total) * 100;
    if (rate >= 60) {
      out.push({
        name: 'consistent follow-through',
        score: Math.round(rate),
        evidence: `${completed}/${total} tasks completed (${Math.round(rate)}%)`,
      });
    }
  }

  // Active-day streak as resilience evidence
  const activeDaysSet = new Set(inputs.activities.map((a) => dayKey(a.createdAt)));
  if (activeDaysSet.size >= 5) {
    out.push({
      name: 'showing up for yourself',
      score: Math.min(100, activeDaysSet.size * 3),
      evidence: `active on ${activeDaysSet.size} different days`,
    });
  }

  return out.sort((a, b) => b.score - a.score).slice(0, 5);
}

export interface PreferenceInsight {
  activity: string;
  frequency: number;
  recencyDays: number;
  score: number;
}

export function computePreferences(inputs: MLInputs): PreferenceInsight[] {
  if (inputs.activities.length < 3) return [];
  const now = Date.now();
  const counts = new Map<string, { count: number; latest: number }>();
  for (const a of inputs.activities) {
    const cur = counts.get(a.activityType) || { count: 0, latest: 0 };
    cur.count++;
    cur.latest = Math.max(cur.latest, a.createdAt.getTime());
    counts.set(a.activityType, cur);
  }
  const totalCount = inputs.activities.length;
  const results: PreferenceInsight[] = [];
  counts.forEach(({ count, latest }, activity) => {
    const recencyDays = Math.floor((now - latest) / 86400000);
    const recencyWeight = Math.max(0.2, 1 - recencyDays / 30);
    const freqWeight = count / totalCount;
    const score = Math.round(freqWeight * recencyWeight * 100);
    results.push({ activity, frequency: count, recencyDays, score });
  });
  return results.sort((a, b) => b.score - a.score).slice(0, 5);
}

export interface SocialInsight {
  groupCount: number;
  postsTotal: number;
  messagesSent: number;
  dmCount: number;
  groupChatCount: number;
  anonymityRate: number;
  socialMode: 'lurker' | 'connector' | 'poster' | 'private' | 'balanced';
  topGroupIds: string[];
}

export function computeSocialStyle(inputs: MLInputs): SocialInsight | null {
  const dms = inputs.messages.filter((m) => m.recipientId && !m.groupId).length;
  const groupMsgs = inputs.messages.filter((m) => m.groupId).length;
  const messagesSent = inputs.messages.length;
  const postsTotal = inputs.posts.length;
  if (messagesSent + postsTotal === 0 && inputs.groupCount === 0) return null;

  const anonContent = inputs.posts.filter((p) => p.isAnonymous).length +
    inputs.messages.filter((m) => m.isAnonymous).length;
  const totalContent = postsTotal + messagesSent;
  const anonymityRate = totalContent > 0 ? anonContent / totalContent : 0;

  const groupCounts = new Map<string, number>();
  for (const m of inputs.messages) if (m.groupId) groupCounts.set(m.groupId, (groupCounts.get(m.groupId) || 0) + 1);
  for (const p of inputs.posts) groupCounts.set(p.groupId, (groupCounts.get(p.groupId) || 0) + 1);
  const topGroupIds = Array.from(groupCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map((e) => e[0]);

  let mode: SocialInsight['socialMode'];
  if (totalContent === 0) mode = 'lurker';
  else if (dms > groupMsgs * 2 && dms > postsTotal) mode = 'connector';
  else if (postsTotal > messagesSent) mode = 'poster';
  else if (anonymityRate > 0.6) mode = 'private';
  else mode = 'balanced';

  return {
    groupCount: inputs.groupCount,
    postsTotal,
    messagesSent,
    dmCount: dms,
    groupChatCount: groupMsgs,
    anonymityRate: Math.round(anonymityRate * 100) / 100,
    socialMode: mode,
    topGroupIds,
  };
}

export interface WhatIfInsight {
  pattern: string;
  observation: string;
  evidence: string;
}

export function computeWhatIfs(inputs: MLInputs): WhatIfInsight[] {
  const out: WhatIfInsight[] = [];
  if (inputs.moods.length < 5) return out;

  const scores = inputs.moods.map((m) => m.score);
  const avg = mean(scores);
  const sd = std(scores);
  if (sd === 0) return out;

  // Find anomalous days (>1 sd from mean)
  const lowDays = inputs.moods.filter((m) => m.score < avg - sd);
  const highDays = inputs.moods.filter((m) => m.score > avg + sd);

  if (highDays.length >= 2) {
    const dowCounts = new Map<string, number>();
    highDays.forEach((d) => {
      const k = dayOfWeek(d.createdAt);
      dowCounts.set(k, (dowCounts.get(k) || 0) + 1);
    });
    const topDow = Array.from(dowCounts.entries()).sort((a, b) => b[1] - a[1])[0];
    if (topDow && topDow[1] >= 2) {
      out.push({
        pattern: 'best-day clustering',
        observation: `Your high-mood days cluster on ${topDow[0]}.`,
        evidence: `${topDow[1]} of ${highDays.length} above-average days fell on ${topDow[0]}.`,
      });
    }
  }

  if (lowDays.length >= 2) {
    const dowCounts = new Map<string, number>();
    lowDays.forEach((d) => {
      const k = dayOfWeek(d.createdAt);
      dowCounts.set(k, (dowCounts.get(k) || 0) + 1);
    });
    const topDow = Array.from(dowCounts.entries()).sort((a, b) => b[1] - a[1])[0];
    if (topDow && topDow[1] >= 2) {
      out.push({
        pattern: 'low-day clustering',
        observation: `Your low-mood days lean toward ${topDow[0]}.`,
        evidence: `${topDow[1]} of ${lowDays.length} below-average days fell on ${topDow[0]}.`,
      });
    }
  }

  // Lumina session lift
  const liftedConvos = inputs.aiConvos.filter(
    (c) => c.moodBefore != null && c.moodAfter != null
  );
  if (liftedConvos.length >= 3) {
    const lifts = liftedConvos.map((c) => (c.moodAfter! - c.moodBefore!));
    const avgLift = mean(lifts);
    if (Math.abs(avgLift) >= 0.5) {
      out.push({
        pattern: 'lumina-session effect',
        observation: avgLift > 0
          ? `Talking to Lumina tends to lift your mood by ~${avgLift.toFixed(1)} points.`
          : `Your mood dips slightly after Lumina sessions — worth noticing.`,
        evidence: `Avg before: ${mean(liftedConvos.map((c) => c.moodBefore!)).toFixed(1)}, after: ${mean(liftedConvos.map((c) => c.moodAfter!)).toFixed(1)}, n=${liftedConvos.length}.`,
      });
    }
  }

  return out;
}

export interface StatedLikesInsight {
  hobbies: string[];
  preferences: string[];
  goals: string[];
  concerns: string[];
  relationships: string[];
  totalFacts: number;
}

export function computeStatedLikes(inputs: MLInputs): StatedLikesInsight | null {
  if (!inputs.userFacts || inputs.userFacts.length === 0) return null;

  const buckets: Record<string, string[]> = {
    hobby: [],
    preference: [],
    goal: [],
    concern: [],
    relationship: [],
    general: [],
  };

  // Sort newest-first so most recent self-disclosures surface first
  const sorted = [...inputs.userFacts].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );

  for (const f of sorted) {
    const cat = f.category in buckets ? f.category : 'general';
    if (buckets[cat].length < 8) {
      const trimmed = f.content.trim();
      if (trimmed && !buckets[cat].includes(trimmed)) {
        buckets[cat].push(trimmed);
      }
    }
  }

  return {
    hobbies: buckets.hobby,
    preferences: buckets.preference,
    goals: buckets.goal,
    concerns: buckets.concern,
    relationships: buckets.relationship,
    totalFacts: inputs.userFacts.length,
  };
}

// ---------- Combined ----------

export interface MLInsights {
  feelings: FeelingsInsight | null;
  relaxers: RelaxerInsight[];
  capabilities: CapabilityInsight[];
  preferences: PreferenceInsight[];
  social: SocialInsight | null;
  whatIfs: WhatIfInsight[];
  statedLikes: StatedLikesInsight | null;
}

export function computeMLInsights(inputs: MLInputs): MLInsights {
  return {
    feelings: computeFeelings(inputs),
    relaxers: computeRelaxers(inputs),
    capabilities: computeCapabilities(inputs),
    preferences: computePreferences(inputs),
    social: computeSocialStyle(inputs),
    whatIfs: computeWhatIfs(inputs),
    statedLikes: computeStatedLikes(inputs),
  };
}

// ---------- Angle pool for "load more" ----------

export interface Angle {
  key: string;
  question: string;
  fact: string; // raw computed answer — Gemini only phrases this
  numbers: Record<string, number | string>;
}

export function computeAngles(inputs: MLInputs): Angle[] {
  const out: Angle[] = [];

  // 1. Best day of week
  if (inputs.moods.length >= 5) {
    const byDow = new Map<string, number[]>();
    inputs.moods.forEach((m) => {
      const k = dayOfWeek(m.createdAt);
      if (!byDow.has(k)) byDow.set(k, []);
      byDow.get(k)!.push(m.score);
    });
    const ranked = Array.from(byDow.entries())
      .filter(([, arr]) => arr.length >= 2)
      .map(([dow, arr]) => ({ dow, avg: mean(arr), n: arr.length }))
      .sort((a, b) => b.avg - a.avg);
    if (ranked.length >= 2) {
      out.push({
        key: 'best_day_of_week',
        question: 'Which day of the week tends to treat you best?',
        fact: `${ranked[0].dow} — average mood ${ranked[0].avg.toFixed(1)} across ${ranked[0].n} entries (worst: ${ranked[ranked.length - 1].dow} at ${ranked[ranked.length - 1].avg.toFixed(1)}).`,
        numbers: { best: ranked[0].dow, bestAvg: ranked[0].avg, worst: ranked[ranked.length - 1].dow, worstAvg: ranked[ranked.length - 1].avg },
      });
    }
  }

  // 2. Time of day
  if (inputs.moods.length >= 5) {
    const buckets: Record<string, number[]> = {
      morning: [], afternoon: [], evening: [], night: [],
    };
    inputs.moods.forEach((m) => {
      const h = m.createdAt.getHours();
      if (h < 12) buckets.morning.push(m.score);
      else if (h < 17) buckets.afternoon.push(m.score);
      else if (h < 22) buckets.evening.push(m.score);
      else buckets.night.push(m.score);
    });
    const ranked = Object.entries(buckets)
      .filter(([, arr]) => arr.length >= 2)
      .map(([t, arr]) => ({ t, avg: mean(arr), n: arr.length }))
      .sort((a, b) => b.avg - a.avg);
    if (ranked.length >= 2) {
      out.push({
        key: 'best_time_of_day',
        question: 'When in the day do you feel most yourself?',
        fact: `${ranked[0].t} — your mood averages ${ranked[0].avg.toFixed(1)} then, vs ${ranked[ranked.length - 1].avg.toFixed(1)} during the ${ranked[ranked.length - 1].t}.`,
        numbers: { bestTime: ranked[0].t, bestAvg: ranked[0].avg },
      });
    }
  }

  // 3. Mood volatility
  if (inputs.moods.length >= 6) {
    const sd = std(inputs.moods.map((m) => m.score));
    out.push({
      key: 'mood_volatility',
      question: 'How steady are your emotions, statistically?',
      fact: sd < 1
        ? `Very steady — your mood standard deviation is just ${sd.toFixed(2)} on a 0-10 scale.`
        : sd < 2
        ? `Moderately variable — std-dev ${sd.toFixed(2)}, some real ups and downs.`
        : `Pretty variable — std-dev ${sd.toFixed(2)}; your emotional range is wide.`,
      numbers: { stdDev: Math.round(sd * 100) / 100 },
    });
  }

  // 4. Most common mood label
  if (inputs.moods.length >= 4) {
    const counts = new Map<string, number>();
    inputs.moods.forEach((m) => counts.set(m.label, (counts.get(m.label) || 0) + 1));
    const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
    if (top) {
      const pct = Math.round((top[1] / inputs.moods.length) * 100);
      out.push({
        key: 'top_mood_label',
        question: 'What feeling shows up most often when you check in?',
        fact: `"${top[0]}" — ${top[1]} of ${inputs.moods.length} mood entries (${pct}%).`,
        numbers: { label: top[0], count: top[1], percent: pct },
      });
    }
  }

  // 5. Note depth
  const notedMoods = inputs.moods.filter((m) => m.note && m.note.trim().length > 0);
  if (notedMoods.length >= 3) {
    const avgLen = mean(notedMoods.map((m) => m.note!.length));
    const noteRate = notedMoods.length / inputs.moods.length;
    out.push({
      key: 'note_depth',
      question: 'How much do you actually write down when you check in?',
      fact: avgLen > 80
        ? `You're a writer — averaging ${Math.round(avgLen)} characters per note across ${notedMoods.length} entries (${Math.round(noteRate * 100)}% of check-ins).`
        : avgLen > 30
        ? `Short and honest — ${Math.round(avgLen)} chars on average, on ${Math.round(noteRate * 100)}% of your check-ins.`
        : `You keep it tight — ${Math.round(avgLen)} chars per note, more glance than journal.`,
      numbers: { avgChars: Math.round(avgLen), noteRate: Math.round(noteRate * 100) },
    });
  }

  // 6. Personality blindspot (lowest confidence axis)
  if (inputs.personalityAxes.length >= 2) {
    const sorted = [...inputs.personalityAxes].sort((a, b) => a.confidence - b.confidence);
    const blind = sorted[0];
    if (blind && blind.confidence < 40) {
      out.push({
        key: 'personality_blindspot',
        question: 'Which side of yourself are you still figuring out?',
        fact: `Your ${blind.axis} axis (${blind.dominant}) only has ${blind.confidence}% confidence — you flip-flop here more than anywhere else.`,
        numbers: { axis: blind.axis, confidence: blind.confidence },
      });
    }
  }

  // 7. Weekend vs weekday
  if (inputs.moods.length >= 6) {
    const weekend = inputs.moods.filter((m) => [0, 6].includes(m.createdAt.getDay())).map((m) => m.score);
    const weekday = inputs.moods.filter((m) => ![0, 6].includes(m.createdAt.getDay())).map((m) => m.score);
    if (weekend.length >= 2 && weekday.length >= 2) {
      const diff = mean(weekend) - mean(weekday);
      out.push({
        key: 'weekend_effect',
        question: 'Are weekends actually better for you, or is that a myth?',
        fact: Math.abs(diff) < 0.3
          ? `No real weekend effect — your mood averages ${mean(weekday).toFixed(1)} on weekdays and ${mean(weekend).toFixed(1)} on weekends. Days are days.`
          : diff > 0
          ? `Weekends help — mood ${mean(weekend).toFixed(1)} on Sat/Sun vs ${mean(weekday).toFixed(1)} on weekdays (+${diff.toFixed(1)}).`
          : `Surprisingly, weekdays are kinder — mood ${mean(weekday).toFixed(1)} vs ${mean(weekend).toFixed(1)} on weekends.`,
        numbers: { weekday: Math.round(mean(weekday) * 10) / 10, weekend: Math.round(mean(weekend) * 10) / 10, diff: Math.round(diff * 10) / 10 },
      });
    }
  }

  // 8. Task diversity
  if (inputs.tasks.length >= 5) {
    const types = new Set(inputs.tasks.map((t) => t.type));
    out.push({
      key: 'task_diversity',
      question: 'Are you a specialist or a generalist with self-care?',
      fact: types.size >= 4
        ? `Generalist — you've tried ${types.size} different task types across ${inputs.tasks.length} tasks.`
        : types.size === 1
        ? `Specialist — you stick to "${[...types][0]}" tasks. Comfort or rut?`
        : `Mostly focused on ${types.size} kinds of tasks (${[...types].join(', ')}).`,
      numbers: { uniqueTypes: types.size, totalTasks: inputs.tasks.length },
    });
  }

  // 9. Comeback count
  if (inputs.moods.length >= 6) {
    let comebacks = 0;
    const sorted = [...inputs.moods].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i - 1].score <= 4 && sorted[i].score >= 7) comebacks++;
    }
    if (comebacks >= 1) {
      out.push({
        key: 'comebacks',
        question: 'How often do you bounce back after a hard moment?',
        fact: `${comebacks} time${comebacks > 1 ? 's' : ''} in this period your mood went from ≤4 to ≥7 between consecutive check-ins. That's resilience showing up in the data.`,
        numbers: { comebacks },
      });
    }
  }

  // 10. Anonymity ratio
  const anonPosts = inputs.posts.filter((p) => p.isAnonymous).length;
  const anonMsgs = inputs.messages.filter((m) => m.isAnonymous).length;
  const totalSocial = inputs.posts.length + inputs.messages.length;
  if (totalSocial >= 5) {
    const anonRate = (anonPosts + anonMsgs) / totalSocial;
    out.push({
      key: 'anonymity_voice',
      question: 'Are you the kind of person who hides behind anonymity, or signs your name?',
      fact: anonRate > 0.6
        ? `You stay private — ${Math.round(anonRate * 100)}% of your posts and messages are anonymous (${anonPosts + anonMsgs}/${totalSocial}).`
        : anonRate < 0.2
        ? `You sign your name — only ${Math.round(anonRate * 100)}% of your contributions are anonymous. You own what you say.`
        : `You're selective — ${Math.round(anonRate * 100)}% anonymous, mostly identified.`,
      numbers: { anonymousPercent: Math.round(anonRate * 100), total: totalSocial },
    });
  }

  // 11. Connector vs lurker
  if (inputs.messages.length >= 3 || inputs.posts.length >= 2) {
    const dms = inputs.messages.filter((m) => m.recipientId && !m.groupId).length;
    const grpMsgs = inputs.messages.filter((m) => m.groupId).length;
    let style: string;
    if (dms > grpMsgs * 2) style = `you prefer one-on-one — ${dms} DMs vs ${grpMsgs} group messages`;
    else if (grpMsgs > dms * 2) style = `you're a group person — ${grpMsgs} group messages vs ${dms} DMs`;
    else style = `you split it evenly — ${dms} DMs and ${grpMsgs} group messages`;
    out.push({
      key: 'social_channel',
      question: 'Do you prefer crowds or one-on-one?',
      fact: style.charAt(0).toUpperCase() + style.slice(1) + '.',
      numbers: { dms, groupMessages: grpMsgs },
    });
  }

  // 12. Most active hour
  if (inputs.activities.length >= 6) {
    const hourCounts = new Map<number, number>();
    inputs.activities.forEach((a) => {
      const h = a.createdAt.getHours();
      hourCounts.set(h, (hourCounts.get(h) || 0) + 1);
    });
    const top = Array.from(hourCounts.entries()).sort((a, b) => b[1] - a[1])[0];
    if (top) {
      const hour = top[0];
      const label = hour === 0 ? '12am' : hour < 12 ? `${hour}am` : hour === 12 ? '12pm' : `${hour - 12}pm`;
      out.push({
        key: 'peak_hour',
        question: 'What time of day do you actually open the app?',
        fact: `${label} — ${top[1]} activities logged at this hour, more than any other.`,
        numbers: { hour, count: top[1] },
      });
    }
  }

  // 13. Group affinity
  if (inputs.groupCount > 0) {
    out.push({
      key: 'group_affinity',
      question: 'How wide is your circle, by your own choosing?',
      fact: inputs.groupCount === 1
        ? `One group — you've kept your circle deliberately tight.`
        : inputs.groupCount <= 3
        ? `${inputs.groupCount} groups — a small, intentional set.`
        : `${inputs.groupCount} groups — you spread your attention across many communities.`,
      numbers: { groups: inputs.groupCount },
    });
  }

  // 14. Best-fit task type for mood
  const relaxers = computeRelaxers(inputs);
  if (relaxers.length >= 1 && relaxers[0].moodLift > 0.5) {
    out.push({
      key: 'mood_lifter',
      question: 'Which task type, statistically, lifts your mood the most?',
      fact: `${relaxers[0].taskType} — your mood averages ${relaxers[0].avgWith} on days you do it vs ${relaxers[0].avgWithout} on days you don't (+${relaxers[0].moodLift}).`,
      numbers: { type: relaxers[0].taskType, lift: relaxers[0].moodLift },
    });
  }

  // 15. Lumina session count
  if (inputs.aiConvos.length >= 2) {
    out.push({
      key: 'lumina_usage',
      question: 'Are you actually using Lumina, or just visiting?',
      fact: `${inputs.aiConvos.length} sessions with Lumina in this window. ${inputs.aiConvos.length >= 5 ? "You've made this part of your rhythm." : "You're still feeling it out."}`,
      numbers: { sessions: inputs.aiConvos.length },
    });
  }

  // 16. Stated hobbies (from chat-extracted facts)
  const facts = inputs.userFacts || [];
  const hobbies = facts.filter((f) => f.category === 'hobby');
  if (hobbies.length >= 1) {
    const recent = [...hobbies]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 4)
      .map((f) => f.content.trim());
    out.push({
      key: 'stated_hobbies',
      question: 'What do you actually enjoy doing, in your own words?',
      fact: `You\'ve told me about ${hobbies.length} hobby${hobbies.length > 1 ? ' interests' : ''}: ${recent.join('; ')}.`,
      numbers: { hobbyCount: hobbies.length },
    });
  }

  // 17. Stated preferences
  const prefs = facts.filter((f) => f.category === 'preference');
  if (prefs.length >= 1) {
    const recent = [...prefs]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 3)
      .map((f) => f.content.trim());
    out.push({
      key: 'stated_preferences',
      question: 'What kind of things do you tend to like or dislike?',
      fact: `From your conversations: ${recent.join('; ')}.`,
      numbers: { prefCount: prefs.length },
    });
  }

  // 18. Stated goals
  const goals = facts.filter((f) => f.category === 'goal');
  if (goals.length >= 1) {
    const recent = [...goals]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 3)
      .map((f) => f.content.trim());
    out.push({
      key: 'stated_goals',
      question: 'What are you actually working toward, by your own description?',
      fact: `You\'ve mentioned ${goals.length} goal${goals.length > 1 ? 's' : ''}: ${recent.join('; ')}.`,
      numbers: { goalCount: goals.length },
    });
  }

  // 19. Stated concerns
  const concerns = facts.filter((f) => f.category === 'concern');
  if (concerns.length >= 1) {
    const recent = [...concerns]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 3)
      .map((f) => f.content.trim());
    out.push({
      key: 'stated_concerns',
      question: 'What weighs on you most, in your own words?',
      fact: `Recurring concerns you\'ve shared: ${recent.join('; ')}.`,
      numbers: { concernCount: concerns.length },
    });
  }

  // 20. Stated relationships
  const rels = facts.filter((f) => f.category === 'relationship');
  if (rels.length >= 1) {
    const recent = [...rels]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 3)
      .map((f) => f.content.trim());
    out.push({
      key: 'stated_relationships',
      question: 'Who are the people who show up most when you talk?',
      fact: `People you\'ve mentioned: ${recent.join('; ')}.`,
      numbers: { relCount: rels.length },
    });
  }

  return out;
}
