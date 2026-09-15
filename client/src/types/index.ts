export type LearningFormat = 'ONLINE' | 'IN_PERSON' | 'EITHER';
export type Weekday = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';
export type TimeOfDay = 'MORNING' | 'AFTERNOON' | 'EVENING';
export type Proficiency = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';
export type SkillType = 'TEACH' | 'WANT';
export type SessionFormat = 'ONLINE' | 'IN_PERSON';

export interface User {
  id: string;
  email: string;
  displayName: string;
  isAdmin?: boolean;
}

export interface Profile {
  id: string;
  userId: string;
  university?: string | null;
  department?: string | null;
  yearLevel?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  learningFormat?: LearningFormat;
  availabilities: { weekday: Weekday; timeOfDay: TimeOfDay }[];
}

export interface Skill {
  id: string;
  name: string;
  category: string;
  description?: string | null;
  isActive?: boolean;
}

export interface MatchedSkill {
  id: string;
  name: string;
  category: string;
}

export interface Match {
  userId: string;
  score: number;
  category?: 'PERFECT' | 'STRONG' | 'POTENTIAL' | 'NONE';
  matchedSkills: {
    theyCanTeachMe: MatchedSkill[];
    iCanTeachThem: MatchedSkill[];
  };
  reasons: string[];
  displayName?: string | null;
  avatarUrl?: string | null;
  university?: string | null;
  department?: string | null;
  learningFormat?: LearningFormat | null;
  rating?: number | null;
  completedExchanges?: number;
  isBoosted?: boolean;
  tier?: 'FREE' | 'PRO';
}

export interface ExchangeRequest {
  id: string;
  senderId: string;
  receiverId: string;
  offeredSkillId: string;
  requestedSkillId: string;
  message: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
  createdAt: string;
  sender?: { id: string; displayName: string; profile?: { avatarUrl?: string | null } };
  receiver?: { id: string; displayName: string; profile?: { avatarUrl?: string | null } };
  offeredSkill?: Skill;
  requestedSkill?: Skill;
}

export interface Exchange {
  id: string;
  userA: { id: string; displayName: string; profile?: { avatarUrl?: string | null; university?: string | null } };
  userB: { id: string; displayName: string; profile?: { avatarUrl?: string | null; university?: string | null } };
  skillA?: Skill;
  skillB?: Skill;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'DISPUTED';
  createdAt: string;
  completedAt?: string | null;
  messageCount?: number;
  sessionCount?: number;
}

export interface Message {
  id: string;
  exchangeId: string;
  senderId: string;
  body: string;
  createdAt: string;
  readAt?: string | null;
  sender?: { id: string; displayName: string };
}

export interface Session {
  id: string;
  exchangeId: string;
  title: string;
  scheduledAt: string;
  durationMinutes: number;
  format: SessionFormat;
  meetingLink?: string | null;
  location?: string | null;
  notes?: string | null;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  payload?: any;
}