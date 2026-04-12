export type Axis = 'EI' | 'SN' | 'TF' | 'JP';
export type Direction = 'E' | 'I' | 'S' | 'N' | 'T' | 'F' | 'J' | 'P';

export interface Question {
  id: string;
  text: string;
  axis: Axis;
  direction: Direction;
}

/**
 * Each statement is worded so that "agree" moves the score toward `direction`.
 * The Likert 0-5 scale is mapped so 0 = strongly against direction, 5 = strongly toward it.
 */
export const QUESTION_BANK: Question[] = [
  // ------- Extraversion / Introversion -------
  { id: 'ei01', axis: 'EI', direction: 'E', text: 'A lively room full of strangers energizes me rather than drains me.' },
  { id: 'ei02', axis: 'EI', direction: 'E', text: 'I think out loud — ideas get clearer when I say them to someone.' },
  { id: 'ei03', axis: 'EI', direction: 'E', text: 'If I spend too much time alone, I start to feel restless and flat.' },
  { id: 'ei04', axis: 'EI', direction: 'E', text: 'I usually introduce myself first in a group I don\'t know.' },
  { id: 'ei05', axis: 'EI', direction: 'E', text: 'My ideal weekend involves plans with several different people.' },
  { id: 'ei06', axis: 'EI', direction: 'I', text: 'After a social day, I need real alone time before I feel like myself again.' },
  { id: 'ei07', axis: 'EI', direction: 'I', text: 'I prefer one deep conversation over a night of small talk.' },
  { id: 'ei08', axis: 'EI', direction: 'I', text: 'I process things best inside my own head before speaking.' },
  { id: 'ei09', axis: 'EI', direction: 'I', text: 'I find large gatherings tiring even when I\'m enjoying them.' },
  { id: 'ei10', axis: 'EI', direction: 'I', text: 'I\'d rather observe a group for a while before joining in.' },
  { id: 'ei11', axis: 'EI', direction: 'E', text: 'I tend to make friends quickly wherever I go.' },
  { id: 'ei12', axis: 'EI', direction: 'I', text: 'Solitude feels more like a reward than a punishment.' },

  // ------- Sensing / Intuition -------
  { id: 'sn01', axis: 'SN', direction: 'S', text: 'I trust concrete facts and direct experience more than abstract theories.' },
  { id: 'sn02', axis: 'SN', direction: 'S', text: 'When learning, I prefer clear, step-by-step instructions.' },
  { id: 'sn03', axis: 'SN', direction: 'S', text: 'I notice small practical details others miss.' },
  { id: 'sn04', axis: 'SN', direction: 'S', text: 'I\'d rather improve something that works than invent something brand new.' },
  { id: 'sn05', axis: 'SN', direction: 'S', text: 'I like working with things I can see, touch, or measure.' },
  { id: 'sn06', axis: 'SN', direction: 'N', text: 'My mind constantly jumps to "what if" and future possibilities.' },
  { id: 'sn07', axis: 'SN', direction: 'N', text: 'I enjoy abstract ideas even when they have no immediate use.' },
  { id: 'sn08', axis: 'SN', direction: 'N', text: 'I see patterns and connections before I see the individual pieces.' },
  { id: 'sn09', axis: 'SN', direction: 'N', text: 'I get bored when a task is purely routine with no room to imagine.' },
  { id: 'sn10', axis: 'SN', direction: 'N', text: 'Metaphors and symbols feel like a natural way to describe reality.' },
  { id: 'sn11', axis: 'SN', direction: 'S', text: 'I focus on what is actually happening, not what it might mean.' },
  { id: 'sn12', axis: 'SN', direction: 'N', text: 'I\'d rather explore an unproven idea than polish a familiar one.' },

  // ------- Thinking / Feeling -------
  { id: 'tf01', axis: 'TF', direction: 'T', text: 'When making a tough decision, logic wins over personal feelings.' },
  { id: 'tf02', axis: 'TF', direction: 'T', text: 'I value being fair and consistent over being warm.' },
  { id: 'tf03', axis: 'TF', direction: 'T', text: 'I can critique a friend\'s work honestly without sugarcoating.' },
  { id: 'tf04', axis: 'TF', direction: 'T', text: 'I find it easier to spot flaws in an argument than to spot hurt feelings.' },
  { id: 'tf05', axis: 'TF', direction: 'T', text: 'I believe the truth matters more than protecting someone\'s ego.' },
  { id: 'tf06', axis: 'TF', direction: 'F', text: 'I often feel what the people around me are feeling without them telling me.' },
  { id: 'tf07', axis: 'TF', direction: 'F', text: 'Harmony in a group matters more to me than winning an argument.' },
  { id: 'tf08', axis: 'TF', direction: 'F', text: 'I make decisions based on how they will affect the people involved.' },
  { id: 'tf09', axis: 'TF', direction: 'F', text: 'I\'m drawn to stories that make me feel something deeply.' },
  { id: 'tf10', axis: 'TF', direction: 'F', text: 'I take criticism personally even when I know it isn\'t meant that way.' },
  { id: 'tf11', axis: 'TF', direction: 'T', text: 'I prefer "correct" over "kind" when the two conflict.' },
  { id: 'tf12', axis: 'TF', direction: 'F', text: 'I care more about how something feels than whether it is optimal.' },

  // ------- Judging / Perceiving -------
  { id: 'jp01', axis: 'JP', direction: 'J', text: 'I feel calmer when my day has a clear plan and schedule.' },
  { id: 'jp02', axis: 'JP', direction: 'J', text: 'I like to-do lists and crossing things off them.' },
  { id: 'jp03', axis: 'JP', direction: 'J', text: 'Unfinished tasks nag at me until I get them done.' },
  { id: 'jp04', axis: 'JP', direction: 'J', text: 'I usually decide quickly and stick with the decision.' },
  { id: 'jp05', axis: 'JP', direction: 'J', text: 'I arrive early rather than on time.' },
  { id: 'jp06', axis: 'JP', direction: 'P', text: 'I keep my options open as long as possible before committing.' },
  { id: 'jp07', axis: 'JP', direction: 'P', text: 'I work best in bursts of inspiration rather than a steady routine.' },
  { id: 'jp08', axis: 'JP', direction: 'P', text: 'Plans that are too rigid make me feel trapped.' },
  { id: 'jp09', axis: 'JP', direction: 'P', text: 'I often start new things before finishing the old ones.' },
  { id: 'jp10', axis: 'JP', direction: 'P', text: 'I enjoy improvising more than following a script.' },
  { id: 'jp11', axis: 'JP', direction: 'J', text: 'I like knowing exactly what to expect from my week.' },
  { id: 'jp12', axis: 'JP', direction: 'P', text: 'Last-minute changes excite me more than they stress me out.' },

  // ------- Extra mixed pool so 10-per-day stays fresh for ~1 week -------
  { id: 'ei13', axis: 'EI', direction: 'E', text: 'I recharge by being around other people.' },
  { id: 'ei14', axis: 'EI', direction: 'I', text: 'I can go a full day without talking to anyone and feel fine.' },
  { id: 'sn13', axis: 'SN', direction: 'S', text: 'I\'d describe myself as grounded and down-to-earth.' },
  { id: 'sn14', axis: 'SN', direction: 'N', text: 'I daydream about future possibilities almost every day.' },
  { id: 'tf13', axis: 'TF', direction: 'T', text: 'I\'d rather be respected than liked.' },
  { id: 'tf14', axis: 'TF', direction: 'F', text: 'I\'d rather be liked than respected.' },
  { id: 'jp13', axis: 'JP', direction: 'J', text: 'I feel uncomfortable leaving things in an open-ended state.' },
  { id: 'jp14', axis: 'JP', direction: 'P', text: 'Flexibility matters to me more than structure.' },
  { id: 'ei15', axis: 'EI', direction: 'E', text: 'I share personal news with people almost as soon as it happens.' },
  { id: 'ei16', axis: 'EI', direction: 'I', text: 'I keep a lot of my inner life private, even from close friends.' },
  { id: 'sn15', axis: 'SN', direction: 'N', text: 'I enjoy theories more than their practical applications.' },
  { id: 'sn16', axis: 'SN', direction: 'S', text: 'I remember specific sensory details — smells, textures, exact phrases.' },
  { id: 'tf15', axis: 'TF', direction: 'F', text: 'Seeing someone else cry can almost make me cry too.' },
  { id: 'tf16', axis: 'TF', direction: 'T', text: 'I stay calm and analytical when the people around me are upset.' },
  { id: 'jp15', axis: 'JP', direction: 'J', text: 'I prefer finishing a project early over working right up to the deadline.' },
  { id: 'jp16', axis: 'JP', direction: 'P', text: 'Deadlines are when I do my best work.' },

  { id: 'ei17', axis: 'EI', direction: 'E', text: 'Silence in a conversation makes me want to fill it.' },
  { id: 'ei18', axis: 'EI', direction: 'I', text: 'Silence in a conversation feels comfortable to me.' },
  { id: 'sn17', axis: 'SN', direction: 'S', text: 'I trust what I can prove more than what I can imagine.' },
  { id: 'sn18', axis: 'SN', direction: 'N', text: 'I love the phrase "what if things were completely different?"' },
  { id: 'tf17', axis: 'TF', direction: 'T', text: 'My head usually overrules my heart.' },
  { id: 'tf18', axis: 'TF', direction: 'F', text: 'My heart usually overrules my head.' },
  { id: 'jp17', axis: 'JP', direction: 'J', text: 'Mess in my environment creates mess in my head.' },
  { id: 'jp18', axis: 'JP', direction: 'P', text: 'I can think clearly even in a chaotic environment.' },

  { id: 'ei19', axis: 'EI', direction: 'E', text: 'I\'d rather be part of the action than watching from the sidelines.' },
  { id: 'ei20', axis: 'EI', direction: 'I', text: 'Observing is often more satisfying than participating.' },
  { id: 'sn19', axis: 'SN', direction: 'N', text: 'I get excited by possibilities most people would call unrealistic.' },
  { id: 'sn20', axis: 'SN', direction: 'S', text: 'Practical people are more trustworthy than visionary ones.' },
  { id: 'tf19', axis: 'TF', direction: 'F', text: 'I go out of my way to avoid hurting people\'s feelings.' },
  { id: 'tf20', axis: 'TF', direction: 'T', text: 'I\'d rather give painful feedback than let someone keep failing.' },
  { id: 'jp19', axis: 'JP', direction: 'J', text: 'I tend to plan trips in detail before leaving.' },
  { id: 'jp20', axis: 'JP', direction: 'P', text: 'The best trips are the ones I barely plan.' },
];

