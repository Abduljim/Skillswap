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
// avatarUrl accepts either a normal http(s) image URL or a data URL (client
// downscales uploaded photos to a small JPEG before sending). Cap length so a
// single profile can't bloat the database.
export const avatarUrlSchema = z
  .preprocess(
    (v) => (v === '' ? null : v),
    z
      .string()
      .max(2_000_000)
      .refine(
        (v) => v.startsWith('data:image/') || /^https?:\/\/.+/i.test(v),
        { message: 'Must be an image URL or data URL' }
      )
      .nullable()
  )
  .optional();

export const updateProfileSchema = z.object({
  displayName: z.string().min(2).max(80).optional(),
  university: z.string().max(200).nullable().optional(),
  department: z.string().max(200).nullable().optional(),
  yearLevel: z.string().max(50).nullable().optional(),
  bio: z.string().max(1000).nullable().optional(),
  avatarUrl: avatarUrlSchema,
  learningFormat: z.enum(['ONLINE', 'IN_PERSON', 'EITHER']).optional(),
  avatarFrame: z.enum(['default', 'frame_0', 'frame_1', 'frame_2', 'frame_3', 'frame_4', 'frame_5', 'frame_6', 'frame_7', 'frame_8', 'frame_9', 'frame_10', 'frame_11']).optional(),
  bannerStyle: z.enum(['cream', 'purple', 'blue', 'teal', 'orange', 'pink', 'gold', 'indigo', 'green']).optional(),
  // Empty selects come in as "" from the web/APK forms; treat them as "not set"
  // instead of failing the entire profile save (which made saved fields vanish).
  occupation: z
    .preprocess((v) => (v === '' ? null : v), z.enum(['student', 'employed', 'self_employed', 'unemployed', 'other']).nullable())
    .optional(),
  jobTitle: z.string().max(100).nullable().optional(),
  company: z.string().max(150).nullable().optional(),
  gender: z
    .preprocess((v) => (v === '' ? null : v), z.enum(['male', 'female', 'unspecified']).nullable())
    .optional(),
  age: z
    .preprocess((v) => (v === '' || v === null ? null : typeof v === 'number' ? v : undefined), z.number().int().min(13).max(120).nullable())
    .optional(),
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

export const changePasswordSchema = z.object({
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
  body: z.string().min(1).max(2_000_000),
  type: z.enum(['TEXT', 'IMAGE', 'STICKER']).default('TEXT'),
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