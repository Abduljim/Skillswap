// Shared types used by both client and server

export type Proficiency = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';
export type SkillType = 'TEACH' | 'WANT';
export type LearningFormat = 'ONLINE' | 'IN_PERSON' | 'EITHER';
export type ExchangeStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
export type ActiveExchangeStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'DISPUTED';
export type SessionStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
export type SessionFormat = 'ONLINE' | 'IN_PERSON';
export type ReportStatus = 'OPEN' | 'REVIEWING' | 'RESOLVED' | 'DISMISSED';

export type Weekday =
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY'
  | 'SUNDAY';

export type TimeOfDay = 'MORNING' | 'AFTERNOON' | 'EVENING';

export interface MatchScore {
  userId: string;
  score: number;
  matchedSkills: {
    theyCanTeachMe: { id: string; name: string; category: string }[];
    iCanTeachThem: { id: string; name: string; category: string }[];
  };
  reasons: string[];
}

export interface ApiError {
  success: false;
  error: { code: string; message: string; details?: unknown };
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;