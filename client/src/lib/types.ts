
export interface UserStats {
  streak: number;
  lastPlayed: string;
  tasksCompleted: number;
  moodHistory: MoodEntry[];
  activityMap: number[]; // 0-4 intensity for the last 28 days
}

export interface MoodEntry {
  date: string;
  score: number; // 1-10
  label: string;
}

export interface DailyTask {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  type: 'movement' | 'social' | 'mindfulness' | 'creative';
}

export interface CommunityPost {
  id: string;
  author: string;
  avatar: string;
  image?: string;
  content: string;
  likes: number;
  timestamp: string;
  community: string;
}

export interface Message {
  role: 'user' | 'model';
  text: string;
}
