import { z } from 'zod';

// ============ Auth ============
export const signupSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(100),
  displayName: z.string().min(2).max(80),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(100),
});

// ============ Profile ============
export const updateProfileSchema = z.object({
  displayName: z.string().min(2).max(80).optional(),
  university: z.string().max(200).nullable().optional(),
  department: z.string().max(200).nullable().optional(),
  yearLevel: z.string().max(50).nullable().optional(),
  bio: z.string().max(1000).nullable().optional(),
  avatarUrl: z.string().url().max(500).nullable().optional(),
  learningFormat: z.enum(['ONLINE', 'IN_PERSON', 'EITHER']).optional(),
  availabilities: z
    .array(
      z.object({
        weekday: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']),
        timeOfDay: z.enum(['MORNING', 'AFTERNOON', 'EVENING']),
      })
    )
    .optional(),
});

export const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(100),
});

// ============ Skills ============
export const addUserSkillSchema = z.object({
  skillId: z.string().uuid(),
  type: z.enum(['TEACH', 'WANT']),
  proficiency: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT']).default('INTERMEDIATE'),
});

// ============ Matches ============
export const matchQuerySchema = z.object({
  minScore: z.coerce.number().int().min(0).max(100).default(40),
  skillId: z.string().uuid().optional(),
  university: z.string().optional(),
  format: z.enum(['ONLINE', 'IN_PERSON', 'EITHER']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

// ============ Exchange requests ============
export const createExchangeRequestSchema = z.object({
  receiverId: z.string().uuid(),
  offeredSkillId: z.string().uuid(),
  requestedSkillId: z.string().uuid(),
  message: z.string().min(10).max(1000),
});

// ============ Sessions ============
export const createSessionSchema = z.object({
  title: z.string().min(2).max(150),
  scheduledAt: z.string().datetime(),
  durationMinutes: z.number().int().min(15).max(480),
  format: z.enum(['ONLINE', 'IN_PERSON']),
  meetingLink: z.string().url().max(500).optional().nullable(),
  location: z.string().max(300).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const updateSessionSchema = createSessionSchema.partial();

// ============ Messages ============
export const createMessageSchema = z.object({
  body: z.string().min(1).max(2000),
});

// ============ Reviews ============
export const createReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional().nullable(),
});

// ============ Reports ============
export const createReportSchema = z.object({
  reportedUserId: z.string().uuid(),
  reason: z.string().min(2).max(100),
  description: z.string().min(10).max(2000),
});

// ============ Admin ============
export const createSkillSchema = z.object({
  name: z.string().min(2).max(80),
  category: z.string().min(2).max(50),
  description: z.string().max(500).optional().nullable(),
});

export const updateSkillSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  category: z.string().min(2).max(50).optional(),
  description: z.string().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const adminUpdateUserSchema = z.object({
  isActive: z.boolean().optional(),
  isAdmin: z.boolean().optional(),
});

// ============ User search ============
export const userSearchSchema = z.object({
  q: z.string().optional(),
  skillId: z.string().uuid().optional(),
  university: z.string().optional(),
  format: z.enum(['ONLINE', 'IN_PERSON', 'EITHER']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  sort: z.enum(['newest', 'rating', 'completed']).default('newest'),
});