export type LikertScore = 0 | 1 | 2 | 3 | 4 | 5;

export interface AxisScores {
  EI: { E: number; I: number };
  SN: { S: number; N: number };
  TF: { T: number; F: number };
  JP: { J: number; P: number };
}

export interface PersonalityResult {
  type: string;
  axes: {
    axis: Axis;
    leftLetter: Direction;
    rightLetter: Direction;
    leftPct: number;
    rightPct: number;
    dominant: Direction;
    confidence: number;
  }[];
  totalAnswers: number;
}

/**
 * Converts a 0-5 Likert answer into a signed score toward the question's direction.
 * 0 → -2.5 (strongly against), 5 → +2.5 (strongly toward), 2.5 = neutral.
 */
export function likertToSigned(score: number): number {
  return score - 2.5;
}

export function computeType(
  answers: { axis: string; direction: string; score: number }[]
): PersonalityResult {
  const tallies: Record<Axis, Record<string, number>> = {
    EI: { E: 0, I: 0 },
    SN: { S: 0, N: 0 },
    TF: { T: 0, F: 0 },
    JP: { J: 0, P: 0 },
  };

  for (const a of answers) {
    const axis = a.axis as Axis;
    if (!tallies[axis]) continue;
    const signed = likertToSigned(a.score);
    const dir = a.direction as Direction;
    const opposite = getOpposite(dir);
    if (signed >= 0) {
      tallies[axis][dir] = (tallies[axis][dir] || 0) + signed;
    } else {
      tallies[axis][opposite] = (tallies[axis][opposite] || 0) + Math.abs(signed);
    }
  }

  const axes = (['EI', 'SN', 'TF', 'JP'] as const).map((axis) => {
    const [left, right] = axis.split('') as [Direction, Direction];
    const leftScore = tallies[axis][left] || 0;
    const rightScore = tallies[axis][right] || 0;
    const total = leftScore + rightScore || 1;
    const leftPct = Math.round((leftScore / total) * 100);
    const rightPct = 100 - leftPct;
    const dominant = leftScore >= rightScore ? left : right;
    const confidence = Math.abs(leftPct - rightPct);
    return { axis, leftLetter: left, rightLetter: right, leftPct, rightPct, dominant, confidence };
  });

  const type = axes.map((a) => a.dominant).join('');
  return { type, axes, totalAnswers: answers.length };
}

function getOpposite(dir: Direction): Direction {
  const map: Record<Direction, Direction> = {
    E: 'I', I: 'E',
    S: 'N', N: 'S',
    T: 'F', F: 'T',
    J: 'P', P: 'J',
  };
  return map[dir];
}

/**
 * Deterministic daily selection: seed by userId + YYYY-MM-DD so the same user
 * always sees the same 10 questions on the same day, but different each day.
 * Skips questions already answered today.
 */
export function selectDailyQuestions(
  userId: string,
  dateKey: string,
  alreadyAnsweredToday: Set<string>,
  count = 10
): Question[] {
  const seed = hashString(`${userId}::${dateKey}`);
  const available = QUESTION_BANK.filter((q) => !alreadyAnsweredToday.has(q.id));
  const shuffled = seededShuffle(available, seed);

  // Balance axes: try to get ~2-3 from each of the 4 axes
  const buckets: Record<Axis, Question[]> = { EI: [], SN: [], TF: [], JP: [] };
  for (const q of shuffled) buckets[q.axis].push(q);

  const picked: Question[] = [];
  const perAxis = Math.floor(count / 4);
  const remainder = count - perAxis * 4;
  for (const axis of ['EI', 'SN', 'TF', 'JP'] as Axis[]) {
    picked.push(...buckets[axis].slice(0, perAxis));
  }
  const leftovers = shuffled.filter((q) => !picked.includes(q));
  picked.push(...leftovers.slice(0, remainder));

  return picked.slice(0, count);
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const out = arr.slice();
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function dateKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const TYPE_PROFILES: Record<string, { name: string; tagline: string; blurb: string; color: string }> = {
  INTJ: { name: 'The Architect', tagline: 'Strategic and visionary', blurb: 'You see systems where others see chaos. You build quietly and precisely, guided by long-term vision more than immediate applause.', color: 'from-indigo-500 to-slate-700' },
  INTP: { name: 'The Logician', tagline: 'Curious and analytical', blurb: 'Your mind is a laboratory. You dismantle ideas to see how they work and feel most alive when you\'re chasing an interesting question.', color: 'from-sky-500 to-indigo-600' },
  ENTJ: { name: 'The Commander', tagline: 'Decisive and bold', blurb: 'You move the world by deciding what happens next. You see the shape of the goal and the path to it at the same time.', color: 'from-rose-500 to-red-700' },
  ENTP: { name: 'The Debater', tagline: 'Quick and inventive', blurb: 'You play with ideas the way other people play with toys. Nothing is sacred — everything is worth reexamining.', color: 'from-amber-400 to-orange-600' },
  INFJ: { name: 'The Advocate', tagline: 'Quiet and meaningful', blurb: 'You carry a deep inner world most people never see. You\'re drawn to purpose, patterns in people, and the things that cannot be said out loud.', color: 'from-purple-500 to-indigo-700' },
  INFP: { name: 'The Mediator', tagline: 'Gentle and idealistic', blurb: 'You feel everything in technicolor. Your values are your compass, and you\'d rather be true than comfortable.', color: 'from-pink-400 to-rose-600' },
  ENFJ: { name: 'The Protagonist', tagline: 'Warm and inspiring', blurb: 'You light up rooms without meaning to. You care about people so clearly it changes the weather around you.', color: 'from-emerald-400 to-teal-600' },
  ENFP: { name: 'The Campaigner', tagline: 'Enthusiastic and free', blurb: 'You chase meaning like it\'s a living thing. You find possibility in almost every conversation, and it\'s contagious.', color: 'from-yellow-400 to-orange-500' },
  ISTJ: { name: 'The Logistician', tagline: 'Reliable and honest', blurb: 'You do what you say you\'ll do. Your word is a contract and your attention to detail is quietly heroic.', color: 'from-slate-500 to-slate-800' },
  ISFJ: { name: 'The Defender', tagline: 'Caring and dependable', blurb: 'You notice the things no one else notices — who\'s hurting, what\'s missing, what needs doing. You hold things together.', color: 'from-teal-400 to-emerald-600' },
  ESTJ: { name: 'The Executive', tagline: 'Organized and dedicated', blurb: 'You turn chaos into a checklist. You respect tradition but you\'re not afraid to be the one in charge.', color: 'from-blue-500 to-indigo-700' },
  ESFJ: { name: 'The Consul', tagline: 'Warm and social', blurb: 'You take care of the people around you like it\'s second nature. Community is where you come alive.', color: 'from-fuchsia-400 to-pink-600' },
  ISTP: { name: 'The Virtuoso', tagline: 'Practical and curious', blurb: 'You learn by doing, breaking, and fixing. You trust your hands as much as your head.', color: 'from-stone-500 to-zinc-700' },
  ISFP: { name: 'The Adventurer', tagline: 'Flexible and charming', blurb: 'You move through the world by feel. Beauty matters to you, and so does freedom to be exactly who you are today.', color: 'from-rose-400 to-pink-500' },
  ESTP: { name: 'The Entrepreneur', tagline: 'Energetic and perceptive', blurb: 'You read rooms faster than most people finish a sentence. You thrive where others freeze.', color: 'from-orange-500 to-red-600' },
  ESFP: { name: 'The Entertainer', tagline: 'Spontaneous and playful', blurb: 'You turn ordinary moments into something worth remembering. Joy follows you — and it\'s not an accident.', color: 'from-amber-400 to-pink-500' },
};
